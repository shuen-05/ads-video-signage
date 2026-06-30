using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);

// Determine the URL/port to run on, handling port collisions automatically
var defaultUrl = "http://0.0.0.0:5000";
var url = defaultUrl;

bool hasUrlsArg = false;
string? urlsArg = null;
for (int i = 0; i < args.Length; i++)
{
    if ((args[i] == "--urls" || args[i] == "-u") && i + 1 < args.Length)
    {
        hasUrlsArg = true;
        urlsArg = args[i + 1];
        break;
    }
}

var envPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(envPort) && int.TryParse(envPort, out var p))
{
    url = $"http://0.0.0.0:{p}";
}
else if (hasUrlsArg)
{
    url = urlsArg!;
}
else
{
    var envUrls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS");
    if (!string.IsNullOrEmpty(envUrls) && envUrls != "http://localhost:5058")
    {
        url = envUrls;
    }
    else
    {
        var portToUse = 5000;
        try
        {
            var ipGlobalProperties = System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties();
            while (portToUse < 65535)
            {
                var listeners = ipGlobalProperties.GetActiveTcpListeners();
                bool inUse = false;
                foreach (var listener in listeners)
                {
                    if (listener.Port == portToUse)
                    {
                        inUse = true;
                        break;
                    }
                }
                if (!inUse) break;
                portToUse++;
            }
        }
        catch { }
        url = $"http://0.0.0.0:{portToUse}";
    }
}

var port = 5000;
try
{
    var firstUrl = url.Split(';').FirstOrDefault() ?? url;
    var cleanUrl = firstUrl.Replace("*", "localhost").Replace("+", "localhost").Replace("0.0.0.0", "localhost");
    var uri = new Uri(cleanUrl);
    port = uri.Port;
}
catch { }

// Configure for large file uploads (500MB)
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 500 * 1024 * 1024;
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 500 * 1024 * 1024;
});

var app = builder.Build();

// Ensure directories exist
var uploadsDir = Path.Combine(app.Environment.ContentRootPath, "uploads");
var dataDir = Path.Combine(app.Environment.ContentRootPath, "data");
Directory.CreateDirectory(uploadsDir);
Directory.CreateDirectory(dataDir);

var dbPath = Path.Combine(dataDir, "db.json");

var JsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = true
};

// Track recently connected devices (in-memory)
var recentConnections = new System.Collections.Concurrent.ConcurrentDictionary<string, DateTime>();

// Serve static files from wwwroot
app.UseStaticFiles();

// Serve uploaded videos
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsDir),
    RequestPath = "/uploads"
});

// ==================== Database Helpers ====================

var dbLock = new object();

AppData ReadDB()
{
    lock (dbLock)
    {
        try
        {
            if (File.Exists(dbPath))
            {
                var json = File.ReadAllText(dbPath);
                return JsonSerializer.Deserialize<AppData>(json, JsonOptions) ?? CreateDefaultDB();
            }
        }
        catch { }
        return CreateDefaultDB();
    }
}

void WriteDB(AppData data)
{
    lock (dbLock)
    {
        var json = JsonSerializer.Serialize(data, JsonOptions);
        File.WriteAllText(dbPath, json);
    }
}

AppData CreateDefaultDB()
{
    var db = new AppData
    {
        Groups = new List<GroupRecord>
        {
            new() { Id = 1, Name = "Group 1", AvatarColor = "#7c3aed", AssignedVideoId = null },
            new() { Id = 2, Name = "Group 2", AvatarColor = "#06b6d4", AssignedVideoId = null },
            new() { Id = 3, Name = "Group 3", AvatarColor = "#f59e0b", AssignedVideoId = null }
        },
        Users = new List<UserRecord>(),
        Videos = new List<VideoRecord>()
    };
    WriteDB(db);
    return db;
}

string NormalizeIP(string? ip)
{
    if (string.IsNullOrEmpty(ip)) return "";
    if (ip.StartsWith("::ffff:")) return ip[7..];
    if (ip == "::1" || ip == "127.0.0.1") return "localhost";
    return ip;
}

string GetClientIP(HttpContext context)
{
    var ip = context.Connection.RemoteIpAddress?.ToString() ?? "";
    return NormalizeIP(ip);
}



// ==================== Page Routes ====================

// Main route - always serve user page
app.MapGet("/", () =>
{
    var filePath = Path.Combine(app.Environment.WebRootPath, "user.html");
    return Results.File(filePath, "text/html");
});

// Force admin dashboard
app.MapGet("/admin", () =>
{
    var filePath = Path.Combine(app.Environment.WebRootPath, "index.html");
    return Results.File(filePath, "text/html");
});

// Force user page
app.MapGet("/user", () =>
{
    var filePath = Path.Combine(app.Environment.WebRootPath, "user.html");
    return Results.File(filePath, "text/html");
});

// ==================== API Routes ====================

// Get all groups
app.MapGet("/api/groups", () =>
{
    var db = ReadDB();
    var groupsWithVideos = db.Groups.Select(g =>
    {
        var video = db.Videos.FirstOrDefault(v => v.Id == g.AssignedVideoId);
        var userCount = db.Users.Count(u => u.GroupId == g.Id);
        return new { g.Id, g.Name, g.AvatarColor, g.AssignedVideoId, assignedVideo = video, userCount };
    });
    return Results.Json(groupsWithVideos, JsonOptions);
});

// Rename group
app.MapPut("/api/groups/{id:int}/name", async (int id, HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<NameUpdateRequest>();
    var db = ReadDB();
    var group = db.Groups.FirstOrDefault(g => g.Id == id);
    if (group == null) return Results.NotFound(new { error = "Group not found" });

    group.Name = body?.Name?.Trim() ?? group.Name;
    WriteDB(db);
    return Results.Json(group, JsonOptions);
});

// Add group
app.MapPost("/api/groups", () =>
{
    var db = ReadDB();
    var nextId = db.Groups.Count > 0 ? db.Groups.Max(g => g.Id) + 1 : 1;
    var colors = new[] { "#7c3aed", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#3b82f6", "#ef4444" };
    var color = colors[(nextId - 1) % colors.Length];
    
    var newGroup = new GroupRecord
    {
        Id = nextId,
        Name = $"Group {nextId}",
        AvatarColor = color,
        AssignedVideoId = null
    };
    db.Groups.Add(newGroup);
    WriteDB(db);
    return Results.Json(new { newGroup.Id, newGroup.Name, newGroup.AvatarColor, newGroup.AssignedVideoId, assignedVideo = (VideoRecord?)null, userCount = 0 }, JsonOptions);
});

// Delete group
app.MapDelete("/api/groups/{id:int}", (int id) =>
{
    var db = ReadDB();
    var group = db.Groups.FirstOrDefault(g => g.Id == id);
    if (group == null) return Results.NotFound(new { error = "Group not found" });

    // Remove users in this group (so they can be reassigned)
    db.Users.RemoveAll(u => u.GroupId == id);

    // Remove the group itself
    db.Groups.Remove(group);
    
    WriteDB(db);
    return Results.Json(new { success = true }, JsonOptions);
});

// Get all users
app.MapGet("/api/users", () =>
{
    var db = ReadDB();
    var usersWithVideos = db.Users.Select(u =>
    {
        var group = db.Groups.FirstOrDefault(g => g.Id == u.GroupId);
        var video = group != null ? db.Videos.FirstOrDefault(v => v.Id == group.AssignedVideoId) : null;
        return new UserWithVideo(u, video, u.GroupId);
    });
    return Results.Json(usersWithVideos, JsonOptions);
});

// Get single user
app.MapGet("/api/users/{id:int}", (int id) =>
{
    var db = ReadDB();
    var user = db.Users.FirstOrDefault(u => u.Id == id);
    if (user == null) return Results.NotFound(new { error = "User not found" });
    var group = db.Groups.FirstOrDefault(g => g.Id == user.GroupId);
    var video = group != null ? db.Videos.FirstOrDefault(v => v.Id == group.AssignedVideoId) : null;
    return Results.Json(new UserWithVideo(user, video, user.GroupId), JsonOptions);
});

// Who am I?
app.MapGet("/api/whoami", (HttpContext context) =>
{
    var clientIP = GetClientIP(context);
    var db = ReadDB();
    var user = db.Users.FirstOrDefault(u => !string.IsNullOrEmpty(u.Ip) && u.Ip == clientIP);
    var group = user != null ? db.Groups.FirstOrDefault(g => g.Id == user.GroupId) : null;
    var video = group != null ? db.Videos.FirstOrDefault(v => v.Id == group.AssignedVideoId) : null;

    // Track this connection
    if (clientIP != "localhost" && !string.IsNullOrEmpty(clientIP))
    {
        recentConnections[clientIP] = DateTime.UtcNow;
    }

    return Results.Json(new
    {
        ip = clientIP,
        user = user,
        assignedVideo = video
    }, JsonOptions);
});

// Update user's IP
app.MapPut("/api/users/{id:int}/ip", async (int id, HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<IpUpdateRequest>();
    var db = ReadDB();
    var user = db.Users.FirstOrDefault(u => u.Id == id);
    if (user == null) return Results.NotFound(new { error = "User not found" });

    var newIP = body?.Ip?.Trim() ?? "";

    if (!string.IsNullOrEmpty(newIP))
    {
        var existing = db.Users.FirstOrDefault(u => u.Ip == newIP && u.Id != id);
        if (existing != null)
            return Results.BadRequest(new { error = $"IP {newIP} is already assigned to {existing.Name}" });
    }

    user.Ip = newIP;
    WriteDB(db);
    return Results.Json(user, JsonOptions);
});

// Update user's name
app.MapPut("/api/users/{id:int}/name", async (int id, HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<NameUpdateRequest>();
    var db = ReadDB();
    var user = db.Users.FirstOrDefault(u => u.Id == id);
    if (user == null) return Results.NotFound(new { error = "User not found" });

    user.Name = body?.Name?.Trim() ?? user.Name;
    WriteDB(db);
    return Results.Json(user, JsonOptions);
});

// Assign IP to a Group
app.MapPut("/api/groups/{groupId:int}/assign", async (int groupId, HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<AssignIpRequest>();
    var ip = body?.Ip?.Trim();
    if (string.IsNullOrEmpty(ip)) return Results.BadRequest(new { error = "IP address is required" });

    var db = ReadDB();
    var group = db.Groups.FirstOrDefault(g => g.Id == groupId);
    if (group == null) return Results.NotFound(new { error = "Group not found" });

    // Check if this IP is already registered to a user
    var user = db.Users.FirstOrDefault(u => u.Ip == ip);
    if (user != null)
    {
        // Reassign to the new group
        user.GroupId = groupId;
    }
    else
    {
        // Create new user for this IP and assign to group
        var nextId = db.Users.Count > 0 ? db.Users.Max(u => u.Id) + 1 : 1;
        var colors = new[] { "#8b5cf6", "#a78bfa", "#c4b5fd", "#22d3ee", "#67e8f9", "#a5f3fc", "#fbbf24", "#fcd34d", "#fde68a" };
        var color = colors[Random.Shared.Next(colors.Length)];
        user = new UserRecord
        {
            Id = nextId,
            Name = ip, // Default name is IP
            Ip = ip,
            GroupId = groupId,
            AvatarColor = color
        };
        db.Users.Add(user);
    }

    WriteDB(db);
    return Results.Json(user, JsonOptions);
});

// Delete / Unassign User
app.MapDelete("/api/users/{id:int}", (int id) =>
{
    var db = ReadDB();
    var user = db.Users.FirstOrDefault(u => u.Id == id);
    if (user == null) return Results.NotFound(new { error = "User not found" });

    db.Users.Remove(user);
    WriteDB(db);
    return Results.Json(new { success = true }, JsonOptions);
});

// Upload video
app.MapPost("/api/upload", async (HttpContext context) =>
{
    var form = await context.Request.ReadFormAsync();
    var file = form.Files.GetFile("video");
    if (file == null || file.Length == 0)
        return Results.BadRequest(new { error = "No video file uploaded" });

    var ext = Path.GetExtension(file.FileName).ToLower();
    var allowedExts = new[] { ".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv" };
    if (!allowedExts.Contains(ext) && !file.ContentType.StartsWith("video/"))
        return Results.BadRequest(new { error = "Only video files are allowed" });

    var uniqueName = $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-{Random.Shared.Next(100000, 999999)}{ext}";
    var filePath = Path.Combine(uploadsDir, uniqueName);

    using (var stream = new FileStream(filePath, FileMode.Create))
    {
        await file.CopyToAsync(stream);
    }

    var db = ReadDB();
    var video = new VideoRecord
    {
        Id = $"vid_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
        Name = form.TryGetValue("name", out var nameVal) ? nameVal.ToString() : file.FileName,
        FileName = uniqueName,
        OriginalName = file.FileName,
        Path = $"/uploads/{uniqueName}",
        Size = file.Length,
        UploadedAt = DateTime.UtcNow.ToString("o")
    };

    db.Videos.Add(video);
    WriteDB(db);
    return Results.Json(video, JsonOptions);
});

// Get all videos
app.MapGet("/api/videos", () =>
{
    var db = ReadDB();
    return Results.Json(db.Videos, JsonOptions);
});

// Delete video
app.MapDelete("/api/videos/{id}", (string id) =>
{
    var db = ReadDB();
    var video = db.Videos.FirstOrDefault(v => v.Id == id);
    if (video == null) return Results.NotFound(new { error = "Video not found" });

    // Unassign from groups
    foreach (var g in db.Groups.Where(g => g.AssignedVideoId == video.Id))
        g.AssignedVideoId = null;

    // Delete file
    var filePath = Path.Combine(uploadsDir, video.FileName);
    if (File.Exists(filePath)) File.Delete(filePath);

    db.Videos.Remove(video);
    WriteDB(db);
    return Results.Json(new { success = true }, JsonOptions);
});

// Assign video to group
app.MapPut("/api/assign", async (HttpContext context) =>
{
    var body = await context.Request.ReadFromJsonAsync<AssignRequest>();
    var db = ReadDB();

    var group = db.Groups.FirstOrDefault(g => g.Id == body!.GroupId);
    if (group == null) return Results.NotFound(new { error = "Group not found" });

    if (!string.IsNullOrEmpty(body!.VideoId))
    {
        var video = db.Videos.FirstOrDefault(v => v.Id == body.VideoId);
        if (video == null) return Results.NotFound(new { error = "Video not found" });
    }

    group.AssignedVideoId = string.IsNullOrEmpty(body.VideoId) ? null : body.VideoId;
    WriteDB(db);

    var assignedVideo = db.Videos.FirstOrDefault(v => v.Id == group.AssignedVideoId);
    return Results.Json(new { group.Id, group.Name, group.AvatarColor, group.AssignedVideoId, assignedVideo }, JsonOptions);
});

// Get recently connected devices
app.MapGet("/api/connections", () =>
{
    var db = ReadDB();
    var registeredIPs = db.Users.Where(u => !string.IsNullOrEmpty(u.Ip)).Select(u => u.Ip).ToHashSet();
    var cutoff = DateTime.UtcNow.AddMinutes(-30); // Show connections from last 30 min

    var connections = recentConnections
        .Where(kvp => kvp.Value > cutoff)
        .OrderByDescending(kvp => kvp.Value)
        .Select(kvp => new
        {
            ip = kvp.Key,
            lastSeen = kvp.Value.ToString("o"),
            isRegistered = registeredIPs.Contains(kvp.Key),
            assignedUser = db.Users.FirstOrDefault(u => u.Ip == kvp.Key)?.Name
        })
        .ToList();

    return Results.Json(connections, JsonOptions);
});

// Get network info
app.MapGet("/api/network", () =>
{
    var addresses = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
        .Where(ni => ni.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up)
        .SelectMany(ni => ni.GetIPProperties().UnicastAddresses)
        .Where(addr => addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                       && !System.Net.IPAddress.IsLoopback(addr.Address))
        .Select(addr => new { name = "Network", address = addr.Address.ToString() })
        .ToList();

    return Results.Json(new
    {
        port,
        addresses,
        url = addresses.Count > 0 ? $"http://{addresses[0].address}:{port}" : $"http://localhost:{port}"
    }, JsonOptions);
});

// ==================== Start ====================

// Print server info
app.Lifetime.ApplicationStarted.Register(() =>
{
    var addresses = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
        .Where(ni => ni.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up)
        .SelectMany(ni => ni.GetIPProperties().UnicastAddresses)
        .Where(addr => addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                       && !System.Net.IPAddress.IsLoopback(addr.Address))
        .Select(addr => addr.Address.ToString())
        .ToList();

    var networkIP = addresses.FirstOrDefault() ?? "localhost";

    var localUrl = $"http://localhost:{port}";
    var networkUrl = $"http://{networkIP}:{port}";
    var adminUrl = $"http://localhost:{port}/admin";

    Console.WriteLine();
    Console.WriteLine("  ╔══════════════════════════════════════════════════╗");
    Console.WriteLine("  ║       Ad Video Management UI - Server            ║");
    Console.WriteLine("  ╠══════════════════════════════════════════════════╣");
    Console.WriteLine($"  ║  Local:    {localUrl,-38}║");
    Console.WriteLine($"  ║  Network:  {networkUrl,-38}║");
    Console.WriteLine("  ║                                                  ║");
    Console.WriteLine($"  ║  Dashboard: {adminUrl,-36}║");
    Console.WriteLine("  ║  Users connect to the Network URL above          ║");
    Console.WriteLine("  ╚══════════════════════════════════════════════════╝");
    Console.WriteLine();
});

app.Run(url);

// ==================== Models ====================

class AppData
{
    public List<GroupRecord> Groups { get; set; } = new();
    public List<UserRecord> Users { get; set; } = new();
    public List<VideoRecord> Videos { get; set; } = new();
}

class GroupRecord
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string AvatarColor { get; set; } = "#7c3aed";
    public string? AssignedVideoId { get; set; }
}

class UserRecord
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Ip { get; set; } = "";
    public int GroupId { get; set; }
    public string AvatarColor { get; set; } = "#7c3aed";
}

class VideoRecord
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string FileName { get; set; } = "";
    public string OriginalName { get; set; } = "";
    public string Path { get; set; } = "";
    public long Size { get; set; }
    public string UploadedAt { get; set; } = "";
}

record UserWithVideo
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
    public string Ip { get; init; } = "";
    public int GroupId { get; init; }
    public string? AssignedVideoId { get; init; }
    public string AvatarColor { get; init; } = "";
    public VideoRecord? AssignedVideo { get; init; }

    public UserWithVideo(UserRecord user, VideoRecord? video, int groupId)
    {
        Id = user.Id;
        Name = user.Name;
        Ip = user.Ip;
        GroupId = groupId;
        AssignedVideoId = video?.Id;
        AvatarColor = user.AvatarColor;
        AssignedVideo = video;
    }
}

record IpUpdateRequest(string? Ip);
record NameUpdateRequest(string? Name);
record AssignRequest(int GroupId, string? VideoId);
record AssignIpRequest(string? Ip);

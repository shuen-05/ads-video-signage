# Ad Video Management System

A lightweight, local-network video advertising and digital signage management platform. It allows a host/administrator to control what video plays on various client devices across a local network in real-time.

---

## 1. What is Necessary to Run This (Prerequisites)

To run and use this project, you need:
- **.NET 10.0 SDK** (Software Development Kit) or Runtime installed on the host machine.
- **A Modern Web Browser** (such as Google Chrome, Microsoft Edge, Safari, or Mozilla Firefox) on both the host machine and the client devices.
- **Local Network Connection (LAN/Wi-Fi)**: To connect multiple physical client devices (e.g., tablets, smart TVs, secondary monitors) to the host server, all devices must be on the same local network.

---

## 2. How to Run

You can run this application either as a compiled standalone executable (recommended for end-users) or directly from the source code (recommended for developers).

### Method A: Run from the Pre-Compiled Release (Recommended for Users)
If you downloaded the application as a compiled release package:
1. **Download & Extract**: Download the release `.zip` file from the **GitHub Releases** section of this repository and extract its contents to a folder on your computer.
2. **Launch the Server**: Double-click `ManagementUI.exe`.
3. **Access the Web Interfaces**: Once running, the server is live and you can access the dashboard and screens using the URLs described below.

---

### Method B: Run from Source Code (For Developers)
If you cloned the source code from this repository and have the **.NET 10 SDK** installed:
1. **Open a Terminal**: Open a command prompt or terminal in the project directory:
   ```bash
   cd Ads_Management
   ```
2. **Run the Application**:
   ```bash
   dotnet run
   ```
   *(The server automatically detects available ports, starting at `5000`, to avoid collisions).*

---

### 3. Accessing the Web Interfaces
Once the server starts (using either method), a console window will display the active URLs:

```
╔══════════════════════════════════════════════════╗
║       Ad Video Management UI - Server            ║
╠══════════════════════════════════════════════════╣
║  Local:    http://localhost:5000                 ║
║  Network:  http://xxx.xxx.x.xxx:5000              ║
║                                                  ║
║  Dashboard: http://localhost:5000/admin          ║
║  Users connect to the Network URL above          ║
╚══════════════════════════════════════════════════╝
```

- **Host Dashboard (Admin)**: Open [http://localhost:5000/admin](http://localhost:5000/admin) on the host computer to manage video files, create groups, and dynamically assign play lists.
- **Client Screens (Users)**: Open the **Network URL** (e.g. `http://192.168.1.100:5000`) on any tablet, smart TV, or mobile browser connected to the same Wi-Fi network.

---

## How to Package as an Executable (.exe)

You can package this web application into a standalone Windows executable (`.exe`) to run it without calling `dotnet run`.

### Option A: Self-Contained Executable (~100MB)
*This bundles the entire .NET runtime inside the `.exe` so it runs on any Windows 64-bit machine—even if they do not have .NET installed.*

1. Run the following command in your terminal:
   ```bash
   dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false
   ```
2. Navigate to the output directory:
   `bin\Release\net10.0\win-x64\publish\`
3. Double-click `ManagementUI.exe` to run the server.

> [!IMPORTANT]
> The `wwwroot` folder (containing the user interface assets) must remain in the same folder as `ManagementUI.exe`. When sharing/deploying, make sure to copy both the `ManagementUI.exe` and the `wwwroot/` folder.

### Option B: Framework-Dependent Executable (~1MB)
*This creates a lightweight executable, but requires the target computer to have the .NET 10 Runtime installed.*

1. Run the following command in your terminal:
   ```bash
   dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true
   ```
2. Navigate to the output directory:
   `bin\Release\net10.0\win-x64\publish\`
3. Copy `ManagementUI.exe` and the `wwwroot` folder to the target machine.

---


## 3. Why Make This Project (Motivation)

This project was built to address the need for a **simple, low-friction digital signage and local video broadcasting system** without relying on complex, expensive, or cloud-dependent solutions.

### Key Drivers:
- **Instant Local Control**: Traditional digital signage platforms require complicated setups, external players, or cloud licensing. This project runs entirely locally and updates instantly.
- **Seamless Device Management by Network Identity**: By mapping client devices automatically via their local IP address, there's no need for users to log in, scan QR codes, or input credentials. Once a device opens the page, it is registered.
- **Flexibility for Live Venues**: It is perfect for retail stores, exhibition booths, local workshops, restaurants (e.g., digital menus), and corporate offices where screens need dynamic, easily switchable media content.

---

## 4. What This Project Does (Features)

The application coordinates media playback across multiple devices using a central dashboard:

- **Centralized Host Dashboard (`/admin`)**:
  - **Upload Video Pool**: Supports uploading videos up to 500MB (MP4, WebM, etc.). Videos are saved locally in the `uploads/` directory.
  - **Group Management**: Group devices into custom units (e.g., "Reception Screen", "Main Stage", "Table 3 Tablet"). You can dynamically add new groups or rename existing ones.
  - **Video Assignment**: Instantly change which video is assigned to which group from a simple dropdown menu.
  - **Live Connection Discovery**: Automatically tracks recently connected IP addresses. The host can register these newly detected devices and assign them to a group in one click.

- **Client Player Screen (`/` or `/user`)**:
  - **Zero-Configuration Playback**: Client devices load the page, identify themselves by their IP address, and automatically play the video assigned to their group in a loop (muted by default to bypass browser autoplay restrictions).
  - **Real-Time Responsiveness**: The page polls the server every 5 seconds. If the host assigns a different video or renames the group, the client screen reloads/updates automatically.

- **Backend & Storage**:
  - Built with a lightweight **ASP.NET Core Minimal API** backend.
  - Utilizes local file persistence with a simple JSON database (`data/db.json`) that saves all configurations, group names, user assignments, and video metadata.

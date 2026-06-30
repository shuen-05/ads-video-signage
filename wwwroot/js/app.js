// ============================================
// Host Dashboard - app.js
// Groups with per-group video assignment
// ============================================

const API_BASE = '';

// ==================== State ====================
let groups = [];
let users = [];
let videos = [];
let connections = [];
let collapsedGroups = {}; // track collapsed state

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  loadNetworkInfo();
  loadData();

  // Upload button
  document.getElementById('uploadVideoBtn').addEventListener('click', () => {
    document.getElementById('videoFileInput').click();
  });

  document.getElementById('videoFileInput').addEventListener('change', handleVideoUpload);

  // Copy URL button
  document.getElementById('copyUrlBtn').addEventListener('click', copyNetworkUrl);

  // Add group button
  document.getElementById('addGroupBtn').addEventListener('click', handleAddGroup);

  // Auto-refresh every 10 seconds
  setInterval(loadData, 10000);
});

// ==================== Data Loading ====================
async function loadData() {
  try {
    const [groupsRes, usersRes, videosRes] = await Promise.all([
      fetch(`${API_BASE}/api/groups`),
      fetch(`${API_BASE}/api/users`),
      fetch(`${API_BASE}/api/videos`)
    ]);

    groups = await groupsRes.json();
    users = await usersRes.json();
    videos = await videosRes.json();

    renderGroups();
    renderVideoPool();
    loadConnections();
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

async function loadNetworkInfo() {
  try {
    const res = await fetch(`${API_BASE}/api/network`);
    const info = await res.json();
    document.getElementById('networkUrl').textContent = info.url;
  } catch (err) {
    document.getElementById('networkUrl').textContent = 'Unable to detect';
  }
}

// ==================== Load Connections ====================
async function loadConnections() {
  try {
    const res = await fetch(`${API_BASE}/api/connections`);
    connections = await res.json();
    renderConnections();
  } catch (err) {
    console.error('Failed to load connections:', err);
  }
}

function renderConnections() {
  const section = document.getElementById('connectionsSection');
  const list = document.getElementById('connectionsList');
  const countEl = document.getElementById('connectionCount');

  if (connections.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  countEl.textContent = `${connections.length} device${connections.length !== 1 ? 's' : ''}`;

  list.innerHTML = connections.map(conn => {
    const timeAgo = getTimeAgo(conn.lastSeen);
    const isReg = conn.isRegistered;

    return `
      <div class="connection-item ${isReg ? 'registered' : 'unregistered'}">
        <span class="connection-ip">${escapeHtml(conn.ip)}</span>
        <span class="connection-status">
          ${isReg
            ? `<span class="registered-to">✓ Registered to ${escapeHtml(conn.assignedUser)}</span>`
            : '<span style="color: var(--accent-amber);">● New device — not registered</span>'
          }
        </span>
        <span class="connection-time">${timeAgo}</span>
        ${!isReg ? `
          <div class="connection-actions">
            <select onchange="assignIPToGroup('${escapeHtml(conn.ip)}', this.value)">
              <option value="">Assign to Group...</option>
              ${groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function assignIPToGroup(ip, groupId) {
  if (!groupId) return;
  try {
    const res = await fetch(`${API_BASE}/api/groups/${groupId}/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to assign IP to group', 'error');
      return;
    }
    const group = groups.find(g => g.id === parseInt(groupId));
    showToast(`Assigned ${ip} to ${group?.name || 'group'}`, 'success');
    loadData();
  } catch (err) {
    showToast('Failed to assign IP to group', 'error');
  }
}

function getTimeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ==================== Render Groups ====================
function renderGroups() {
  const grid = document.getElementById('groupsGrid');
  const countEl = document.getElementById('userCount');
  countEl.textContent = `${groups.length} groups · ${users.length} users`;

  grid.innerHTML = groups.map(group => {
    const groupUsers = users.filter(u => u.groupId === group.id);
    const hasVideo = group.assignedVideo !== null;
    const isCollapsed = collapsedGroups[group.id] || false;
    const initials = group.name.split(' ').map(w => w[0]).join('').toUpperCase();

    return `
      <div class="group-card" style="--card-accent: ${group.avatarColor};">
        <div class="group-header" onclick="toggleGroup(${group.id})">
          <div class="group-info">
            <div class="group-avatar" style="background: ${group.avatarColor};">
              ${initials}
            </div>
            <div class="group-details">
              <input
                type="text"
                class="group-name-input"
                value="${escapeHtml(group.name)}"
                data-group-id="${group.id}"
                onchange="updateGroupName(${group.id}, this.value)"
                onclick="event.stopPropagation()"
                title="Click to edit group name"
              />
              <span class="group-user-count">${groupUsers.length} users</span>
            </div>
          </div>
          <div class="group-header-right">
            <div class="group-video-badge ${hasVideo ? 'has-video' : 'no-video'}">
              ${hasVideo ? '✓ Video' : '⚠ No video'}
            </div>
            <button class="btn-delete-group" onclick="event.stopPropagation(); deleteGroup(${group.id})" title="Delete group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button class="btn-toggle ${isCollapsed ? 'collapsed' : ''}" title="Toggle group">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <div class="group-body ${isCollapsed ? 'collapsed' : ''}">
          <!-- Group Video Assignment -->
          <div class="group-video-section">
            <div class="group-video-preview">
              ${hasVideo ? `
                <video controls muted preload="metadata">
                  <source src="${group.assignedVideo.path}" type="video/mp4">
                </video>
              ` : `
                <div class="no-video">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  <span>No video assigned to this group</span>
                </div>
              `}
            </div>
            <div class="group-video-actions">
              <select id="assign-group-${group.id}" onchange="assignVideoToGroup(${group.id}, this.value)">
                <option value="">— Assign a video —</option>
                ${videos.map(v => `
                  <option value="${v.id}" ${group.assignedVideoId === v.id ? 'selected' : ''}>
                    ${escapeHtml(v.name)}
                  </option>
                `).join('')}
              </select>
              ${hasVideo ? `
                <button class="btn btn-secondary btn-sm" onclick="unassignVideoFromGroup(${group.id})">
                  Unassign
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Users in this Group -->
          <div class="group-users-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
            Users in this group
          </div>
          <div class="group-users-grid">
            ${groupUsers.map(user => renderUserMiniCard(user)).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderUserMiniCard(user) {
  // If user name is an IP address, we show initials like "IP", otherwise use initials of custom name.
  const initials = user.name && isNaN(user.name.charAt(0)) && !user.name.includes('.') 
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) 
    : 'IP';

  const isOnline = connections.some(c => c.ip === user.ip);

  return `
    <div class="user-mini-card">
      <div class="mini-card-header">
        <div class="mini-user-info">
          <div class="mini-avatar" style="background: ${user.avatarColor || '#8b5cf6'};">
            ${initials}
          </div>
          <div class="mini-user-details">
            <input
              type="text"
              class="mini-name-input"
              value="${escapeHtml(user.name)}"
              data-user-id="${user.id}"
              onchange="updateUserName(${user.id}, this.value)"
              title="Click to edit name"
              placeholder="Device Name"
            />
            <span class="mini-ip-label">${escapeHtml(user.ip)}</span>
          </div>
        </div>
        <div class="mini-card-right">
          <div class="mini-status">
            <div class="status-dot ${isOnline ? 'online' : ''}"></div>
            <span>${isOnline ? 'Active' : 'Offline'}</span>
          </div>
          <button class="btn-unassign" onclick="unassignUser(${user.id})" title="Unassign device from group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

async function handleAddGroup() {
  try {
    const res = await fetch(`${API_BASE}/api/groups`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to create group');
    const newGroup = await res.json();
    showToast(`Added "${newGroup.name}"`, 'success');
    loadData();
  } catch (err) {
    showToast('Failed to add group', 'error');
  }
}

async function unassignUser(userId) {
  if (!confirm('Are you sure you want to unassign this device from the group?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to unassign device');
    showToast('Device unassigned successfully', 'success');
    loadData();
  } catch (err) {
    showToast('Failed to unassign device', 'error');
  }
}

// ==================== Toggle Group ====================
function toggleGroup(groupId) {
  collapsedGroups[groupId] = !collapsedGroups[groupId];
  renderGroups();
}

// ==================== Render Video Pool ====================
function renderVideoPool() {
  const pool = document.getElementById('videoPool');

  if (videos.length === 0) {
    pool.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3;">
          <polygon points="23 7 16 12 23 17 23 7"></polygon>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
        <p>No videos uploaded yet</p>
        <span>Click "Upload Video" to get started</span>
      </div>
    `;
    return;
  }

  pool.innerHTML = videos.map(video => {
    const sizeStr = formatFileSize(video.size);
    const assignedTo = groups.filter(g => g.assignedVideoId === video.id).map(g => g.name);

    return `
      <div class="video-item">
        <video muted preload="metadata" onclick="this.paused ? this.play() : this.pause()">
          <source src="${video.path}" type="video/mp4">
        </video>
        <div class="video-item-info">
          <div>
            <div class="video-item-name" title="${escapeHtml(video.name)}">${escapeHtml(video.name)}</div>
            <div class="video-item-size">
              ${sizeStr}
              ${assignedTo.length > 0 ? ` · Assigned to: ${assignedTo.join(', ')}` : ''}
            </div>
          </div>
          <div class="video-item-actions">
            <button class="btn btn-danger btn-sm" onclick="deleteVideo('${video.id}')" title="Delete video">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== Actions ====================
async function saveIP(userId) {
  const input = document.getElementById(`ip-${userId}`);
  const ip = input.value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/ip`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to save IP', 'error');
      return;
    }

    showToast(`IP ${ip ? 'saved' : 'cleared'} successfully`, 'success');
    loadData();
  } catch (err) {
    showToast('Failed to save IP', 'error');
  }
}

async function updateUserName(userId, name) {
  if (!name.trim()) return;

  try {
    await fetch(`${API_BASE}/api/users/${userId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    loadData();
  } catch (err) {
    showToast('Failed to update name', 'error');
  }
}

async function updateGroupName(groupId, name) {
  if (!name.trim()) return;

  try {
    await fetch(`${API_BASE}/api/groups/${groupId}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    loadData();
  } catch (err) {
    showToast('Failed to update group name', 'error');
  }
}

async function deleteGroup(groupId) {
  if (!confirm('Are you sure you want to delete this group? All registered devices in this group will be unassigned.')) return;
  try {
    const res = await fetch(`${API_BASE}/api/groups/${groupId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete group');
    showToast('Group deleted successfully', 'success');
    loadData();
  } catch (err) {
    showToast('Failed to delete group', 'error');
  }
}

async function assignVideoToGroup(groupId, videoId) {
  try {
    await fetch(`${API_BASE}/api/assign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, videoId: videoId || null })
    });

    const group = groups.find(g => g.id === groupId);
    const video = videos.find(v => v.id === videoId);
    showToast(
      videoId
        ? `Assigned "${video?.name}" to ${group?.name}`
        : `Unassigned video from ${group?.name}`,
      'success'
    );
    loadData();
  } catch (err) {
    showToast('Failed to assign video', 'error');
  }
}

async function unassignVideoFromGroup(groupId) {
  await assignVideoToGroup(groupId, null);
}

async function handleVideoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const overlay = document.getElementById('uploadOverlay');
  const progress = document.getElementById('uploadProgress');
  overlay.style.display = 'flex';
  progress.style.width = '0%';

  const formData = new FormData();
  formData.append('video', file);
  formData.append('name', file.name);

  try {
    // Simulate progress
    let progressVal = 0;
    const progressInterval = setInterval(() => {
      progressVal = Math.min(progressVal + Math.random() * 15, 90);
      progress.style.width = progressVal + '%';
    }, 200);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });

    clearInterval(progressInterval);
    progress.style.width = '100%';

    if (!res.ok) {
      throw new Error('Upload failed');
    }

    const video = await res.json();
    setTimeout(() => {
      overlay.style.display = 'none';
      showToast(`Uploaded "${video.name}" successfully`, 'success');
      loadData();
    }, 500);
  } catch (err) {
    overlay.style.display = 'none';
    showToast('Failed to upload video: ' + err.message, 'error');
  }

  // Reset input
  e.target.value = '';
}

async function deleteVideo(videoId) {
  const video = videos.find(v => v.id === videoId);
  if (!confirm(`Delete "${video?.name}"? This will also unassign it from any groups.`)) return;

  try {
    await fetch(`${API_BASE}/api/videos/${videoId}`, { method: 'DELETE' });
    showToast(`Deleted "${video?.name}"`, 'success');
    loadData();
  } catch (err) {
    showToast('Failed to delete video', 'error');
  }
}

function copyNetworkUrl() {
  const url = document.getElementById('networkUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    showToast('URL copied to clipboard', 'info');
  }).catch(() => {
    // Fallback for non-HTTPS
    const textarea = document.createElement('textarea');
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('URL copied to clipboard', 'info');
  });
}

// ==================== Helpers ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };

  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

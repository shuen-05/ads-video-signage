// ============================================
// User Page - user.js
// ============================================

const API_BASE = '';

let currentUser = null;
let currentVideo = null;

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  identify();

  // Auto-poll for updates every 5 seconds
  setInterval(checkForUpdates, 5000);
});

// ==================== Identify User by IP ====================
async function identify() {
  showState('loading');

  try {
    const res = await fetch(`${API_BASE}/api/whoami`);
    const data = await res.json();

    if (!data.user) {
      // Not registered
      document.getElementById('myIP').textContent = data.ip;
      showState('notRegistered');
      updateHeader(null, data.ip);
      return;
    }

    currentUser = data.user;
    currentVideo = data.assignedVideo;
    updateHeader(currentUser);

    if (currentVideo) {
      showVideo(currentUser, currentVideo);
    } else {
      document.getElementById('noVideoUserName').textContent = `Welcome, ${currentUser.name}`;
      showState('noVideo');
    }
  } catch (err) {
    console.error('Failed to identify:', err);
    document.getElementById('myIP').textContent = 'Unable to detect';
    showState('notRegistered');
  }
}

// ==================== Check for Updates ====================
async function checkForUpdates() {
  if (!currentUser) {
    // Retry identification in case host registered us
    try {
      const res = await fetch(`${API_BASE}/api/whoami`);
      const data = await res.json();

      if (data.user) {
        currentUser = data.user;
        currentVideo = data.assignedVideo;
        updateHeader(currentUser);

        if (currentVideo) {
          showVideo(currentUser, currentVideo);
        } else {
          document.getElementById('noVideoUserName').textContent = `Welcome, ${currentUser.name}`;
          showState('noVideo');
        }
      }
    } catch (err) {
      // Silently retry
    }
    return;
  }

  // Already identified — check if video assignment changed
  try {
    const res = await fetch(`${API_BASE}/api/users/${currentUser.id}`);
    if (!res.ok) {
      currentUser = null;
      currentVideo = null;
      identify();
      return;
    }
    const userData = await res.json();

    const newVideoId = userData.assignedVideoId;
    const oldVideoId = currentVideo ? currentVideo.id : null;

    if (newVideoId !== oldVideoId) {
      currentUser = userData;
      currentVideo = userData.assignedVideo || null;
      updateHeader(currentUser);

      if (currentVideo) {
        showVideo(currentUser, currentVideo);
      } else {
        document.getElementById('noVideoUserName').textContent = `Welcome, ${currentUser.name}`;
        showState('noVideo');
      }
    }

    // Also update the name if changed
    if (userData.name !== currentUser.name) {
      currentUser.name = userData.name;
      updateHeader(currentUser);
    }
  } catch (err) {
    // Silently retry
  }
}

// ==================== UI Updates ====================
function showState(state) {
  const states = ['loadingState', 'notRegisteredState', 'noVideoState', 'videoContainer'];
  states.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = 'none';
  });

  switch (state) {
    case 'loading':
      document.getElementById('loadingState').style.display = 'block';
      break;
    case 'notRegistered':
      document.getElementById('notRegisteredState').style.display = 'block';
      break;
    case 'noVideo':
      document.getElementById('noVideoState').style.display = 'block';
      break;
    case 'video':
      document.getElementById('videoContainer').style.display = 'block';
      break;
  }
}

function showVideo(user, video) {
  document.getElementById('videoUserName').textContent = `Welcome, ${user.name}`;
  document.getElementById('videoName').textContent = video.name;

  const player = document.getElementById('userVideoPlayer');
  const source = document.getElementById('videoSource');

  // Only reload if source changed
  if (source.src !== window.location.origin + video.path) {
    source.src = video.path;
    player.load();
    player.play().catch(() => {
      // Autoplay may be blocked — that's okay
    });
  }

  showState('video');
}

function updateHeader(user, ip) {
  const nameEl = document.getElementById('userNameHeader');
  const avatarEl = document.getElementById('userAvatarSmall');

  if (user) {
    const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase();
    nameEl.textContent = user.name;
    avatarEl.style.background = user.avatarColor;
    avatarEl.textContent = initials;
  } else {
    nameEl.textContent = ip ? `IP: ${ip}` : 'Unknown';
    avatarEl.style.background = '#555';
    avatarEl.textContent = '?';
  }
}

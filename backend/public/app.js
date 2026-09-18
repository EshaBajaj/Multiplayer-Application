/**
 * ROXSTAR Single Page Web Application Controller (Bifurcated Stepper Edition)
 * Manages 3-Step Guided Flow (Step 1: Player Select -> Step 2: Clean Lobby -> Step 3: Room Arena),
 * Vibrant Canvas Wheel Rendering, Standard Player Names, REST API, Socket.IO, Web Audio DSP.
 */

let socket = null;
let currentUser = null;
let currentRoom = null;
let currentSpinState = null;
let countdownInterval = null;
let wheelRotationAngle = 0;
let isWheelSpinning = false;
let spinAnimationId = null;

// Pre-configured player identities
const playersMap = {
  player1: { username: 'player_1', display_name: 'Player 1 (Host)' },
  player2: { username: 'player_2', display_name: 'Player 2' },
  player3: { username: 'player_3', display_name: 'Player 3' },
  player4: { username: 'player_4', display_name: 'Player 4' },
};

// Auto Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
  fetchRooms();
  selectPlayer('player1');
  // Always render colorful wheel initial preview!
  drawCanvasWheel([]);
});

// Winner Modal Control
function openWinnerModal(winnerName, prizePoints) {
  const modal = document.getElementById('winnerModal');
  const modalText = document.getElementById('winnerModalText');
  if (modalText) {
    modalText.innerHTML = `<strong>${winnerName}</strong> won <strong>+${prizePoints} Virtual Points</strong>!<br><span style="font-size:0.88rem; color:var(--text-muted); margin-top:6px; display:inline-block;">Enjoy your reward!</span>`;
  }
  if (modal) modal.style.display = 'flex';
}

function closeWinnerModal() {
  const modal = document.getElementById('winnerModal');
  if (modal) modal.style.display = 'none';
}

// Lobby Segmented Mode Switcher (Step 2)
function switchLobbyMode(mode) {
  const joinBtn = document.getElementById('modeJoinBtn');
  const createBtn = document.getElementById('modeCreateBtn');
  const joinBox = document.getElementById('lobbyJoinMode');
  const createBox = document.getElementById('lobbyCreateMode');

  if (mode === 'join') {
    if (joinBtn) joinBtn.classList.add('active');
    if (createBtn) createBtn.classList.remove('active');
    if (joinBox) joinBox.style.display = 'flex';
    if (createBox) createBox.style.display = 'none';
  } else {
    if (createBtn) createBtn.classList.add('active');
    if (joinBtn) joinBtn.classList.remove('active');
    if (createBox) createBox.style.display = 'flex';
    if (joinBox) joinBox.style.display = 'none';
  }
}

// Sub-Tab Navigation inside Step 3
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-view'));
    });
  });
}

function switchTab(targetView) {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((t) => {
    if (t.getAttribute('data-view') === targetView) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  document.querySelectorAll('.view-section').forEach((v) => {
    v.style.display = 'none';
  });
  const targetElem = document.getElementById(targetView);
  if (targetElem) targetElem.style.display = 'block';

  if (targetView === 'studioView' && window.webStudio) {
    window.webStudio.initMic();
  } else if (targetView === 'spinView') {
    drawCanvasWheel(currentSpinState || []);
  }
}

function switchToStudioTab() {
  switchTab('studioView');
}

// BIFURCATED STEPPER FLOW CONTROLLER
function navigateToStep(stepNumber) {
  const step1 = document.getElementById('sectionStep1');
  const step2 = document.getElementById('sectionStep2');
  const step3 = document.getElementById('sectionStep3');

  const ind1 = document.getElementById('step1Indicator');
  const ind2 = document.getElementById('step2Indicator');
  const ind3 = document.getElementById('step3Indicator');

  // Hide all sections
  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'none';
  if (step3) step3.style.display = 'none';

  // Reset indicators
  if (ind1) ind1.className = 'step-item';
  if (ind2) ind2.className = 'step-item';
  if (ind3) ind3.className = 'step-item';

  if (stepNumber === 1) {
    if (step1) step1.style.display = 'flex';
    if (ind1) ind1.className = 'step-item active';
  } else if (stepNumber === 2) {
    if (step2) step2.style.display = 'flex';
    if (ind2) ind2.className = 'step-item active';
    fetchRooms();
  } else if (stepNumber === 3) {
    if (step3) step3.style.display = 'flex';
    if (ind3) ind3.className = 'step-item active';
    switchTab('arenaView');
  }
}

// Logging to Console
function logConsole(type, data) {
  const logContainer = document.getElementById('consoleLog');
  if (!logContainer) return;

  const entry = document.createElement('div');
  entry.className = `log-line ${type}`;
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `<strong style="color: var(--primary);">[${time}] ${type}</strong>: ${JSON.stringify(data)}`;
  logContainer.prepend(entry);
}

// 1. Step 1: Select Player
function selectPlayer(key) {
  ['btnP1', 'btnP2', 'btnP3', 'btnP4'].forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.remove('active');
  });

  const p = playersMap[key];
  if (p) {
    const input = document.getElementById('usernameInput');
    if (input) input.value = p.display_name;

    const activeBtn = document.getElementById('btn' + key.toUpperCase().replace('LAYER', 'P'));
    if (activeBtn) activeBtn.classList.add('active');
  }
}

async function confirmStep1() {
  const usernameInput = document.getElementById('usernameInput');
  const displayName = usernameInput.value.trim();
  if (!displayName) return alert('Please select or enter a player name.');

  const username = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        display_name: displayName,
      }),
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      updateUserUI();
      logConsole('auth_success', { name: currentUser.display_name, points: currentUser.virtual_points });
      navigateToStep(2);
    } else {
      alert('Authentication error: ' + data.error);
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to authentication API.');
  }
}

function updateUserUI() {
  if (!currentUser) return;
  const avatar = document.getElementById('userAvatarImg');
  const name = document.getElementById('userNameLabel');
  const points = document.getElementById('userPointsLabel');

  if (avatar) avatar.src = currentUser.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.username}`;
  if (name) name.innerText = currentUser.display_name || currentUser.username;
  if (points) points.innerText = `${currentUser.virtual_points || 100} PTS`;
}

// 2. Step 2: Room Lobby
async function fetchRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    const select = document.getElementById('roomSelect');

    if (select) {
      select.innerHTML = '<option value="">-- Choose active room --</option>';
      if (data.success && data.rooms) {
        data.rooms.forEach((r) => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = `${r.title} (${r.online_participants_count} online - Host: ${r.owner_display_name || r.owner_username})`;
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch rooms:', err);
  }
}

async function createRoom() {
  if (!currentUser) return alert('Please complete Step 1 first.');
  const titleInput = document.getElementById('newRoomTitleInput');
  const title = titleInput ? titleInput.value.trim() : `${currentUser.display_name}'s Arena`;

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || `${currentUser.display_name}'s Arena`,
        owner_id: currentUser.id,
        max_participants: 20,
      }),
    });
    const data = await res.json();
    if (data.success) {
      currentRoom = data.room;
      document.getElementById('currentRoomTitle').innerText = currentRoom.title;
      fetchRooms();
      joinRoomSocket();
    } else {
      alert('Room creation failed: ' + data.error);
    }
  } catch (err) {
    console.error(err);
    alert('Error creating room');
  }
}

function joinRoomById(roomId) {
  const select = document.getElementById('roomSelect');
  if (select) select.value = roomId;
  joinRoomSocket();
}

// 3. Step 3: Socket.IO Real-Time Connection
function joinRoomSocket() {
  if (!currentUser) return alert('Please complete Step 1 first.');

  let roomId = currentRoom ? currentRoom.id : null;
  const select = document.getElementById('roomSelect');
  if (select && select.value) roomId = select.value;

  if (!roomId) return alert('Please select or create a room first.');

  if (!socket) {
    socket = io();

    socket.on('connect', () => {
      const statusPill = document.getElementById('connectionStatusPill');
      if (statusPill) {
        statusPill.className = 'status-badge status-connected';
        statusPill.innerText = `Connected`;
      }
      logConsole('socket_connected', { socketId: socket.id });

      if (currentRoom && currentUser) {
        socket.emit('join_room', { room_id: currentRoom.id, user_id: currentUser.id });
      }
    });

    socket.on('disconnect', () => {
      const statusPill = document.getElementById('connectionStatusPill');
      if (statusPill) {
        statusPill.className = 'status-badge status-disconnected';
        statusPill.innerText = 'Disconnected';
      }
      logConsole('socket_disconnected', {});
    });

    socket.on('room_state', (state) => {
      logConsole('room_state', state);
      renderParticipants(state.participants || []);
      renderSharedJukebox(state.shared_drafts || []);
      if (state.active_spin) {
        handleSpinStarted(state.active_spin);
      }
    });

    socket.on('user_joined', (data) => {
      logConsole('user_joined', data);
      renderParticipants(data.participants || []);
    });

    socket.on('user_left', (data) => {
      logConsole('user_left', data);
      renderParticipants(data.participants || []);
    });

    socket.on('draft_shared', (draft) => {
      logConsole('draft_shared', draft);
      addJukeboxDraft(draft);
    });

    socket.on('spin_started', (data) => {
      logConsole('spin_started', data);
      handleSpinStarted(data);
    });

    socket.on('user_eliminated', (data) => {
      logConsole('user_eliminated', data);
      handleUserEliminated(data);
    });

    socket.on('winner_announced', (data) => {
      logConsole('winner_announced', data);
      handleWinnerAnnounced(data);
    });

    socket.on('spin_aborted', (data) => {
      logConsole('spin_aborted', data);
      handleSpinAborted(data);
    });

    socket.on('spin_error', (data) => {
      logConsole('spin_error', data);
      alert('Spin Error: ' + (data.error || data.message));
    });
  }

  socket.emit('join_room', { room_id: roomId, user_id: currentUser.id }, (ack) => {
    if (ack && ack.success) {
      currentRoom = ack.room || { id: roomId, title: 'Live Arena' };
      document.getElementById('currentRoomTitle').innerText = currentRoom.title || 'Live Room';
      logConsole('join_room_success', ack);
      
      navigateToStep(3);
    }
  });
}

function leaveRoomSocket() {
  if (!socket || !currentRoom || !currentUser) return;
  socket.emit('leave_room', { room_id: currentRoom.id, user_id: currentUser.id }, () => {
    logConsole('left_room', { room_id: currentRoom.id });
    currentRoom = null;
    document.getElementById('currentRoomTitle').innerText = 'Not in a Room';
    navigateToStep(2);
  });
}

// 4. Participant & Jukebox Rendering
function renderParticipants(list) {
  const grid = document.getElementById('participantsGrid');
  const countBadge = document.getElementById('participantCountLabel');
  const readinessPill = document.getElementById('readinessPill');

  if (countBadge) countBadge.innerText = `${list.length} Online`;
  if (readinessPill) {
    const readyCount = list.length;
    if (readyCount >= 3) {
      readinessPill.className = 'role-badge role-host';
      readinessPill.innerText = `✅ ${readyCount} / 3 Ready`;
    } else {
      readinessPill.className = 'role-badge role-participant';
      readinessPill.innerText = `⚠️ ${readyCount} / 3 Ready`;
    }
  }

  currentSpinState = list;
  drawCanvasWheel(list);

  if (!grid) return;
  if (list.length === 0) {
    grid.innerHTML = '<div style="color: var(--text-muted);">No members online.</div>';
    return;
  }

  grid.innerHTML = list
    .map(
      (p) => `
    <div class="participant-card">
      <img class="user-avatar" src="${p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.username}`}" alt="avatar" />
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <strong style="font-size: 0.88rem; color: var(--text-main);">${p.display_name || p.username}</strong>
        <span class="role-badge ${p.role === 'HOST' ? 'role-host' : 'role-participant'}">${p.role}</span>
      </div>
    </div>
  `
    )
    .join('');
}

function renderSharedJukebox(drafts) {
  const container = document.getElementById('jukeboxList');
  if (!container) return;

  if (!drafts || drafts.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.88rem;">No shared voice takes yet.</div>';
    return;
  }

  container.innerHTML = drafts.map((d) => formatDraftHtml(d)).join('');
}

function addJukeboxDraft(draft) {
  const container = document.getElementById('jukeboxList');
  if (!container) return;

  if (container.innerText.includes('No shared voice takes')) {
    container.innerHTML = '';
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = formatDraftHtml(draft);
  container.prepend(wrapper.firstElementChild);
}

function formatDraftHtml(d) {
  let fileUrl = d.file_url || '';
  if (fileUrl.includes('/uploads/')) {
    fileUrl = fileUrl.substring(fileUrl.indexOf('/uploads/'));
  }
  const author = d.shared_by_display_name || d.shared_by_username || d.username || 'Participant';

  return `
    <div class="draft-card">
      <div>
        <strong style="color: var(--text-main); font-size: 0.9rem;">${d.title || 'Studio Voice Take'}</strong>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          By: <strong style="color: var(--primary);">${author}</strong> &bull; 
          <span style="color: var(--accent-pink); font-weight: 700;">${d.effect_applied || 'ECHO_DSP'}</span>
        </div>
      </div>
      <audio controls src="${fileUrl}" preload="auto"></audio>
    </div>
  `;
}

// 5. Studio Recording & Share to Jukebox
async function startStudioRecord() {
  if (!window.webStudio) return;
  const ok = await window.webStudio.startRecording();
  if (ok) {
    document.getElementById('recBtn').style.display = 'none';
    document.getElementById('stopRecBtn').style.display = 'inline-flex';
    document.getElementById('studioStatusText').innerText = '🎙️ Recording live microphone with Echo DSP...';
  }
}

function stopStudioRecord() {
  if (!window.webStudio) return;
  window.webStudio.stopRecording();
  document.getElementById('recBtn').style.display = 'inline-flex';
  document.getElementById('stopRecBtn').style.display = 'none';
  document.getElementById('studioStatusText').innerText = '✅ Recording saved! Click Share to post to Jukebox.';
  document.getElementById('shareTakeGroup').style.display = 'flex';
}

async function uploadAndShareTake() {
  if (!currentUser || !currentRoom) {
    return alert('You must be in an active room to share takes.');
  }

  const titleInput = document.getElementById('takeTitleInput');
  const title = titleInput ? titleInput.value.trim() : 'Studio Voice Take';

  const res = await window.webStudio.uploadRecording(currentUser.id, title);
  if (res && res.success) {
    socket.emit('share_draft', {
      room_id: currentRoom.id,
      draft_id: res.draft.id,
      user_id: currentUser.id,
    });
    alert('🎉 Take shared to Jukebox!');
    switchTab('arenaView');
  }
}

// 6. 5-Rotation Physics Spin Wheel Engine
function startSpinWheel() {
  if (!socket || !currentRoom || !currentUser) {
    return alert('Authenticate and join a room first.');
  }

  closeWinnerModal();
  document.getElementById('winnerBanner').style.display = 'none';

  socket.emit('start_spin', { room_id: currentRoom.id, user_id: currentUser.id }, (ack) => {
    if (ack && !ack.success) {
      alert('Cannot start spin: ' + (ack.error || ack.message));
    }
  });
}

function handleSpinStarted(data) {
  closeWinnerModal();
  document.getElementById('winnerBanner').style.display = 'none';
  const badge = document.getElementById('spinStatusBadge');
  if (badge) {
    badge.className = 'status-badge status-connected';
    badge.innerText = 'RUNNING';
  }

  currentSpinState = data.participants || [];
  renderSpinSeats(currentSpinState);
  
  trigger5RotationPhysicsSpin(currentSpinState);
  startSpinCountdown();
}

function trigger5RotationPhysicsSpin(players, targetWinnerId = null) {
  const activePlayers = players.length >= 2 ? players : [
    { display_name: 'Player 1 (Host)' },
    { display_name: 'Player 2' },
    { display_name: 'Player 3' },
    { display_name: 'Player 4' }
  ];
  const itemsCount = activePlayers.length;
  const segmentAngle = (2 * Math.PI) / itemsCount;
  
  let targetIndex = 0;
  if (targetWinnerId) {
    targetIndex = activePlayers.findIndex((p) => p.user_id === targetWinnerId);
    if (targetIndex < 0) targetIndex = Math.floor(Math.random() * itemsCount);
  } else {
    targetIndex = Math.floor(Math.random() * itemsCount);
  }

  const randomSpinAngle = targetIndex * segmentAngle;
  const fiveFullRotations = 5 * (2 * Math.PI);
  const startAngle = wheelRotationAngle;
  const targetTotalRotation = startAngle + fiveFullRotations + randomSpinAngle;

  const durationMs = 3500;
  const startTime = performance.now();
  let lastTickSegment = -1;

  if (spinAnimationId) cancelAnimationFrame(spinAnimationId);

  function animatePhysicsSpin(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / durationMs);

    const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    wheelRotationAngle = startAngle + (targetTotalRotation - startAngle) * easedProgress;

    const currentSegment = Math.floor((wheelRotationAngle % (2 * Math.PI)) / segmentAngle);
    if (currentSegment !== lastTickSegment) {
      lastTickSegment = currentSegment;
      if (window.webStudio) window.webStudio.playSpinTick();
    }

    drawCanvasWheel(activePlayers);

    if (progress < 1.0) {
      spinAnimationId = requestAnimationFrame(animatePhysicsSpin);
    } else {
      wheelRotationAngle = targetTotalRotation % (2 * Math.PI);
      drawCanvasWheel(activePlayers);
    }
  }

  spinAnimationId = requestAnimationFrame(animatePhysicsSpin);
}

function handleUserEliminated(data) {
  if (window.webStudio) window.webStudio.playEliminationSound();

  const eliminatedId = data.eliminated_user.user_id;
  currentSpinState = currentSpinState.map((p) => {
    if (p.user_id === eliminatedId) {
      return { ...p, is_eliminated: true, elimination_round: data.elimination_round };
    }
    return p;
  });

  renderSpinSeats(currentSpinState);
  drawCanvasWheel(currentSpinState);

  if (data.remaining_players && data.remaining_players.length > 1) {
    startSpinCountdown();
  } else {
    clearInterval(countdownInterval);
    document.getElementById('spinCountdownPill').style.display = 'none';
  }
}

function handleWinnerAnnounced(data) {
  clearInterval(countdownInterval);
  if (spinAnimationId) cancelAnimationFrame(spinAnimationId);

  const winner = data.winner;
  currentSpinState = currentSpinState.map((p) => {
    if (p.user_id === winner.user_id) {
      return { ...p, is_winner: true };
    }
    return p;
  });

  trigger5RotationPhysicsSpin(currentSpinState, winner.user_id);

  setTimeout(() => {
    if (window.webStudio) window.webStudio.playVictoryChime();

    const badge = document.getElementById('spinStatusBadge');
    if (badge) {
      badge.className = 'status-badge status-connected';
      badge.innerText = 'COMPLETED';
    }
    document.getElementById('spinCountdownPill').style.display = 'none';

    const banner = document.getElementById('winnerBanner');
    const winnerText = document.getElementById('winnerTextLabel');
    if (banner && winnerText) {
      banner.style.display = 'block';
      winnerText.innerHTML = `<strong>${winner.display_name || winner.username}</strong> won <strong>+${winner.prize_points} PTS</strong>! 🎉`;
    }

    if (currentUser && currentUser.id === winner.user_id) {
      currentUser.virtual_points = winner.total_points;
      updateUserUI();
    }

    renderSpinSeats(currentSpinState);
    triggerConfetti();
    openWinnerModal(winner.display_name || winner.username, winner.prize_points);
  }, 3600);
}

function handleSpinAborted(data) {
  clearInterval(countdownInterval);
  if (spinAnimationId) cancelAnimationFrame(spinAnimationId);

  const badge = document.getElementById('spinStatusBadge');
  if (badge) {
    badge.className = 'status-badge status-disconnected';
    badge.innerText = `ABORTED`;
  }
  document.getElementById('spinCountdownPill').style.display = 'none';
  alert(`Spin Aborted: ${data.reason}`);
}

function startSpinCountdown() {
  clearInterval(countdownInterval);
  let sec = 5;
  const pill = document.getElementById('spinCountdownPill');
  if (!pill) return;

  pill.style.display = 'inline-flex';
  pill.innerText = `⏱️ Next Elimination: ${sec}s`;

  countdownInterval = setInterval(() => {
    sec -= 1;
    if (sec > 0) {
      pill.innerText = `⏱️ Next Elimination: ${sec}s`;
    } else {
      pill.innerText = `💥 Eliminating...`;
      clearInterval(countdownInterval);
    }
  }, 1000);
}

// Canvas Visual Wheel Rendering (ALWAYS Vibrant & Colorful)
function drawCanvasWheel(players) {
  const canvas = document.getElementById('wheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Fallback default colored slices if empty or less than 2 players
  let renderSlices = players;
  if (!players || players.length < 2) {
    renderSlices = [
      { display_name: 'Player 1 (Host)' },
      { display_name: 'Player 2' },
      { display_name: 'Player 3' },
      { display_name: 'Player 4' }
    ];
  }

  const numSlices = renderSlices.length;
  const sliceAngle = (2 * Math.PI) / numSlices;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = centerX - 12;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const colors = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#9333ea', '#0284c7', '#e11d48', '#0284c7'];

  for (let i = 0; i < numSlices; i++) {
    const p = renderSlices[i];
    const startAngle = i * sliceAngle + wheelRotationAngle;
    const endAngle = (i + 1) * sliceAngle + wheelRotationAngle;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();

    if (p.is_winner) {
      ctx.fillStyle = '#d97706';
    } else if (p.is_eliminated) {
      ctx.fillStyle = '#cbd5e1';
    } else {
      ctx.fillStyle = colors[i % colors.length];
    }
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Text Label
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.is_eliminated ? '#94a3b8' : '#ffffff';
    ctx.font = '700 12px "Outfit", sans-serif';
    ctx.fillText((p.display_name || p.username || `Player ${i + 1}`).substring(0, 14), radius - 18, 4);
    ctx.restore();
  }
}

function renderSpinSeats(players) {
  const container = document.getElementById('spinSeatsGrid');
  if (!container) return;

  if (!players || players.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted);">Start a spin to populate seats.</div>';
    return;
  }

  container.innerHTML = players
    .map((p, idx) => {
      let className = 'seat-card';
      let statusBadge = '<span style="color: var(--success); font-weight:700;">● IN PLAY</span>';

      if (p.is_winner) {
        className += ' winner';
        statusBadge = '<span style="color: var(--gold); font-weight:700;">👑 WINNER</span>';
      } else if (p.is_eliminated) {
        className += ' eliminated';
        statusBadge = '<span style="color: var(--danger); text-decoration: line-through;">ELIMINATED</span>';
      }

      return `
      <div class="${className}">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
          <span>Seat #${p.seat_order || idx + 1}</span>
          ${statusBadge}
        </div>
        <strong style="font-size: 0.88rem; color: var(--text-main); ${p.is_eliminated ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
          ${p.display_name || p.username}
        </strong>
      </div>
    `;
    })
    .join('');
}

// Confetti Generator
function triggerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#9333ea', '#0284c7'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 3 + 2,
      speedX: Math.random() * 2 - 1,
      rotation: Math.random() * 360,
    });
  }

  let duration = 0;
  function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += 2;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    duration++;
    if (duration < 180) {
      requestAnimationFrame(animateConfetti);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  animateConfetti();
}

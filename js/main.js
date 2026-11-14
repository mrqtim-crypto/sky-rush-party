import * as THREE from 'three';
import { sfx } from './audio.js';
import {
  CUSTOMIZATION_CATALOG,
  CharacterAvatar,
  ITEM_META,
  getRandomAppearance,
  getRandomNickname
} from './character.js';
import { AbyssWorld, FLOOR_VERTICAL_GAP } from './world.js';
import { RoomNetwork } from './network.js';

// ================= STATE & CONFIG =================
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090d16);
scene.fog = new THREE.FogExp2(0x090d16, 0.016);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 140);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.25);
dirLight.position.set(8, 22, 14);
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
rimLight.position.set(-10, -8, -8);
scene.add(rimLight);

// Lobby Preview Stage Group
const lobbyStageGroup = new THREE.Group();
scene.add(lobbyStageGroup);

const pedestalGeo = new THREE.CylinderGeometry(1.18, 1.38, 0.24, 36);
const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  metalness: 0.45,
  roughness: 0.25
});
const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
pedestalMesh.position.y = -0.12;
lobbyStageGroup.add(pedestalMesh);

const pedestalRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.24, 0.05, 12, 40),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
);
pedestalRing.rotation.x = Math.PI / 2;
pedestalRing.position.y = 0.01;
lobbyStageGroup.add(pedestalRing);

// Load or create saved appearance & nickname
let myAppearance = getRandomAppearance(false);
try {
  const saved = localStorage.getItem('ns_shaft_appearance_v1');
  if (saved) myAppearance = { ...myAppearance, ...JSON.parse(saved) };
} catch (e) {}

const nameInput = document.getElementById('player-name');
try {
  const savedName = localStorage.getItem('ns_shaft_name_v1');
  if (savedName) nameInput.value = savedName;
} catch (e) {}

// Lobby Avatar (showNameplate: false so the 3D hair/crown/head is 100% unobstructed!)
const lobbyAvatar = new CharacterAvatar({
  id: 'preview_me',
  name: nameInput.value || '下樓梯小霸王',
  isLocal: true,
  showNameplate: false,
  appearance: myAppearance
});
lobbyAvatar.dropRing.visible = false;
lobbyStageGroup.add(lobbyAvatar.group);

// Abyss World
const world = new AbyssWorld(scene);
world.root.visible = false;

// Game State
let gameState = 'lobby'; // 'lobby' | 'playing' | 'result'
let isSoloSession = false;
let cameraCloseMode = false;
let matchParticipants = [];
const players = new Map();
let localPlayer = null;
let netSyncAccumulator = 0;

// Fast-Paced Combo & Cooldowns
let floorCombo = 0;
let floorComboTimer = 0;
let screenShakeTimer = 0;
let shoveCooldown = 0;
let ghostCurseCooldown = 0;
let ghostRockCooldown = 0;
let joyX = 0;
let joyY = 0;
const keys = {};

// ================= LOBBY CAMERA VIEW OFFSET (NEVER BLOCK CHARACTER!) =================
function updateCameraProjection() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;

  if (gameState === 'lobby') {
    const stageEl = document.getElementById('preview-touch-zone');
    if (stageEl) {
      const rect = stageEl.getBoundingClientRect();
      const stageCenterY = rect.top + rect.height * 0.54;
      const screenCenterY = h * 0.5;
      // Shift projection center upward so (0, 1.0, 0) renders squarely inside #preview-touch-zone!
      const offsetY = screenCenterY - stageCenterY;
      camera.setViewOffset(w, h, 0, offsetY, w, h);
    } else {
      camera.setViewOffset(w, h, 0, h * 0.24, w, h);
    }
  } else {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
}

// ================= CUSTOMIZATION UI SETUP =================
function saveProfileLocally() {
  try {
    localStorage.setItem('ns_shaft_appearance_v1', JSON.stringify(myAppearance));
    localStorage.setItem('ns_shaft_name_v1', nameInput.value.trim() || '下樓梯小霸王');
  } catch (e) {}
}

function renderCustomizationUI() {
  const bindPills = (containerId, list, currentKey, onSelect) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    list.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'cust-pill' + (myAppearance[currentKey] === item.id ? ' active' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        sfx.customizePop();
        onSelect(item.id);
        refreshAvatarAndSync();
      });
      el.appendChild(btn);
    });
  };

  bindPills('opt-gender', CUSTOMIZATION_CATALOG.genders, 'gender', (val) => {
    myAppearance.gender = val;
  });

  bindPills('opt-hair', CUSTOMIZATION_CATALOG.hairs, 'hair', (val) => {
    myAppearance.hair = val;
  });

  const colorRow = document.getElementById('opt-hair-color');
  if (colorRow) {
    colorRow.innerHTML = '';
    CUSTOMIZATION_CATALOG.hairColors.forEach((c) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot-btn' + (myAppearance.hairColor === c.id ? ' active' : '');
      dot.style.backgroundColor = c.id;
      dot.title = c.label;
      dot.addEventListener('click', () => {
        sfx.customizePop();
        myAppearance.hairColor = c.id;
        refreshAvatarAndSync();
      });
      colorRow.appendChild(dot);
    });
  }

  bindPills('opt-top', CUSTOMIZATION_CATALOG.tops, 'top', (val) => {
    myAppearance.top = val;
    myAppearance.suit = 'none';
  });

  bindPills('opt-bottom', CUSTOMIZATION_CATALOG.bottoms, 'bottom', (val) => {
    myAppearance.bottom = val;
    myAppearance.suit = 'none';
  });

  bindPills('opt-suit', CUSTOMIZATION_CATALOG.suits, 'suit', (val) => {
    myAppearance.suit = val;
  });

  const isWearingSuit = myAppearance.suit && myAppearance.suit !== 'none';
  const suitObj = CUSTOMIZATION_CATALOG.suits.find((s) => s.id === myAppearance.suit);
  const hintText = isWearingSuit ? `(已穿${suitObj ? suitObj.label.split(' ')[1] : '套裝'}，點選可切回混搭)` : '';
  document.getElementById('top-override-hint').textContent = hintText;
  document.getElementById('bottom-override-hint').textContent = hintText;
}

function refreshAvatarAndSync() {
  renderCustomizationUI();
  const cleanName = (nameInput.value || '下樓梯小霸王').trim().slice(0, 10) || '下樓梯小霸王';
  lobbyAvatar.updateAppearance(myAppearance, cleanName);
  const stageTag = document.getElementById('stage-name-preview');
  if (stageTag) stageTag.textContent = `👑 ${cleanName}`;
  saveProfileLocally();
  network.updateMyProfile({
    name: cleanName,
    appearance: myAppearance
  });
}

// Lobby Tab Switching
document.querySelectorAll('.lobby-tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    sfx.customizePop();
    document.querySelectorAll('.lobby-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tabBtn.classList.add('active');
    const target = document.getElementById(tabBtn.dataset.tab);
    if (target) target.classList.add('active');
    updateCameraProjection();
  });
});

// Sound Mute Toggle
const soundBtn = document.getElementById('btn-sound-toggle');
soundBtn.addEventListener('click', () => {
  const on = sfx.toggleMute();
  soundBtn.textContent = on ? '🔊' : '🔇';
});

// Randomize Buttons
document.getElementById('btn-random-all').addEventListener('click', () => {
  sfx.itemPickup();
  nameInput.value = getRandomNickname();
  myAppearance = getRandomAppearance(true);
  refreshAvatarAndSync();
});

document.getElementById('btn-random-outfit').addEventListener('click', () => {
  sfx.customizePop();
  myAppearance = getRandomAppearance(true);
  refreshAvatarAndSync();
});

document.getElementById('btn-random-name').addEventListener('click', () => {
  sfx.customizePop();
  nameInput.value = getRandomNickname();
  refreshAvatarAndSync();
});

nameInput.addEventListener('input', () => {
  refreshAvatarAndSync();
});

// Drag to rotate 3D preview character in Lobby
const previewZone = document.getElementById('preview-touch-zone');
let isDraggingPreview = false;
let lastPreviewX = 0;
previewZone.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  isDraggingPreview = true;
  lastPreviewX = e.clientX;
});
window.addEventListener('pointermove', (e) => {
  if (!isDraggingPreview) return;
  const dx = e.clientX - lastPreviewX;
  lastPreviewX = e.clientX;
  lobbyAvatar.group.rotation.y += dx * 0.016;
});
window.addEventListener('pointerup', () => {
  isDraggingPreview = false;
});

// ================= NETWORK & ROOM SETUP =================
const onlineStatusEl = document.getElementById('online-status');
const roomInput = document.getElementById('room-input');
const roomPwdInput = document.getElementById('room-pwd-input');
const chkFillBots = document.getElementById('chk-fill-bots');
const rosterListEl = document.getElementById('roster-list');
const readyCounterEl = document.getElementById('ready-counter');
const tabPlayerBadge = document.getElementById('tab-player-badge');
const btnGuestReady = document.getElementById('btn-guest-ready');
const btnHostStart = document.getElementById('btn-host-start');

function showToast(msg) {
  const t = document.getElementById('global-toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

const network = new RoomNetwork({
  onStatus: (text) => {
    onlineStatusEl.textContent = text;
  },
  onAuthFailed: (msg) => {
    showToast(msg);
  },
  onRosterUpdate: (playersArr, roomConfig, isHost, myId) => {
    rosterListEl.innerHTML = '';
    let readyCount = 0;
    playersArr.forEach((p) => {
      if (p.ready || p.isHost) readyCount++;
      const chip = document.createElement('div');
      chip.className = 'roster-chip' + (p.ready || p.isHost ? ' ready' : '');
      const roleIcon = p.isHost ? '👑' : p.ready ? '✅' : '⏳';
      chip.textContent = `${roleIcon} ${p.name}${p.id === myId ? ' (你)' : ''}`;
      rosterListEl.appendChild(chip);
    });

    readyCounterEl.textContent = `準備 ${readyCount}/${playersArr.length}`;
    tabPlayerBadge.textContent = `${playersArr.length}人`;

    if (isHost) {
      btnHostStart.classList.remove('hidden');
      btnGuestReady.classList.add('hidden');
    } else {
      btnHostStart.classList.add('hidden');
      btnGuestReady.classList.remove('hidden');
    }
  },
  onMatchStart: (payload) => {
    isSoloSession = false;
    startMatchFromPayload(payload);
  },
  onRemoteState: (playerId, state) => {
    const p = players.get(playerId);
    if (!p || p.isLocal) return;
    p.targetX = state.x;
    p.targetY = state.y;
    p.targetZ = state.z;
    p.vx = state.vx || 0;
    p.vy = state.vy || 0;
    p.vz = state.vz || 0;
    p.rotY = state.rotY || 0;

    let needLabelRefresh = false;
    if (state.hp !== undefined && p.hp !== state.hp) {
      p.hp = state.hp;
      p.avatar.hp = state.hp;
      needLabelRefresh = true;
    }
    if (state.floor !== undefined) {
      p.maxFloor = Math.max(p.maxFloor, state.floor);
    }
    if (state.heldItem !== undefined && p.heldItem !== state.heldItem) {
      p.heldItem = state.heldItem;
      p.avatar.heldItem = state.heldItem;
      needLabelRefresh = true;
    }
    if (state.hasBomb !== undefined && p.hasBomb !== state.hasBomb) {
      p.hasBomb = state.hasBomb;
      p.avatar.hasBomb = state.hasBomb;
      needLabelRefresh = true;
    }
    if (state.isGhost !== undefined && p.isGhost !== state.isGhost) {
      p.isGhost = state.isGhost;
      p.avatar.setGhostMode(state.isGhost);
      needLabelRefresh = true;
    }
    if (needLabelRefresh) {
      p.avatar.refreshOverheadLabel();
    }
  },
  onRemoteAction: (playerId, action, payload) => {
    handleIncomingAction(playerId, action, payload);
  }
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
  roomInput.value = urlParams.get('room').toUpperCase().slice(0, 8);
}
if (urlParams.get('pwd')) {
  roomPwdInput.value = urlParams.get('pwd').slice(0, 8);
}

renderCustomizationUI();
refreshAvatarAndSync();
updateCameraProjection();

network.joinOrCreateRoom({
  roomId: roomInput.value,
  password: roomPwdInput.value,
  playerName: nameInput.value,
  appearance: myAppearance,
  fillBots: chkFillBots.checked
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  sfx.readyBeep(true);
  network.joinOrCreateRoom({
    roomId: roomInput.value,
    password: roomPwdInput.value,
    playerName: nameInput.value,
    appearance: myAppearance,
    fillBots: chkFillBots.checked
  });
});

function copyRoomInviteLink() {
  sfx.customizePop();
  const url = new URL(window.location.href);
  url.searchParams.set('room', network.roomId);
  if (roomPwdInput.value.trim()) {
    url.searchParams.set('pwd', roomPwdInput.value.trim());
  } else {
    url.searchParams.delete('pwd');
  }
  navigator.clipboard?.writeText(url.toString()).catch(() => {});
  showToast('🔗 已複製專屬邀請連結！傳給朋友點開直接進房！');
}

document.getElementById('btn-share-link').addEventListener('click', copyRoomInviteLink);
document.getElementById('btn-top-share').addEventListener('click', copyRoomInviteLink);

btnGuestReady.addEventListener('click', () => {
  const nextReady = !network.myReady;
  sfx.readyBeep(nextReady);
  network.updateMyProfile({ ready: nextReady });
  btnGuestReady.textContent = nextReady ? '✅ 已準備 (點此取消)' : '⏳ 點擊準備完成';
});

// ================= INSTANT SOLO PLAY & MULTIPLAYER START =================
function startSoloMatchNow() {
  isSoloSession = true;
  const cleanName = (nameInput.value || '下樓梯小霸王').trim().slice(0, 10) || '下樓梯小霸王';
  const list = [
    {
      id: network.myId,
      name: cleanName,
      appearance: { ...myAppearance },
      isBot: false
    }
  ];

  if (chkFillBots.checked) {
    for (let i = 1; i <= 5; i++) {
      list.push({
        id: `bot_${i}`,
        name: `🤖 ${getRandomNickname()}`,
        appearance: getRandomAppearance(true),
        isBot: true
      });
    }
  }

  startMatchFromPayload({
    seed: Math.floor(Math.random() * 900000) + 100000,
    participants: list
  });
}

document.getElementById('btn-solo-start').addEventListener('click', startSoloMatchNow);

document.getElementById('btn-hud-restart').addEventListener('click', () => {
  if (isSoloSession || network.roomPlayers.size <= 1) {
    startSoloMatchNow();
  } else if (network.isHost) {
    btnHostStart.click();
  }
});

document.getElementById('btn-ghost-finish-now').addEventListener('click', () => {
  let topSurvivor = null;
  players.forEach((p) => {
    if (!p.isGhost && (!topSurvivor || p.maxFloor > topSurvivor.maxFloor)) {
      topSurvivor = p;
    }
  });
  finishMatch(topSurvivor || localPlayer);
});

document.getElementById('btn-play-again-instant').addEventListener('click', () => {
  if (isSoloSession || network.roomPlayers.size <= 1) {
    startSoloMatchNow();
  } else if (network.isHost) {
    btnHostStart.click();
  } else {
    document.getElementById('btn-back-lobby').click();
  }
});

btnHostStart.addEventListener('click', () => {
  if (!network.isHost) {
    // If guest clicks or still connecting, start solo immediately!
    startSoloMatchNow();
    return;
  }
  isSoloSession = network.roomPlayers.size <= 1;
  const humanPlayers = Array.from(network.roomPlayers.values()).map((p) => ({
    id: p.id,
    name: p.name,
    appearance: p.appearance || getRandomAppearance(true),
    isBot: false
  }));

  const fullList = [...humanPlayers];
  if (chkFillBots.checked) {
    const targetCount = Math.max(6, humanPlayers.length);
    let botIdx = 1;
    while (fullList.length < targetCount) {
      fullList.push({
        id: `bot_${botIdx++}`,
        name: `🤖 ${getRandomNickname()}`,
        appearance: getRandomAppearance(true),
        isBot: true
      });
    }
  }

  network.hostStartMatch(fullList);
});

// ================= MATCH INITIALIZATION =================
function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
  updateCameraProjection();
}

function addEventFeed(text) {
  const feed = document.getElementById('event-feed');
  if (!feed) return;
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.textContent = text;
  feed.prepend(item);
  while (feed.children.length > 4) {
    feed.removeChild(feed.lastChild);
  }
  setTimeout(() => {
    if (item.parentNode === feed) feed.removeChild(item);
  }, 4000);
}

function showCenterBanner(text, duration = 1800) {
  const banner = document.getElementById('center-banner');
  banner.textContent = text;
  banner.classList.remove('hidden');
  clearTimeout(showCenterBanner._t);
  showCenterBanner._t = setTimeout(() => banner.classList.add('hidden'), duration);
}

function startMatchFromPayload(payload) {
  sfx.countdown(true);
  sfx.startBgm();
  sfx.setBgmIntensity(1.0);

  gameState = 'playing';
  floorCombo = 0;
  floorComboTimer = 0;
  lobbyStageGroup.visible = false;
  world.root.visible = true;
  world.resetWorld(payload.seed || 123456);

  players.forEach((p) => scene.remove(p.avatar.group));
  players.clear();

  matchParticipants = payload.participants || [];
  const total = matchParticipants.length;

  matchParticipants.forEach((part, idx) => {
    const isMe = part.id === network.myId;
    const avatar = new CharacterAvatar({
      id: part.id,
      name: part.name,
      isLocal: isMe,
      showNameplate: true,
      appearance: part.appearance || getRandomAppearance(true)
    });
    scene.add(avatar.group);

    const spreadX = total === 1 ? 0 : (idx - (total - 1) / 2) * 1.1;
    const startX = Math.max(-3.6, Math.min(3.6, spreadX));
    const startY = -FLOOR_VERTICAL_GAP + 0.32;
    const startZ = total === 1 ? 0 : (idx % 2 === 0 ? -0.45 : 0.45);

    avatar.group.position.set(startX, startY, startZ);

    const pObj = {
      id: part.id,
      name: part.name,
      isLocal: isMe,
      isBot: Boolean(part.isBot),
      avatar,
      x: startX,
      y: startY,
      z: startZ,
      targetX: startX,
      targetY: startY,
      targetZ: startZ,
      vx: 0,
      vy: 0,
      vz: 0,
      rotY: 0,
      hp: 12,
      maxFloor: 1,
      kills: 0,
      isGrounded: true,
      currentPlatformKey: 1,
      lastHealedFloor: 1,
      lavaStandTimer: 0,
      heldItem: null,
      hasBomb: false,
      bombTimer: 0,
      bombPassImmunity: 0,
      isGhost: false,
      survivalOrder: 0,
      botThinkTimer: 0,
      botTargetX: startX,
      botTargetZ: startZ,
      lastAttackerId: null
    };

    players.set(part.id, pObj);
    if (isMe) localPlayer = pObj;
  });

  if (!localPlayer && players.size > 0) {
    localPlayer = players.values().next().value;
  }

  updateHudUI();
  updateItemButtonUI();
  switchScreen('hud-screen');
  const modeMsg = players.size === 1
    ? '⚡ 單人百層極速挑戰開始！往下衝刺刷新紀錄！'
    : '🔥 深淵極速大亂鬥開始！踩頭、推人、搶道具！';
  showCenterBanner(modeMsg, 2000);
}

// ================= HUD & ITEM UI UPDATES =================
function updateHudUI() {
  if (!localPlayer) return;
  const floorEl = document.getElementById('hud-floor');
  floorEl.textContent = `🌊 地下 B${String(localPlayer.maxFloor).padStart(3, '0')} 層`;

  const comboEl = document.getElementById('hud-combo-badge');
  if (floorCombo >= 2 && !localPlayer.isGhost) {
    comboEl.textContent = `🔥 極速連下 x${floorCombo}`;
    comboEl.classList.remove('hidden');
  } else {
    comboEl.classList.add('hidden');
  }

  const hpText = document.getElementById('hud-hp-text');
  hpText.textContent = localPlayer.isGhost ? '👻 背後靈' : `❤️ ${localPlayer.hp}/12`;

  const segWrap = document.getElementById('hud-hp-segments');
  segWrap.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const seg = document.createElement('div');
    let cls = 'hp-seg';
    if (!localPlayer.isGhost && i < localPlayer.hp) {
      cls += ' filled';
      if (localPlayer.hp <= 4) cls += ' danger';
      else if (localPlayer.hp <= 7) cls += ' warn';
    }
    seg.className = cls;
    segWrap.appendChild(seg);
  }

  let aliveCount = 0;
  players.forEach((p) => {
    if (!p.isGhost) aliveCount++;
  });
  document.getElementById('hud-alive-count').textContent =
    players.size === 1 ? '⚡ 單人挑戰' : `👑 存活: ${aliveCount}/${players.size}`;

  const aliveCluster = document.getElementById('alive-actions');
  const ghostCluster = document.getElementById('ghost-actions');
  const ghostBanner = document.getElementById('ghost-mode-banner');

  if (localPlayer.isGhost) {
    aliveCluster.classList.add('hidden');
    ghostCluster.classList.remove('hidden');
    ghostBanner.classList.remove('hidden');
  } else {
    aliveCluster.classList.remove('hidden');
    ghostCluster.classList.add('hidden');
    ghostBanner.classList.add('hidden');
  }
}

function updateItemButtonUI() {
  const btn = document.getElementById('btn-use-item');
  const iconEl = document.getElementById('item-btn-icon');
  const nameEl = document.getElementById('item-btn-name');
  const subEl = document.getElementById('item-btn-sub');

  if (!localPlayer || !localPlayer.heldItem) {
    btn.classList.add('empty');
    btn.disabled = true;
    iconEl.textContent = '🎁';
    nameEl.textContent = '無道具';
    subEl.textContent = '踩問號箱拾取';
    return;
  }

  const meta = ITEM_META[localPlayer.heldItem] || { icon: '🎁', name: '神秘道具' };
  btn.classList.remove('empty');
  btn.disabled = false;
  iconEl.textContent = meta.icon;
  nameEl.textContent = meta.name;
  subEl.textContent = '點擊立即害人！';
}

// ================= PVP & SABOTAGE ACTIONS =================
function performJump(p) {
  if (!p || p.isGhost || p.avatar.frozenTimer > 0) return;
  if (p.isGrounded) {
    p.vy = 10.2;
    p.isGrounded = false;
    if (p.isLocal) sfx.jump();
  }
}

function performShove(attacker) {
  if (!attacker || attacker.isGhost || attacker.avatar.frozenTimer > 0) return;
  attacker.avatar.punchAnimTimer = 0.28;
  if (attacker.isLocal) sfx.shovePunch();

  players.forEach((victim) => {
    if (victim.id === attacker.id || victim.isGhost) return;
    const dx = victim.x - attacker.x;
    const dy = victim.y - attacker.y;
    const dz = victim.z - attacker.z;
    const distXZ = Math.hypot(dx, dz);

    if (distXZ < 2.45 && Math.abs(dy) < 1.8) {
      const angle = Math.atan2(dz, dx);
      victim.vx += Math.cos(angle) * 12.5;
      victim.vz += Math.sin(angle) * 12.5;
      victim.vy = Math.max(victim.vy, 5.2);
      victim.isGrounded = false;
      victim.lastAttackerId = attacker.id;
      if (attacker.isLocal || victim.isLocal) {
        screenShakeTimer = 0.16;
      }
      addEventFeed(`🥊 ${attacker.name} 狠推了 ${victim.name} 一把！`);
    }
  });
}

function useHeldItem(user) {
  if (!user || user.isGhost || !user.heldItem) return;
  const itemType = user.heldItem;
  user.heldItem = null;
  user.avatar.heldItem = null;
  user.avatar.refreshOverheadLabel();
  if (user.isLocal) updateItemButtonUI();

  network.sendAction('use_item', {
    itemType,
    x: user.x,
    y: user.y,
    z: user.z
  });

  executeItemEffect(user, itemType, user.x, user.y, user.z);
}

function executeItemEffect(user, itemType, x, y, z) {
  if (itemType === 'banana') {
    sfx.customizePop();
    world.spawnBananaHazard(x, y, z, user.id);
    addEventFeed(`🍌 ${user.name} 在踏板上丟了香蕉皮！`);
  } else if (itemType === 'glove') {
    sfx.shovePunch();
    user.avatar.punchAnimTimer = 0.4;
    screenShakeTimer = 0.22;
    players.forEach((v) => {
      if (v.id === user.id || v.isGhost) return;
      const dist = Math.hypot(v.x - x, v.z - z);
      if (dist < 4.5 && Math.abs(v.y - y) < 2.6) {
        const ang = Math.atan2(v.z - z, v.x - x);
        v.vx += Math.cos(ang) * 18.0;
        v.vz += Math.sin(ang) * 18.0;
        v.vy = 7.8;
        v.isGrounded = false;
        v.lastAttackerId = user.id;
      }
    });
    addEventFeed(`🥊 ${user.name} 揮出彈簧重拳轟飛對手！`);
  } else if (itemType === 'bomb') {
    sfx.switchTrigger();
    let nearest = null;
    let bestD = Infinity;
    players.forEach((v) => {
      if (v.id !== user.id && !v.isGhost) {
        const d = Math.hypot(v.x - x, v.y - y, v.z - z);
        if (d < bestD) {
          bestD = d;
          nearest = v;
        }
      }
    });
    const target = nearest || user;
    target.hasBomb = true;
    target.bombTimer = 3.8;
    target.bombPassImmunity = 0.55;
    target.avatar.hasBomb = true;
    target.avatar.refreshOverheadLabel();
    addEventFeed(`💣 ${user.name} 把定時炸彈塞給了 ${target.name}！`);
  } else if (itemType === 'freeze') {
    sfx.freezeRay();
    players.forEach((v) => {
      if (v.id !== user.id && !v.isGhost) {
        const d = Math.hypot(v.x - x, v.y - y, v.z - z);
        if (d < 6.8) {
          v.avatar.frozenTimer = 1.8;
          v.vx *= 0.2;
          v.vz *= 0.2;
        }
      }
    });
    addEventFeed(`❄️ ${user.name} 發射急凍光線凍結了周圍對手！`);
  } else if (itemType === 'swap') {
    const candidates = [];
    players.forEach((v) => {
      if (v.id !== user.id && !v.isGhost) candidates.push(v);
    });
    if (candidates.length > 0) {
      sfx.swapTeleport();
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const tx = target.x, ty = target.y, tz = target.z;
      target.x = user.x; target.y = user.y; target.z = user.z;
      user.x = tx; user.y = ty + 0.4; user.z = tz;
      user.vy = Math.max(0, user.vy);
      addEventFeed(`🔀 ${user.name} 發動抓交替，與 ${target.name} 瞬間換位！`);
    }
  }
}

function handleIncomingAction(playerId, action, payload) {
  const actor = players.get(playerId);
  if (!actor) return;

  if (action === 'shove') {
    performShove(actor);
  } else if (action === 'use_item') {
    executeItemEffect(actor, payload.itemType, payload.x, payload.y, payload.z);
  } else if (action === 'trigger_switch') {
    activateFieldSwitch(actor, payload.switchType);
  } else if (action === 'ghost_curse') {
    const newType = payload.newType || 'spike';
    world.cursePlatform(payload.floorKey, newType);
    sfx.ghostCurse();
    addEventFeed(`👻 背後靈 ${actor.name} 將踏板詛咒成危險機關！`);
  } else if (action === 'ghost_rock') {
    sfx.switchTrigger();
    world.triggerRockfall(world.ceilingY);
    addEventFeed(`☄️ 背後靈 ${actor.name} 召喚了深淵落石雨！`);
  }
}

function activateFieldSwitch(actor, switchType) {
  sfx.switchTrigger();
  const pill = document.getElementById('hud-field-event');
  pill.classList.remove('hidden');

  if (switchType === 'speed_up') {
    world.speedBoostTimer = 5.5;
    pill.textContent = '⚡ 全場極速下墜中！';
    addEventFeed(`⚡ ${actor.name} 踩下全場加速開關！`);
  } else if (switchType === 'reverse_belt') {
    world.conveyorReversed = !world.conveyorReversed;
    pill.textContent = '🔄 輸送帶方向大逆轉！';
    addEventFeed(`🔄 ${actor.name} 逆轉了所有輸送帶方向！`);
  } else if (switchType === 'rockfall') {
    world.triggerRockfall(world.ceilingY);
    pill.textContent = '☄️ 警告：天降熔岩落石！';
    addEventFeed(`☄️ ${actor.name} 啟動了天降落石機關！`);
  }

  clearTimeout(activateFieldSwitch._t);
  activateFieldSwitch._t = setTimeout(() => {
    pill.classList.add('hidden');
  }, 5000);
}

// ================= MOBILE FLOATING JOYSTICK & MULTI-TOUCH =================
const joyZone = document.getElementById('joystick-zone');
const joyBase = document.getElementById('joystick-base');
const joyKnob = document.getElementById('joystick-knob');
let activeJoyPointerId = null;
let joyCenterX = 0;
let joyCenterY = 0;
const maxJoyRadius = 42;

joyZone.addEventListener('pointerdown', (e) => {
  if (activeJoyPointerId !== null) return;
  activeJoyPointerId = e.pointerId;
  joyZone.setPointerCapture(e.pointerId);

  const rect = joyZone.getBoundingClientRect();
  joyCenterX = e.clientX;
  joyCenterY = e.clientY;

  const localLeft = Math.max(8, Math.min(rect.width - 124, e.clientX - rect.left - 58));
  const localBottom = Math.max(8, Math.min(rect.height - 124, rect.bottom - e.clientY - 58));
  joyBase.style.left = `${localLeft}px`;
  joyBase.style.bottom = `${localBottom}px`;
  joyKnob.style.transform = `translate(0px, 0px)`;
  joyX = 0;
  joyY = 0;
});

joyZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activeJoyPointerId) return;
  const dx = e.clientX - joyCenterX;
  const dy = e.clientY - joyCenterY;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, maxJoyRadius);
  const angle = Math.atan2(dy, dx);

  const kx = Math.cos(angle) * clamped;
  const ky = Math.sin(angle) * clamped;
  joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;

  joyX = kx / maxJoyRadius;
  joyY = ky / maxJoyRadius;
});

function releaseJoystick(e) {
  if (e.pointerId !== activeJoyPointerId) return;
  activeJoyPointerId = null;
  joyX = 0;
  joyY = 0;
  joyKnob.style.transform = `translate(0px, 0px)`;
  joyBase.style.left = `14px`;
  joyBase.style.bottom = `22px`;
}
joyZone.addEventListener('pointerup', releaseJoystick);
joyZone.addEventListener('pointercancel', releaseJoystick);

// Right-side Multi-Touch Action Buttons
document.getElementById('btn-jump').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (localPlayer) performJump(localPlayer);
});

document.getElementById('btn-shove').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!localPlayer || localPlayer.isGhost || shoveCooldown > 0) return;
  shoveCooldown = 1.05;
  performShove(localPlayer);
  network.sendAction('shove', {});
});

document.getElementById('btn-use-item').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (localPlayer && localPlayer.heldItem) {
    useHeldItem(localPlayer);
  }
});

// Ghost Revenge Buttons
document.getElementById('btn-ghost-curse').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!localPlayer || !localPlayer.isGhost || ghostCurseCooldown > 0) return;
  let bestKey = null;
  let bestDist = Infinity;
  for (const [k, p] of world.platforms.entries()) {
    if (!p.isBroken && (p.type === 'normal' || p.type === 'conveyor_left' || p.type === 'conveyor_right')) {
      const d = Math.hypot(p.x - localPlayer.x, p.y - localPlayer.y, p.z - localPlayer.z);
      if (d < bestDist) {
        bestDist = d;
        bestKey = k;
      }
    }
  }
  if (bestKey !== null) {
    ghostCurseCooldown = 3.5;
    const newType = Math.random() < 0.5 ? 'spike' : 'cracked';
    world.cursePlatform(bestKey, newType);
    sfx.ghostCurse();
    addEventFeed(`👻 你詛咒了第 B${Math.floor(bestKey)} 層踏板！`);
    network.sendAction('ghost_curse', { floorKey: bestKey, newType });
  }
});

document.getElementById('btn-ghost-rock').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!localPlayer || !localPlayer.isGhost || ghostRockCooldown > 0) return;
  ghostRockCooldown = 5.5;
  sfx.switchTrigger();
  world.triggerRockfall(world.ceilingY);
  addEventFeed(`☄️ 你召喚了深淵落石雨！`);
  network.sendAction('ghost_rock', {});
});

document.getElementById('btn-ghost-dash').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!localPlayer || !localPlayer.isGhost) return;
  const survivors = [];
  players.forEach((p) => {
    if (!p.isGhost) survivors.push(p);
  });
  if (survivors.length > 0) {
    const target = survivors[Math.floor(Math.random() * survivors.length)];
    localPlayer.x = target.x + (Math.random() - 0.5) * 2;
    localPlayer.y = target.y + 1.0;
    localPlayer.z = target.z;
    sfx.swapTeleport();
  }
});

document.getElementById('btn-cam-mode').addEventListener('click', (e) => {
  cameraCloseMode = !cameraCloseMode;
  e.currentTarget.textContent = cameraCloseMode ? '🎥 近距' : '🎥 視角';
});

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (gameState !== 'playing' || !localPlayer) return;
  if (e.code === 'Space') {
    performJump(localPlayer);
  } else if (e.code === 'KeyF' || e.code === 'KeyQ') {
    if (shoveCooldown <= 0 && !localPlayer.isGhost) {
      shoveCooldown = 1.05;
      performShove(localPlayer);
      network.sendAction('shove', {});
    }
  } else if (e.code === 'KeyE' || e.code === 'Enter') {
    if (localPlayer.heldItem) useHeldItem(localPlayer);
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// ================= PHYSICS & BOT AI LOOP =================
function damagePlayer(p, amount, reasonText) {
  if (p.isGhost) return;
  p.hp = Math.max(0, p.hp - amount);
  p.avatar.hp = p.hp;
  p.avatar.refreshOverheadLabel();
  if (p.isLocal) {
    screenShakeTimer = 0.22;
    updateHudUI();
  }

  if (p.hp <= 0) {
    eliminatePlayer(p, reasonText || `💀 ${p.name} 體力耗盡倒下了！`);
  }
}

function eliminatePlayer(p, message) {
  if (p.isGhost) return;
  p.hp = 0;
  p.hasBomb = false;
  p.avatar.hasBomb = false;
  p.isGhost = true;
  p.avatar.setGhostMode(true);

  let remainingAlive = 0;
  players.forEach((other) => {
    if (!other.isGhost) remainingAlive++;
  });
  p.survivalOrder = remainingAlive + 1;

  if (p.lastAttackerId && players.has(p.lastAttackerId)) {
    players.get(p.lastAttackerId).kills++;
  }

  sfx.fallEliminated();
  addEventFeed(message);

  // If pure 1-player mode (no bots/peers), end match immediately!
  if (players.size === 1) {
    finishMatch(localPlayer);
    return;
  }

  if (p.isLocal) {
    showCenterBanner('👻 你變成了背後靈！可害人或點上方「立即結算重玩」！', 2400);
  }
  updateHudUI();
  checkMatchEndCondition();
}

function checkMatchEndCondition() {
  if (gameState !== 'playing') return;
  const aliveList = [];
  players.forEach((p) => {
    if (!p.isGhost) aliveList.push(p);
  });

  if ((players.size > 1 && aliveList.length <= 1) || aliveList.length === 0) {
    if (aliveList.length === 1) {
      aliveList[0].survivalOrder = 1;
    }
    finishMatch(aliveList[0] || localPlayer);
  }
}

function finishMatch(winner) {
  if (gameState === 'result') return;
  gameState = 'result';
  sfx.stopBgm();
  sfx.win();

  const titleEl = document.getElementById('result-title');
  const subEl = document.getElementById('result-subtitle');
  const listEl = document.getElementById('leaderboard-list');

  if (players.size === 1 && localPlayer) {
    titleEl.textContent = `⚡ 單人挑戰結束！抵達 B${String(localPlayer.maxFloor).padStart(3, '0')} 層！`;
  } else {
    titleEl.textContent = winner ? `🏆 冠軍：${winner.name}！` : '🏁 回合結束！';
  }

  const sorted = Array.from(players.values()).sort((a, b) => {
    const rankA = a.isGhost ? a.survivalOrder : 1;
    const rankB = b.isGhost ? b.survivalOrder : 1;
    if (rankA !== rankB) return rankA - rankB;
    return b.maxFloor - a.maxFloor;
  });

  const deepest = Math.max(...sorted.map((p) => p.maxFloor), 1);
  subEl.textContent = `本局最深紀錄：地下 B${String(deepest).padStart(3, '0')} 層`;

  listEl.innerHTML = '';
  sorted.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'leader-row' + (idx === 0 ? ' winner' : '');
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
    row.innerHTML = `
      <span>${medal} ${p.name}${p.isLocal ? ' (你)' : ''}</span>
      <span>🌊 B${String(p.maxFloor).padStart(3, '0')}層 ｜ 💥 害人 ${p.kills}</span>
    `;
    listEl.appendChild(row);
  });

  switchScreen('result-screen');
}

document.getElementById('btn-back-lobby').addEventListener('click', () => {
  sfx.stopBgm();
  sfx.customizePop();
  gameState = 'lobby';
  world.root.visible = false;
  lobbyStageGroup.visible = true;
  players.forEach((p) => scene.remove(p.avatar.group));
  players.clear();
  switchScreen('lobby-screen');
});

function updateBotInput(bot, dt) {
  bot.botThinkTimer -= dt;
  if (bot.botThinkTimer <= 0) {
    bot.botThinkTimer = 0.18 + Math.random() * 0.18;

    let bestPlat = null;
    let bestScore = Infinity;
    for (const [, plat] of world.platforms.entries()) {
      if (plat.isBroken) continue;
      const dy = bot.y - plat.y;
      if (dy >= -0.6 && dy < 6.8) {
        const dist = Math.hypot(plat.x - bot.x, plat.z - bot.z);
        const hazardPenalty = plat.type === 'spike' ? 4.5 : plat.type === 'lava' ? 2.5 : 0;
        const score = dist + hazardPenalty - dy * 0.35;
        if (score < bestScore) {
          bestScore = score;
          bestPlat = plat;
        }
      }
    }

    if (bestPlat) {
      const ceilingDist = world.ceilingY - bot.y;
      if (bot.isGrounded && ceilingDist < 6.0) {
        bot.botTargetX = bestPlat.x + (bestPlat.x > 0 ? -bestPlat.w * 0.72 : bestPlat.w * 0.72);
        bot.botTargetZ = bestPlat.z;
      } else {
        bot.botTargetX = bestPlat.x + (Math.random() - 0.5) * (bestPlat.w * 0.5);
        bot.botTargetZ = bestPlat.z + (Math.random() - 0.5) * (bestPlat.d * 0.4);
      }
    }

    if (bot.heldItem && Math.random() < 0.5) {
      useHeldItem(bot);
    }
    players.forEach((other) => {
      if (other.id !== bot.id && !other.isGhost) {
        const d = Math.hypot(other.x - bot.x, other.z - bot.z);
        if (d < 1.9 && Math.abs(other.y - bot.y) < 1.2 && Math.random() < 0.4) {
          performShove(bot);
        }
      }
    });
  }

  const dx = bot.botTargetX - bot.x;
  const dz = bot.botTargetZ - bot.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.2) {
    return { mx: dx / len, mz: dz / len };
  }
  return { mx: 0, mz: 0 };
}

function updatePlayerPhysics(p, dt) {
  const isSimulatedLocally = p.isLocal || (network.isHost && p.isBot) || (isSoloSession && p.isBot);

  if (!isSimulatedLocally) {
    p.x += (p.targetX - p.x) * Math.min(1, dt * 16);
    p.y += (p.targetY - p.y) * Math.min(1, dt * 16);
    p.z += (p.targetZ - p.z) * Math.min(1, dt * 16);
    p.avatar.group.position.set(p.x, p.y, p.z);
    p.avatar.group.rotation.y = p.rotY;
    p.avatar.animate(dt, Math.hypot(p.vx, p.vz) > 0.4, true);
    return;
  }

  let mx = 0;
  let mz = 0;
  if (p.isLocal) {
    mx = joyX;
    mz = joyY;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
  } else if (p.isBot && !p.isGhost) {
    const bIn = updateBotInput(p, dt);
    mx = bIn.mx;
    mz = bIn.mz;
  }

  if (p.isGhost) {
    if (p.isLocal) {
      p.x += mx * 10.5 * dt;
      p.z += mz * 10.5 * dt;
      let avgY = world.ceilingY - 5.5;
      let cnt = 0;
      players.forEach((other) => {
        if (!other.isGhost) {
          avgY += other.y;
          cnt++;
        }
      });
      if (cnt > 0) avgY = (avgY - (world.ceilingY - 5.5)) / cnt;
      p.y += (avgY + 1.2 - p.y) * dt * 3.0;
    }
    p.x = Math.max(-7.8, Math.min(7.8, p.x));
    p.z = Math.max(-3.8, Math.min(3.8, p.z));
    p.avatar.group.position.set(p.x, p.y, p.z);
    p.avatar.animate(dt, true, false);
    return;
  }

  if (p.avatar.frozenTimer > 0) {
    mx = 0;
    mz = 0;
  }

  // Fast, snappy arcade movement!
  let currentPlat = world.platforms.get(p.currentPlatformKey);
  const onIce = p.isGrounded && currentPlat && currentPlat.type === 'ice';
  const moveSpeed = 8.8;
  const accel = onIce ? 3.2 : 18.5;
  const friction = onIce ? 0.985 : 0.78;

  if (Math.hypot(mx, mz) > 0.04) {
    p.vx += (mx * moveSpeed - p.vx) * Math.min(1, accel * dt);
    p.vz += (mz * moveSpeed - p.vz) * Math.min(1, accel * dt);
    p.rotY = Math.atan2(mx, mz);
  } else {
    p.vx *= Math.pow(friction, dt * 60);
    p.vz *= Math.pow(friction, dt * 60);
  }

  if (p.isGrounded && currentPlat) {
    if (currentPlat.type === 'conveyor_left' || currentPlat.type === 'conveyor_right') {
      const dir = (currentPlat.type === 'conveyor_right' ? 1 : -1) * (world.conveyorReversed ? -1 : 1);
      p.x += dir * 5.0 * dt;
    }
  }

  // Crisp fast gravity
  const prevY = p.y;
  p.vy -= 31.5 * dt;
  p.vy = Math.max(-23.5, p.vy);

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;

  p.x = Math.max(-8.2, Math.min(8.2, p.x));
  p.z = Math.max(-4.1, Math.min(4.1, p.z));

  p.isGrounded = false;
  let highestGroundBelow = null;

  for (const [key, plat] of world.platforms.entries()) {
    if (plat.isBroken) continue;
    const halfW = plat.w * 0.5 + 0.28;
    const halfD = plat.d * 0.5 + 0.28;

    if (Math.abs(p.x - plat.x) <= halfW && Math.abs(p.z - plat.z) <= halfD) {
      const topY = plat.y + 0.26;
      if (topY <= prevY + 0.35 && (highestGroundBelow === null || topY > highestGroundBelow)) {
        highestGroundBelow = topY;
      }

      if (p.vy <= 0 && prevY >= topY - 0.22 && p.y <= topY + 0.18) {
        p.y = topY;
        p.vy = 0;
        p.isGrounded = true;
        p.currentPlatformKey = key;
        currentPlat = plat;

        if (plat.floorIndex > p.maxFloor) {
          p.maxFloor = plat.floorIndex;
          if (p.isLocal) {
            floorCombo++;
            floorComboTimer = 2.4;
            updateHudUI();
          }
        }

        handlePlatformLanding(p, plat);
        break;
      }
    }
  }

  p.avatar.updateLandingProjection(highestGroundBelow);

  if (p.isGrounded && currentPlat && !currentPlat.isBroken) {
    if (currentPlat.type === 'lava') {
      p.lavaStandTimer += dt;
      if (p.lavaStandTimer > 0.55) {
        p.lavaStandTimer = 0;
        p.vy = 9.5;
        p.isGrounded = false;
        if (p.isLocal) sfx.stepLava();
        damagePlayer(p, 2, `🔥 ${p.name} 被熔岩踏板燙死！`);
      }
    } else if (currentPlat.type === 'catapult') {
      currentPlat.catapultCharge += dt;
      if (currentPlat.catapultCharge > 0.42) {
        currentPlat.catapultCharge = 0;
        const randAng = Math.random() * Math.PI * 2;
        p.vx = Math.cos(randAng) * 15.5;
        p.vz = Math.sin(randAng) * 15.5;
        p.vy = 8.2;
        p.isGrounded = false;
        if (p.isLocal) sfx.stepCatapult();
      }
    }

    if (currentPlat.hasItemBox && currentPlat.itemBoxMesh) {
      const boxWorldX = currentPlat.x + currentPlat.itemBoxMesh.position.x;
      const boxWorldZ = currentPlat.z + currentPlat.itemBoxMesh.position.z;
      if (Math.hypot(p.x - boxWorldX, p.z - boxWorldZ) < 1.1) {
        currentPlat.hasItemBox = false;
        currentPlat.itemBoxMesh.visible = false;
        const itemKeys = Object.keys(ITEM_META);
        const picked = itemKeys[Math.floor(Math.random() * itemKeys.length)];
        p.heldItem = picked;
        p.avatar.heldItem = picked;
        p.avatar.refreshOverheadLabel();
        if (p.isLocal) {
          sfx.itemPickup();
          updateItemButtonUI();
        }
      }
    }

    if (currentPlat.switchType && currentPlat.switchCooldown <= 0) {
      if (Math.hypot(p.x - currentPlat.x, p.z - currentPlat.z) < 1.0) {
        currentPlat.switchCooldown = 7.0;
        activateFieldSwitch(p, currentPlat.switchType);
        network.sendAction('trigger_switch', { switchType: currentPlat.switchType });
      }
    }
  } else {
    p.lavaStandTimer = 0;
  }

  for (let i = world.bananas.length - 1; i >= 0; i--) {
    const b = world.bananas[i];
    if (performance.now() - b.createdAt < 400 && b.ownerId === p.id) continue;
    if (Math.hypot(p.x - b.x, p.z - b.z) < 0.88 && Math.abs(p.y - b.y) < 1.0) {
      world.root.remove(b.mesh);
      world.bananas.splice(i, 1);
      sfx.bananaSlip();
      const slipAngle = Math.random() * Math.PI * 2;
      p.vx = Math.cos(slipAngle) * 15.5;
      p.vz = Math.sin(slipAngle) * 15.5;
      p.vy = 6.5;
      p.isGrounded = false;
      p.lastAttackerId = b.ownerId;
      addEventFeed(`🍌 ${p.name} 踩到香蕉皮大滑倒！`);
    }
  }

  for (let i = world.rocks.length - 1; i >= 0; i--) {
    const r = world.rocks[i];
    if (Math.hypot(p.x - r.x, p.z - r.z) < 1.05 && Math.abs(p.y + 0.8 - r.y) < 1.2) {
      sfx.explosion();
      p.vy = -9.0;
      p.vx += (Math.random() - 0.5) * 12;
      damagePlayer(p, 3, `☄️ ${p.name} 被天降落石砸入深淵！`);
      world.root.remove(r.mesh);
      world.root.remove(r.warningLine);
      world.rocks.splice(i, 1);
    }
  }

  if (p.hasBomb) {
    p.bombPassImmunity = Math.max(0, p.bombPassImmunity - dt);
    p.bombTimer -= dt;

    if (p.bombPassImmunity <= 0) {
      players.forEach((other) => {
        if (other.id !== p.id && !other.isGhost && !other.hasBomb) {
          if (Math.hypot(other.x - p.x, other.z - p.z) < 1.08 && Math.abs(other.y - p.y) < 1.4) {
            p.hasBomb = false;
            p.avatar.hasBomb = false;
            p.avatar.refreshOverheadLabel();

            other.hasBomb = true;
            other.bombTimer = Math.max(1.6, p.bombTimer);
            other.bombPassImmunity = 0.7;
            other.avatar.hasBomb = true;
            other.avatar.refreshOverheadLabel();
            sfx.switchTrigger();
            addEventFeed(`💣 ${p.name} 把炸彈傳染給了 ${other.name}！`);
          }
        }
      });
    }

    if (p.hasBomb && p.bombTimer <= 0) {
      p.hasBomb = false;
      p.avatar.hasBomb = false;
      p.avatar.refreshOverheadLabel();
      sfx.explosion();
      p.vy = 9.5;
      p.vx = (Math.random() - 0.5) * 16;
      damagePlayer(p, 4, `💥 ${p.name} 被定時炸彈炸飛淘汰！`);
    }
  }

  players.forEach((other) => {
    if (other.id === p.id || other.isGhost) return;
    const dx = p.x - other.x;
    const dz = p.z - other.z;
    const distXZ = Math.hypot(dx, dz);
    const dy = p.y - other.y;

    if (p.vy < -1.0 && distXZ < 0.95 && dy >= 0.82 && dy <= 1.9) {
      p.vy = 11.5;
      p.isGrounded = false;
      p.kills++;

      other.avatar.squishTimer = 0.6;
      other.vy = -10.5;
      other.lastAttackerId = p.id;
      if (p.isLocal || other.isLocal) screenShakeTimer = 0.18;
      sfx.stompHead();
      addEventFeed(`👟 ${p.name} 踩扁了 ${other.name} 的頭二段跳！`);
      damagePlayer(other, 1, `👟 ${other.name} 被 ${p.name} 一腳踩進深淵！`);
    } else if (distXZ < 0.78 && distXZ > 0.001 && Math.abs(dy) < 1.1) {
      const push = (0.78 - distXZ) * 0.55;
      const nx = dx / distXZ;
      const nz = dz / distXZ;
      p.x += nx * push;
      p.z += nz * push;
      other.x -= nx * push;
      other.z -= nz * push;
    }
  });

  if (p.y + 1.65 >= world.ceilingY - 0.4) {
    p.y = world.ceilingY - 2.2;
    p.vy = -9.0;
    p.isGrounded = false;
    if (p.isLocal) sfx.stepSpike();
    damagePlayer(p, 4, `⚙️ ${p.name} 被頭頂尖刺天花板刺穿淘汰！`);
  }

  if (p.y < world.ceilingY - 21.5) {
    eliminatePlayer(p, `🕳️ ${p.name} 墜入無底深淵淘汰！`);
  }

  p.avatar.group.position.set(p.x, p.y, p.z);
  p.avatar.group.rotation.y = p.rotY;
  p.avatar.animate(dt, Math.hypot(p.vx, p.vz) > 0.45, p.isGrounded);
}

function handlePlatformLanding(p, plat) {
  if (plat.type === 'normal' || plat.type === 'conveyor_left' || plat.type === 'conveyor_right' || plat.type === 'ice') {
    if (p.lastHealedFloor !== plat.floorIndex) {
      p.lastHealedFloor = plat.floorIndex;
      if (p.hp < 12) {
        p.hp = Math.min(12, p.hp + 1);
        p.avatar.hp = p.hp;
        p.avatar.refreshOverheadLabel();
        if (p.isLocal) updateHudUI();
      }
      if (p.isLocal) {
        if (plat.type === 'ice') sfx.stepIce();
        else sfx.stepNormal(floorCombo);
      }
    }
  } else if (plat.type === 'spike') {
    if (p.lastHealedFloor !== plat.floorIndex) {
      p.lastHealedFloor = plat.floorIndex;
      p.vy = 5.4;
      p.isGrounded = false;
      if (p.isLocal) sfx.stepSpike();
      damagePlayer(p, 3, `🩸 ${p.name} 踩上尖刺釘板陣亡！`);
    }
  } else if (plat.type === 'spring') {
    p.vy = 14.5;
    p.isGrounded = false;
    if (p.isLocal) sfx.stepSpring();
  } else if (plat.type === 'cracked') {
    if (plat.crackedTimer === 0) {
      plat.crackedTimer = 0.01;
      if (p.isLocal) sfx.stepCracked();
    }
  }
}

// ================= MAIN RENDER LOOP =================
let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (gameState === 'lobby') {
    if (!isDraggingPreview) {
      lobbyAvatar.group.rotation.y += dt * 0.6;
    }
    lobbyAvatar.animate(dt, false, true);
    // Position camera so the character + pedestal sits cleanly inside the top showcase window!
    camera.position.set(0, 1.15, 3.65);
    camera.lookAt(0, 0.98, 0);
  } else if (gameState === 'playing') {
    // Combo decay
    if (floorComboTimer > 0) {
      floorComboTimer -= dt;
      if (floorComboTimer <= 0) {
        floorCombo = 0;
        updateHudUI();
      }
    }

    // Dynamic BGM tempo scales with depth & speed boost!
    const depthFactor = localPlayer ? 1.0 + Math.min(0.55, localPlayer.maxFloor * 0.012) : 1.0;
    const boostFactor = world.speedBoostTimer > 0 ? 1.25 : 1.0;
    sfx.setBgmIntensity(depthFactor * boostFactor);

    if (shoveCooldown > 0) {
      shoveCooldown = Math.max(0, shoveCooldown - dt);
      document.getElementById('shove-cd-text').textContent =
        shoveCooldown > 0 ? `${shoveCooldown.toFixed(1)}s` : '就緒';
    }
    if (ghostCurseCooldown > 0) {
      ghostCurseCooldown = Math.max(0, ghostCurseCooldown - dt);
      document.getElementById('curse-cd-text').textContent =
        ghostCurseCooldown > 0 ? `冷卻 ${ghostCurseCooldown.toFixed(1)}s` : '變成尖刺/碎裂磚';
    }
    if (ghostRockCooldown > 0) {
      ghostRockCooldown = Math.max(0, ghostRockCooldown - dt);
      document.getElementById('rock-cd-text').textContent =
        ghostRockCooldown > 0 ? `${ghostRockCooldown.toFixed(1)}s` : '就緒';
    }

    let lowestY = world.ceilingY - 10;
    players.forEach((p) => {
      if (!p.isGhost && p.y < lowestY) lowestY = p.y;
    });

    world.update(dt, lowestY);

    players.forEach((p) => {
      updatePlayerPhysics(p, dt);
    });

    if (localPlayer && !localPlayer.isGhost) {
      const ceilDist = Math.max(0, world.ceilingY - (localPlayer.y + 1.6));
      const warnEl = document.getElementById('hud-ceiling-warn');
      warnEl.textContent = ceilDist < 3.5
        ? `🚨 小心頭頂尖刺！(${ceilDist.toFixed(1)}m)`
        : `⚙️ 尖刺距離 ${ceilDist.toFixed(1)}m`;
    }

    // Fast-tracking 3D Party Camera + Screen Shake
    if (localPlayer) {
      const targetCamX = localPlayer.x * 0.38;
      const targetCamY = cameraCloseMode ? localPlayer.y + 2.8 : localPlayer.y + 3.4;
      const targetCamZ = cameraCloseMode ? 10.6 : 14.2;

      camera.position.x += (targetCamX - camera.position.x) * Math.min(1, dt * 10);
      camera.position.y += (targetCamY - camera.position.y) * Math.min(1, dt * 12);
      camera.position.z += (targetCamZ - camera.position.z) * Math.min(1, dt * 10);

      if (screenShakeTimer > 0) {
        screenShakeTimer = Math.max(0, screenShakeTimer - dt);
        camera.position.x += (Math.random() - 0.5) * 0.42;
        camera.position.y += (Math.random() - 0.5) * 0.42;
      }

      camera.lookAt(localPlayer.x * 0.25, localPlayer.y - 2.1, 0);
    }

    netSyncAccumulator += dt;
    if (netSyncAccumulator >= 0.05 && localPlayer && !isSoloSession) {
      netSyncAccumulator = 0;
      network.sendState({
        x: localPlayer.x,
        y: localPlayer.y,
        z: localPlayer.z,
        vx: localPlayer.vx,
        vy: localPlayer.vy,
        vz: localPlayer.vz,
        rotY: localPlayer.rotY,
        hp: localPlayer.hp,
        floor: localPlayer.maxFloor,
        heldItem: localPlayer.heldItem,
        hasBomb: localPlayer.hasBomb,
        isGhost: localPlayer.isGhost
      });
    }
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraProjection();
});

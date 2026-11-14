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
scene.fog = new THREE.FogExp2(0x090d16, 0.018);

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 140);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
dirLight.position.set(8, 22, 14);
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
rimLight.position.set(-10, -10, -8);
scene.add(rimLight);

// Lobby Preview Stage Group
const lobbyStageGroup = new THREE.Group();
scene.add(lobbyStageGroup);

const pedestalGeo = new THREE.CylinderGeometry(1.35, 1.55, 0.28, 32);
const pedestalMat = new THREE.MeshStandardMaterial({
  color: 0x1e293b,
  metalness: 0.4,
  roughness: 0.3
});
const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
pedestalMesh.position.y = -0.14;
lobbyStageGroup.add(pedestalMesh);

const pedestalRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.42, 0.06, 12, 36),
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

const lobbyAvatar = new CharacterAvatar({
  id: 'preview_me',
  name: nameInput.value || '下樓梯小霸王',
  isLocal: true,
  appearance: myAppearance
});
lobbyAvatar.dropRing.visible = false;
lobbyStageGroup.add(lobbyAvatar.group);

// Abyss World
const world = new AbyssWorld(scene);
world.root.visible = false;

// Game State
let gameState = 'lobby'; // 'lobby' | 'playing' | 'result'
let cameraCloseMode = false;
let matchParticipants = [];
const players = new Map(); // id -> playerRuntimeObj
let localPlayer = null;
let netSyncAccumulator = 0;

// Cooldowns & Input
let shoveCooldown = 0;
let ghostCurseCooldown = 0;
let ghostRockCooldown = 0;
let joyX = 0;
let joyY = 0;
const keys = {};

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

  // Hair Color Swatches
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

  // Selecting a Top or Bottom automatically disables full Suit so the user sees their choice immediately
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
  const hintText = isWearingSuit ? `(目前已穿 ${suitObj ? suitObj.label.split(' ')[1] : '套裝'}，點選可切回混搭)` : '';
  document.getElementById('top-override-hint').textContent = hintText;
  document.getElementById('bottom-override-hint').textContent = hintText;
}

function refreshAvatarAndSync() {
  renderCustomizationUI();
  const cleanName = (nameInput.value || '下樓梯小霸王').trim().slice(0, 10) || '下樓梯小霸王';
  lobbyAvatar.updateAppearance(myAppearance, cleanName);
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
  });
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
  lobbyAvatar.group.rotation.y += dx * 0.015;
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

// Parse URL params for One-Click Invite Link
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
  roomInput.value = urlParams.get('room').toUpperCase().slice(0, 8);
}
if (urlParams.get('pwd')) {
  roomPwdInput.value = urlParams.get('pwd').slice(0, 8);
}

renderCustomizationUI();
refreshAvatarAndSync();

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
  btnGuestReady.textContent = nextReady
    ? '✅ 已準備完成！（點擊取消）'
    : '⏳ 點擊準備完成（等待房主開局）';
});

btnHostStart.addEventListener('click', () => {
  if (!network.isHost) return;
  sfx.countdown(true);
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
  }, 4500);
}

function showCenterBanner(text, duration = 2000) {
  const banner = document.getElementById('center-banner');
  banner.textContent = text;
  banner.classList.remove('hidden');
  clearTimeout(showCenterBanner._t);
  showCenterBanner._t = setTimeout(() => banner.classList.add('hidden'), duration);
}

function startMatchFromPayload(payload) {
  sfx.countdown(true);
  gameState = 'playing';
  lobbyStageGroup.visible = false;
  world.root.visible = true;
  world.resetWorld(payload.seed || 123456);

  // Clean up previous player meshes
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
      appearance: part.appearance || getRandomAppearance(true)
    });
    scene.add(avatar.group);

    // Spread players across Floor 1 safe platform (y = -3.4)
    const spreadX = (idx - (total - 1) / 2) * 1.15;
    const startX = Math.max(-3.8, Math.min(3.8, spreadX));
    const startY = -FLOOR_VERTICAL_GAP + 0.35;
    const startZ = (idx % 2 === 0 ? -0.5 : 0.5);

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
  showCenterBanner('🔥 深淵大逃殺開始！小心頭頂尖刺與身邊損友！', 2600);
}

// ================= HUD & ITEM UI UPDATES =================
function updateHudUI() {
  if (!localPlayer) return;
  const floorEl = document.getElementById('hud-floor');
  floorEl.textContent = `🌊 地下 B${String(localPlayer.maxFloor).padStart(3, '0')} 層`;

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
  document.getElementById('hud-alive-count').textContent = `👑 存活: ${aliveCount}/${players.size}`;

  // Toggle Alive vs Ghost Controls
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
    p.vy = 9.2;
    p.isGrounded = false;
    if (p.isLocal) sfx.jump();
  }
}

function performShove(attacker) {
  if (!attacker || attacker.isGhost || attacker.avatar.frozenTimer > 0) return;
  attacker.avatar.punchAnimTimer = 0.32;
  if (attacker.isLocal) sfx.shovePunch();

  players.forEach((victim) => {
    if (victim.id === attacker.id || victim.isGhost) return;
    const dx = victim.x - attacker.x;
    const dy = victim.y - attacker.y;
    const dz = victim.z - attacker.z;
    const distXZ = Math.hypot(dx, dz);

    if (distXZ < 2.35 && Math.abs(dy) < 1.8) {
      const angle = Math.atan2(dz, dx);
      victim.vx += Math.cos(angle) * 10.5;
      victim.vz += Math.sin(angle) * 10.5;
      victim.vy = Math.max(victim.vy, 4.8);
      victim.isGrounded = false;
      victim.lastAttackerId = attacker.id;
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
    user.avatar.punchAnimTimer = 0.45;
    players.forEach((v) => {
      if (v.id === user.id || v.isGhost) return;
      const dist = Math.hypot(v.x - x, v.z - z);
      if (dist < 4.2 && Math.abs(v.y - y) < 2.5) {
        const ang = Math.atan2(v.z - z, v.x - x);
        v.vx += Math.cos(ang) * 16.5;
        v.vz += Math.sin(ang) * 16.5;
        v.vy = 7.2;
        v.isGrounded = false;
        v.lastAttackerId = user.id;
      }
    });
    addEventFeed(`🥊 ${user.name} 揮出彈簧重拳轟飛對手！`);
  } else if (itemType === 'bomb') {
    sfx.switchTrigger();
    // Attach time bomb to nearest alive rival, or self if nobody left
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
    target.bombTimer = 4.2;
    target.bombPassImmunity = 0.6;
    target.avatar.hasBomb = true;
    target.avatar.refreshOverheadLabel();
    addEventFeed(`💣 ${user.name} 把定時炸彈塞給了 ${target.name}！`);
  } else if (itemType === 'freeze') {
    sfx.freezeRay();
    players.forEach((v) => {
      if (v.id !== user.id && !v.isGhost) {
        const d = Math.hypot(v.x - x, v.y - y, v.z - z);
        if (d < 6.5) {
          v.avatar.frozenTimer = 2.0;
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
    pill.textContent = '⚡ 全場下墜加速中！';
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
const maxJoyRadius = 44;

joyZone.addEventListener('pointerdown', (e) => {
  if (activeJoyPointerId !== null) return;
  activeJoyPointerId = e.pointerId;
  joyZone.setPointerCapture(e.pointerId);

  const rect = joyZone.getBoundingClientRect();
  joyCenterX = e.clientX;
  joyCenterY = e.clientY;

  // Move visual joystick base directly under the player's thumb!
  const localLeft = Math.max(8, Math.min(rect.width - 126, e.clientX - rect.left - 59));
  const localBottom = Math.max(8, Math.min(rect.height - 126, rect.bottom - e.clientY - 59));
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
  shoveCooldown = 1.4;
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
  // Find closest safe platform near localGhost
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
    ghostCurseCooldown = 4.5;
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
  ghostRockCooldown = 7.0;
  sfx.switchTrigger();
  world.triggerRockfall(world.ceilingY);
  addEventFeed(`☄️ 你召喚了深淵落石雨！`);
  network.sendAction('ghost_rock', {});
});

document.getElementById('btn-ghost-dash').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!localPlayer || !localPlayer.isGhost) return;
  // Teleport ghost directly to a random alive survivor to harass them!
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

// Camera Mode Toggle
document.getElementById('btn-cam-mode').addEventListener('click', (e) => {
  cameraCloseMode = !cameraCloseMode;
  e.currentTarget.textContent = cameraCloseMode ? '🎥 近距視角' : '🎥 俯視視角';
});

// Keyboard support for PC players
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (gameState !== 'playing' || !localPlayer) return;
  if (e.code === 'Space') {
    performJump(localPlayer);
  } else if (e.code === 'KeyF' || e.code === 'KeyQ') {
    if (shoveCooldown <= 0 && !localPlayer.isGhost) {
      shoveCooldown = 1.4;
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
  if (p.isLocal) updateHudUI();

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
  if (p.isLocal) {
    showCenterBanner('👻 你變成了背後靈！用右下技能繼續害人！', 2500);
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

  // End match when 1 survivor left (or 0 if single player died)
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
  sfx.win();

  const titleEl = document.getElementById('result-title');
  const subEl = document.getElementById('result-subtitle');
  const listEl = document.getElementById('leaderboard-list');

  titleEl.textContent = winner ? `🏆 冠軍：${winner.name}！` : '🏁 回合結束！';

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
    bot.botThinkTimer = 0.28 + Math.random() * 0.25;

    // Look for a safe platform below or near current Y
    let bestPlat = null;
    let bestScore = Infinity;
    for (const [, plat] of world.platforms.entries()) {
      if (plat.isBroken) continue;
      const dy = bot.y - plat.y;
      if (dy >= -0.8 && dy < 7.5) {
        const dist = Math.hypot(plat.x - bot.x, plat.z - bot.z);
        const hazardPenalty = plat.type === 'spike' ? 4.5 : plat.type === 'lava' ? 2.5 : 0;
        const score = dist + hazardPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestPlat = plat;
        }
      }
    }

    if (bestPlat) {
      // If currently standing on a platform and ceiling is close, intentionally walk off the edge to drop down!
      const ceilingDist = world.ceilingY - bot.y;
      if (bot.isGrounded && ceilingDist < 5.2) {
        bot.botTargetX = bestPlat.x + (bestPlat.x > 0 ? -bestPlat.w * 0.68 : bestPlat.w * 0.68);
        bot.botTargetZ = bestPlat.z;
      } else {
        bot.botTargetX = bestPlat.x + (Math.random() - 0.5) * (bestPlat.w * 0.5);
        bot.botTargetZ = bestPlat.z + (Math.random() - 0.5) * (bestPlat.d * 0.4);
      }
    }

    // Bots also use items & shove nearby players!
    if (bot.heldItem && Math.random() < 0.45) {
      useHeldItem(bot);
    }
    players.forEach((other) => {
      if (other.id !== bot.id && !other.isGhost) {
        const d = Math.hypot(other.x - bot.x, other.z - bot.z);
        if (d < 1.8 && Math.abs(other.y - bot.y) < 1.2 && Math.random() < 0.35) {
          performShove(bot);
        }
      }
    });
  }

  const dx = bot.botTargetX - bot.x;
  const dz = bot.botTargetZ - bot.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.25) {
    return { mx: dx / len, mz: dz / len };
  }
  return { mx: 0, mz: 0 };
}

function updatePlayerPhysics(p, dt) {
  const isSimulatedLocally = p.isLocal || (network.isHost && p.isBot);

  if (!isSimulatedLocally) {
    // Smooth interpolation for remote multiplayer peers
    p.x += (p.targetX - p.x) * Math.min(1, dt * 14);
    p.y += (p.targetY - p.y) * Math.min(1, dt * 14);
    p.z += (p.targetZ - p.z) * Math.min(1, dt * 14);
    p.avatar.group.position.set(p.x, p.y, p.z);
    p.avatar.group.rotation.y = p.rotY;
    p.avatar.animate(dt, Math.hypot(p.vx, p.vz) > 0.4, true);
    return;
  }

  // Movement Input
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

  // Ghost free-flight mode
  if (p.isGhost) {
    if (p.isLocal) {
      p.x += mx * 8.5 * dt;
      p.z += mz * 8.5 * dt;
      // Keep ghost vertically near the active survivors
      let avgY = world.ceilingY - 6;
      let cnt = 0;
      players.forEach((other) => {
        if (!other.isGhost) {
          avgY += other.y;
          cnt++;
        }
      });
      if (cnt > 0) avgY = (avgY - (world.ceilingY - 6)) / cnt;
      p.y += (avgY + 1.2 - p.y) * dt * 2.5;
    }
    p.x = Math.max(-7.8, Math.min(7.8, p.x));
    p.z = Math.max(-3.8, Math.min(3.8, p.z));
    p.avatar.group.position.set(p.x, p.y, p.z);
    p.avatar.animate(dt, true, false);
    return;
  }

  // Frozen check
  if (p.avatar.frozenTimer > 0) {
    mx = 0;
    mz = 0;
  }

  // Check current platform surface properties (ice, conveyor)
  let currentPlat = world.platforms.get(p.currentPlatformKey);
  const onIce = p.isGrounded && currentPlat && currentPlat.type === 'ice';
  const moveSpeed = 6.8;
  const accel = onIce ? 2.6 : 14.0;
  const friction = onIce ? 0.985 : 0.82;

  if (Math.hypot(mx, mz) > 0.05) {
    p.vx += (mx * moveSpeed - p.vx) * Math.min(1, accel * dt);
    p.vz += (mz * moveSpeed - p.vz) * Math.min(1, accel * dt);
    p.rotY = Math.atan2(mx, mz);
  } else {
    p.vx *= Math.pow(friction, dt * 60);
    p.vz *= Math.pow(friction, dt * 60);
  }

  // Conveyor belt push
  if (p.isGrounded && currentPlat) {
    if (currentPlat.type === 'conveyor_left' || currentPlat.type === 'conveyor_right') {
      const dir = (currentPlat.type === 'conveyor_right' ? 1 : -1) * (world.conveyorReversed ? -1 : 1);
      p.x += dir * 3.4 * dt;
    }
  }

  // Gravity
  const prevY = p.y;
  p.vy -= 23.5 * dt;
  p.vy = Math.max(-19.5, p.vy);

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;

  // Keep within 3D Shaft walls
  p.x = Math.max(-8.2, Math.min(8.2, p.x));
  p.z = Math.max(-4.1, Math.min(4.1, p.z));

  // Platform Landing & Projection Scan
  p.isGrounded = false;
  let highestGroundBelow = null;

  for (const [key, plat] of world.platforms.entries()) {
    if (plat.isBroken) continue;
    const halfW = plat.w * 0.5 + 0.26;
    const halfD = plat.d * 0.5 + 0.26;

    if (Math.abs(p.x - plat.x) <= halfW && Math.abs(p.z - plat.z) <= halfD) {
      const topY = plat.y + 0.28;
      // Track highest platform below feet for the mobile laser landing ring
      if (topY <= prevY + 0.3 && (highestGroundBelow === null || topY > highestGroundBelow)) {
        highestGroundBelow = topY;
      }

      // Swept landing check
      if (p.vy <= 0 && prevY >= topY - 0.18 && p.y <= topY + 0.16) {
        p.y = topY;
        p.vy = 0;
        p.isGrounded = true;
        p.currentPlatformKey = key;
        currentPlat = plat;

        if (plat.floorIndex > p.maxFloor) {
          p.maxFloor = plat.floorIndex;
          if (p.isLocal) updateHudUI();
        }

        // Handle Landing Platform Traps!
        handlePlatformLanding(p, plat);
        break;
      }
    }
  }

  p.avatar.updateLandingProjection(highestGroundBelow);

  // Continuous Lava & Catapult platform effects while standing
  if (p.isGrounded && currentPlat && !currentPlat.isBroken) {
    if (currentPlat.type === 'lava') {
      p.lavaStandTimer += dt;
      if (p.lavaStandTimer > 0.75) {
        p.lavaStandTimer = 0;
        p.vy = 8.4;
        p.isGrounded = false;
        if (p.isLocal) sfx.stepLava();
        damagePlayer(p, 2, `🔥 ${p.name} 被熔岩踏板燙死！`);
      }
    } else if (currentPlat.type === 'catapult') {
      currentPlat.catapultCharge += dt;
      if (currentPlat.catapultCharge > 0.55) {
        currentPlat.catapultCharge = 0;
        const randAng = Math.random() * Math.PI * 2;
        p.vx = Math.cos(randAng) * 14.0;
        p.vz = Math.sin(randAng) * 14.0;
        p.vy = 7.5;
        p.isGrounded = false;
        if (p.isLocal) sfx.stepCatapult();
      }
    }

    // Item Box Pickup
    if (currentPlat.hasItemBox && currentPlat.itemBoxMesh) {
      const boxWorldX = currentPlat.x + currentPlat.itemBoxMesh.position.x;
      const boxWorldZ = currentPlat.z + currentPlat.itemBoxMesh.position.z;
      if (Math.hypot(p.x - boxWorldX, p.z - boxWorldZ) < 1.05) {
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

    // Field Sabotage Switch Trigger
    if (currentPlat.switchType && currentPlat.switchCooldown <= 0) {
      if (Math.hypot(p.x - currentPlat.x, p.z - currentPlat.z) < 0.95) {
        currentPlat.switchCooldown = 8.0;
        activateFieldSwitch(p, currentPlat.switchType);
        network.sendAction('trigger_switch', { switchType: currentPlat.switchType });
      }
    }
  } else {
    p.lavaStandTimer = 0;
  }

  // Dropped Banana Hazard Check
  for (let i = world.bananas.length - 1; i >= 0; i--) {
    const b = world.bananas[i];
    if (performance.now() - b.createdAt < 450 && b.ownerId === p.id) continue;
    if (Math.hypot(p.x - b.x, p.z - b.z) < 0.85 && Math.abs(p.y - b.y) < 1.0) {
      world.root.remove(b.mesh);
      world.bananas.splice(i, 1);
      sfx.bananaSlip();
      const slipAngle = Math.random() * Math.PI * 2;
      p.vx = Math.cos(slipAngle) * 14.5;
      p.vz = Math.sin(slipAngle) * 14.5;
      p.vy = 6.0;
      p.isGrounded = false;
      p.lastAttackerId = b.ownerId;
      addEventFeed(`🍌 ${p.name} 踩到香蕉皮大滑倒！`);
    }
  }

  // Falling Rock Hazard Check
  for (let i = world.rocks.length - 1; i >= 0; i--) {
    const r = world.rocks[i];
    if (Math.hypot(p.x - r.x, p.z - r.z) < 1.05 && Math.abs(p.y + 0.8 - r.y) < 1.2) {
      sfx.explosion();
      p.vy = -8.0;
      p.vx += (Math.random() - 0.5) * 10;
      damagePlayer(p, 3, `☄️ ${p.name} 被天降落石砸入深淵！`);
      world.root.remove(r.mesh);
      world.root.remove(r.warningLine);
      world.rocks.splice(i, 1);
    }
  }

  // Time Bomb Countdown & Passing by Body Collision
  if (p.hasBomb) {
    p.bombPassImmunity = Math.max(0, p.bombPassImmunity - dt);
    p.bombTimer -= dt;

    if (p.bombPassImmunity <= 0) {
      players.forEach((other) => {
        if (other.id !== p.id && !other.isGhost && !other.hasBomb) {
          if (Math.hypot(other.x - p.x, other.z - p.z) < 1.05 && Math.abs(other.y - p.y) < 1.4) {
            // Pass the bomb!
            p.hasBomb = false;
            p.avatar.hasBomb = false;
            p.avatar.refreshOverheadLabel();

            other.hasBomb = true;
            other.bombTimer = Math.max(1.8, p.bombTimer);
            other.bombPassImmunity = 0.75;
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
      p.vy = 8.5;
      p.vx = (Math.random() - 0.5) * 16;
      damagePlayer(p, 4, `💥 ${p.name} 被定時炸彈炸飛淘汰！`);
    }
  }

  // PvP Body Collision & Head Stomp Check!
  players.forEach((other) => {
    if (other.id === p.id || other.isGhost) return;
    const dx = p.x - other.x;
    const dz = p.z - other.z;
    const distXZ = Math.hypot(dx, dz);
    const dy = p.y - other.y;

    // 1. Head Stomp (falling onto another player's head!)
    if (p.vy < -1.0 && distXZ < 0.92 && dy >= 0.85 && dy <= 1.85) {
      p.vy = 10.6; // Bounce high up!
      p.isGrounded = false;
      p.kills++;

      other.avatar.squishTimer = 0.6;
      other.vy = -9.0; // Smash victim downward!
      other.lastAttackerId = p.id;
      sfx.stompHead();
      addEventFeed(`👟 ${p.name} 踩扁了 ${other.name} 的頭二段跳！`);
      damagePlayer(other, 1, `👟 ${other.name} 被 ${p.name} 一腳踩進深淵！`);
    }
    // 2. Horizontal Body Bump
    else if (distXZ < 0.78 && distXZ > 0.001 && Math.abs(dy) < 1.1) {
      const push = (0.78 - distXZ) * 0.55;
      const nx = dx / distXZ;
      const nz = dz / distXZ;
      p.x += nx * push;
      p.z += nz * push;
      other.x -= nx * push;
      other.z -= nz * push;
    }
  });

  // Spiked Ceiling Collision Check
  if (p.y + 1.65 >= world.ceilingY - 0.4) {
    p.y = world.ceilingY - 2.2;
    p.vy = -7.5;
    p.isGrounded = false;
    if (p.isLocal) sfx.stepSpike();
    damagePlayer(p, 4, `⚙️ ${p.name} 被頭頂尖刺天花板刺穿淘汰！`);
  }

  // Deep Abyss Fall Elimination Check
  if (p.y < world.ceilingY - 23.5) {
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
        else sfx.stepNormal();
      }
    }
  } else if (plat.type === 'spike') {
    if (p.lastHealedFloor !== plat.floorIndex) {
      p.lastHealedFloor = plat.floorIndex;
      p.vy = 4.6;
      p.isGrounded = false;
      if (p.isLocal) sfx.stepSpike();
      damagePlayer(p, 3, `🩸 ${p.name} 踩上尖刺釘板陣亡！`);
    }
  } else if (plat.type === 'spring') {
    p.vy = 13.2;
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
      lobbyAvatar.group.rotation.y += dt * 0.55;
    }
    lobbyAvatar.animate(dt, false, true);
    camera.position.set(0, 1.45, 3.85);
    camera.lookAt(0, 1.05, 0);
  } else if (gameState === 'playing') {
    // Cooldown UI timers
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

    // Find lowest player Y to ensure floors are generated ahead
    let lowestY = world.ceilingY - 10;
    players.forEach((p) => {
      if (!p.isGhost && p.y < lowestY) lowestY = p.y;
    });

    world.update(dt, lowestY);

    players.forEach((p) => {
      updatePlayerPhysics(p, dt);
    });

    // Update ceiling warning pill
    if (localPlayer && !localPlayer.isGhost) {
      const ceilDist = Math.max(0, world.ceilingY - (localPlayer.y + 1.6));
      const warnEl = document.getElementById('hud-ceiling-warn');
      warnEl.textContent = ceilDist < 3.5
        ? `🚨 小心頭頂尖刺！(${ceilDist.toFixed(1)}m)`
        : `⚙️ 尖刺距離 ${ceilDist.toFixed(1)}m`;
    }

    // Smart 3D Party Camera (frames ceiling above + platforms below clearly on mobile)
    if (localPlayer) {
      const targetCamX = localPlayer.x * 0.38;
      const targetCamY = cameraCloseMode ? localPlayer.y + 3.2 : localPlayer.y + 3.8;
      const targetCamZ = cameraCloseMode ? 11.2 : 15.2;

      camera.position.x += (targetCamX - camera.position.x) * Math.min(1, dt * 6);
      camera.position.y += (targetCamY - camera.position.y) * Math.min(1, dt * 7);
      camera.position.z += (targetCamZ - camera.position.z) * Math.min(1, dt * 6);

      // Look slightly below the player so upcoming platforms are always visible on phone screens
      camera.lookAt(localPlayer.x * 0.25, localPlayer.y - 2.2, 0);
    }

    // Broadcast state over PeerJS at ~20Hz
    netSyncAccumulator += dt;
    if (netSyncAccumulator >= 0.05 && localPlayer) {
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

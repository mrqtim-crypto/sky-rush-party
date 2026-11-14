import * as THREE from 'three';
import { sfx } from './audio.js';
import { CUSTOM_CATALOG, Character3D, getRandomAppearance } from './character.js';
import { RoomNetwork } from './network.js';
import {
  TrackWorld,
  TRACK_LENGTH,
  ROW_LEN,
  LANE_WIDTH,
  TRACK_HALF_WIDTH,
  UPPER_DECK_HEIGHT
} from './world.js';

const ITEMS_CATALOG = [
  { id: 'turbo', name: '渦輪衝刺', icon: '⚡' },
  { id: 'shockwave', name: '震波手榴彈', icon: '💥' },
  { id: 'shield', name: '能量護盾', icon: '🛡️' },
  { id: 'magnet', name: '磁力吸盤', icon: '🧲' },
  { id: 'slime_trap', name: '黏液陷阱', icon: '🧪' }
];

const AI_NAMES = [
  '閃電阿凱', '草莓泡芙', '暴風小傑', '霓虹米亞',
  '恐龍豆豆', '星光露露', '渦輪雷恩'
];

class SkyRushGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.state = 'lobby'; // 'lobby' | 'countdown' | 'racing' | 'result'
    this.trackMode = 'spiral';
    this.roomSeed = 202611;

    // Load saved player appearance
    const savedApp = localStorage.getItem('skyrush_appearance');
    this.myAppearance = savedApp ? JSON.parse(savedApp) : {
      gender: 'girl',
      skinColor: '#ffe0c8',
      hairStyle: 'twintails',
      hairColor: '#ff4785',
      eyeStyle: 'starry',
      eyeColor: '#00b4d8',
      outfit: 'hoodie',
      outfitColor: '#00d2ff',
      backItem: 'wings',
      trail: 'rainbow'
    };
    this.myName = localStorage.getItem('skyrush_name') || '派對之星';

    // Controls state
    this.input = {
      steer: 0, // -1 (left) to +1 (right)
      keys: {}
    };

    // Camera shake
    this.shakeIntensity = 0;

    // Runners list: local player + remote P2P players + AI bots
    this.localRunner = null;
    this.aiRunners = [];
    this.remoteRunners = new Map(); // id -> runner

    // Trail particles
    this.particles = [];

    this.initThree();
    this.initLobbyStage();
    this.initCustomizerUI();
    this.initControls();
    this.initMultiplayer();

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101632');
    this.scene.fog = new THREE.FogExp2('#101632', 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      260
    );

    // Lights
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#3a2b6e', 1.15);
    this.scene.add(hemiLight);

    this.dirLight = new THREE.DirectionalLight('#fff6e5', 1.35);
    this.dirLight.position.set(18, 36, 24);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);

    // Starfield particles in sky
    const starGeo = new THREE.BufferGeometry();
    const starVerts = [];
    for (let i = 0; i < 600; i++) {
      starVerts.push(
        (Math.random() - 0.5) * 220,
        (Math.random() - 0.5) * 180,
        -Math.random() * 620
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const starMat = new THREE.PointsMaterial({ color: '#a8e6ff', size: 0.7 });
    this.starField = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starField);

    // World & Track
    this.world = new TrackWorld(this.scene);
    this.world.buildTrack(this.roomSeed, this.trackMode);

    // Particle Group
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initLobbyStage() {
    this.lobbyGroup = new THREE.Group();
    this.scene.add(this.lobbyGroup);

    const pedGeo = new THREE.CylinderGeometry(1.35, 1.55, 0.32, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: '#253166',
      roughness: 0.25,
      metalness: 0.3
    });
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.position.set(0, -0.16, 0);

    const ringGeo = new THREE.TorusGeometry(1.42, 0.06, 12, 36);
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#00f0ff',
      emissive: '#00f0ff',
      emissiveIntensity: 0.85
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.lobbyRing = ring;

    this.lobbyGroup.add(ped, ring);
    this.lobbyGroup.position.set(0, 1.5, 6.0);

    // Preview Character
    this.previewChar = new Character3D(this.myAppearance, this.myName, true);
    this.lobbyGroup.add(this.previewChar.root);
    this.previewRotationY = 0;
    this.previewJumpVel = 0;
    this.previewY = 0;
  }

  initCustomizerUI() {
    const nameInput = document.getElementById('player-name');
    nameInput.value = this.myName;
    nameInput.addEventListener('input', () => {
      this.myName = nameInput.value.trim() || '派對之星';
      localStorage.setItem('skyrush_name', this.myName);
      this.previewChar.updateNameTag(this.myName);
    });

    const modeSelect = document.getElementById('track-mode-select');
    modeSelect.addEventListener('change', () => {
      this.trackMode = modeSelect.value;
      this.world.repositionTrackMode(this.trackMode);
      this.updateCamModeButton();
    });

    // Category Tabs switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.jump();
        tabBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));
        document.getElementById(`pane-${tabId}`).classList.add('active');
      });
    });

    const renderOptions = (containerId, list, key) => {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      list.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'opt-card' + (this.myAppearance[key] === item.id ? ' selected' : '');
        div.textContent = item.label;
        div.addEventListener('click', () => {
          sfx.itemPickup();
          this.myAppearance[key] = item.id;
          this.saveAndRefreshPreview();
          renderAllOptions();
        });
        container.appendChild(div);
      });
    };

    const renderSwatches = (containerId, colors, key) => {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      colors.forEach((hex) => {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (this.myAppearance[key] === hex ? ' selected' : '');
        sw.style.backgroundColor = hex;
        sw.addEventListener('click', () => {
          sfx.jump();
          this.myAppearance[key] = hex;
          this.saveAndRefreshPreview();
          renderAllOptions();
        });
        container.appendChild(sw);
      });
    };

    const renderAllOptions = () => {
      renderOptions('gender-options', CUSTOM_CATALOG.genders, 'gender');
      renderSwatches('skin-colors', CUSTOM_CATALOG.skinColors, 'skinColor');
      renderOptions('hair-options', CUSTOM_CATALOG.hairStyles, 'hairStyle');
      renderSwatches('hair-colors', CUSTOM_CATALOG.hairColors, 'hairColor');
      renderOptions('eye-options', CUSTOM_CATALOG.eyeStyles, 'eyeStyle');
      renderSwatches('eye-colors', CUSTOM_CATALOG.eyeColors, 'eyeColor');
      renderOptions('outfit-options', CUSTOM_CATALOG.outfits, 'outfit');
      renderSwatches('outfit-colors', CUSTOM_CATALOG.outfitColors, 'outfitColor');
      renderOptions('back-options', CUSTOM_CATALOG.backItems, 'backItem');
      renderOptions('trail-options', CUSTOM_CATALOG.trails, 'trail');
    };

    renderAllOptions();

    // Random Look Button
    document.getElementById('btn-random-look').addEventListener('click', () => {
      sfx.spring();
      this.myAppearance = getRandomAppearance();
      this.saveAndRefreshPreview();
      renderAllOptions();
      this.previewJumpVel = 8.5;
    });

    // Pose Jump Button
    document.getElementById('btn-pose-jump').addEventListener('click', () => {
      sfx.jump();
      this.previewJumpVel = 9.5;
      this.previewChar.squash = 0.65;
    });

    // Touch / Drag rotation on preview stage
    const touchZone = document.getElementById('preview-touch-zone');
    let dragging = false;
    let lastX = 0;
    touchZone.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      lastX = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.previewRotationY += dx * 0.012;
    });
    window.addEventListener('pointerup', () => {
      dragging = false;
    });

    // Start Game Button
    document.getElementById('btn-start-game').addEventListener('click', () => {
      sfx.init();
      this.startMatch();
    });

    // Rematch & Back to Lobby buttons
    document.getElementById('btn-rematch').addEventListener('click', () => {
      this.roomSeed = this.network.sendAction('new_race');
      this.world.buildTrack(this.roomSeed, this.trackMode);
      this.startMatch();
    });

    document.getElementById('btn-back-lobby').addEventListener('click', () => {
      this.switchToLobby();
    });

    // Toggle Camera/Track Mode mid-game
    document.getElementById('btn-toggle-cam').addEventListener('click', () => {
      this.trackMode = this.trackMode === 'spiral' ? 'tube' : 'spiral';
      document.getElementById('track-mode-select').value = this.trackMode;
      this.world.repositionTrackMode(this.trackMode);
      this.updateCamModeButton();
      this.addFeedToast(
        this.trackMode === 'tube'
          ? '🛸 已切換為：360° 環形管筒視角！'
          : '🌀 已切換為：螺旋雲霄飛車視角！'
      );
    });
  }

  updateCamModeButton() {
    const btn = document.getElementById('btn-toggle-cam');
    btn.textContent = this.trackMode === 'tube' ? '🛸 管筒' : '🌀 螺旋';
  }

  saveAndRefreshPreview() {
    localStorage.setItem('skyrush_appearance', JSON.stringify(this.myAppearance));
    this.previewChar.setAppearance(this.myAppearance);
    this.previewChar.squash = 1.22;
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      this.input.keys[e.code] = true;
      if (this.state === 'racing') {
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
          e.preventDefault();
          this.triggerJumpOrSlam();
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          e.preventDefault();
          this.triggerBump();
        } else if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') {
          e.preventDefault();
          this.triggerUseItem();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.input.keys[e.code] = false;
    });

    // Mobile Virtual Joystick
    const joyBase = document.getElementById('joystick-base');
    const joyKnob = document.getElementById('joystick-knob');
    let joyPointerId = null;
    let joyCenterX = 0;

    const updateJoystick = (clientX) => {
      const maxOffset = 42;
      const dx = Math.max(-maxOffset, Math.min(maxOffset, clientX - joyCenterX));
      joyKnob.style.transform = `translateX(${dx}px)`;
      this.input.steer = dx / maxOffset;
    };

    joyBase.addEventListener('pointerdown', (e) => {
      joyPointerId = e.pointerId;
      const rect = joyBase.getBoundingClientRect();
      joyCenterX = rect.left + rect.width / 2;
      joyBase.setPointerCapture(e.pointerId);
      updateJoystick(e.clientX);
    });

    joyBase.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyPointerId) {
        updateJoystick(e.clientX);
      }
    });

    const resetJoystick = (e) => {
      if (e.pointerId === joyPointerId) {
        joyPointerId = null;
        joyKnob.style.transform = 'translateX(0px)';
        this.input.steer = 0;
      }
    };
    joyBase.addEventListener('pointerup', resetJoystick);
    joyBase.addEventListener('pointercancel', resetJoystick);

    // Touch Action Buttons
    document.getElementById('btn-jump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerJumpOrSlam();
    });

    document.getElementById('btn-bump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerBump();
    });

    document.getElementById('btn-use-item').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerUseItem();
    });
  }

  initMultiplayer() {
    const statusEl = document.getElementById('online-status');
    const roomInput = document.getElementById('room-input');

    // Read ?room=XXXX from URL if present
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      roomInput.value = urlRoom.toUpperCase().slice(0, 6);
    }

    this.network = new RoomNetwork({
      onStatus: (txt) => {
        statusEl.textContent = txt;
      },
      onWelcome: ({ seed }) => {
        this.roomSeed = seed;
        this.world.buildTrack(this.roomSeed, this.trackMode);
      },
      onPlayerJoined: (player) => {
        this.addFeedToast(`👋 玩家 [${player.name}] 跨網連入了房間！`);
      },
      onPlayerLeft: (playerId) => {
        const rem = this.remoteRunners.get(playerId);
        if (rem) {
          this.scene.remove(rem.char.root);
          this.remoteRunners.delete(playerId);
        }
      },
      onRemoteState: (playerId, state) => {
        this.updateRemoteRunner(playerId, state);
      },
      onRemoteAction: (playerId, action, payload) => {
        this.handleRemoteAction(playerId, action, payload);
      },
      onNewRace: (newSeed) => {
        this.roomSeed = newSeed;
        this.world.buildTrack(this.roomSeed, this.trackMode);
      }
    });

    const doJoin = () => {
      const code = roomInput.value.trim().toUpperCase() || 'PARTY1';
      roomInput.value = code;
      this.network.joinRoom(code, {
        name: this.myName,
        appearance: this.myAppearance
      });
    };

    doJoin();

    document.getElementById('btn-join-room').addEventListener('click', () => {
      sfx.itemPickup();
      doJoin();
    });

    // Copy Invite Link Button
    const copyBtn = document.getElementById('btn-copy-invite');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        sfx.itemPickup();
        const code = roomInput.value.trim().toUpperCase() || 'PARTY1';
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
        navigator.clipboard?.writeText(inviteUrl);
        const toast = document.getElementById('invite-copied-toast');
        if (toast) {
          toast.classList.remove('hidden');
          setTimeout(() => toast.classList.add('hidden'), 3000);
        }
      });
    }
  }

  updateRemoteRunner(playerId, st) {
    let runner = this.remoteRunners.get(playerId);
    if (!runner) {
      const char = new Character3D(st.appearance || getRandomAppearance(), st.name || '連線玩家', false);
      this.scene.add(char.root);
      runner = {
        id: playerId,
        name: st.name || '連線玩家',
        isAI: false,
        isLocal: false,
        char,
        u: st.u || 0,
        h: st.h || 0,
        s: st.s || 0,
        vu: 0,
        vh: 0,
        vs: 14,
        isGrounded: true,
        stunTimer: 0,
        boostTimer: 0,
        shieldTimer: 0,
        finished: false,
        finishTime: 0
      };
      this.remoteRunners.set(playerId, runner);
    }
    runner.u = st.u ?? runner.u;
    runner.h = st.h ?? runner.h;
    runner.s = st.s ?? runner.s;
    runner.isGrounded = st.isGrounded ?? true;
    runner.stunTimer = st.stunTimer ?? 0;
    runner.boostTimer = st.boostTimer ?? 0;
    runner.shieldTimer = st.shieldTimer ?? 0;
    runner.finished = st.finished ?? false;
  }

  handleRemoteAction(playerId, action, payload) {
    if (action === 'bump' && this.localRunner) {
      const ds = Math.abs(this.localRunner.s - payload.s);
      const du = Math.abs(this.localRunner.u - payload.u);
      if (ds < 2.2 && du < 2.4) {
        this.applyKnockback(this.localRunner, payload.dir * 13, 6.5, payload.byName);
      }
    } else if (action === 'shockwave' && this.localRunner) {
      this.world.spawnShockwave(payload.u, payload.h, payload.s, '#ff007f');
      const ds = Math.abs(this.localRunner.s - payload.s);
      const du = this.localRunner.u - payload.u;
      if (ds < 4.0 && Math.abs(du) < 4.0) {
        const dir = du >= 0 ? 1 : -1;
        this.applyKnockback(this.localRunner, dir * 15, 8.0, payload.byName);
      }
    }
  }

  createRunnerObj(id, name, appearance, isLocal = false, isAI = false, startLane = 0) {
    const char = new Character3D(appearance, name, isLocal);
    this.scene.add(char.root);
    return {
      id,
      name,
      isLocal,
      isAI,
      char,
      u: startLane * LANE_WIDTH,
      h: 0,
      s: 2,
      vu: 0,
      vh: 0,
      vs: 0,
      isGrounded: true,
      canSlam: false,
      isSlamming: false,
      bumpCooldown: 0,
      stunTimer: 0,
      boostTimer: 0,
      shieldTimer: 0,
      item: null,
      knockouts: 0,
      stomps: 0,
      finished: false,
      finishTime: 0,
      aiTargetU: startLane * LANE_WIDTH,
      aiDecisionTimer: 0.2 + Math.random() * 0.5
    };
  }

  clearMatchRunners() {
    if (this.localRunner) {
      this.scene.remove(this.localRunner.char.root);
      this.localRunner = null;
    }
    this.aiRunners.forEach((bot) => this.scene.remove(bot.char.root));
    this.aiRunners = [];
  }

  startMatch() {
    this.clearMatchRunners();
    this.lobbyGroup.visible = false;

    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('result-screen').classList.remove('active');
    document.getElementById('hud-screen').classList.add('active');
    document.getElementById('event-feed').innerHTML = '';

    // Create Local Player
    this.localRunner = this.createRunnerObj(
      'local',
      this.myName,
      this.myAppearance,
      true,
      false,
      0
    );
    this.updateItemHUD();

    // Fill remaining slots up to 8 total runners with AI Rivals
    const lanes = [-2, -1, 1, 2, -1.5, 1.5, -0.5];
    const remoteCount = this.remoteRunners.size;
    const botCount = Math.max(0, 7 - remoteCount);

    for (let i = 0; i < botCount; i++) {
      const bot = this.createRunnerObj(
        `bot_${i}`,
        AI_NAMES[i % AI_NAMES.length],
        getRandomAppearance(),
        false,
        true,
        lanes[i % lanes.length]
      );
      bot.s = 2 + (i % 2) * 1.6;
      this.aiRunners.push(bot);
    }

    this.matchStartTime = performance.now();
    this.state = 'countdown';
    this.runCountdown();
  }

  runCountdown() {
    const banner = document.getElementById('center-banner');
    banner.classList.remove('hidden');
    let count = 3;
    banner.textContent = count;
    sfx.countdown(false);

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        banner.textContent = count;
        sfx.countdown(false);
      } else if (count === 0) {
        banner.textContent = 'GO! 衝刺！';
        sfx.countdown(true);
        this.state = 'racing';
        this.raceStartClock = performance.now();
      } else {
        banner.classList.add('hidden');
        clearInterval(timer);
      }
    }, 750);
  }

  switchToLobby() {
    this.clearMatchRunners();
    this.lobbyGroup.visible = true;
    this.state = 'lobby';
    document.getElementById('hud-screen').classList.remove('active');
    document.getElementById('result-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('active');
    document.getElementById('speed-lines').classList.add('hidden');
  }

  getAllRunners() {
    const list = [];
    if (this.localRunner) list.push(this.localRunner);
    this.remoteRunners.forEach((r) => list.push(r));
    this.aiRunners.forEach((b) => list.push(b));
    return list;
  }

  // ================= PLAYER ACTIONS =================
  triggerJumpOrSlam() {
    const r = this.localRunner;
    if (!r || this.state !== 'racing' || r.stunTimer > 0) return;

    if (r.isGrounded) {
      r.vh = 14.2;
      r.isGrounded = false;
      r.canSlam = true;
      r.isSlamming = false;
      r.char.squash = 1.35;
      sfx.jump();
      this.updateJumpButtonUI(true);
    } else if (r.canSlam && !r.isSlamming) {
      r.vh = -26.0;
      r.isSlamming = true;
      r.canSlam = false;
      r.char.squash = 0.65;
      sfx.slam();
    }
  }

  updateJumpButtonUI(inAir) {
    const icon = document.getElementById('jump-icon');
    const label = document.getElementById('jump-label');
    if (inAir) {
      icon.textContent = '⏬';
      label.textContent = '空中下砸';
    } else {
      icon.textContent = '⬆️';
      label.textContent = '跳躍';
    }
  }

  triggerBump() {
    const r = this.localRunner;
    if (!r || this.state !== 'racing' || r.bumpCooldown > 0 || r.stunTimer > 0) return;

    r.bumpCooldown = 1.1;
    const steerDir = this.getEffectiveSteer() >= 0 ? 1 : -1;
    r.vu += steerDir * 11.5;
    r.char.squash = 0.72;
    sfx.bump();
    this.world.spawnShockwave(r.u, r.h, r.s, '#00f0ff');

    const tile = this.world.getTileAt(r.u, r.h, r.s);
    const iceMult = tile && tile.type === 'ice' ? 2.1 : 1.0;

    for (const other of this.getAllRunners()) {
      if (other === r || other.finished) continue;
      const ds = Math.abs(other.s - r.s);
      const du = other.u - r.u;
      const dh = Math.abs(other.h - r.h);
      if (ds < 2.2 && Math.abs(du) < 2.4 && dh < 1.6) {
        const pushDir = du >= 0 ? 1 : -1;
        this.applyKnockback(other, pushDir * 14.5 * iceMult, 5.5, r.name);
        r.knockouts++;
        this.shakeIntensity = 0.35;
        this.addFeedToast(`💥 你側撞頂飛了 [${other.name}]！`);
      }
    }

    this.network.sendAction('bump', {
      u: r.u,
      h: r.h,
      s: r.s,
      dir: steerDir,
      byName: r.name
    });
  }

  triggerUseItem() {
    const r = this.localRunner;
    if (!r || !r.item || this.state !== 'racing') return;
    this.activateRunnerItem(r, r.item);
    r.item = null;
    this.updateItemHUD();
  }

  activateRunnerItem(r, item) {
    if (item.id === 'turbo') {
      r.boostTimer = 2.8;
      if (r.isLocal) {
        sfx.boost();
        this.addFeedToast('⚡ 發動【渦輪衝刺】全速前進！');
      }
    } else if (item.id === 'shield') {
      r.shieldTimer = 5.5;
      if (r.isLocal) {
        sfx.itemPickup();
        this.addFeedToast('🛡️ 開啟【能量護盾】免疫推擠與陷阱！');
      }
    } else if (item.id === 'shockwave') {
      this.world.spawnShockwave(r.u, r.h, r.s, '#ffbe0b');
      if (r.isLocal) {
        sfx.slam();
        this.shakeIntensity = 0.4;
        this.addFeedToast('💥 引爆【震波手榴彈】震飛周圍對手！');
        this.network.sendAction('shockwave', {
          u: r.u,
          h: r.h,
          s: r.s,
          byName: r.name
        });
      }
      for (const other of this.getAllRunners()) {
        if (other === r || other.finished) continue;
        if (Math.abs(other.s - r.s) < 4.5 && Math.abs(other.u - r.u) < 4.5) {
          const dir = other.u >= r.u ? 1 : -1;
          this.applyKnockback(other, dir * 16.5, 8.5, r.name);
          r.knockouts++;
        }
      }
    } else if (item.id === 'magnet') {
      let target = null;
      for (const other of this.getAllRunners()) {
        if (other !== r && other.s > r.s && (!target || other.s < target.s)) {
          target = other;
        }
      }
      r.boostTimer = 1.8;
      if (target) {
        target.vs *= 0.55;
        if (r.isLocal) {
          sfx.boost();
          this.addFeedToast(`🧲 磁力吸盤鎖定 [${target.name}] 加速吸近！`);
        }
      }
    } else if (item.id === 'slime_trap') {
      this.world.spawnDroppedTrap(r.u, r.h, Math.max(2, r.s - 2.2), r.id);
      if (r.isLocal) {
        sfx.jump();
        this.addFeedToast('🧪 在後方佈下了【黏液陷阱】！');
      }
    }
  }

  applyKnockback(target, vuForce, vhForce, attackerName = '') {
    if (target.shieldTimer > 0) {
      target.shieldTimer = Math.max(0.2, target.shieldTimer - 1.2);
      if (target.isLocal) {
        this.addFeedToast('🛡️ 護盾擋下了撞擊！');
      }
      return;
    }
    target.vu = vuForce;
    target.vh = vhForce;
    target.isGrounded = false;
    target.stunTimer = 0.65;
    target.char.squash = 0.55;
    if (target.isLocal) {
      sfx.bump();
      this.shakeIntensity = 0.42;
      if (attackerName) {
        this.addFeedToast(`⚠️ 被 [${attackerName}] 撞飛了！`);
      }
    }
  }

  updateItemHUD() {
    const btn = document.getElementById('btn-use-item');
    const icon = document.getElementById('item-icon');
    const label = document.getElementById('item-label');
    const item = this.localRunner ? this.localRunner.item : null;

    if (item) {
      btn.classList.remove('disabled');
      icon.textContent = item.icon;
      label.textContent = item.name;
    } else {
      btn.classList.add('disabled');
      icon.textContent = '🎲';
      label.textContent = '無道具';
    }
  }

  addFeedToast(text) {
    const feed = document.getElementById('event-feed');
    const div = document.createElement('div');
    div.className = 'feed-toast';
    div.textContent = text;
    feed.appendChild(div);
    while (feed.children.length > 3) {
      feed.removeChild(feed.firstChild);
    }
    setTimeout(() => {
      if (div.parentNode === feed) feed.removeChild(div);
    }, 2600);
  }

  getEffectiveSteer() {
    let kSteer = 0;
    if (this.input.keys['KeyA'] || this.input.keys['ArrowLeft']) kSteer -= 1;
    if (this.input.keys['KeyD'] || this.input.keys['ArrowRight']) kSteer += 1;
    if (kSteer !== 0) return kSteer;
    return this.input.steer;
  }

  // ================= PHYSICS & AI UPDATE =================
  updateRunnerPhysics(r, dt, time) {
    if (r.finished) {
      r.char.animate(dt, time, { speed: 2, isGrounded: true });
      return;
    }

    if (r.bumpCooldown > 0) r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
    if (r.stunTimer > 0) r.stunTimer = Math.max(0, r.stunTimer - dt);
    if (r.boostTimer > 0) r.boostTimer = Math.max(0, r.boostTimer - dt);
    if (r.shieldTimer > 0) r.shieldTimer = Math.max(0, r.shieldTimer - dt);

    const currentTile = this.world.getTileAt(r.u, r.h, r.s);
    const tileType = currentTile ? currentTile.type : 'air';

    let targetSpeed = 16.5;
    if (r.boostTimer > 0) targetSpeed = 25.5;
    else if (r.stunTimer > 0) targetSpeed = 6.5;
    else if (tileType === 'slime' && r.isGrounded) targetSpeed = 9.0;
    else if (tileType === 'ice') targetSpeed = 19.2;
    else if (tileType === 'upper') targetSpeed = 20.5;

    r.vs += (targetSpeed - r.vs) * Math.min(1, dt * 6);

    let steer = 0;
    if (r.isLocal) {
      steer = this.getEffectiveSteer();
    } else if (r.isAI) {
      steer = this.updateAIBrain(r, dt);
    }

    const lateralAccel = tileType === 'ice' ? 18.0 : 32.0;
    const lateralDamping = tileType === 'ice' ? 2.2 : 8.5;
    const desiredVu = steer * 9.5;
    r.vu += (desiredVu - r.vu) * Math.min(1, dt * (r.stunTimer > 0 ? 1.5 : lateralDamping));
    if (Math.abs(steer) > 0.05 && r.stunTimer <= 0) {
      r.vu += steer * lateralAccel * dt * 0.25;
    }

    r.u += r.vu * dt;
    r.s += r.vs * dt;

    const gravity = -34.0;
    r.vh += gravity * dt;
    r.h += r.vh * dt;

    const supportTile = this.world.getTileAt(r.u, r.h, r.s);
    const withinTrackWidth = Math.abs(r.u) <= TRACK_HALF_WIDTH + 0.45;

    if (withinTrackWidth && supportTile && r.h <= supportTile.deckHeight && r.vh <= 0) {
      const wasSlamming = r.isSlamming;
      r.h = supportTile.deckHeight;
      r.vh = 0;
      r.isGrounded = true;
      r.canSlam = false;
      r.isSlamming = false;

      if (r.isLocal) this.updateJumpButtonUI(false);

      if (wasSlamming) {
        r.char.squash = 0.52;
        this.world.spawnShockwave(r.u, r.h, r.s, '#ff007f');
        if (supportTile.type === 'fragile') {
          this.world.triggerFragileTile(supportTile.r, supportTile.lane, true);
        }
        for (const other of this.getAllRunners()) {
          if (other !== r && Math.abs(other.s - r.s) < 3.8 && Math.abs(other.u - r.u) < 3.8) {
            const dir = other.u >= r.u ? 1 : -1;
            this.applyKnockback(other, dir * 15, 8.0, r.name);
            r.knockouts++;
            if (r.isLocal) this.addFeedToast(`⏬ 下砸震波彈飛了 [${other.name}]！`);
          }
        }
      }

      if (supportTile.type === 'fragile') {
        if (supportTile.state === 'intact' && r.isLocal) sfx.glassCrack();
        this.world.triggerFragileTile(supportTile.r, supportTile.lane, false);
      } else if (supportTile.type === 'spring') {
        r.vh = 21.5;
        r.isGrounded = false;
        r.canSlam = true;
        r.char.squash = 1.45;
        if (r.isLocal) {
          sfx.spring();
          this.updateJumpButtonUI(true);
          this.addFeedToast('🚀 彈簧跳板！飛躍高空捷徑！');
        }
      } else if (supportTile.type === 'boost') {
        r.boostTimer = Math.max(r.boostTimer, 1.35);
        if (r.isLocal) sfx.boost();
      }
    } else {
      r.isGrounded = false;
    }

    if (r.h < -5.5) {
      r.h = 3.2;
      r.vh = 0;
      r.u = 0;
      r.vu = 0;
      r.stunTimer = 0.75;
      if (r.isLocal) {
        sfx.bump();
        this.addFeedToast('💫 墜入深淵！已緊急傳送回賽道！');
      }
    }

    for (const other of this.getAllRunners()) {
      if (other === r || other.finished) continue;
      const ds = Math.abs(other.s - r.s);
      const du = r.u - other.u;
      const dh = r.h - other.h;

      if (ds < 1.1 && Math.abs(du) < 1.05) {
        if (r.vh < -1.0 && dh > 0.55 && dh < 1.9) {
          r.vh = 16.5;
          r.canSlam = true;
          r.stomps++;
          other.char.squash = 0.42;
          other.stunTimer = 1.05;
          other.vs *= 0.4;
          if (r.isLocal) {
            sfx.stomp();
            this.addFeedToast(`👟 踩扁了 [${other.name}] 觸發二段大跳！`);
          } else if (other.isLocal) {
            sfx.stomp();
            this.addFeedToast(`😵 被 [${r.name}] 踩頭借力了！`);
          }
        } else if (Math.abs(dh) < 0.85) {
          const push = du >= 0 ? 1 : -1;
          r.vu += push * 14 * dt;
          other.vu -= push * 14 * dt;
        }
      }
    }

    for (const obs of this.world.obstacles) {
      if (Math.abs(obs.s - r.s) > 1.35) continue;

      if (obs.type === 'pendulum') {
        if (Math.abs(obs.u - r.u) < 1.45 && Math.abs(obs.h - r.h) < 1.8) {
          const dir = r.u >= obs.u ? 1 : -1;
          this.applyKnockback(r, dir * 16, 7.5, '巨型擺錘');
        }
      } else if (obs.type === 'sweeper') {
        if (r.h < 1.15) {
          const barAngle = obs.angle % Math.PI;
          if (Math.abs(Math.sin(barAngle)) < 0.48) {
            this.applyKnockback(r, (r.u >= 0 ? 1 : -1) * 10, 6.5, '旋轉激光桿');
          }
        }
      } else if (obs.type === 'bumper') {
        if (Math.abs(obs.u - r.u) < 1.25 && r.h < 1.8) {
          const dir = r.u >= obs.u ? 1 : -1;
          this.applyKnockback(r, dir * 15, 5.5, '彈力撞柱');
        }
      }
    }

    for (const box of this.world.itemBoxes) {
      if (!box.active) continue;
      if (
        Math.abs(box.s - r.s) < 1.3 &&
        Math.abs(box.u - r.u) < 1.3 &&
        Math.abs(box.h - (r.h + 0.8)) < 1.4
      ) {
        box.active = false;
        box.mesh.visible = false;
        box.respawnTimer = 4.0;
        if (!r.item) {
          r.item = ITEMS_CATALOG[Math.floor(Math.random() * ITEMS_CATALOG.length)];
          if (r.isLocal) {
            sfx.itemPickup();
            this.updateItemHUD();
            this.addFeedToast(`🎁 獲得道具：【${r.item.icon} ${r.item.name}】`);
          }
        }
      }
    }

    for (const trap of this.world.droppedTraps) {
      if (!trap.active || trap.ownerId === r.id) continue;
      if (
        Math.abs(trap.s - r.s) < 1.2 &&
        Math.abs(trap.u - r.u) < 1.2 &&
        Math.abs(trap.h - r.h) < 1.0
      ) {
        trap.active = false;
        trap.mesh.visible = false;
        this.applyKnockback(r, (Math.random() - 0.5) * 14, 4.5, '黏液陷阱');
      }
    }

    if (Math.random() < 0.45) {
      this.spawnRunnerTrail(r);
    }

    if (r.s >= TRACK_LENGTH && !r.finished) {
      r.finished = true;
      r.finishTime = (performance.now() - this.raceStartClock) / 1000;
      if (r.isLocal) {
        sfx.win();
        this.showResults();
      }
    }

    this.syncRunnerMeshTransform(r, dt, time);
  }

  syncRunnerMeshTransform(r, dt, time) {
    const tf = this.world.getTrackTransform(r.u, r.h, r.s);
    r.char.root.position.copy(tf.position);
    r.char.root.rotation.set(tf.pitch, Math.PI + tf.yaw - r.vu * 0.03, tf.roll);
    r.char.animate(dt, time, {
      speed: r.vs,
      isGrounded: r.isGrounded,
      isStunned: r.stunTimer > 0,
      isBoosting: r.boostTimer > 0,
      shieldActive: r.shieldTimer > 0
    });
  }

  updateAIBrain(bot, dt) {
    bot.aiDecisionTimer -= dt;
    if (bot.aiDecisionTimer <= 0) {
      bot.aiDecisionTimer = 0.22 + Math.random() * 0.35;

      const lookRow = Math.min(this.world.rows.length - 1, Math.round((bot.s + 6) / ROW_LEN));
      const rowTiles = this.world.rows[lookRow] || [];
      const safeLanes = rowTiles.filter((t) => t && t.state !== 'broken' && t.type !== 'gap');

      if (safeLanes.length > 0) {
        const bonusTile = safeLanes.find((t) => t.type === 'spring' || t.type === 'boost');
        const chosen = bonusTile || safeLanes[Math.floor(Math.random() * safeLanes.length)];
        bot.aiTargetU = chosen.u;
      } else if (bot.isGrounded) {
        bot.vh = 14.0;
        bot.isGrounded = false;
      }

      for (const obs of this.world.obstacles) {
        if (obs.type === 'sweeper' && obs.s > bot.s && obs.s - bot.s < 5.0 && bot.isGrounded) {
          bot.vh = 14.0;
          bot.isGrounded = false;
        }
      }

      if (bot.item && Math.random() < 0.45) {
        this.activateRunnerItem(bot, bot.item);
        bot.item = null;
      }
    }

    const diff = bot.aiTargetU - bot.u;
    return Math.max(-1, Math.min(1, diff * 0.65));
  }

  spawnRunnerTrail(r) {
    const trailInfo =
      CUSTOM_CATALOG.trails.find((t) => t.id === r.char.appearance.trail) ||
      CUSTOM_CATALOG.trails[0];
    const geo = new THREE.SphereGeometry(0.11, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: r.boostTimer > 0 ? '#00f0ff' : trailInfo.color,
      transparent: true,
      opacity: 0.75
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(r.char.root.position);
    mesh.position.y += 0.2;
    this.particleGroup.add(mesh);
    this.particles.push({ mesh, life: 0.35, maxLife: 0.35 });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particleGroup.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        const ratio = p.life / p.maxLife;
        p.mesh.scale.setScalar(ratio);
        p.mesh.material.opacity = ratio * 0.7;
      }
    }
  }

  updateCameraAndHUD(dt) {
    const r = this.localRunner;
    if (!r) return;

    const all = this.getAllRunners().sort((a, b) => b.s - a.s);
    const myRank = all.indexOf(r) + 1;
    document.getElementById('hud-rank').innerHTML = `${myRank}<small>/${all.length}</small>`;

    const pct = Math.min(100, Math.floor((r.s / TRACK_LENGTH) * 100));
    document.getElementById('hud-distance').textContent = `${pct}%`;
    document.getElementById('hud-progress-fill').style.width = `${pct}%`;
    document.getElementById('hud-zone-label').textContent = this.world.getZoneInfo(r.s).name;

    const cdPct = (r.bumpCooldown / 1.1) * 100;
    document.getElementById('bump-cd-fill').style.height = `${cdPct}%`;

    const speedLines = document.getElementById('speed-lines');
    if (r.boostTimer > 0 || r.vs > 20) {
      speedLines.classList.remove('hidden');
    } else {
      speedLines.classList.add('hidden');
    }

    const camBackTf = this.world.getTrackTransform(r.u * 0.68, r.h + 4.3, r.s - 8.2);
    const lookAheadTf = this.world.getTrackTransform(r.u * 0.5, r.h + 1.2, r.s + 10.0);

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.8);
      camBackTf.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      camBackTf.position.y += (Math.random() - 0.5) * this.shakeIntensity;
    }

    this.camera.position.lerp(camBackTf.position, Math.min(1, dt * 10));
    this.camera.lookAt(lookAheadTf.position);
    this.camera.rotation.z = THREE.MathUtils.lerp(
      this.camera.rotation.z,
      -camBackTf.roll * 0.65 - r.vu * 0.015,
      Math.min(1, dt * 8)
    );
  }

  showResults() {
    this.state = 'result';
    document.getElementById('hud-screen').classList.remove('active');
    document.getElementById('result-screen').classList.add('active');
    document.getElementById('speed-lines').classList.add('hidden');

    const all = this.getAllRunners().sort((a, b) => b.s - a.s);
    const myRank = all.indexOf(this.localRunner) + 1;

    const trophies = ['🏆', '🥈', '🥉'];
    document.getElementById('result-trophy').textContent = trophies[myRank - 1] || '🎉';
    document.getElementById('result-title').textContent =
      myRank === 1 ? '第 1 名！派對總冠軍！' : `第 ${myRank} 名！精彩完賽！`;
    document.getElementById('result-subtitle').textContent =
      `撞飛對手: ${this.localRunner.knockouts} 次 ｜ 踩頭二段跳: ${this.localRunner.stomps} 次`;

    const lbList = document.getElementById('leaderboard-list');
    lbList.innerHTML = '';
    all.forEach((runner, idx) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (runner.isLocal ? ' me' : '');
      const rankBadge = idx < 3 ? trophies[idx] : `#${idx + 1}`;
      const progressText = runner.finished
        ? `${runner.finishTime.toFixed(1)}s`
        : `${Math.floor((runner.s / TRACK_LENGTH) * 100)}%`;
      row.innerHTML = `
        <span><b>${rankBadge}</b> ${runner.name}</span>
        <span>💥 ${runner.knockouts || 0} ｜ ⏱️ ${progressText}</span>
      `;
      lbList.appendChild(row);
    });
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const time = now / 1000;

    if (this.state === 'lobby') {
      this.camera.position.set(0, 2.85, 9.2);
      this.camera.lookAt(0, 2.55, 6.0);
      this.camera.rotation.z = 0;

      if (this.previewY > 0 || this.previewJumpVel !== 0) {
        this.previewJumpVel -= 26 * dt;
        this.previewY += this.previewJumpVel * dt;
        if (this.previewY <= 0) {
          this.previewY = 0;
          this.previewJumpVel = 0;
          this.previewChar.squash = 0.72;
        }
      }
      this.previewChar.root.position.y = this.previewY;
      this.previewChar.root.rotation.y = this.previewRotationY;
      this.lobbyRing.rotation.z = time * 1.5;

      this.previewChar.animate(dt, time, {
        speed: 6,
        isGrounded: this.previewY <= 0.01
      });
    } else {
      this.world.update(dt, time);

      if (this.state === 'racing') {
        this.updateRunnerPhysics(this.localRunner, dt, time);
        this.aiRunners.forEach((bot) => this.updateRunnerPhysics(bot, dt, time));
        this.remoteRunners.forEach((rem) => this.syncRunnerMeshTransform(rem, dt, time));

        // Broadcast local state over P2P WebRTC RoomNetwork
        if (Math.random() < 0.5) {
          const r = this.localRunner;
          this.network.sendState({
            name: r.name,
            appearance: this.myAppearance,
            u: r.u,
            h: r.h,
            s: r.s,
            isGrounded: r.isGrounded,
            stunTimer: r.stunTimer,
            boostTimer: r.boostTimer,
            shieldTimer: r.shieldTimer,
            finished: r.finished
          });
        }
      } else if (this.state === 'countdown') {
        this.syncRunnerMeshTransform(this.localRunner, dt, time);
        this.aiRunners.forEach((bot) => this.syncRunnerMeshTransform(bot, dt, time));
      }

      this.updateParticles(dt);
      this.updateCameraAndHUD(dt);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SkyRushGame();
});

import * as THREE from 'three';
import { sfx } from './audio.js';
import { CUSTOM_CATALOG, Character3D, getRandomAppearance } from './character.js';
import { RoomNetwork } from './network.js';
import {
  TrackWorld,
  TRACK_LENGTH,
  ROW_LEN,
  LANE_WIDTH,
  TRACK_HALF_WIDTH
} from './world.js';

const AI_NAMES = [
  '法老阿凱', '奈菲爾ティ', '沙漠泡芙', '荷魯斯小傑',
  '貓神米亞', '聖甲蟲豆豆', '金字塔露露'
];

class PyramidRushGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.state = 'lobby'; // 'lobby' | 'countdown' | 'racing' | 'result'
    this.roomSeed = 202611;

    const savedApp = localStorage.getItem('pyramid_appearance');
    this.myAppearance = savedApp ? JSON.parse(savedApp) : {
      gender: 'girl',
      skinColor: '#ffe4d0',
      hairStyle: 'bob',
      hairColor: '#3b2820',
      eyeStyle: 'starry',
      eyeColor: '#2b2d42',
      outfit: 'explorer',
      outfitColor: '#f4a261',
      backItem: 'backpack',
      trail: 'gold'
    };
    this.myName = localStorage.getItem('pyramid_name') || '小法老';

    this.input = {
      steer: 0,
      crouchHold: false,
      keys: {}
    };

    this.shakeIntensity = 0;
    this.localRunner = null;
    this.aiRunners = [];
    this.remoteRunners = new Map();
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
    // Warm, clean Egyptian desert sunset sky
    this.scene.background = new THREE.Color('#e8b878');
    this.scene.fog = new THREE.FogExp2('#e8b878', 0.009);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      240
    );

    const hemiLight = new THREE.HemisphereLight('#fff8eb', '#8c5828', 1.25);
    this.scene.add(hemiLight);

    this.dirLight = new THREE.DirectionalLight('#fff2d6', 1.35);
    this.dirLight.position.set(22, 42, 26);
    this.dirLight.castShadow = true;
    this.scene.add(this.dirLight);

    this.world = new TrackWorld(this.scene);
    this.world.buildTrack(this.roomSeed);

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

    const pedGeo = new THREE.CylinderGeometry(1.35, 1.55, 0.34, 24);
    const pedMat = new THREE.MeshStandardMaterial({
      color: '#c99352',
      roughness: 0.6
    });
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.position.set(0, -0.17, 0);

    const ringGeo = new THREE.TorusGeometry(1.42, 0.06, 10, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#ffd166',
      metalness: 0.6,
      roughness: 0.25
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.lobbyRing = ring;

    this.lobbyGroup.add(ped, ring);
    this.lobbyGroup.position.set(0, 1.5, 6.0);

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
      this.myName = nameInput.value.trim() || '小法老';
      localStorage.setItem('pyramid_name', this.myName);
      this.previewChar.updateNameTag(this.myName);
    });

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

    document.getElementById('btn-random-look').addEventListener('click', () => {
      sfx.spring();
      this.myAppearance = getRandomAppearance();
      this.saveAndRefreshPreview();
      renderAllOptions();
      this.previewJumpVel = 8.0;
    });

    document.getElementById('btn-pose-jump').addEventListener('click', () => {
      sfx.jump();
      this.previewJumpVel = 9.0;
      this.previewChar.squash = 0.68;
    });

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

    document.getElementById('btn-start-game').addEventListener('click', () => {
      sfx.init();
      this.startMatch();
    });

    document.getElementById('btn-rematch').addEventListener('click', () => {
      this.roomSeed = this.network.sendAction('new_race');
      this.world.buildTrack(this.roomSeed);
      this.startMatch();
    });

    document.getElementById('btn-back-lobby').addEventListener('click', () => {
      this.switchToLobby();
    });
  }

  saveAndRefreshPreview() {
    localStorage.setItem('pyramid_appearance', JSON.stringify(this.myAppearance));
    this.previewChar.setAppearance(this.myAppearance);
    this.previewChar.squash = 1.2;
  }

  initControls() {
    window.addEventListener('keydown', (e) => {
      this.input.keys[e.code] = true;
      if (this.state === 'racing') {
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
          e.preventDefault();
          this.triggerJump();
        } else if (e.code === 'KeyS' || e.code === 'ArrowDown' || e.code === 'ControlLeft') {
          e.preventDefault();
          this.triggerCrouch(true);
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          e.preventDefault();
          this.triggerBump();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.input.keys[e.code] = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown' || e.code === 'ControlLeft') {
        this.input.crouchHold = false;
      }
    });

    // Virtual Joystick
    const joyBase = document.getElementById('joystick-base');
    const joyKnob = document.getElementById('joystick-knob');
    let joyPointerId = null;
    let joyCenterX = 0;

    const updateJoystick = (clientX) => {
      const maxOffset = 44;
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

    // Jump Button
    document.getElementById('btn-jump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerJump();
    });

    // Crouch Button (Tap for 0.85s crouch slide, or hold to stay crouched!)
    const crouchBtn = document.getElementById('btn-crouch');
    crouchBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      crouchBtn.classList.add('active-hold');
      this.triggerCrouch(true);
    });
    const endCrouchHold = () => {
      crouchBtn.classList.remove('active-hold');
      this.input.crouchHold = false;
    };
    crouchBtn.addEventListener('pointerup', endCrouchHold);
    crouchBtn.addEventListener('pointercancel', endCrouchHold);

    // Bump Button
    document.getElementById('btn-bump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerBump();
    });
  }

  initMultiplayer() {
    const statusEl = document.getElementById('online-status');
    const roomInput = document.getElementById('room-input');

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
        this.world.buildTrack(this.roomSeed);
      },
      onPlayerJoined: (player) => {
        this.addFeedToast(`👋 [${player.name}] 加入了金字塔探險！`);
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
        this.world.buildTrack(this.roomSeed);
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
      const char = new Character3D(st.appearance || getRandomAppearance(), st.name || '探險家', false);
      this.scene.add(char.root);
      runner = {
        id: playerId,
        name: st.name || '探險家',
        isAI: false,
        isLocal: false,
        char,
        u: st.u || 0,
        h: st.h || 0,
        s: st.s || 0,
        vu: 0,
        vh: 0,
        vs: 12,
        isGrounded: true,
        crouchTimer: 0,
        stunTimer: 0,
        finished: false,
        finishTime: 0
      };
      this.remoteRunners.set(playerId, runner);
    }
    runner.u = st.u ?? runner.u;
    runner.h = st.h ?? runner.h;
    runner.s = st.s ?? runner.s;
    runner.isGrounded = st.isGrounded ?? true;
    runner.crouchTimer = st.crouchTimer ?? 0;
    runner.stunTimer = st.stunTimer ?? 0;
    runner.finished = st.finished ?? false;
  }

  handleRemoteAction(playerId, action, payload) {
    if (action === 'bump' && this.localRunner) {
      const ds = Math.abs(this.localRunner.s - payload.s);
      const du = Math.abs(this.localRunner.u - payload.u);
      if (ds < 2.2 && du < 2.4) {
        this.applyKnockback(this.localRunner, payload.dir * 12, 5.5, payload.byName);
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
      crouchTimer: 0,
      bumpCooldown: 0,
      stunTimer: 0,
      boostTimer: 0,
      knockouts: 0,
      finished: false,
      finishTime: 0,
      aiTargetU: startLane * LANE_WIDTH,
      aiDecisionTimer: 0.2 + Math.random() * 0.4
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

    this.localRunner = this.createRunnerObj(
      'local',
      this.myName,
      this.myAppearance,
      true,
      false,
      0
    );

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
      bot.s = 2 + (i % 2) * 1.5;
      this.aiRunners.push(bot);
    }

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
        banner.textContent = 'GO! 出發！';
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
  }

  getAllRunners() {
    const list = [];
    if (this.localRunner) list.push(this.localRunner);
    this.remoteRunners.forEach((r) => list.push(r));
    this.aiRunners.forEach((b) => list.push(b));
    return list;
  }

  // ================= JUMP, CROUCH & BUMP =================
  triggerJump() {
    const r = this.localRunner;
    if (!r || this.state !== 'racing' || r.stunTimer > 0) return;

    if (r.isGrounded) {
      r.vh = 13.8;
      r.isGrounded = false;
      r.crouchTimer = 0;
      this.input.crouchHold = false;
      r.char.squash = 1.32;
      sfx.jump();
    }
  }

  triggerCrouch(hold = false) {
    const r = this.localRunner;
    if (!r || this.state !== 'racing' || r.stunTimer > 0) return;

    if (hold) this.input.crouchHold = true;
    r.crouchTimer = 0.85; // Each tap crouches for 0.85s (or continuously while held)
    if (!r.isGrounded && r.vh > -18) {
      // Fast drop to ground if pressed in air!
      r.vh = -20.0;
    }
    sfx.playTone(320, 180, 0.12, 'sine', 0.12);
  }

  triggerBump() {
    const r = this.localRunner;
    if (!r || this.state !== 'racing' || r.bumpCooldown > 0 || r.stunTimer > 0) return;

    r.bumpCooldown = 1.0;
    const steerDir = this.getEffectiveSteer() >= 0 ? 1 : -1;
    r.vu += steerDir * 10.5;
    r.char.squash = 0.72;
    sfx.bump();
    this.world.spawnShockwave(r.u, r.h, r.s, '#ffd166');

    for (const other of this.getAllRunners()) {
      if (other === r || other.finished) continue;
      const ds = Math.abs(other.s - r.s);
      const du = other.u - r.u;
      if (ds < 2.2 && Math.abs(du) < 2.3) {
        const pushDir = du >= 0 ? 1 : -1;
        this.applyKnockback(other, pushDir * 13.5, 5.0, r.name);
        r.knockouts++;
        this.shakeIntensity = 0.28;
        this.addFeedToast(`💥 你把 [${other.name}] 推向了旁邊！`);
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

  applyKnockback(target, vuForce, vhForce, sourceName = '') {
    target.vu = vuForce;
    target.vh = vhForce;
    target.isGrounded = false;
    target.stunTimer = 0.65;
    target.crouchTimer = 0;
    target.char.squash = 0.55;
    if (target.isLocal) {
      sfx.bump();
      this.shakeIntensity = 0.35;
      if (sourceName) {
        this.addFeedToast(`⚠️ 撞上了【${sourceName}】！`);
      }
    }
  }

  addFeedToast(text) {
    const feed = document.getElementById('event-feed');
    const div = document.createElement('div');
    div.className = 'feed-toast';
    div.textContent = text;
    feed.appendChild(div);
    while (feed.children.length > 2) {
      feed.removeChild(feed.firstChild);
    }
    setTimeout(() => {
      if (div.parentNode === feed) feed.removeChild(div);
    }, 2300);
  }

  getEffectiveSteer() {
    let kSteer = 0;
    if (this.input.keys['KeyA'] || this.input.keys['ArrowLeft']) kSteer -= 1;
    if (this.input.keys['KeyD'] || this.input.keys['ArrowRight']) kSteer += 1;
    if (kSteer !== 0) return kSteer;
    return this.input.steer;
  }

  // ================= PHYSICS & TRAP COLLISIONS =================
  updateRunnerPhysics(r, dt, time) {
    if (r.finished) {
      r.char.animate(dt, time, { speed: 2, isGrounded: true });
      return;
    }

    if (r.bumpCooldown > 0) r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
    if (r.stunTimer > 0) r.stunTimer = Math.max(0, r.stunTimer - dt);
    if (r.boostTimer > 0) r.boostTimer = Math.max(0, r.boostTimer - dt);

    if (r.isLocal && this.input.crouchHold) {
      r.crouchTimer = Math.max(r.crouchTimer, 0.2);
    } else if (r.crouchTimer > 0) {
      r.crouchTimer = Math.max(0, r.crouchTimer - dt);
    }
    const isCrouching = r.crouchTimer > 0 && r.isGrounded;

    const currentTile = this.world.getTileAt(r.u, r.s);
    const tileType = currentTile ? currentTile.type : 'air';

    // Steady ~12.5 m/s pace so 2,600m takes ~3.5 - 4 minutes
    let targetSpeed = 12.6;
    if (r.boostTimer > 0) targetSpeed = 18.5;
    else if (r.stunTimer > 0) targetSpeed = 4.5;
    else if (tileType === 'quicksand' && r.isGrounded) targetSpeed = 7.2;

    r.vs += (targetSpeed - r.vs) * Math.min(1, dt * 6);

    let steer = 0;
    if (r.isLocal) {
      steer = this.getEffectiveSteer();
    } else if (r.isAI) {
      steer = this.updateAIBrain(r, dt);
    }

    const desiredVu = steer * 8.8;
    r.vu += (desiredVu - r.vu) * Math.min(1, dt * (r.stunTimer > 0 ? 2.0 : 9.0));

    // Integrate lateral movement & keep inside corridor bounds
    let nextU = r.u + r.vu * dt;
    nextU = Math.max(-TRACK_HALF_WIDTH + 0.55, Math.min(TRACK_HALF_WIDTH - 0.55, nextU));

    // Check center branch divider wall (lane 2 wall when inside Left/Right split branch)
    const nextTile = this.world.getTileAt(nextU, r.s + 0.6);
    if (nextTile && nextTile.type === 'wall') {
      // Push cleanly into Left Branch or Right Branch!
      const branchDir = r.u >= 0 ? 1 : -1;
      nextU = branchDir * (LANE_WIDTH * 1.15);
      r.vu = branchDir * 4.0;
    }
    r.u = nextU;
    r.s += r.vs * dt;

    // Gravity & Floor check
    r.vh -= 34.0 * dt;
    r.h += r.vh * dt;

    const supportTile = this.world.getTileAt(r.u, r.s);
    if (supportTile && supportTile.type !== 'wall' && r.h <= 0 && r.vh <= 0) {
      r.h = 0;
      r.vh = 0;
      r.isGrounded = true;

      if (supportTile.type === 'crumble') {
        this.world.triggerCrumbleTile(supportTile.r, supportTile.lane);
      } else if (supportTile.type === 'boost') {
        r.boostTimer = Math.max(r.boostTimer, 1.3);
        if (r.isLocal) sfx.boost();
      }
    } else {
      r.isGrounded = false;
    }

    // Respawn if fallen into scorpion pit
    if (r.h < -4.5) {
      r.h = 2.5;
      r.vh = 0;
      r.u = r.u >= 0 ? LANE_WIDTH : -LANE_WIDTH;
      r.stunTimer = 0.7;
      if (r.isLocal) {
        sfx.bump();
        this.addFeedToast('🕳️ 掉入深坑！已爬回金字塔通道！');
      }
    }

    // Soft player-to-player jostling
    for (const other of this.getAllRunners()) {
      if (other === r || other.finished) continue;
      if (Math.abs(other.s - r.s) < 1.0 && Math.abs(other.u - r.u) < 0.95 && Math.abs(other.h - r.h) < 1.0) {
        const push = r.u >= other.u ? 1 : -1;
        r.vu += push * 12 * dt;
        other.vu -= push * 12 * dt;
      }
    }

    // Check Pyramid Traps (Jump vs Crouch vs Left/Right)
    for (const trap of this.world.traps) {
      if (Math.abs(trap.s - r.s) > 0.95 || r.stunTimer > 0) continue;

      if (trap.type === 'high_fire' || trap.type === 'high_gate') {
        // High trap: hits unless Crouching (isCrouching)!
        if (r.u >= trap.uMin && r.u <= trap.uMax) {
          if (!isCrouching) {
            r.s -= 1.8;
            this.applyKnockback(r, (Math.random() - 0.5) * 6, 4.0, trap.name);
          }
        }
      } else if (trap.type === 'low_spikes' || trap.type === 'low_log') {
        // Low ground trap: hits unless Jumping (r.h > 0.72)!
        if (r.u >= trap.uMin && r.u <= trap.uMax) {
          if (r.h < 0.72) {
            r.s -= 1.8;
            this.applyKnockback(r, (Math.random() - 0.5) * 6, 6.0, trap.name);
          }
        }
      } else if (trap.type === 'swing_axe') {
        if (Math.abs(trap.u - r.u) < 1.3 && Math.abs(trap.h - r.h) < 1.5) {
          const dir = r.u >= trap.u ? 1 : -1;
          this.applyKnockback(r, dir * 14, 6.0, trap.name);
        }
      } else if (trap.type === 'boulder') {
        if (Math.abs(trap.u - r.u) < 1.25 && r.h < 1.6) {
          const dir = r.u >= trap.u ? 1 : -1;
          this.applyKnockback(r, dir * 13, 5.5, trap.name);
        }
      }
    }

    // Check Finish Gate
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
    r.char.root.rotation.set(0, Math.PI + tf.yaw - r.vu * 0.025, 0);
    r.char.animate(dt, time, {
      speed: r.vs,
      isGrounded: r.isGrounded,
      isStunned: r.stunTimer > 0,
      isCrouching: r.crouchTimer > 0 && r.isGrounded
    });
  }

  updateAIBrain(bot, dt) {
    bot.aiDecisionTimer -= dt;
    if (bot.aiDecisionTimer <= 0) {
      bot.aiDecisionTimer = 0.22 + Math.random() * 0.3;

      // Check upcoming row for walls or gaps
      const lookRow = Math.min(this.world.rows.length - 1, Math.round((bot.s + 6) / ROW_LEN));
      const rowTiles = this.world.rows[lookRow] || [];
      const validTiles = rowTiles.filter(
        (t) => t && t.state !== 'broken' && t.type !== 'gap' && t.type !== 'wall'
      );

      if (validTiles.length > 0) {
        // Stay on current side if in split branch
        const sameSide = validTiles.filter((t) => (bot.u >= 0 ? t.u >= 0 : t.u <= 0));
        const pool = sameSide.length > 0 ? sameSide : validTiles;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        bot.aiTargetU = chosen.u;
      }

      // React to upcoming traps within 5.5 meters
      for (const trap of this.world.traps) {
        const dist = trap.s - bot.s;
        if (dist > 0.5 && dist < 5.5) {
          if (trap.type === 'high_fire' || trap.type === 'high_gate') {
            if (Math.random() < 0.82) bot.crouchTimer = 0.9;
          } else if (trap.type === 'low_spikes' || trap.type === 'low_log') {
            if (bot.isGrounded && Math.random() < 0.82) {
              bot.vh = 13.8;
              bot.isGrounded = false;
            }
          }
        }
      }
    }

    const diff = bot.aiTargetU - bot.u;
    return Math.max(-1, Math.min(1, diff * 0.65));
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  updateCameraAndHUD(dt) {
    const r = this.localRunner;
    if (!r) return;

    const all = this.getAllRunners().sort((a, b) => b.s - a.s);
    const myRank = all.indexOf(r) + 1;
    document.getElementById('hud-rank').innerHTML = `${myRank}<small>/${all.length}</small>`;

    const pct = Math.min(100, Math.floor((r.s / TRACK_LENGTH) * 100));
    const elapsed = this.state === 'racing' ? (performance.now() - this.raceStartClock) / 1000 : 0;
    document.getElementById('hud-timer').textContent = `${this.formatTime(elapsed)} · ${pct}%`;
    document.getElementById('hud-progress-fill').style.width = `${pct}%`;
    document.getElementById('hud-zone-label').textContent = this.world.getZoneInfo(r.s).name;

    const cdPct = (r.bumpCooldown / 1.0) * 100;
    document.getElementById('bump-cd-fill').style.height = `${cdPct}%`;

    // Steady, clean, readable camera follow
    const camBackTf = this.world.getTrackTransform(r.u * 0.55, r.h * 0.35 + 4.2, r.s - 7.8);
    const lookAheadTf = this.world.getTrackTransform(r.u * 0.4, 1.1, r.s + 10.0);

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.8);
      camBackTf.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      camBackTf.position.y += (Math.random() - 0.5) * this.shakeIntensity;
    }

    this.camera.position.lerp(camBackTf.position, Math.min(1, dt * 10));
    this.camera.lookAt(lookAheadTf.position);
  }

  showResults() {
    this.state = 'result';
    document.getElementById('hud-screen').classList.remove('active');
    document.getElementById('result-screen').classList.add('active');

    const all = this.getAllRunners().sort((a, b) => b.s - a.s);
    const myRank = all.indexOf(this.localRunner) + 1;

    const trophies = ['🏆', '🥈', '🥉'];
    document.getElementById('result-trophy').textContent = trophies[myRank - 1] || '🏺';
    document.getElementById('result-title').textContent =
      myRank === 1 ? '第 1 名！奪得法老黃金寶藏！' : `第 ${myRank} 名！成功抵達寶庫！`;
    document.getElementById('result-subtitle').textContent =
      `通關時間: ${this.formatTime(this.localRunner.finishTime)} ｜ 推擠對手: ${this.localRunner.knockouts} 次`;

    const lbList = document.getElementById('leaderboard-list');
    lbList.innerHTML = '';
    all.forEach((runner, idx) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (runner.isLocal ? ' me' : '');
      const rankBadge = idx < 3 ? trophies[idx] : `#${idx + 1}`;
      const progressText = runner.finished
        ? this.formatTime(runner.finishTime)
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
      this.camera.position.set(0, 2.75, 9.0);
      this.camera.lookAt(0, 2.45, 6.0);

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
      this.lobbyRing.rotation.z = time * 1.2;

      this.previewChar.animate(dt, time, {
        speed: 5,
        isGrounded: this.previewY <= 0.01
      });
    } else {
      this.world.update(dt, time);

      if (this.state === 'racing') {
        this.updateRunnerPhysics(this.localRunner, dt, time);
        this.aiRunners.forEach((bot) => this.updateRunnerPhysics(bot, dt, time));
        this.remoteRunners.forEach((rem) => this.syncRunnerMeshTransform(rem, dt, time));

        if (Math.random() < 0.5) {
          const r = this.localRunner;
          this.network.sendState({
            name: r.name,
            appearance: this.myAppearance,
            u: r.u,
            h: r.h,
            s: r.s,
            isGrounded: r.isGrounded,
            crouchTimer: r.crouchTimer,
            stunTimer: r.stunTimer,
            finished: r.finished
          });
        }
      } else if (this.state === 'countdown') {
        this.syncRunnerMeshTransform(this.localRunner, dt, time);
        this.aiRunners.forEach((bot) => this.syncRunnerMeshTransform(bot, dt, time));
      }

      this.updateCameraAndHUD(dt);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PyramidRushGame();
});

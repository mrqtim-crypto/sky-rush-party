import * as THREE from 'three';
import { sfx } from './audio.js';
import { RoomNetwork } from './network.js';
import { ChameleonAvatar, POSE_LIST } from './character.js';
import { LandmarkWorld } from './world.js';

const HIDE_PHASE_SECONDS = 90;  // 90 秒躲藏準備期
const HUNT_PHASE_SECONDS = 270; // 4 分 30 秒 (270秒) 追捕倒數

const BOT_NAMES = ['信義小籠包', '珍奶半糖少冰', '國父練舞哥', '藍白拖戰神', '大安森林鴿', '夜市臭豆腐'];

class TaiwanChameleonGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 160);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.95);
    this.scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.15);
    dirLight.position.set(18, 32, 22);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 90;
    const d = 32;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);

    this.world = new LandmarkWorld(this.scene);

    // Game State
    this.screenState = 'lobby'; // 'lobby' | 'playing' | 'result'
    this.phase = 'hide';        // 'hide' (90s) | 'hunt' (270s)
    this.phaseTimer = HIDE_PHASE_SECONDS;
    this.selectedMap = 'taipei101';
    this.fillBots = true;

    // Local Player State
    this.myAvatar = new ChameleonAvatar('百變小龍', 'chameleon');
    this.scene.add(this.myAvatar.root);
    this.myPos = new THREE.Vector3(0, 0, 6);
    this.myVelY = 0;
    this.myRotY = 0;
    this.isGrounded = true;
    this.isPositionLocked = false;
    this.myScore = 0;
    this.bobaCharges = 2;
    this.bobaSpeedTimer = 0;
    this.tauntCooldown = 0;
    this.autoTauntTimer = 30;

    // Hunter Attack & Penalty Cooldowns
    this.attackCooldown = 0;
    this.penaltyTimer = 0; // 4.0s stun when hitting a real scene prop!
    this.radarCooldown = 0;

    // Camera Orbit State
    this.camYaw = 0;
    this.camPitch = 0.38;
    this.camDist = 5.6;

    // Input State
    this.joyVec = { x: 0, y: 0 };
    this.keys = {};

    // Other Participants (Remote Players + AI Bots)
    this.otherPlayers = new Map(); // id -> { id, name, isBot, avatar, x, y, z, rotY, role, score, botTarget, botStateTimer }
    this.smokeClouds = [];

    this.setupNetwork();
    this.setupUI();
    this.setupControls();
    this.parseUrlInviteParams();

    // Build initial lobby background map
    this.world.buildMap(this.selectedMap, 10101);
    this.positionAvatarForLobby();

    window.addEventListener('resize', () => this.onResize());
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.animate(t));
  }

  setupNetwork() {
    this.net = new RoomNetwork({
      onStatus: (text) => {
        const el = document.getElementById('online-status');
        if (el) el.textContent = text;
      },
      onAuthFailed: (msg) => {
        this.showToast(msg, true);
      },
      onRosterUpdate: (players, roomConfig, isHost, myId) => {
        this.renderLobbyRoster(players, roomConfig, isHost, myId);
      },
      onMatchStart: (payload) => {
        this.startMatchFromHostPayload(payload);
      },
      onRemoteState: (playerId, state) => {
        this.applyRemotePlayerState(playerId, state);
      },
      onRemoteAction: (playerId, action, payload) => {
        this.handleRemoteAction(playerId, action, payload);
      }
    });
  }

  parseUrlInviteParams() {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const urlPwd = params.get('pwd');

    const roomInput = document.getElementById('room-input');
    const pwdInput = document.getElementById('room-pwd-input');
    const nameInput = document.getElementById('player-name');

    if (urlRoom && roomInput) {
      roomInput.value = urlRoom.toUpperCase().slice(0, 8);
    }
    if (urlPwd && pwdInput) {
      pwdInput.value = urlPwd.slice(0, 8);
    }

    // Randomize default nickname suffix slightly so multiple tabs have distinct names
    if (nameInput && nameInput.value === '百變小龍') {
      const suffixes = ['王', '哥', '俠', '星', '仔', '寶'];
      nameInput.value = '變色龍' + suffixes[Math.floor(Math.random() * suffixes.length)] + Math.floor(Math.random() * 90 + 10);
    }

    this.connectToCurrentRoomInputs();
  }

  connectToCurrentRoomInputs() {
    const roomId = document.getElementById('room-input')?.value || 'TW101';
    const password = document.getElementById('room-pwd-input')?.value || '';
    const playerName = document.getElementById('player-name')?.value || '變色龍玩家';

    this.myAvatar.name = playerName;
    this.net.joinOrCreateRoom({
      roomId,
      password,
      playerName,
      mapId: this.selectedMap,
      fillBots: this.fillBots
    });
  }

  setupUI() {
    // Lobby Preview Pose Buttons
    document.querySelectorAll('[data-preview-pose]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.poseChange();
        document.querySelectorAll('[data-preview-pose]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const pose = btn.getAttribute('data-preview-pose');
        this.myAvatar.applyPose(pose);
        if (pose === 'cone') {
          this.myAvatar.setAllParts([
            { color: '#ea580c', roughness: 0.4 },
            { color: '#ea580c', roughness: 0.4 },
            { color: '#f8fafc', roughness: 0.3 },
            { color: '#ea580c', roughness: 0.4 },
            { color: '#ea580c', roughness: 0.4 },
            { color: '#1e293b', roughness: 0.8 }
          ]);
        } else if (pose === 'ball') {
          this.myAvatar.setSingleColor('#eab308', 0.25, 0.7);
        } else if (pose === 'box') {
          this.myAvatar.setAllParts([
            { color: '#0284c7', roughness: 0.4 },
            { color: '#16a34a', roughness: 0.4 },
            { color: '#16a34a', roughness: 0.4 },
            { color: '#16a34a', roughness: 0.4 },
            { color: '#334155', roughness: 0.7 },
            { color: '#334155', roughness: 0.7 }
          ]);
        } else if (pose === 'guard') {
          this.myAvatar.setAllParts([
            { color: '#e2e8f0', roughness: 0.2 },
            { color: '#1d4ed8', roughness: 0.4 },
            { color: '#1d4ed8', roughness: 0.4 },
            { color: '#1d4ed8', roughness: 0.4 },
            { color: '#1d4ed8', roughness: 0.4 },
            { color: '#991b1b', roughness: 0.6 }
          ]);
        } else {
          this.myAvatar.resetToPureWhite();
        }
      });
    });

    // Join / Update Room Button
    document.getElementById('btn-join-room')?.addEventListener('click', () => {
      sfx.readyBeep(true);
      this.connectToCurrentRoomInputs();
    });

    // Player Name & Password live update
    document.getElementById('player-name')?.addEventListener('change', (e) => {
      this.net.updateMyProfile({ name: e.target.value });
    });
    document.getElementById('room-pwd-input')?.addEventListener('change', (e) => {
      if (this.net.isHost) {
        this.net.updateMyProfile({ password: e.target.value });
        this.showToast(e.target.value ? `🔒 已設定房間密碼：${e.target.value}` : '🔓 已取消房間密碼');
      }
    });

    // One-Click Share Invite Link (with Room ID & Password)
    document.getElementById('btn-share-link')?.addEventListener('click', async () => {
      sfx.paintBlend();
      const roomId = (document.getElementById('room-input')?.value || 'TW101').trim().toUpperCase();
      const pwd = (document.getElementById('room-pwd-input')?.value || '').trim();

      // Update room password on host if not yet synced
      if (this.net.isHost && pwd !== this.net.password) {
        this.net.updateMyProfile({ password: pwd });
      }

      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const params = new URLSearchParams();
      params.set('room', roomId);
      if (pwd) params.set('pwd', pwd);
      const shareUrl = `${baseUrl}?${params.toString()}`;
      const shareText = `🦎 來玩《台灣變色龍：地標大躲貓貓》！房號：${roomId}${pwd ? `（密碼：${pwd}）` : ''} 點連結直接進房：`;

      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        this.showToast('✅ 已複製專屬房間連結！傳給朋友點開即可進房！');
      } catch (e) {
        this.showToast(`🔗 分享網址：${shareUrl}`);
      }

      if (navigator.share) {
        try {
          await navigator.share({
            title: '台灣變色龍：地標大躲貓貓 3D',
            text: shareText,
            url: shareUrl
          });
        } catch (err) {}
      }
    });

    // Map Selector Cards
    document.querySelectorAll('.map-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (!this.net.isHost) {
          this.showToast('👑 只有房主可以切換地圖場景喔！', true);
          return;
        }
        sfx.colorPick();
        const mapId = card.getAttribute('data-map') || 'taipei101';
        this.selectedMap = mapId;
        document.querySelectorAll('.map-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.world.buildMap(this.selectedMap, 10101);
        this.net.updateMyProfile({ mapId: this.selectedMap });
      });
    });

    // AI Bot Toggle
    document.getElementById('chk-fill-bots')?.addEventListener('change', (e) => {
      if (!this.net.isHost) {
        e.target.checked = this.fillBots;
        return;
      }
      this.fillBots = e.target.checked;
      this.net.updateMyProfile({ fillBots: this.fillBots });
    });

    // Guest Ready Button
    document.getElementById('btn-guest-ready')?.addEventListener('click', () => {
      const nextReady = !this.net.myReady;
      sfx.readyBeep(nextReady);
      this.net.updateMyProfile({ ready: nextReady });
      const btn = document.getElementById('btn-guest-ready');
      if (btn) {
        btn.classList.toggle('is-ready', nextReady);
        btn.textContent = nextReady
          ? '✅ 已準備完成！（點擊可取消・等待房主開始）'
          : '⏳ 點擊準備完成（等待房主開始）';
      }
    });

    // Host Start Match Button
    document.getElementById('btn-host-start')?.addEventListener('click', () => {
      if (!this.net.isHost) return;
      const humans = Array.from(this.net.roomPlayers.values());
      const unready = humans.filter((p) => !p.isHost && !p.ready);
      if (unready.length > 0) {
        this.showToast(`⚠️ 還有 ${unready.length} 位玩家尚未點擊準備，仍為您強制開局！`);
      }

      // Build full participants list (Human players + AI bots if enabled)
      const participants = humans.map((h) => ({
        id: h.id,
        name: h.name,
        isBot: false
      }));

      if (this.fillBots) {
        const targetCount = Math.max(6, participants.length + 1);
        let botIdx = 0;
        while (participants.length < targetCount) {
          participants.push({
            id: `bot_${botIdx + 1}`,
            name: BOT_NAMES[botIdx % BOT_NAMES.length],
            isBot: true
          });
          botIdx++;
        }
      } else if (participants.length < 2) {
        // Ensure at least 1 AI opponent if solo testing with bots unchecked
        participants.push({
          id: 'bot_1',
          name: '信義小籠包(AI)',
          isBot: true
        });
      }

      this.net.hostStartMatch(participants);
    });

    // Build In-Game Pose Buttons Row
    const poseRow = document.getElementById('pose-buttons-row');
    if (poseRow) {
      poseRow.innerHTML = '';
      POSE_LIST.forEach((p) => {
        const btn = document.createElement('button');
        btn.className = `pose-pill-btn ${p.id === 'stand' ? 'active' : ''}`;
        btn.dataset.poseId = p.id;
        btn.innerHTML = `${p.icon} ${p.name}`;
        btn.addEventListener('click', () => {
          this.selectChameleonPose(p.id);
        });
        poseRow.appendChild(btn);
      });
    }

    // Tilt Slider & Reset
    const tiltSlider = document.getElementById('tilt-slider');
    tiltSlider?.addEventListener('input', (e) => {
      const deg = Number(e.target.value || 0);
      this.myAvatar.setTilt((deg * Math.PI) / 180);
    });
    document.getElementById('btn-reset-tilt')?.addEventListener('click', () => {
      if (tiltSlider) tiltSlider.value = '0';
      this.myAvatar.setTilt(0);
    });

    // Lock Position Toggle
    document.getElementById('btn-lock-pos')?.addEventListener('click', () => {
      this.togglePositionLock(!this.isPositionLocked);
    });

    // 1-Click Surroundings Auto-Camo Button!
    document.getElementById('btn-auto-camo')?.addEventListener('click', () => {
      this.triggerSurroundingsAutoCamo();
    });

    // Boba Smoke Escape Button
    document.getElementById('btn-boba-smoke')?.addEventListener('click', () => {
      this.triggerBobaSmoke();
    });

    // Taiwanese Taunt Button
    document.getElementById('btn-taunt')?.addEventListener('click', () => {
      this.triggerTaunt(true);
    });

    // Jump Buttons
    document.getElementById('btn-jump-cham')?.addEventListener('click', () => this.triggerJump());
    document.getElementById('btn-jump-hunt')?.addEventListener('click', () => this.triggerJump());

    // Hunter Blue-White Slipper Attack Button!
    document.getElementById('btn-slipper-attack')?.addEventListener('click', () => {
      this.triggerHunterSlipperAttack();
    });

    // Hunter Radar Scan Button
    document.getElementById('btn-radar-scan')?.addEventListener('click', () => {
      this.triggerHunterRadar();
    });

    // Host Skip Hide Phase Buttons
    const skipHandler = () => {
      if (this.phase === 'hide') {
        this.enterHuntPhase();
        this.net.sendAction('skip_hide', {});
      }
    };
    document.getElementById('btn-skip-hide')?.addEventListener('click', skipHandler);
    document.getElementById('btn-chameleon-skip-hide')?.addEventListener('click', skipHandler);

    // Back to Lobby from Result Screen
    document.getElementById('btn-back-lobby')?.addEventListener('click', () => {
      this.returnToLobby();
    });
  }

  renderLobbyRoster(players, roomConfig, isHost, myId) {
    // Sync map selection UI if Guest
    if (!isHost && roomConfig) {
      if (roomConfig.mapId && roomConfig.mapId !== this.selectedMap) {
        this.selectedMap = roomConfig.mapId;
        this.world.buildMap(this.selectedMap, 10101);
      }
      document.querySelectorAll('.map-card').forEach((c) => {
        c.classList.toggle('active', c.getAttribute('data-map') === this.selectedMap);
      });
      const botChk = document.getElementById('chk-fill-bots');
      if (botChk && roomConfig.fillBots !== undefined) {
        botChk.checked = roomConfig.fillBots;
      }
    }

    const rosterEl = document.getElementById('roster-list');
    const readyCountEl = document.getElementById('ready-counter');
    if (rosterEl) {
      rosterEl.innerHTML = '';
      let readyCount = 0;
      players.forEach((p) => {
        if (p.ready || p.isHost) readyCount++;
        const row = document.createElement('div');
        row.className = 'roster-item';
        const roleIcon = p.isHost ? '👑 房主' : '👤 玩家';
        const meTag = p.id === myId ? ' (你)' : '';
        const statusClass = p.ready || p.isHost ? 'ready' : 'wait';
        const statusText = p.isHost ? '👑 房主就緒' : p.ready ? '✅ 已準備' : '⏳ 準備中';
        row.innerHTML = `
          <span class="roster-name">${roleIcon}・${p.name}${meTag}</span>
          <span class="roster-status ${statusClass}">${statusText}</span>
        `;
        rosterEl.appendChild(row);
      });
      if (readyCountEl) {
        readyCountEl.textContent = `已準備 ${readyCount}/${players.length}`;
      }
    }

    // Show Host Start vs Guest Ready button
    const hostBtn = document.getElementById('btn-host-start');
    const guestBtn = document.getElementById('btn-guest-ready');
    if (hostBtn && guestBtn) {
      hostBtn.classList.toggle('hidden', !isHost);
      guestBtn.classList.toggle('hidden', isHost);
    }
  }

  // ==================== MATCH INITIALIZATION ====================
  startMatchFromHostPayload(payload) {
    sfx.countdown(true);
    this.selectedMap = payload.mapId || 'taipei101';
    this.world.buildMap(this.selectedMap, payload.seed || 12345);

    this.otherPlayers.forEach((p) => this.scene.remove(p.avatar.root));
    this.otherPlayers.clear();

    const hunterSet = new Set(payload.initialHunterIds || []);
    const participants = payload.participants || [];

    // Determine my role
    const amIHunter = hunterSet.has(this.net.myId);
    this.myScore = 0;
    this.bobaCharges = 2;
    this.bobaSpeedTimer = 0;
    this.attackCooldown = 0;
    this.penaltyTimer = 0;
    this.radarCooldown = 0;
    this.isPositionLocked = false;
    this.togglePositionLock(false);

    this.myAvatar.name = this.net.myName;
    if (amIHunter) {
      this.myAvatar.setRole('hunter');
      this.myPos.set(0, 0, 28); // Inside Metro Exit 4 Holding Gate!
      this.myRotY = Math.PI;
    } else {
      this.myAvatar.setRole('chameleon');
      this.myAvatar.resetToPureWhite(); // Starts 100% Pure White!
      this.myPos.set((Math.random() - 0.5) * 8, 0, 6 + (Math.random() - 0.5) * 4);
      this.myRotY = 0;
    }

    // Spawn Other Human Players & AI Bots
    participants.forEach((p, idx) => {
      if (p.id === this.net.myId) return;
      const role = hunterSet.has(p.id) ? 'hunter' : 'chameleon';
      const avatar = new ChameleonAvatar(p.name, role);
      if (role === 'chameleon') {
        avatar.resetToPureWhite();
      }
      this.scene.add(avatar.root);

      const startX = role === 'hunter' ? (idx % 2 === 0 ? -1.5 : 1.5) : (idx - 2.5) * 2.5;
      const startZ = role === 'hunter' ? 28 : 5;
      avatar.root.position.set(startX, 0, startZ);

      // Pick a hiding spot for AI Chameleon bots
      const spot = this.world.hidingSpots[idx % Math.max(1, this.world.hidingSpots.length)];

      this.otherPlayers.set(p.id, {
        id: p.id,
        name: p.name,
        isBot: Boolean(p.isBot),
        avatar,
        x: startX,
        y: 0,
        z: startZ,
        rotY: 0,
        role,
        score: 0,
        botSpot: spot,
        botBlended: false,
        botWanderAngle: Math.random() * Math.PI * 2,
        botStateTimer: 0
      });
    });

    // Set Phase to 90s Hide Phase
    this.phase = 'hide';
    this.phaseTimer = HIDE_PHASE_SECONDS;
    this.world.setHunterGateLocked(true);

    this.switchScreen('hud');
    this.updateRoleHUD();

    const hunterNames = participants
      .filter((p) => hunterSet.has(p.id))
      .map((p) => p.name)
      .join('、');

    this.showCenterBanner(
      amIHunter
        ? `🩴 你被抽中當「鬼」！等待 90 秒後出動抓人！`
        : `🦎 你是「純白變色龍」！鬼是【${hunterNames}】，快在 90 秒內換動作＋吸色偽裝！`,
      4200
    );
  }

  enterHuntPhase() {
    if (this.phase === 'hunt') return;
    this.phase = 'hunt';
    this.phaseTimer = HUNT_PHASE_SECONDS; // 4m30s (270s)
    this.world.setHunterGateLocked(false);
    sfx.countdown(true);

    document.getElementById('hunter-wait-panel')?.classList.add('hidden');
    document.getElementById('btn-chameleon-skip-hide')?.classList.add('hidden');

    this.showCenterBanner('🩴 90秒結束！藍白拖獵人正式出動！（追捕倒數 4分30秒）', 3800);
    this.addEventFeed('🚨 捷運站出口開啟！鬼拿著藍白拖出動了！');
  }

  updateRoleHUD() {
    const isHunter = this.myAvatar.role === 'hunter';
    const badge = document.getElementById('hud-role-badge');
    if (badge) {
      badge.className = `role-badge ${isHunter ? 'hunter' : 'chameleon'}`;
      badge.textContent = isHunter ? '🩴 抓人者：藍白拖鬼' : '🦎 躲藏者：純白變色龍';
    }

    document.getElementById('chameleon-actions')?.classList.toggle('hidden', isHunter);
    document.getElementById('chameleon-pose-bar')?.classList.toggle('hidden', isHunter);
    document.getElementById('btn-lock-pos')?.classList.toggle('hidden', isHunter);
    document.getElementById('hunter-actions')?.classList.toggle('hidden', !isHunter);

    const inHidePhase = this.phase === 'hide';
    document.getElementById('hunter-wait-panel')?.classList.toggle('hidden', !(isHunter && inHidePhase));
    document.getElementById('btn-skip-hide')?.classList.toggle('hidden', !this.net.isHost);
    document.getElementById('btn-chameleon-skip-hide')?.classList.toggle('hidden', !(this.net.isHost && !isHunter && inHidePhase));

    this.updateBodyColorDotsUI();
  }

  updateBodyColorDotsUI() {
    const dots = document.querySelectorAll('#body-color-dots span');
    dots.forEach((dot, idx) => {
      dot.style.background = this.myAvatar.partColors[idx] || '#ffffff';
    });
  }

  // ==================== CHAMELEON MECHANICS ====================
  selectChameleonPose(poseId) {
    if (this.myAvatar.role !== 'chameleon') return;
    sfx.poseChange();
    this.myAvatar.applyPose(poseId);
    document.querySelectorAll('#pose-buttons-row .pose-pill-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.poseId === poseId);
    });
  }

  togglePositionLock(locked) {
    this.isPositionLocked = locked;
    const btn = document.getElementById('btn-lock-pos');
    if (btn) {
      btn.classList.toggle('locked', locked);
      btn.textContent = locked
        ? '🔒 已鎖定位置（滑動螢幕可360°偷看鬼）'
        : '🔓 自由移動中 (點此鎖定不動)';
    }
  }

  // 核心功能：一鍵快速塗上周邊相同顏色 (6 部位自動射線採樣)
  triggerSurroundingsAutoCamo() {
    if (this.myAvatar.role !== 'chameleon') return;
    sfx.paintBlend();

    const centers = this.myAvatar.getPartWorldCenters();
    const sampledParts = this.world.sampleSurroundingColorsForParts(centers);
    this.myAvatar.setAllParts(sampledParts);
    this.updateBodyColorDotsUI();

    // Spawn subtle sparkle ring
    this.spawnColorBurstEffect(this.myPos.x, this.myPos.y + 0.8, this.myPos.z, sampledParts[1].color);
    this.showToast('🎨 已自動吸取周邊環境顏色與質感！');
  }

  // 點擊 3D 畫面上的任何物件直接秒吸色
  trySampleColorFromScreenTap(clientX, clientY) {
    if (this.screenState !== 'playing' || this.myAvatar.role !== 'chameleon') return;

    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hits = raycaster.intersectObjects(this.world.paintableMeshes, false);

    if (hits.length > 0 && hits[0].distance < 18) {
      const obj = hits[0].object;
      if (obj.userData && obj.userData.paintColor) {
        sfx.colorPick();
        this.myAvatar.setSingleColor(
          obj.userData.paintColor,
          obj.userData.roughness ?? 0.5,
          obj.userData.metalness ?? 0.05
        );
        this.updateBodyColorDotsUI();
      }
    }
  }

  triggerBobaSmoke() {
    if (this.myAvatar.role !== 'chameleon' || this.bobaCharges <= 0) return;
    this.bobaCharges--;
    this.bobaSpeedTimer = 4.5;
    this.togglePositionLock(false);
    sfx.bobaSmoke();

    const countEl = document.getElementById('boba-count');
    if (countEl) countEl.textContent = `(${this.bobaCharges})`;

    this.spawnBobaSmokeCloud(this.myPos.x, this.myPos.z);
    this.net.sendAction('boba_smoke', { x: this.myPos.x, z: this.myPos.z });
    this.showToast('🧋 施放黑糖珍奶煙霧彈！加速逃跑 4.5 秒！');
  }

  spawnBobaSmokeCloud(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0.2, z);

    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      transparent: true,
      opacity: 0.85,
      roughness: 0.9
    });

    for (let i = 0; i < 14; i++) {
      const r = 0.35 + Math.random() * 0.65;
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), smokeMat);
      p.position.set((Math.random() - 0.5) * 3.2, Math.random() * 1.8, (Math.random() - 0.5) * 3.2);
      group.add(p);
    }

    this.scene.add(group);
    this.smokeClouds.push({ mesh: group, timer: 4.5 });
  }

  spawnColorBurstEffect(x, y, z, hexColor) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor),
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), mat);
    ring.position.set(x, y, z);
    this.scene.add(ring);
    this.smokeClouds.push({ mesh: ring, timer: 0.45, isBurst: true });
  }

  triggerTaunt(manual = true) {
    if (this.myAvatar.role !== 'chameleon') return;
    if (manual && this.tauntCooldown > 0) return;

    if (Math.random() < 0.5) {
      sfx.tauntBabu();
    } else {
      sfx.tauntGarbageTruck();
    }

    if (manual) {
      this.myScore += 30;
      this.tauntCooldown = 10;
      this.showToast('🔊 巴哺嘲諷成功！積分 +30！');
    } else {
      this.showToast('🔊 忍不住發出了台味嘲諷聲音！小心鬼聽聲辨位！');
    }

    this.spawnColorBurstEffect(this.myPos.x, this.myPos.y + 1.5, this.myPos.z, '#ec4899');
    this.net.sendAction('taunt', { x: this.myPos.x, z: this.myPos.z, name: this.myAvatar.name });
  }

  // ==================== HUNTER MECHANICS (藍白拖敲打 & 4秒敲錯懲罰) ====================
  triggerHunterSlipperAttack() {
    if (this.myAvatar.role !== 'hunter') return;
    if (this.phase === 'hide') {
      this.showToast('🙈 目前是 90 秒躲藏期，倒數結束後才能出動敲人！');
      return;
    }
    if (this.penaltyTimer > 0) {
      this.showToast(`⚡ 手麻撿拖鞋硬直中！還要等 ${this.penaltyTimer.toFixed(1)} 秒！`, true);
      return;
    }
    if (this.attackCooldown > 0) {
      return;
    }

    this.myAvatar.triggerSlipperSwing();
    this.net.sendAction('slipper_swing', {});

    // 1. Check if we hit any Chameleon within 2.5m in front/around the Hunter
    let hitTarget = null;
    let bestDist = 2.55;

    for (const [, p] of this.otherPlayers.entries()) {
      if (p.role !== 'chameleon') continue;
      const dx = p.x - this.myPos.x;
      const dz = p.z - this.myPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        bestDist = dist;
        hitTarget = p;
      }
    }

    if (hitTarget) {
      // SUCCESS! Hit a hiding Chameleon -> Infect them into a Hunter!
      sfx.slipperHitPlayer();
      this.attackCooldown = 1.0;
      this.myScore += 60;
      this.infectPlayer(hitTarget.id, this.myAvatar.name);
      this.net.sendAction('infect_player', {
        targetId: hitTarget.id,
        hunterName: this.myAvatar.name
      });
      return;
    }

    // 2. Didn't hit a Chameleon -> Check if we hit a REAL scene prop by mistake!
    const forward = new THREE.Vector3(Math.sin(this.myRotY), 0, Math.cos(this.myRotY)).normalize();
    const rayOrigin = new THREE.Vector3(this.myPos.x, this.myPos.y + 0.75, this.myPos.z);
    const raycaster = new THREE.Raycaster(rayOrigin, forward, 0.1, 2.35);
    const propHits = raycaster.intersectObjects(this.world.decoyPropMeshes, false);

    // Also check proximity to any decoy prop bounding center
    let hitRealProp = propHits.length > 0;
    if (!hitRealProp) {
      for (const mesh of this.world.decoyPropMeshes) {
        const wp = new THREE.Vector3();
        mesh.getWorldPosition(wp);
        if (Math.hypot(wp.x - (this.myPos.x + forward.x * 1.1), wp.z - (this.myPos.z + forward.z * 1.1)) < 1.35) {
          hitRealProp = true;
          break;
        }
      }
    }

    if (hitRealProp) {
      // ⚠️ WRONG HIT ON REAL PROP! Trigger 4.0-second Hand-Numbness & Dropped Slipper Penalty!
      sfx.slipperPenalty();
      this.penaltyTimer = 4.0;
      this.attackCooldown = 4.0;
      this.myAvatar.stunnedTimer = 4.0;
      this.showToast('⚡ 敲到真物件了！手麻掉拖鞋罰站 4 秒！', true);
      this.addEventFeed(`💥 ${this.myAvatar.name} 藍白拖敲錯真物件，手麻硬直 4 秒！`);
    } else {
      // Normal Miss in open air -> 1.8s recovery cooldown to prevent continuous spam
      sfx.slipperSwing();
      this.attackCooldown = 1.8;
    }
  }

  infectPlayer(targetId, hunterName) {
    if (targetId === this.net.myId) {
      if (this.myAvatar.role === 'hunter') return;
      sfx.slipperHitPlayer();
      this.myAvatar.setRole('hunter');
      this.isPositionLocked = false;
      this.togglePositionLock(false);
      this.updateRoleHUD();
      this.showCenterBanner(`🩴 啪！你被【${hunterName}】的藍白拖抓到了！\n感染變成「鬼」，快一起抓剩下的變色龍！`, 4000);
      this.addEventFeed(`🦠 ${this.myAvatar.name} 被 ${hunterName} 敲中，感染變成藍白拖鬼！`);
    } else {
      const p = this.otherPlayers.get(targetId);
      if (p && p.role !== 'hunter') {
        p.role = 'hunter';
        p.avatar.setRole('hunter');
        this.addEventFeed(`🦠 ${p.name} 被 ${hunterName} 的藍白拖抓獲，感染變成鬼！`);
      }
    }

    this.checkAllChameleonsCaught();
  }

  triggerHunterRadar() {
    if (this.myAvatar.role !== 'hunter' || this.radarCooldown > 0) return;
    this.radarCooldown = 22;
    sfx.readyBeep(true);

    let nearCount = 0;
    for (const [, p] of this.otherPlayers.entries()) {
      if (p.role === 'chameleon') {
        const d = Math.hypot(p.x - this.myPos.x, p.z - this.myPos.z);
        if (d <= 18) nearCount++;
      }
    }

    if (nearCount > 0) {
      this.showToast(`📡 逼逼雷達：半徑 18 公尺內有 ${nearCount} 隻偽裝變色龍！`);
    } else {
      this.showToast('📡 逼逼雷達：附近 18 公尺內沒有變色龍，換個區域找找！');
    }
  }

  triggerJump() {
    if (this.isPositionLocked || this.penaltyTimer > 0) return;
    if (this.isGrounded) {
      this.myVelY = 7.2;
      this.isGrounded = false;
      sfx.jump();
    }
  }

  // ==================== NETWORK SYNC & AI BOTS ====================
  applyRemotePlayerState(playerId, state) {
    if (!state || playerId === this.net.myId) return;
    let p = this.otherPlayers.get(playerId);
    if (!p) {
      const avatar = new ChameleonAvatar(state.name || '連線玩家', state.role || 'chameleon');
      this.scene.add(avatar.root);
      p = {
        id: playerId,
        name: state.name || '連線玩家',
        isBot: false,
        avatar,
        x: state.x || 0,
        y: state.y || 0,
        z: state.z || 0,
        rotY: state.rotY || 0,
        role: state.role || 'chameleon',
        score: state.score || 0
      };
      this.otherPlayers.set(playerId, p);
    }

    p.x = state.x ?? p.x;
    p.y = state.y ?? p.y;
    p.z = state.z ?? p.z;
    p.rotY = state.rotY ?? p.rotY;
    p.score = state.score ?? p.score;
    p.role = state.role || p.role;

    if (state.appearance) {
      p.avatar.applyRemoteAppearance(state.appearance);
    }
  }

  handleRemoteAction(playerId, action, payload) {
    if (action === 'infect_player' && payload) {
      this.infectPlayer(payload.targetId, payload.hunterName || '獵人');
    } else if (action === 'skip_hide') {
      this.enterHuntPhase();
    } else if (action === 'boba_smoke' && payload) {
      sfx.bobaSmoke();
      this.spawnBobaSmokeCloud(payload.x, payload.z);
    } else if (action === 'taunt' && payload) {
      sfx.tauntBabu();
      this.addEventFeed(`🔊 場上傳來【${payload.name}】的巴哺嘲諷聲！`);
      this.spawnColorBurstEffect(payload.x, 1.4, payload.z, '#ec4899');
    } else if (action === 'slipper_swing') {
      const p = this.otherPlayers.get(playerId);
      if (p) p.avatar.triggerSlipperSwing();
    }
  }

  updateAIBots(dt) {
    for (const [, bot] of this.otherPlayers.entries()) {
      if (!bot.isBot) continue;

      if (bot.role === 'chameleon') {
        // During Hide Phase: run to assigned landmark hiding spot, strike pose & auto-blend!
        if (bot.botSpot && !bot.botBlended) {
          const dx = bot.botSpot.x - bot.x;
          const dz = bot.botSpot.z - bot.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.35) {
            const step = Math.min(dist, 5.5 * dt);
            bot.x += (dx / dist) * step;
            bot.z += (dz / dist) * step;
            bot.rotY = Math.atan2(dx, dz);
            bot.avatar.update(dt, true);
          } else {
            bot.x = bot.botSpot.x;
            bot.z = bot.botSpot.z;
            bot.rotY = bot.botSpot.rotY || 0;
            bot.avatar.applyPose(bot.botSpot.poseId || 'cone');
            const partData = (bot.botSpot.colors || []).map((c, idx) => ({
              color: c,
              roughness: bot.botSpot.roughness ? bot.botSpot.roughness[idx] : 0.45,
              metalness: 0.05
            }));
            bot.avatar.setAllParts(partData);
            bot.botBlended = true;
            bot.avatar.update(dt, false);
          }
        } else {
          // Stay frozen in camouflage pose!
          if (this.phase === 'hunt') {
            bot.score += dt;
          }
          bot.avatar.update(dt, false);
        }
      } else if (bot.role === 'hunter') {
        // AI Hunter waits in holding gate during 90s Hide Phase, then patrols plaza!
        if (this.phase === 'hide') {
          bot.avatar.update(dt, false);
          continue;
        }

        if (bot.avatar.stunnedTimer > 0) {
          bot.avatar.update(dt, false);
          continue;
        }

        bot.botStateTimer -= dt;
        if (bot.botStateTimer <= 0) {
          bot.botStateTimer = 2.0 + Math.random() * 2.5;
          // Gently steer toward a random plaza point or nearby moving player
          const targetX = (Math.random() - 0.5) * 30;
          const targetZ = (Math.random() - 0.5) * 28;
          bot.botWanderAngle = Math.atan2(targetX - bot.x, targetZ - bot.z);
        }

        bot.x += Math.sin(bot.botWanderAngle) * 5.2 * dt;
        bot.z += Math.cos(bot.botWanderAngle) * 5.2 * dt;
        bot.x = Math.max(-32, Math.min(32, bot.x));
        bot.z = Math.max(-25, Math.min(25, bot.z));
        bot.rotY = bot.botWanderAngle;
        bot.avatar.update(dt, true);

        // Check if AI Hunter catches a player who is moving or pure white nearby
        if (this.myAvatar.role === 'chameleon') {
          const dMe = Math.hypot(this.myPos.x - bot.x, this.myPos.z - bot.z);
          const isMePureWhite = this.myAvatar.partColors[0] === '#ffffff' && this.myAvatar.poseId === 'stand';
          const detectRadius = isMePureWhite || !this.isPositionLocked ? 2.1 : 0.85;
          if (dMe < detectRadius) {
            bot.avatar.triggerSlipperSwing();
            this.infectPlayer(this.net.myId, bot.name);
          }
        }
      }

      bot.avatar.root.position.set(bot.x, bot.y, bot.z);
      bot.avatar.root.rotation.y = bot.rotY;
      // Hide Chameleon nametags from Hunters so they have to spot them by sight!
      if (bot.avatar.nameSprite) {
        bot.avatar.nameSprite.visible = !(this.myAvatar.role === 'hunter' && bot.role === 'chameleon');
      }
    }
  }

  checkAllChameleonsCaught() {
    if (this.screenState !== 'playing') return;
    let chamCount = this.myAvatar.role === 'chameleon' ? 1 : 0;
    for (const [, p] of this.otherPlayers.entries()) {
      if (p.role === 'chameleon') chamCount++;
    }
    if (chamCount === 0) {
      this.finishRound('hunters_win');
    }
  }

  finishRound(reason = 'time_up') {
    if (this.screenState === 'result') return;
    this.screenState = 'result';
    sfx.win();
    this.switchScreen('result');

    let chamSurvivors = this.myAvatar.role === 'chameleon' ? 1 : 0;
    let hunterCount = this.myAvatar.role === 'hunter' ? 1 : 0;
    for (const [, p] of this.otherPlayers.entries()) {
      if (p.role === 'chameleon') chamSurvivors++;
      else hunterCount++;
    }

    const trophyEl = document.getElementById('result-trophy');
    const titleEl = document.getElementById('result-title');
    const subEl = document.getElementById('result-subtitle');

    if (chamSurvivors > 0) {
      if (trophyEl) trophyEl.textContent = '🦎🏆';
      if (titleEl) titleEl.textContent = '時間到！變色龍偽裝大獲全勝！';
      if (this.myAvatar.role === 'chameleon') this.myScore += 120;
    } else {
      if (trophyEl) trophyEl.textContent = '🩴👑';
      if (titleEl) titleEl.textContent = '全數抓獲！藍白拖獵人陣營全勝！';
    }

    if (subEl) {
      subEl.textContent = `最終倖存變色龍: ${chamSurvivors} 人 ｜ 藍白拖獵人: ${hunterCount} 人`;
    }

    // Build Leaderboard
    const allScores = [
      { name: `${this.myAvatar.name} (你)`, role: this.myAvatar.role, score: Math.round(this.myScore) }
    ];
    for (const [, p] of this.otherPlayers.entries()) {
      allScores.push({
        name: p.name,
        role: p.role,
        score: Math.round(p.score + (p.role === 'chameleon' ? 100 : 45))
      });
    }
    allScores.sort((a, b) => b.score - a.score);

    const lbEl = document.getElementById('leaderboard-list');
    if (lbEl) {
      lbEl.innerHTML = '';
      allScores.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'lb-row';
        const badge = item.role === 'hunter' ? '🩴 藍白拖鬼' : '🦎 倖存變色龍';
        row.innerHTML = `
          <span>#${idx + 1} ${item.name} <small>(${badge})</small></span>
          <span>${item.score} 分</span>
        `;
        lbEl.appendChild(row);
      });
    }
  }

  returnToLobby() {
    this.screenState = 'lobby';
    this.otherPlayers.forEach((p) => this.scene.remove(p.avatar.root));
    this.otherPlayers.clear();
    this.myAvatar.setRole('chameleon');
    this.myAvatar.resetToPureWhite();
    this.positionAvatarForLobby();
    this.switchScreen('lobby');
  }

  positionAvatarForLobby() {
    this.myPos.set(0, 0, 12);
    this.myRotY = 0;
    this.myAvatar.root.position.copy(this.myPos);
    this.myAvatar.root.rotation.y = 0;
  }

  // ==================== CONTROLS (JOYSTICK + CAMERA ORBIT + KEYBOARD) ====================
  setupControls() {
    // Virtual Joystick
    const joyZone = document.getElementById('joystick-zone');
    const joyKnob = document.getElementById('joystick-knob');
    let joyPointerId = null;
    let joyCenter = { x: 0, y: 0 };

    joyZone?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      joyPointerId = e.pointerId;
      const rect = joyZone.getBoundingClientRect();
      joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      joyZone.setPointerCapture(e.pointerId);
    });

    joyZone?.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyPointerId) return;
      const dx = e.clientX - joyCenter.x;
      const dy = e.clientY - joyCenter.y;
      const maxR = 42;
      const dist = Math.min(maxR, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * dist;
      const ky = Math.sin(angle) * dist;
      if (joyKnob) {
        joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
      }
      this.joyVec.x = kx / maxR;
      this.joyVec.y = ky / maxR;
    });

    const resetJoy = (e) => {
      if (e && e.pointerId !== joyPointerId) return;
      joyPointerId = null;
      if (joyKnob) joyKnob.style.transform = 'translate(0px, 0px)';
      this.joyVec.x = 0;
      this.joyVec.y = 0;
    };
    joyZone?.addEventListener('pointerup', resetJoy);
    joyZone?.addEventListener('pointercancel', resetJoy);

    // Camera Drag & Tap-to-Pick Color on Canvas
    let camPointerId = null;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let movedDist = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      camPointerId = e.pointerId;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      movedDist = 0;
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== camPointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      movedDist += Math.hypot(dx, dy);
      lastX = e.clientX;
      lastY = e.clientY;

      this.camYaw -= dx * 0.0075;
      this.camPitch = Math.max(0.12, Math.min(1.25, this.camPitch + dy * 0.006));
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerId !== camPointerId) return;
      camPointerId = null;
      if (movedDist < 10) {
        // Short tap on 3D canvas -> Sample color directly from tapped object!
        this.trySampleColorFromScreenTap(downX, downY);
      }
    });

    // Keyboard Support (WASD + Space + E + Q)
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.screenState !== 'playing') return;
      if (e.code === 'Space') this.triggerJump();
      if (e.code === 'KeyE') {
        if (this.myAvatar.role === 'hunter') this.triggerHunterSlipperAttack();
        else this.triggerSurroundingsAutoCamo();
      }
      if (e.code === 'KeyF' && this.myAvatar.role === 'chameleon') {
        this.togglePositionLock(!this.isPositionLocked);
      }
      if (e.code === 'KeyQ' && this.myAvatar.role === 'chameleon') {
        this.triggerTaunt(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  // ==================== MAIN UPDATE LOOP ====================
  animate(now) {
    requestAnimationFrame((t) => this.animate(t));
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.screenState === 'lobby') {
      this.myAvatar.root.rotation.y += dt * 0.65;
      this.camera.position.set(0, 3.2, 16.5);
      this.camera.lookAt(0, 1.4, 8);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.screenState === 'playing') {
      this.updateMatchTimers(dt);
      this.updateLocalPlayer(dt);
      this.updateAIBots(dt);
      this.updateRemotePlayers(dt);
      this.updateSmokeEffects(dt);
      this.world.update(dt, this.phase === 'hunt' && this.phaseTimer <= 90);
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateMatchTimers(dt) {
    this.phaseTimer -= dt;
    if (this.phase === 'hide' && this.phaseTimer <= 0) {
      this.enterHuntPhase();
    } else if (this.phase === 'hunt' && this.phaseTimer <= 0) {
      this.finishRound('time_up');
      return;
    }

    // Format MM:SS
    const secLeft = Math.max(0, Math.ceil(this.phaseTimer));
    const mm = String(Math.floor(secLeft / 60)).padStart(2, '0');
    const ss = String(secLeft % 60).padStart(2, '0');

    const phaseLabel = document.getElementById('hud-phase-label');
    const timerDigits = document.getElementById('hud-timer');
    if (phaseLabel) {
      phaseLabel.textContent = this.phase === 'hide' ? '🙈 躲藏準備期' : '🩴 追捕倒數';
    }
    if (timerDigits) {
      timerDigits.textContent = `${mm}:${ss}`;
    }

    // Update alive counts
    let chamCount = this.myAvatar.role === 'chameleon' ? 1 : 0;
    let huntCount = this.myAvatar.role === 'hunter' ? 1 : 0;
    for (const [, p] of this.otherPlayers.entries()) {
      if (p.role === 'chameleon') chamCount++;
      else huntCount++;
    }
    const chamEl = document.getElementById('hud-cham-count');
    const huntEl = document.getElementById('hud-hunt-count');
    if (chamEl) chamEl.textContent = `🦎 剩餘: ${chamCount}`;
    if (huntEl) huntEl.textContent = `🩴 鬼: ${huntCount}`;

    // Cooldowns & Survival Points
    if (this.myAvatar.role === 'chameleon' && this.phase === 'hunt') {
      this.myScore += dt * 1.2;
      this.autoTauntTimer -= dt;
      if (this.autoTauntTimer <= 0) {
        this.autoTauntTimer = 30;
        this.triggerTaunt(false);
      }
    }

    if (this.tauntCooldown > 0) {
      this.tauntCooldown = Math.max(0, this.tauntCooldown - dt);
      const tEl = document.getElementById('taunt-cd');
      if (tEl) tEl.textContent = this.tauntCooldown > 0 ? `${Math.ceil(this.tauntCooldown)}s` : '+30分';
    }

    if (this.radarCooldown > 0) {
      this.radarCooldown = Math.max(0, this.radarCooldown - dt);
      const rEl = document.getElementById('radar-cd');
      if (rEl) rEl.textContent = this.radarCooldown > 0 ? `${Math.ceil(this.radarCooldown)}s` : '就緒';
    }

    // Hunter Attack & 4s Wrong-Hit Penalty UI
    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    }
    if (this.penaltyTimer > 0) {
      this.penaltyTimer = Math.max(0, this.penaltyTimer - dt);
    }

    const penaltyWrap = document.getElementById('hud-penalty-bar-wrap');
    const penaltyText = document.getElementById('hud-penalty-text');
    const penaltyFill = document.getElementById('hud-penalty-fill');
    const slipperBtn = document.getElementById('btn-slipper-attack');
    const slipperTitle = document.getElementById('slipper-btn-title');
    const slipperSub = document.getElementById('slipper-btn-sub');

    if (this.penaltyTimer > 0) {
      penaltyWrap?.classList.remove('hidden');
      if (penaltyText) penaltyText.textContent = `⚡ 敲錯真物件！手麻撿拖鞋硬直中 (${this.penaltyTimer.toFixed(1)}s)`;
      if (penaltyFill) penaltyFill.style.width = `${(this.penaltyTimer / 4.0) * 100}%`;
      slipperBtn?.classList.add('cooldown');
      if (slipperTitle) slipperTitle.textContent = `手麻硬直 ${this.penaltyTimer.toFixed(1)}s`;
      if (slipperSub) slipperSub.textContent = '打到真物件罰站中...';
    } else {
      penaltyWrap?.classList.add('hidden');
      if (this.attackCooldown > 0) {
        slipperBtn?.classList.add('cooldown');
        if (slipperTitle) slipperTitle.textContent = `收手冷卻 ${this.attackCooldown.toFixed(1)}s`;
        if (slipperSub) slipperSub.textContent = '準備下一次揮擊';
      } else {
        slipperBtn?.classList.remove('cooldown');
        if (slipperTitle) slipperTitle.textContent = '藍白拖敲打！';
        if (slipperSub) slipperSub.textContent = '敲錯真物罰站 4 秒';
      }
    }
  }

  updateLocalPlayer(dt) {
    // Combine Joystick + Keyboard input
    let ix = this.joyVec.x;
    let iy = this.joyVec.y;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) ix -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) ix += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) iy -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) iy += 1;

    const mag = Math.hypot(ix, iy);
    const hasMoveInput = mag > 0.08 && !this.isPositionLocked;

    if (this.bobaSpeedTimer > 0) {
      this.bobaSpeedTimer = Math.max(0, this.bobaSpeedTimer - dt);
    }

    let speed = this.myAvatar.role === 'hunter' ? 6.8 : 6.0;
    if (this.bobaSpeedTimer > 0) speed *= 1.45;
    if (this.penaltyTimer > 0) speed *= 0.42; // Slowed down when hand is numb from hitting wrong prop!

    if (hasMoveInput) {
      const moveAngle = Math.atan2(ix, iy) + this.camYaw;
      const step = Math.min(1, mag) * speed * dt;
      this.myPos.x += Math.sin(moveAngle) * step;
      this.myPos.z += Math.cos(moveAngle) * step;
      this.myRotY = moveAngle;
    }

    // Keep Hunter inside Metro Exit 4 Gate during 90s Hide Phase
    if (this.myAvatar.role === 'hunter' && this.phase === 'hide') {
      this.myPos.x = Math.max(-3.2, Math.min(3.2, this.myPos.x));
      this.myPos.z = Math.max(25.8, Math.min(30.2, this.myPos.z));
    } else {
      this.myPos.x = Math.max(-35, Math.min(35, this.myPos.x));
      this.myPos.z = Math.max(-27, Math.min(30, this.myPos.z));
    }

    // Vertical Gravity & Jump
    if (!this.isGrounded) {
      this.myPos.y += this.myVelY * dt;
      this.myVelY -= 19.5 * dt;
      if (this.myPos.y <= 0) {
        this.myPos.y = 0;
        this.myVelY = 0;
        this.isGrounded = true;
      }
    }

    this.myAvatar.root.position.copy(this.myPos);
    this.myAvatar.root.rotation.y = this.myRotY;
    this.myAvatar.update(dt, hasMoveInput);

    // Update 3rd-Person Orbit Camera
    const camX = this.myPos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const camY = this.myPos.y + 1.4 + Math.sin(this.camPitch) * this.camDist;
    const camZ = this.myPos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    this.camera.position.set(camX, Math.max(0.6, camY), camZ);
    this.camera.lookAt(this.myPos.x, this.myPos.y + 1.15, this.myPos.z);

    // Broadcast state at ~15Hz
    this.netSyncAccum = (this.netSyncAccum || 0) + dt;
    if (this.netSyncAccum >= 0.066) {
      this.netSyncAccum = 0;
      this.net.sendState({
        name: this.myAvatar.name,
        x: Number(this.myPos.x.toFixed(2)),
        y: Number(this.myPos.y.toFixed(2)),
        z: Number(this.myPos.z.toFixed(2)),
        rotY: Number(this.myRotY.toFixed(2)),
        role: this.myAvatar.role,
        score: Math.round(this.myScore),
        appearance: this.myAvatar.serializeAppearance()
      });
    }
  }

  updateRemotePlayers(dt) {
    for (const [, p] of this.otherPlayers.entries()) {
      if (p.isBot) continue;
      p.avatar.root.position.lerp(new THREE.Vector3(p.x, p.y, p.z), Math.min(1, dt * 12));
      p.avatar.root.rotation.y = p.rotY;
      p.avatar.update(dt, false);
      if (p.avatar.nameSprite) {
        p.avatar.nameSprite.visible = !(this.myAvatar.role === 'hunter' && p.role === 'chameleon');
      }
    }
  }

  updateSmokeEffects(dt) {
    for (let i = this.smokeClouds.length - 1; i >= 0; i--) {
      const s = this.smokeClouds[i];
      s.timer -= dt;
      if (s.isBurst) {
        s.mesh.scale.addScalar(dt * 3.5);
      }
      if (s.timer <= 0) {
        this.scene.remove(s.mesh);
        this.smokeClouds.splice(i, 1);
      }
    }
  }

  // ==================== UI HELPERS ====================
  switchScreen(screenName) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`)?.classList.add('active');
    this.screenState = screenName === 'hud' ? 'playing' : screenName;
  }

  showToast(text, isError = false) {
    const el = document.getElementById('global-toast');
    if (!el) return;
    el.textContent = text;
    el.style.background = isError
      ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
      : 'linear-gradient(135deg, #059669, #10b981)';
    el.classList.remove('hidden');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  showCenterBanner(text, duration = 3000) {
    const el = document.getElementById('center-banner');
    if (!el) return;
    el.innerText = text;
    el.classList.remove('hidden');
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => el.classList.add('hidden'), duration);
  }

  addEventFeed(text) {
    const feed = document.getElementById('event-feed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = text;
    feed.appendChild(item);
    setTimeout(() => {
      item.remove();
    }, 4500);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameApp = new TaiwanChameleonGame();
});

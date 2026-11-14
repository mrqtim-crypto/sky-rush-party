import * as THREE from 'three';

export const CUSTOM_CATALOG = {
  genders: [
    { id: 'boy', label: '👦 Q萌小男生' },
    { id: 'girl', label: '👧 Q萌小女生' }
  ],
  skinColors: [
    '#ffe4d0', '#f7cbb0', '#e3a882', '#c2835c', '#ffdce8'
  ],
  hairStyles: [
    { id: 'bob', label: '🍄 呆毛妹妹頭' },
    { id: 'twintails', label: '🎀 Q彈雙馬尾' },
    { id: 'spiky', label: '⚡ 元氣刺蝟頭' },
    { id: 'bun', label: '🍡 軟萌雙丸子' },
    { id: 'pharaoh_hat', label: '👑 小法老頭巾' },
    { id: 'cat_ears', label: '🐱 埃及貓耳髮' }
  ],
  hairColors: [
    '#3b2820', '#ffd13b', '#ff5c8a', '#4cc9f0',
    '#ff7b29', '#9b5de5', '#52b788', '#f8f9fa'
  ],
  eyeStyles: [
    { id: 'starry', label: '✨ 閃亮水汪眼' },
    { id: 'cute', label: '🍒 圓滾豆豆眼' },
    { id: 'happy', label: '😊 笑瞇瞇彎眼' },
    { id: 'cool', label: '😎 自信小酷眼' },
    { id: 'fire', label: '🔥 探險鬥志眼' }
  ],
  eyeColors: [
    '#2b2d42', '#0096c7', '#e63946', '#d97706', '#7209b7', '#2a9d8f'
  ],
  outfits: [
    { id: 'explorer', label: '🧭 尋寶探險服' },
    { id: 'pharaoh', label: '🏺 黃金小法老' },
    { id: 'bastet', label: '🐾 貓神連身裝' },
    { id: 'hoodie', label: '🧥 可愛連帽衫' },
    { id: 'dino', label: '🦖 呆萌小恐龍' }
  ],
  outfitColors: [
    '#f4a261', '#ffd166', '#4cc9f0', '#ff6b8b',
    '#52b788', '#9b5de5', '#ffffff', '#3d405b'
  ],
  backItems: [
    { id: 'backpack', label: '🎒 探險小背包' },
    { id: 'wings', label: '🪽 荷魯斯小翼' },
    { id: 'ankh', label: '☥ 守護生命符' },
    { id: 'none', label: '🚫 無背飾' }
  ],
  trails: [
    { id: 'gold', label: '✨ 黃金星砂', color: '#ffd166' },
    { id: 'sand', label: '🌪️ 沙漠旋風', color: '#f4a261' },
    { id: 'turquoise', label: '💎 聖甲蟲藍光', color: '#4cc9f0' }
  ]
};

export function getRandomAppearance() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return {
    gender: pick(CUSTOM_CATALOG.genders).id,
    skinColor: pick(CUSTOM_CATALOG.skinColors),
    hairStyle: pick(CUSTOM_CATALOG.hairStyles).id,
    hairColor: pick(CUSTOM_CATALOG.hairColors),
    eyeStyle: pick(CUSTOM_CATALOG.eyeStyles).id,
    eyeColor: pick(CUSTOM_CATALOG.eyeColors),
    outfit: pick(CUSTOM_CATALOG.outfits).id,
    outfitColor: pick(CUSTOM_CATALOG.outfitColors),
    backItem: pick(CUSTOM_CATALOG.backItems).id,
    trail: pick(CUSTOM_CATALOG.trails).id
  };
}

export class Character3D {
  constructor(appearance = {}, name = 'Player', isLocal = false) {
    this.appearance = {
      gender: 'girl',
      skinColor: '#ffe4d0',
      hairStyle: 'bob',
      hairColor: '#3b2820',
      eyeStyle: 'starry',
      eyeColor: '#2b2d42',
      outfit: 'explorer',
      outfitColor: '#f4a261',
      backItem: 'backpack',
      trail: 'gold',
      ...appearance
    };
    this.name = name;
    this.isLocal = isLocal;

    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    this.headGroup = null;
    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;
    this.hairDynamicParts = [];
    this.backDynamicParts = [];

    // Face canvas for cute Chibi expressions
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.currentExpression = 'normal';
    this.blinkTimer = Math.random() * 3;

    this.squash = 1.0;
    this.crouchAmount = 0; // 0 = standing, 1 = crouching

    this.buildModel();
    this.updateNameTag(this.name);
  }

  setAppearance(newApp) {
    this.appearance = { ...this.appearance, ...newApp };
    this.buildModel();
  }

  drawFace(expression = 'normal') {
    const ctx = this.faceCtx;
    const { skinColor, eyeStyle, eyeColor, gender } = this.appearance;

    ctx.clearRect(0, 0, 256, 256);

    // Base skin
    ctx.fillStyle = skinColor;
    ctx.fillRect(0, 0, 256, 256);

    // Big soft pink chibi blush cheeks
    ctx.fillStyle = 'rgba(255, 115, 145, 0.5)';
    ctx.beginPath();
    ctx.ellipse(58, 158, 25, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(198, 158, 25, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute eyebrows
    ctx.strokeStyle = '#3a2218';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    if (expression === 'stun') {
      ctx.beginPath();
      ctx.moveTo(58, 90); ctx.lineTo(92, 80);
      ctx.moveTo(198, 90); ctx.lineTo(164, 80);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(76, 92, 16, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(180, 92, 16, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    const drawEye = (cx, cy, isLeft) => {
      if (expression === 'blink' || eyeStyle === 'happy' || expression === 'crouch') {
        ctx.strokeStyle = '#241623';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy + 4, 18, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        return;
      }

      if (expression === 'stun') {
        // > < dizzy eyes
        ctx.strokeStyle = '#241623';
        ctx.lineWidth = 9;
        ctx.beginPath();
        if (isLeft) {
          ctx.moveTo(cx - 14, cy - 12);
          ctx.lineTo(cx + 12, cy);
          ctx.lineTo(cx - 14, cy + 12);
        } else {
          ctx.moveTo(cx + 14, cy - 12);
          ctx.lineTo(cx - 12, cy);
          ctx.lineTo(cx + 14, cy + 12);
        }
        ctx.stroke();
        return;
      }

      if (eyeStyle === 'cute') {
        // Super cute round bean eyes with big shine
        ctx.fillStyle = '#1f1624';
        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 6, cy - 6, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 6, cy + 6, 3.5, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // Big anime/chibi eyes
      const ry = eyeStyle === 'cool' ? 17 : 25;
      ctx.fillStyle = '#1b1521';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 22, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 17, ry - 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#120d17';
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 9.5, 0, Math.PI * 2);
      ctx.fill();

      // Big sparkles
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 7, cy - 7, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 6, cy + 6, 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (gender === 'girl') {
        ctx.strokeStyle = '#1b1521';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx + (isLeft ? -18 : 18), cy - 10);
        ctx.lineTo(cx + (isLeft ? -26 : 26), cy - 17);
        ctx.stroke();
      }
    };

    drawEye(76, 126, true);
    drawEye(180, 126, false);

    // Cute cat/chibi mouth (w shape or small happy mouth)
    ctx.strokeStyle = '#5e2a24';
    ctx.fillStyle = '#ff6b81';
    ctx.lineWidth = 5.5;
    if (expression === 'stun') {
      ctx.beginPath();
      ctx.arc(128, 174, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Cute "ω" smile
      ctx.beginPath();
      ctx.arc(118, 166, 10, 0.1 * Math.PI, 0.95 * Math.PI);
      ctx.arc(138, 166, 10, 0.05 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    this.faceTexture.needsUpdate = true;
  }

  buildModel() {
    while (this.bodyGroup.children.length > 0) {
      this.bodyGroup.remove(this.bodyGroup.children[0]);
    }
    this.hairDynamicParts = [];
    this.backDynamicParts = [];

    const { gender, skinColor, hairStyle, hairColor, outfit, outfitColor, backItem } = this.appearance;
    this.drawFace('normal');

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55, metalness: 0.02 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.45, metalness: 0.05 });
    const outfitMat = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.45, metalness: 0.1 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.25, metalness: 0.55 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: '#fff8eb', roughness: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#3b2d26', roughness: 0.6 });

    // 1. BIG CUTE CHIBI HEAD (2-head ratio: larger, rounder head)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.24, 0);
    this.bodyGroup.add(this.headGroup);

    const headGeo = new THREE.SphereGeometry(0.52, 24, 24);
    const headMesh = new THREE.Mesh(
      headGeo,
      new THREE.MeshStandardMaterial({ map: this.faceTexture, roughness: 0.5 })
    );
    headMesh.scale.set(1.06, 0.98, 1.02); // Slightly wide chubby cheeks
    headMesh.rotation.y = -Math.PI / 2;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Chubby round ears
    const earGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const leftEar = new THREE.Mesh(earGeo, skinMat);
    leftEar.position.set(-0.52, -0.04, 0);
    const rightEar = new THREE.Mesh(earGeo, skinMat);
    rightEar.position.set(0.52, -0.04, 0);
    this.headGroup.add(leftEar, rightEar);

    // 2. CUTE HAIR & HEADWEAR
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.545, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCap.position.y = 0.02;
    hairCap.scale.set(1.06, 1.0, 1.03);
    hairCap.rotation.x = -0.15;
    this.headGroup.add(hairCap);

    // Cute Ahoge (top sprout hair)
    const ahoge = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8), hairMat);
    ahoge.position.set(0.05, 0.62, 0.05);
    ahoge.rotation.z = -0.35;
    this.headGroup.add(ahoge);
    this.hairDynamicParts.push(ahoge);

    // Front bangs
    const bangGeo = new THREE.CapsuleGeometry(0.09, 0.16, 6, 8);
    for (let i = -1.5; i <= 1.5; i += 1) {
      const bang = new THREE.Mesh(bangGeo, hairMat);
      bang.position.set(i * 0.13, 0.26, 0.48);
      bang.rotation.z = i * -0.1;
      this.headGroup.add(bang);
    }

    if (hairStyle === 'twintails') {
      [-1, 1].forEach((dir) => {
        const pivot = new THREE.Group();
        pivot.position.set(dir * 0.5, 0.14, -0.1);
        const ribbon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), goldMat);
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), hairMat);
        tail.scale.set(0.85, 1.35, 0.85);
        tail.position.set(dir * 0.15, -0.22, -0.05);
        pivot.add(ribbon, tail);
        this.headGroup.add(pivot);
        this.hairDynamicParts.push(pivot);
      });
    } else if (hairStyle === 'bun') {
      [-1, 1].forEach((dir) => {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), hairMat);
        bun.position.set(dir * 0.42, 0.46, -0.06);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 16), goldMat);
        ring.position.copy(bun.position);
        ring.rotation.x = Math.PI / 2;
        this.headGroup.add(bun, ring);
      });
    } else if (hairStyle === 'spiky') {
      const spikeGeo = new THREE.ConeGeometry(0.18, 0.4, 8);
      [[-0.3, 0.5, 0.5], [0, 0.58, 0], [0.3, 0.5, -0.5]].forEach(([x, y, rz]) => {
        const s = new THREE.Mesh(spikeGeo, hairMat);
        s.position.set(x, y, 0);
        s.rotation.z = rz;
        this.headGroup.add(s);
      });
    } else if (hairStyle === 'pharaoh_hat') {
      // Nemes Pharaoh Headdress
      const nemes = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.68, 0.62, 16), goldMat);
      nemes.position.set(0, 0.12, -0.14);
      const cobra = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), outfitMat);
      cobra.position.set(0, 0.44, 0.52);
      this.headGroup.add(nemes, cobra);
    } else if (hairStyle === 'cat_ears') {
      // Cute Egyptian Bastet Cat Ears with gold rings
      const earCone = new THREE.ConeGeometry(0.18, 0.36, 12);
      [-1, 1].forEach((dir) => {
        const cEar = new THREE.Mesh(earCone, hairMat);
        cEar.position.set(dir * 0.34, 0.54, 0.05);
        cEar.rotation.z = dir * -0.25;
        this.headGroup.add(cEar);
      });
    }

    // 3. CHUBBY CUTE TORSO & OUTFITS
    const bodyGeo = new THREE.CapsuleGeometry(0.32, 0.24, 12, 16);
    const bodyMesh = new THREE.Mesh(bodyGeo, outfitMat);
    bodyMesh.position.set(0, 0.58, 0);
    bodyMesh.castShadow = true;
    this.bodyGroup.add(bodyMesh);

    if (outfit === 'explorer') {
      // Cute Explorer pith belt & scarf
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.075, 10, 18), new THREE.MeshStandardMaterial({ color: '#e63946' }));
      scarf.position.set(0, 0.82, 0);
      scarf.rotation.x = Math.PI / 2;
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 16), darkMat);
      belt.position.set(0, 0.48, 0);
      this.bodyGroup.add(scarf, belt);
    } else if (outfit === 'pharaoh') {
      // Golden collar & white royal kilt
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.12, 16), goldMat);
      collar.position.set(0, 0.8, 0);
      const kilt = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 16), whiteMat);
      kilt.position.set(0, 0.42, 0);
      this.bodyGroup.add(collar, kilt);
    } else if (outfit === 'bastet') {
      // Cute cat bell collar & cat tail
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 8, 16), goldMat);
      collar.position.set(0, 0.82, 0);
      collar.rotation.x = Math.PI / 2;
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), goldMat);
      bell.position.set(0, 0.78, 0.32);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 8, 10), outfitMat);
      tail.position.set(0, 0.45, -0.38);
      tail.rotation.x = -0.8;
      this.bodyGroup.add(collar, bell, tail);
    } else if (outfit === 'dino') {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.48, 10), outfitMat);
      tail.position.set(0, 0.44, -0.38);
      tail.rotation.x = -Math.PI * 0.6;
      this.bodyGroup.add(tail);
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 8), goldMat);
        sp.position.set(0, 0.78 - i * 0.15, -0.32);
        sp.rotation.x = -Math.PI / 2;
        this.bodyGroup.add(sp);
      }
    }

    // 4. STUBBY CUTE HANDS & FEET
    const handGeo = new THREE.SphereGeometry(0.13, 12, 12);
    this.leftArm = new THREE.Mesh(handGeo, skinMat);
    this.leftArm.scale.set(0.9, 1.35, 0.9);
    this.leftArm.position.set(-0.4, 0.62, 0);
    this.rightArm = new THREE.Mesh(handGeo, skinMat);
    this.rightArm.scale.set(0.9, 1.35, 0.9);
    this.rightArm.position.set(0.4, 0.62, 0);
    this.bodyGroup.add(this.leftArm, this.rightArm);

    const footGeo = new THREE.SphereGeometry(0.14, 12, 12);
    this.leftLeg = new THREE.Mesh(footGeo, darkMat);
    this.leftLeg.scale.set(0.95, 0.85, 1.25);
    this.leftLeg.position.set(-0.16, 0.14, 0.04);
    this.rightLeg = new THREE.Mesh(footGeo, darkMat);
    this.rightLeg.scale.set(0.95, 0.85, 1.25);
    this.rightLeg.position.set(0.16, 0.14, 0.04);
    this.bodyGroup.add(this.leftLeg, this.rightLeg);

    // 5. BACK ITEMS
    if (backItem === 'backpack') {
      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.42, 0.24),
        new THREE.MeshStandardMaterial({ color: '#bc6c25', roughness: 0.6 })
      );
      pack.position.set(0, 0.62, -0.32);
      const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.48, 10), goldMat);
      scroll.rotation.z = Math.PI / 2;
      scroll.position.set(0, 0.86, -0.32);
      this.bodyGroup.add(pack, scroll);
    } else if (backItem === 'wings') {
      [-1, 1].forEach((dir) => {
        const wingPivot = new THREE.Group();
        wingPivot.position.set(dir * 0.14, 0.72, -0.28);
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.05), goldMat);
        w.position.set(dir * 0.2, 0.06, 0);
        w.rotation.z = dir * 0.3;
        wingPivot.add(w);
        this.bodyGroup.add(wingPivot);
        this.backDynamicParts.push(wingPivot);
      });
    } else if (backItem === 'ankh') {
      const ankhGroup = new THREE.Group();
      ankhGroup.position.set(0, 0.7, -0.36);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), goldMat);
      loop.position.y = 0.15;
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.05), goldMat);
      barV.position.y = -0.08;
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05), goldMat);
      barH.position.y = 0.02;
      ankhGroup.add(loop, barV, barH);
      this.bodyGroup.add(ankhGroup);
      this.backDynamicParts.push(ankhGroup);
    }
  }

  updateNameTag(name) {
    this.name = name;
    if (this.nameSprite) {
      this.root.remove(this.nameSprite);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = this.isLocal ? 'rgba(255, 209, 102, 0.92)' : 'rgba(35, 24, 16, 0.78)';
    ctx.beginPath();
    ctx.roundRect(22, 12, 212, 40, 20);
    ctx.fill();

    ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = this.isLocal ? '#2b1808' : '#fff8eb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.name, 128, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    this.nameSprite = new THREE.Sprite(mat);
    this.nameSprite.position.set(0, 2.15, 0);
    this.nameSprite.scale.set(1.4, 0.35, 1);
    this.root.add(this.nameSprite);
  }

  animate(dt, time, state = {}) {
    const { speed = 10, isGrounded = true, isStunned = false, isCrouching = false } = state;

    // Expression & Blink
    let targetExp = 'normal';
    if (isStunned) targetExp = 'stun';
    else if (isCrouching) targetExp = 'crouch';
    else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        targetExp = 'blink';
        if (this.blinkTimer <= -0.14) {
          this.blinkTimer = 2.4 + Math.random() * 2.5;
        }
      }
    }
    if (targetExp !== this.currentExpression) {
      this.currentExpression = targetExp;
      this.drawFace(targetExp);
    }

    // Smooth Crouch & Squash interpolation
    const targetCrouch = isCrouching ? 1.0 : 0.0;
    this.crouchAmount += (targetCrouch - this.crouchAmount) * Math.min(1, dt * 16);
    this.squash += (1.0 - this.squash) * Math.min(1, dt * 10);

    const crouchScaleY = 1.0 - this.crouchAmount * 0.46; // Squashes down to 54% height when crouching!
    const crouchScaleXZ = 1.0 + this.crouchAmount * 0.22;
    const effY = this.squash * crouchScaleY;
    const effXZ = (1 / Math.sqrt(Math.max(0.4, this.squash))) * crouchScaleXZ;
    this.bodyGroup.scale.set(effXZ, effY, effXZ);

    // Cute Chibi waddle / run / crouch pose
    const runCycle = time * Math.max(8, speed * 1.3);
    if (isCrouching) {
      // Cute ducking pose: head tucks forward, hands cover head!
      this.headGroup.rotation.x = 0.35;
      this.leftArm.position.set(-0.34, 1.05, 0.22);
      this.rightArm.position.set(0.34, 1.05, 0.22);
      this.leftLeg.position.z = Math.sin(runCycle * 1.3) * 0.14;
      this.rightLeg.position.z = -Math.sin(runCycle * 1.3) * 0.14;
      this.bodyGroup.position.y = 0;
    } else if (isGrounded) {
      this.headGroup.rotation.x = 0;
      const swing = Math.sin(runCycle) * 0.22;
      this.leftLeg.position.z = swing;
      this.rightLeg.position.z = -swing;
      this.leftArm.position.set(-0.4, 0.62, -swing);
      this.rightArm.position.set(0.4, 0.62, swing);
      this.bodyGroup.position.y = Math.abs(Math.sin(runCycle)) * 0.09;
      this.bodyGroup.rotation.z = Math.cos(runCycle) * 0.05; // Cute chibi waddle!
    } else {
      // Jumping pose
      this.headGroup.rotation.x = -0.15;
      this.leftArm.position.set(-0.42, 0.88, 0);
      this.rightArm.position.set(0.42, 0.88, 0);
      this.leftLeg.position.z = -0.1;
      this.rightLeg.position.z = 0.12;
      this.bodyGroup.position.y = 0;
      this.bodyGroup.rotation.z = 0;
    }

    // Hair bounce
    this.hairDynamicParts.forEach((part, idx) => {
      part.rotation.z = Math.sin(runCycle + idx) * 0.18;
    });
  }
}

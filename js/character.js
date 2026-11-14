import * as THREE from 'three';

export const CUSTOM_CATALOG = {
  genders: [
    { id: 'boy', label: '👦 元氣少年' },
    { id: 'girl', label: '👧 俏皮少女' }
  ],
  skinColors: [
    '#ffe0c8', '#f5c6a5', '#e0a37c', '#b87a56', '#ffd6e7'
  ],
  hairStyles: [
    { id: 'spiky', label: '⚡ 刺蝟潮髮' },
    { id: 'twintails', label: '🎀 活力雙馬尾' },
    { id: 'bob', label: '🍄 齊瀏海短髮' },
    { id: 'bun', label: '🍡 可愛雙丸子' },
    { id: 'long', label: '🌊 飄逸長髮' },
    { id: 'afro', label: '🔥 派對蓬蓬頭' }
  ],
  hairColors: [
    '#ff4785', '#00e5ff', '#ffd000', '#38ff9c',
    '#9d4edd', '#ff6d00', '#f8f9fa', '#212529'
  ],
  eyeStyles: [
    { id: 'starry', label: '✨ 星光大眼' },
    { id: 'cute', label: '💧 元氣圓眼' },
    { id: 'cool', label: '😎 酷帥半睜' },
    { id: 'happy', label: '😊 笑彎彎眼' },
    { id: 'fire', label: '🔥 熱血鬥志' }
  ],
  eyeColors: [
    '#00b4d8', '#ff2a85', '#ffd100', '#52b788', '#9b5de5', '#ff5400'
  ],
  outfits: [
    { id: 'hoodie', label: '🧥 街頭連帽衫' },
    { id: 'uniform', label: '🎓 學院百褶裝' },
    { id: 'cyber', label: '🤖 未來機甲服' },
    { id: 'dino', label: '🦖 恐龍玩偶裝' },
    { id: 'royal', label: '👑 皇家披風裝' }
  ],
  outfitColors: [
    '#00d2ff', '#ff3e8a', '#ffbe0b', '#39ff88',
    '#8338ec', '#fb5607', '#ffffff', '#2b2d42'
  ],
  backItems: [
    { id: 'wings', label: '🪽 天使羽翼' },
    { id: 'jetpack', label: '🚀 噴氣背包' },
    { id: 'halo', label: '💫 星光光環' },
    { id: 'none', label: '🚫 無背飾' }
  ],
  trails: [
    { id: 'rainbow', label: '🌈 彩虹流光', color: '#00f0ff' },
    { id: 'sakura', label: '🌸 櫻花粉焰', color: '#ff5ca8' },
    { id: 'gold', label: '⭐ 金色星塵', color: '#ffd000' }
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
      skinColor: '#ffe0c8',
      hairStyle: 'twintails',
      hairColor: '#ff4785',
      eyeStyle: 'starry',
      eyeColor: '#00b4d8',
      outfit: 'hoodie',
      outfitColor: '#00d2ff',
      backItem: 'wings',
      trail: 'rainbow',
      ...appearance
    };
    this.name = name;
    this.isLocal = isLocal;

    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    // Dynamic parts for animation
    this.headGroup = null;
    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;
    this.hairDynamicParts = [];
    this.backDynamicParts = [];
    this.shieldMesh = null;

    // Face canvas for dynamic expressions
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.currentExpression = 'normal'; // 'normal' | 'blink' | 'stun' | 'boost'
    this.blinkTimer = Math.random() * 3;

    // Squash & stretch state
    this.squash = 1.0;

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

    // Cute rosy cheeks
    ctx.fillStyle = 'rgba(255, 105, 145, 0.42)';
    ctx.beginPath();
    ctx.ellipse(62, 156, 22, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(194, 156, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyebrows
    ctx.strokeStyle = '#3a2318';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    if (expression === 'stun') {
      // Worried brows
      ctx.beginPath();
      ctx.moveTo(58, 92); ctx.lineTo(94, 82);
      ctx.moveTo(198, 92); ctx.lineTo(162, 82);
      ctx.stroke();
    } else if (eyeStyle === 'fire' || eyeStyle === 'cool') {
      // Determined brows
      ctx.beginPath();
      ctx.moveTo(56, 82); ctx.lineTo(98, 94);
      ctx.moveTo(200, 82); ctx.lineTo(158, 94);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(78, 94, 18, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(178, 94, 18, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    // Eyes
    const drawEye = (cx, cy, isLeft) => {
      if (expression === 'blink' || eyeStyle === 'happy') {
        ctx.strokeStyle = '#241623';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(cx, cy + 4, 18, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        return;
      }

      if (expression === 'stun') {
        // > < eyes when bumped/stunned
        ctx.strokeStyle = '#241623';
        ctx.lineWidth = 8;
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

      // Sclera / Eye outline
      ctx.fillStyle = '#1b1926';
      ctx.beginPath();
      const ry = eyeStyle === 'cool' ? 16 : 24;
      ctx.ellipse(cx, cy, 21, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Iris
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 16, ry - 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupil
      ctx.fillStyle = '#10121a';
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 9, 0, Math.PI * 2);
      ctx.fill();

      // Highlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 6, cy - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 6, cy + 6, 3, 0, Math.PI * 2);
      ctx.fill();

      if (eyeStyle === 'starry' || expression === 'boost') {
        // Star sparkle in eye
        ctx.fillStyle = '#fff59d';
        ctx.beginPath();
        ctx.arc(cx, cy - 1, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyelashes for girl
      if (gender === 'girl') {
        ctx.strokeStyle = '#1b1926';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx + (isLeft ? -18 : 18), cy - 10);
        ctx.lineTo(cx + (isLeft ? -26 : 26), cy - 18);
        ctx.stroke();
      }
    };

    drawEye(78, 126, true);
    drawEye(178, 126, false);

    // Mouth
    ctx.strokeStyle = '#6b2d26';
    ctx.fillStyle = '#ff5c77';
    ctx.lineWidth = 5;
    if (expression === 'stun') {
      ctx.beginPath();
      ctx.arc(128, 174, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (expression === 'boost') {
      ctx.beginPath();
      ctx.arc(128, 166, 16, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(128, 166, 12, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    this.faceTexture.needsUpdate = true;
  }

  buildModel() {
    // Clear existing bodyGroup children
    while (this.bodyGroup.children.length > 0) {
      this.bodyGroup.remove(this.bodyGroup.children[0]);
    }
    this.hairDynamicParts = [];
    this.backDynamicParts = [];

    const { gender, skinColor, hairStyle, hairColor, outfit, outfitColor, backItem } = this.appearance;
    this.drawFace('normal');

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.45, metalness: 0.05 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.35, metalness: 0.1 });
    const outfitMat = new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.35, metalness: 0.15 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#222638', roughness: 0.5 });

    // 1. HEAD GROUP (Chibi proportion: big expressive head)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.38, 0);
    this.bodyGroup.add(this.headGroup);

    // Head Sphere with Face Texture mapped to front
    const headGeo = new THREE.SphereGeometry(0.46, 24, 24);
    // Rotate UVs/sphere so face canvas centers on +Z
    const headMaterials = new THREE.MeshStandardMaterial({
      map: this.faceTexture,
      roughness: 0.4
    });
    const headMesh = new THREE.Mesh(headGeo, headMaterials);
    headMesh.rotation.y = -Math.PI / 2;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Ears
    const earGeo = new THREE.SphereGeometry(0.1, 12, 12);
    const leftEar = new THREE.Mesh(earGeo, skinMat);
    leftEar.position.set(-0.44, -0.02, 0);
    const rightEar = new THREE.Mesh(earGeo, skinMat);
    rightEar.position.set(0.44, -0.02, 0);
    this.headGroup.add(leftEar, rightEar);

    // 2. HAIR STYLES
    const hairCapGeo = new THREE.SphereGeometry(0.485, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.y = 0.02;
    hairCap.rotation.x = -0.18;
    this.headGroup.add(hairCap);

    // Front bangs
    const bangGeo = new THREE.ConeGeometry(0.16, 0.32, 8);
    for (let i = -1; i <= 1; i++) {
      const bang = new THREE.Mesh(bangGeo, hairMat);
      bang.position.set(i * 0.16, 0.25, 0.41);
      bang.rotation.x = Math.PI * 0.88;
      bang.rotation.z = i * -0.18;
      this.headGroup.add(bang);
    }

    if (hairStyle === 'spiky') {
      const spikeGeo = new THREE.ConeGeometry(0.18, 0.46, 8);
      const positions = [
        [0, 0.56, 0, 0, 0],
        [-0.28, 0.46, -0.05, 0, 0.55],
        [0.28, 0.46, -0.05, 0, -0.55],
        [0, 0.42, -0.35, -0.6, 0],
        [-0.22, 0.48, 0.2, 0.4, 0.4],
        [0.22, 0.48, 0.2, 0.4, -0.4]
      ];
      positions.forEach(([x, y, z, rx, rz]) => {
        const s = new THREE.Mesh(spikeGeo, hairMat);
        s.position.set(x, y, z);
        s.rotation.set(rx, 0, rz);
        this.headGroup.add(s);
      });
    } else if (hairStyle === 'twintails') {
      [-1, 1].forEach((dir) => {
        const tailPivot = new THREE.Group();
        tailPivot.position.set(dir * 0.44, 0.16, -0.12);
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 8, 12), whiteMat);
        tailPivot.add(tie);

        const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.68, 12), hairMat);
        tailMesh.position.set(dir * 0.16, -0.24, -0.08);
        tailMesh.rotation.z = dir * 0.5;
        tailMesh.rotation.x = 0.25;
        tailPivot.add(tailMesh);
        this.headGroup.add(tailPivot);
        this.hairDynamicParts.push(tailPivot);
      });
    } else if (hairStyle === 'bun') {
      [-1, 1].forEach((dir) => {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), hairMat);
        bun.position.set(dir * 0.36, 0.42, -0.08);
        this.headGroup.add(bun);
        this.hairDynamicParts.push(bun);
      });
    } else if (hairStyle === 'bob') {
      const sideGeo = new THREE.CapsuleGeometry(0.14, 0.32, 8, 12);
      [-1, 1].forEach((dir) => {
        const side = new THREE.Mesh(sideGeo, hairMat);
        side.position.set(dir * 0.4, -0.06, 0.06);
        side.rotation.z = dir * -0.12;
        this.headGroup.add(side);
      });
    } else if (hairStyle === 'long') {
      const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.75, 0.24), hairMat);
      backHair.position.set(0, -0.22, -0.36);
      backHair.rotation.x = 0.18;
      this.headGroup.add(backHair);
      this.hairDynamicParts.push(backHair);
    } else if (hairStyle === 'afro') {
      const afro = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 20), hairMat);
      afro.position.set(0, 0.18, -0.06);
      this.headGroup.add(afro);
    }

    // 3. TORSO & OUTFITS
    const torsoRadiusTop = gender === 'girl' ? 0.24 : 0.28;
    const torsoRadiusBottom = gender === 'girl' ? 0.34 : 0.31;
    const torsoGeo = new THREE.CylinderGeometry(torsoRadiusTop, torsoRadiusBottom, 0.62, 16);
    const torsoMesh = new THREE.Mesh(torsoGeo, outfitMat);
    torsoMesh.position.set(0, 0.72, 0);
    torsoMesh.castShadow = true;
    this.bodyGroup.add(torsoMesh);

    if (outfit === 'hoodie') {
      // Hoodie pocket & white drawstring stripes
      const hoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 10, 18), outfitMat);
      hoodRing.position.set(0, 0.98, -0.04);
      hoodRing.rotation.x = Math.PI / 2;
      this.bodyGroup.add(hoodRing);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.06), whiteMat);
      stripe.position.set(0, 0.72, 0.28);
      this.bodyGroup.add(stripe);
    } else if (outfit === 'uniform') {
      // Sailor collar + pleated skirt/shorts
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.14, 16), whiteMat);
      collar.position.set(0, 0.95, 0);
      this.bodyGroup.add(collar);

      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.32, 16), darkMat);
      skirt.position.set(0, 0.45, 0);
      this.bodyGroup.add(skirt);
    } else if (outfit === 'cyber') {
      // Glowing shoulder pads & chest core
      const neonMat = new THREE.MeshStandardMaterial({
        color: '#00f0ff',
        emissive: '#00f0ff',
        emissiveIntensity: 0.8
      });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), neonMat);
      core.position.set(0, 0.78, 0.28);
      this.bodyGroup.add(core);

      [-1, 1].forEach((dir) => {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.32), outfitMat);
        pad.position.set(dir * 0.36, 0.96, 0);
        pad.rotation.z = dir * -0.25;
        this.bodyGroup.add(pad);
      });
    } else if (outfit === 'dino') {
      // Cute Dino tail & back spikes!
      const spikeMat = new THREE.MeshStandardMaterial({ color: '#ffd000', roughness: 0.3 });
      const dinoTail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 10), outfitMat);
      dinoTail.position.set(0, 0.48, -0.42);
      dinoTail.rotation.x = -Math.PI * 0.62;
      this.bodyGroup.add(dinoTail);

      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), spikeMat);
        sp.position.set(0, 0.88 - i * 0.18, -0.32);
        sp.rotation.x = -Math.PI / 2;
        this.bodyGroup.add(sp);
      }
    } else if (outfit === 'royal') {
      // Gold trim & Royal Cape
      const goldMat = new THREE.MeshStandardMaterial({ color: '#ffd000', metalness: 0.6, roughness: 0.2 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.16, 8), goldMat);
      crown.position.set(0, 0.52, 0);
      this.headGroup.add(crown);

      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.05), new THREE.MeshStandardMaterial({ color: '#e6194b' }));
      cape.position.set(0, 0.62, -0.32);
      cape.rotation.x = 0.22;
      this.bodyGroup.add(cape);
      this.backDynamicParts.push(cape);
    }

    // 4. ARMS & LEGS
    const limbGeo = new THREE.CapsuleGeometry(0.1, 0.28, 8, 12);
    this.leftArm = new THREE.Mesh(limbGeo, skinMat);
    this.leftArm.position.set(-0.38, 0.72, 0);
    this.rightArm = new THREE.Mesh(limbGeo, skinMat);
    this.rightArm.position.set(0.38, 0.72, 0);
    this.bodyGroup.add(this.leftArm, this.rightArm);

    const shoeGeo = new THREE.CapsuleGeometry(0.115, 0.26, 8, 12);
    this.leftLeg = new THREE.Mesh(shoeGeo, darkMat);
    this.leftLeg.position.set(-0.16, 0.22, 0);
    this.rightLeg = new THREE.Mesh(shoeGeo, darkMat);
    this.rightLeg.position.set(0.16, 0.22, 0);
    this.bodyGroup.add(this.leftLeg, this.rightLeg);

    // 5. BACK ACCESSORIES
    if (backItem === 'wings') {
      const wingMat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#cceeff',
        emissiveIntensity: 0.25,
        roughness: 0.2
      });
      [-1, 1].forEach((dir) => {
        const wingPivot = new THREE.Group();
        wingPivot.position.set(dir * 0.14, 0.85, -0.28);
        const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.05), wingMat);
        w1.position.set(dir * 0.22, 0.08, 0);
        w1.rotation.z = dir * 0.35;
        const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.05), wingMat);
        w2.position.set(dir * 0.18, -0.08, 0);
        w2.rotation.z = dir * 0.15;
        wingPivot.add(w1, w2);
        this.bodyGroup.add(wingPivot);
        this.backDynamicParts.push(wingPivot);
      });
    } else if (backItem === 'jetpack') {
      const jetGroup = new THREE.Group();
      jetGroup.position.set(0, 0.78, -0.32);
      const packMat = new THREE.MeshStandardMaterial({ color: '#e0e6ed', metalness: 0.6, roughness: 0.25 });
      const flameMat = new THREE.MeshStandardMaterial({ color: '#00f0ff', emissive: '#00f0ff', emissiveIntensity: 1.0 });
      [-0.14, 0.14].forEach((ox) => {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 12), packMat);
        tank.position.x = ox;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 8), flameMat);
        flame.position.set(ox, -0.28, 0);
        flame.rotation.x = Math.PI;
        jetGroup.add(tank, flame);
        this.backDynamicParts.push(flame);
      });
      this.bodyGroup.add(jetGroup);
    } else if (backItem === 'halo') {
      const haloMat = new THREE.MeshStandardMaterial({
        color: '#ffd000',
        emissive: '#ffaa00',
        emissiveIntensity: 0.8
      });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 10, 24), haloMat);
      halo.position.set(0, 2.04, 0);
      halo.rotation.x = Math.PI / 2;
      this.bodyGroup.add(halo);
      this.backDynamicParts.push(halo);
    }

    // 6. SHIELD BUBBLE (Hidden until Shield Item active)
    const shieldGeo = new THREE.SphereGeometry(1.15, 20, 20);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: '#00f0ff',
      emissive: '#00aaff',
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.34,
      wireframe: false
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
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

    ctx.fillStyle = this.isLocal ? 'rgba(0, 240, 255, 0.85)' : 'rgba(16, 22, 44, 0.78)';
    ctx.beginPath();
    ctx.roundRect(18, 10, 220, 44, 22);
    ctx.fill();

    ctx.font = 'bold 26px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = this.isLocal ? '#061024' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.name, 128, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    this.nameSprite = new THREE.Sprite(mat);
    this.nameSprite.position.set(0, 2.38, 0);
    this.nameSprite.scale.set(1.5, 0.38, 1);
    this.root.add(this.nameSprite);
  }

  animate(dt, time, state = {}) {
    const { speed = 12, isGrounded = true, isStunned = false, isBoosting = false, shieldActive = false } = state;

    // Expression & Blinking
    let targetExp = 'normal';
    if (isStunned) targetExp = 'stun';
    else if (isBoosting) targetExp = 'boost';
    else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        targetExp = 'blink';
        if (this.blinkTimer <= -0.14) {
          this.blinkTimer = 2.2 + Math.random() * 2.5;
        }
      }
    }
    if (targetExp !== this.currentExpression) {
      this.currentExpression = targetExp;
      this.drawFace(targetExp);
    }

    // Shield visibility
    if (this.shieldMesh) {
      this.shieldMesh.visible = !!shieldActive;
      if (shieldActive) {
        this.shieldMesh.rotation.y += dt * 3;
      }
    }

    // Smooth Squash & Stretch recovery
    this.squash += (1.0 - this.squash) * Math.min(1, dt * 10);
    const invSquash = 1 / Math.sqrt(Math.max(0.35, this.squash));
    this.bodyGroup.scale.set(invSquash, this.squash, invSquash);

    // Limb & Hair Bounce
    const runCycle = time * Math.max(8, speed * 1.15);
    if (isGrounded) {
      const swing = Math.sin(runCycle) * 0.65;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.9;
      this.rightArm.rotation.x = swing * 0.9;
      this.bodyGroup.position.y = Math.abs(Math.sin(runCycle)) * 0.08;
    } else {
      // Airborne pose
      this.leftLeg.rotation.x = 0.45;
      this.rightLeg.rotation.x = -0.35;
      this.leftArm.rotation.x = -2.2;
      this.rightArm.rotation.x = -2.2;
      this.bodyGroup.position.y = 0;
    }

    // Secondary hair physics
    this.hairDynamicParts.forEach((part, idx) => {
      part.rotation.x = 0.2 + Math.sin(runCycle + idx) * 0.22;
    });

    // Back item animation (wings flap, halo bobs)
    this.backDynamicParts.forEach((part, idx) => {
      if (this.appearance.backItem === 'wings') {
        const dir = idx === 0 ? -1 : 1;
        part.rotation.y = dir * (0.25 + Math.sin(time * (isGrounded ? 10 : 22)) * 0.35);
      } else if (this.appearance.backItem === 'halo') {
        part.position.y = 2.04 + Math.sin(time * 4) * 0.06;
      }
    });
  }
}

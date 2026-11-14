import * as THREE from 'three';

export const CUSTOMIZATION_CATALOG = {
  genders: [
    { id: 'male', label: '👦 男生' },
    { id: 'female', label: '👧 女生' },
    { id: 'quirky', label: '😎 搞怪' }
  ],
  hairs: [
    { id: 'spiky', label: '⚡ 刺蝟頭' },
    { id: 'twintails', label: '🎀 雙馬尾' },
    { id: 'afro', label: '🪩 爆炸頭' },
    { id: 'pompadour', label: '🛵 飛機頭' },
    { id: 'helmet', label: '⛑️ 安全帽' },
    { id: 'crown', label: '👑 皇冠' },
    { id: 'bald', label: '💡 大光頭' }
  ],
  hairColors: [
    { id: '#1e293b', label: '炭黑' },
    { id: '#f59e0b', label: '閃金' },
    { id: '#ef4444', label: '赤紅' },
    { id: '#3b82f6', label: '電藍' },
    { id: '#ec4899', label: '櫻粉' },
    { id: '#10b981', label: '翠綠' },
    { id: '#a855f7', label: '幻紫' },
    { id: '#f1f5f9', label: '銀白' }
  ],
  tops: [
    { id: 'classic_tee', label: '🎽 熱血紅帶白T' },
    { id: 'uniform', label: '🎒 高中制服' },
    { id: 'hawaiian', label: '🌴 海灘花襯衫' },
    { id: 'hoodie', label: '🧥 潮流帽T' },
    { id: 'jersey', label: '🏀 23號球衣' },
    { id: 'tank', label: '💪 台客吊嘎' }
  ],
  bottoms: [
    { id: 'jeans', label: '👖 牛仔褲+球鞋' },
    { id: 'slippers', label: '🩴 海灘褲+藍白拖' },
    { id: 'skirt', label: '👗 高校百褶裙' },
    { id: 'track', label: '🏃 三線運動褲' },
    { id: 'overalls', label: '🔧 吊帶工裝褲' }
  ],
  suits: [
    { id: 'none', label: '✨ 自由混搭 (使用上衣+下身)' },
    { id: 'dino', label: '🦖 暴龍充氣套裝' },
    { id: 'banana', label: '🍌 巨型香蕉套裝' },
    { id: 'astronaut', label: '🧑‍🚀 太空人套裝' },
    { id: 'ninja', label: '🥷 暗影忍者套裝' },
    { id: 'bear', label: '🐻 台灣黑熊套裝' },
    { id: 'gold', label: '💰 純金土豪套裝' }
  ]
};

const FUNNY_NAMES = [
  '下樓梯小霸王', '踩頭狂魔', '藍白拖戰神', '深淵暴龍',
  '香蕉滑倒王', '百層生還者', '彈簧飛天豬', '心機背後靈',
  '台南全糖少爺', '信義區靚仔', '別推我拜託', '抓交替專家'
];

export function getRandomNickname() {
  return FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)];
}

export function getRandomAppearance(allowSuit = true) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)].id;
  const useSuit = allowSuit && Math.random() < 0.36;
  const nonNoneSuits = CUSTOMIZATION_CATALOG.suits.filter((s) => s.id !== 'none');

  return {
    gender: pick(CUSTOMIZATION_CATALOG.genders),
    hair: pick(CUSTOMIZATION_CATALOG.hairs),
    hairColor: pick(CUSTOMIZATION_CATALOG.hairColors),
    top: pick(CUSTOMIZATION_CATALOG.tops),
    bottom: pick(CUSTOMIZATION_CATALOG.bottoms),
    suit: useSuit ? pick(nonNoneSuits) : 'none'
  };
}

export const ITEM_META = {
  banana: { icon: '🍌', name: '香蕉皮陷阱' },
  glove: { icon: '🥊', name: '彈簧重拳套' },
  bomb: { icon: '💣', name: '傳染定時炸彈' },
  freeze: { icon: '❄️', name: '急凍光線槍' },
  swap: { icon: '🔀', name: '抓交替換位符' }
};

export class CharacterAvatar {
  constructor({ id, name = '玩家', isLocal = false, appearance = {} }) {
    this.id = id;
    this.name = name;
    this.isLocal = isLocal;
    this.appearance = {
      gender: appearance.gender || 'male',
      hair: appearance.hair || 'spiky',
      hairColor: appearance.hairColor || '#1e293b',
      top: appearance.top || 'classic_tee',
      bottom: appearance.bottom || 'jeans',
      suit: appearance.suit || 'none'
    };

    this.hp = 12;
    this.maxHp = 12;
    this.floor = 1;
    this.heldItem = null;
    this.isGhost = false;
    this.hasBomb = false;
    this.frozenTimer = 0;
    this.squishTimer = 0;
    this.hurtFlashTimer = 0;
    this.punchAnimTimer = 0;
    this.walkCycle = 0;

    this.group = new THREE.Group();
    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    this.buildLandingGuide();
    this.buildCharacterModel();
    this.buildStatusAttachments();
    this.buildOverheadLabel();
  }

  buildLandingGuide() {
    // Vertical laser line + bright landing ring below feet for effortless mobile depth perception
    const ringGeo = new THREE.RingGeometry(0.42, 0.62, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.dropRingMat = new THREE.MeshBasicMaterial({
      color: this.isLocal ? 0x22c55e : 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: this.isLocal ? 0.9 : 0.45,
      depthWrite: false
    });
    this.dropRing = new THREE.Mesh(ringGeo, this.dropRingMat);
    this.dropRing.position.y = 0.03;
    this.group.add(this.dropRing);

    const lineGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
    lineGeo.translate(0, -0.5, 0);
    this.dropLineMat = new THREE.MeshBasicMaterial({
      color: this.isLocal ? 0x4ade80 : 0x38bdf8,
      transparent: true,
      opacity: this.isLocal ? 0.5 : 0.2,
      depthWrite: false
    });
    this.dropLine = new THREE.Mesh(lineGeo, this.dropLineMat);
    this.dropLine.visible = false;
    this.group.add(this.dropLine);
  }

  clearBodyModel() {
    while (this.bodyRoot.children.length > 0) {
      const child = this.bodyRoot.children[0];
      this.bodyRoot.remove(child);
    }
  }

  buildCharacterModel() {
    this.clearBodyModel();
    const app = this.appearance;
    const isSuit = app.suit && app.suit !== 'none';

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd1b3, roughness: 0.55 });
    const hairMat = new THREE.MeshStandardMaterial({ color: app.hairColor || '#1e293b', roughness: 0.45 });

    // Torso & Costume Colors
    let torsoColor = 0xffffff;
    let accentColor = 0xef4444;
    let sleeveColor = 0xffffff;

    if (isSuit) {
      if (app.suit === 'dino') { torsoColor = 0x22c55e; accentColor = 0xfacc15; sleeveColor = 0x16a34a; }
      else if (app.suit === 'banana') { torsoColor = 0xfacc15; accentColor = 0xca8a04; sleeveColor = 0xfef08a; }
      else if (app.suit === 'astronaut') { torsoColor = 0xf8fafc; accentColor = 0x2563eb; sleeveColor = 0xe2e8f0; }
      else if (app.suit === 'ninja') { torsoColor = 0x1e1b4b; accentColor = 0xdc2626; sleeveColor = 0x0f172a; }
      else if (app.suit === 'bear') { torsoColor = 0x18181b; accentColor = 0xffffff; sleeveColor = 0x27272a; }
      else if (app.suit === 'gold') { torsoColor = 0xfbbf24; accentColor = 0xfef08a; sleeveColor = 0xf59e0b; }
    } else {
      if (app.top === 'classic_tee') { torsoColor = 0xf8fafc; accentColor = 0xef4444; sleeveColor = 0xf8fafc; }
      else if (app.top === 'uniform') { torsoColor = 0xfef9c3; accentColor = 0x1e3a8a; sleeveColor = 0xfef9c3; }
      else if (app.top === 'hawaiian') { torsoColor = 0x06b6d4; accentColor = 0xf43f5e; sleeveColor = 0x0891b2; }
      else if (app.top === 'hoodie') { torsoColor = 0x7c3aed; accentColor = 0xc4b5fd; sleeveColor = 0x6d28d9; }
      else if (app.top === 'jersey') { torsoColor = 0xdc2626; accentColor = 0xfef08a; sleeveColor = 0xffd1b3; }
      else if (app.top === 'tank') { torsoColor = 0xffffff; accentColor = 0x38bdf8; sleeveColor = 0xffd1b3; }
    }

    const metalness = app.suit === 'gold' ? 0.65 : 0.08;
    const torsoMat = new THREE.MeshStandardMaterial({ color: torsoColor, roughness: 0.45, metalness });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, metalness });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.5, metalness });

    // Lower body colors
    let pantsColor = 0x2563eb;
    let shoeColor = 0xef4444;
    if (isSuit) {
      pantsColor = torsoColor;
      shoeColor = accentColor;
    } else {
      if (app.bottom === 'jeans') { pantsColor = 0x1d4ed8; shoeColor = 0xef4444; }
      else if (app.bottom === 'slippers') { pantsColor = 0x10b981; shoeColor = 0x2563eb; }
      else if (app.bottom === 'skirt') { pantsColor = 0x1e293b; shoeColor = 0xf8fafc; }
      else if (app.bottom === 'track') { pantsColor = 0x111827; shoeColor = 0xfacc15; }
      else if (app.bottom === 'overalls') { pantsColor = 0xd97706; shoeColor = 0x78350f; }
    }
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.5, metalness });
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.45 });

    // 1. Legs
    this.leftLeg = new THREE.Group();
    this.rightLeg = new THREE.Group();
    this.leftLeg.position.set(-0.2, 0.52, 0);
    this.rightLeg.position.set(0.2, 0.52, 0);

    const legGeo = new THREE.BoxGeometry(0.24, 0.46, 0.26);
    legGeo.translate(0, -0.23, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, app.bottom === 'skirt' && !isSuit ? skinMat : pantsMat);
    const rightLegMesh = new THREE.Mesh(legGeo, app.bottom === 'skirt' && !isSuit ? skinMat : pantsMat);

    // Shoes / Taiwanese Blue-White Slippers
    const shoeGeo = new THREE.BoxGeometry(0.27, 0.14, 0.36);
    shoeGeo.translate(0, -0.45, 0.04);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);

    if (app.bottom === 'slippers' && !isSuit) {
      const strapGeo = new THREE.BoxGeometry(0.28, 0.06, 0.16);
      strapGeo.translate(0, -0.39, 0.05);
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      leftShoe.add(new THREE.Mesh(strapGeo, whiteMat));
      rightShoe.add(new THREE.Mesh(strapGeo, whiteMat));
    }

    this.leftLeg.add(leftLegMesh, leftShoe);
    this.rightLeg.add(rightLegMesh, rightShoe);
    this.bodyRoot.add(this.leftLeg, this.rightLeg);

    // 2. Torso
    if (app.suit === 'banana') {
      const bananaGeo = new THREE.CylinderGeometry(0.32, 0.42, 1.35, 12);
      const bananaMesh = new THREE.Mesh(bananaGeo, torsoMat);
      bananaMesh.position.y = 1.05;
      this.bodyRoot.add(bananaMesh);
    } else {
      const torsoGeo = new THREE.BoxGeometry(0.66, 0.68, 0.42);
      const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
      torsoMesh.position.y = 0.86;
      this.bodyRoot.add(torsoMesh);
    }

    // Skirt or Dino Tail or Taiwan Bear V-mark
    if (!isSuit && app.bottom === 'skirt') {
      const skirtGeo = new THREE.CylinderGeometry(0.34, 0.46, 0.28, 12);
      const skirtMesh = new THREE.Mesh(skirtGeo, pantsMat);
      skirtMesh.position.y = 0.56;
      this.bodyRoot.add(skirtMesh);
    }
    if (!isSuit && app.top === 'uniform') {
      // School backpack
      const bagGeo = new THREE.BoxGeometry(0.5, 0.48, 0.22);
      const bagMat = new THREE.MeshStandardMaterial({ color: 0x166534 });
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.position.set(0, 0.88, -0.28);
      this.bodyRoot.add(bag);
    }
    if (app.suit === 'dino') {
      const tailGeo = new THREE.ConeGeometry(0.24, 0.75, 8);
      tailGeo.rotateX(Math.PI * 0.42);
      const tail = new THREE.Mesh(tailGeo, torsoMat);
      tail.position.set(0, 0.65, -0.45);
      this.bodyRoot.add(tail);
    } else if (app.suit === 'bear') {
      // White V chest mark of Formosan Black Bear
      const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.04), accentMat);
      v1.position.set(-0.08, 0.92, 0.22);
      v1.rotation.z = -0.5;
      const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.04), accentMat);
      v2.position.set(0.08, 0.92, 0.22);
      v2.rotation.z = 0.5;
      this.bodyRoot.add(v1, v2);
    } else if (app.suit === 'ninja') {
      // Katana on back
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.95, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 })
      );
      blade.position.set(0, 1.05, -0.26);
      blade.rotation.z = 0.45;
      this.bodyRoot.add(blade);
    } else if (app.suit === 'gold') {
      // Gold chain
      const chain = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.045, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, metalness: 0.85, roughness: 0.2 })
      );
      chain.rotation.x = Math.PI / 2;
      chain.position.set(0, 1.16, 0.06);
      this.bodyRoot.add(chain);
    }

    // 3. Arms
    this.leftArm = new THREE.Group();
    this.rightArm = new THREE.Group();
    this.leftArm.position.set(-0.44, 1.12, 0);
    this.rightArm.position.set(0.44, 1.12, 0);

    const armGeo = new THREE.BoxGeometry(0.2, 0.52, 0.2);
    armGeo.translate(0, -0.22, 0);
    this.leftArm.add(new THREE.Mesh(armGeo, sleeveMat));
    this.rightArm.add(new THREE.Mesh(armGeo, sleeveMat));
    this.bodyRoot.add(this.leftArm, this.rightArm);

    // 4. Head & Facial Expression (Gender differences)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.48, 0);

    const headGeo = new THREE.BoxGeometry(0.62, 0.58, 0.58);
    const headMesh = new THREE.Mesh(headGeo, app.suit === 'bear' ? torsoMat : skinMat);
    this.headGroup.add(headMesh);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    if (app.gender === 'quirky') {
      // Cool pixel sunglasses
      const glasses = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.14, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1, metalness: 0.8 })
      );
      glasses.position.set(0, 0.05, 0.3);
      this.headGroup.add(glasses);
    } else {
      const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.04), eyeMat);
      const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.04), eyeMat);
      leftEye.position.set(-0.14, 0.04, 0.29);
      rightEye.position.set(0.14, 0.04, 0.29);
      this.headGroup.add(leftEye, rightEye);

      if (app.gender === 'female') {
        // Pink blush cheeks
        const blushMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
        const bL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), blushMat);
        const bR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.04), blushMat);
        bL.position.set(-0.2, -0.06, 0.29);
        bR.position.set(0.2, -0.06, 0.29);
        this.headGroup.add(bL, bR);
      } else {
        // Determined eyebrows for male
        const browL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.04), hairMat);
        const browR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.04), hairMat);
        browL.position.set(-0.14, 0.14, 0.3);
        browR.position.set(0.14, 0.14, 0.3);
        browL.rotation.z = -0.15;
        browR.rotation.z = 0.15;
        this.headGroup.add(browL, browR);
      }
    }

    // Classic NS-Shaft Red Headband if classic_tee
    if (!isSuit && app.top === 'classic_tee') {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.1, 0.61),
        new THREE.MeshStandardMaterial({ color: 0xef4444 })
      );
      band.position.set(0, 0.18, 0);
      this.headGroup.add(band);
    }

    // 5. Hair / Suit Headgear
    if (app.suit === 'astronaut') {
      const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55, metalness: 0.6, roughness: 0.1 })
      );
      this.headGroup.add(visor);
    } else if (app.suit === 'dino') {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.3, 0.68), torsoMat);
      hood.position.set(0, 0.26, 0);
      this.headGroup.add(hood);
      for (let i = 0; i < 3; i++) {
        const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), accentMat);
        crest.position.set(0, 0.42, 0.18 - i * 0.2);
        this.headGroup.add(crest);
      }
    } else if (app.suit === 'bear') {
      const earGeo = new THREE.SphereGeometry(0.16, 10, 10);
      const earL = new THREE.Mesh(earGeo, torsoMat);
      const earR = new THREE.Mesh(earGeo, torsoMat);
      earL.position.set(-0.28, 0.32, 0);
      earR.position.set(0.28, 0.32, 0);
      this.headGroup.add(earL, earR);
    } else {
      this.buildHairMesh(app.hair, hairMat);
    }

    this.bodyRoot.add(this.headGroup);
  }

  buildHairMesh(hairType, hairMat) {
    if (hairType === 'bald') return;

    if (hairType === 'spiky') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.18, 0.62), hairMat);
      base.position.set(0, 0.28, 0);
      this.headGroup.add(base);
      for (let i = -1; i <= 1; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 5), hairMat);
        spike.position.set(i * 0.18, 0.44, 0.04);
        spike.rotation.z = -i * 0.25;
        this.headGroup.add(spike);
      }
    } else if (hairType === 'twintails') {
      const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.62), hairMat);
      topCap.position.set(0, 0.26, 0);
      const tailGeo = new THREE.ConeGeometry(0.16, 0.55, 8);
      const tL = new THREE.Mesh(tailGeo, hairMat);
      const tR = new THREE.Mesh(tailGeo, hairMat);
      tL.position.set(-0.42, 0.08, -0.05);
      tR.position.set(0.42, 0.08, -0.05);
      tL.rotation.z = 0.45;
      tR.rotation.z = -0.45;
      this.headGroup.add(topCap, tL, tR);
    } else if (hairType === 'afro') {
      const afro = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 14), hairMat);
      afro.position.set(0, 0.24, -0.02);
      this.headGroup.add(afro);
    } else if (hairType === 'pompadour') {
      const pomp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.32, 0.78), hairMat);
      pomp.position.set(0, 0.34, 0.14);
      pomp.rotation.x = -0.22;
      this.headGroup.add(pomp);
    } else if (hairType === 'helmet') {
      const helmetMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmetMat);
      dome.position.set(0, 0.16, 0);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 0.25), helmetMat);
      brim.position.set(0, 0.2, 0.28);
      this.headGroup.add(dome, brim);
    } else if (hairType === 'crown') {
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.75, roughness: 0.2 });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.24, 8), crownMat);
      ring.position.set(0, 0.38, 0);
      this.headGroup.add(ring);
    }
  }

  buildStatusAttachments() {
    // 1. Ice Freeze Shell
    const iceGeo = new THREE.BoxGeometry(1.15, 2.0, 1.15);
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.52,
      roughness: 0.15
    });
    this.iceBlock = new THREE.Mesh(iceGeo, iceMat);
    this.iceBlock.position.y = 1.0;
    this.iceBlock.visible = false;
    this.group.add(this.iceBlock);

    // 2. Time Bomb above head
    this.bombGroup = new THREE.Group();
    const bombBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3, metalness: 0.5 })
    );
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    spark.position.y = 0.32;
    this.bombSpark = spark;
    this.bombGroup.add(bombBall, spark);
    this.bombGroup.position.set(0, 2.25, 0);
    this.bombGroup.visible = false;
    this.group.add(this.bombGroup);

    // 3. Ghost Aura Cone (when eliminated and playing as Vengeful Ghost!)
    const ghostGeo = new THREE.ConeGeometry(0.55, 1.4, 12);
    ghostGeo.rotateX(Math.PI);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.55,
      wireframe: false
    });
    this.ghostTail = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostTail.position.y = 0.85;
    this.ghostTail.visible = false;
    this.group.add(this.ghostTail);
  }

  buildOverheadLabel() {
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 96;
    this.labelCtx = this.labelCanvas.getContext('2d');

    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: this.labelTex,
      transparent: true,
      depthTest: false
    });
    this.labelSprite = new THREE.Sprite(mat);
    this.labelSprite.scale.set(2.5, 0.94, 1);
    this.labelSprite.position.set(0, 2.48, 0);
    this.labelSprite.renderOrder = 999;
    this.group.add(this.labelSprite);

    this.refreshOverheadLabel();
  }

  refreshOverheadLabel() {
    if (!this.labelCtx) return;
    const ctx = this.labelCtx;
    ctx.clearRect(0, 0, 256, 96);

    // Background pill
    ctx.fillStyle = this.isGhost
      ? 'rgba(88, 28, 135, 0.82)'
      : this.isLocal
      ? 'rgba(15, 23, 42, 0.88)'
      : 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.roundRect(18, 8, 220, 74, 16);
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = this.isGhost ? '#c084fc' : this.isLocal ? '#4ade80' : '#38bdf8';
    ctx.stroke();

    // Name + Held item or Ghost tag
    const itemIcon = this.heldItem && ITEM_META[this.heldItem] ? ` ${ITEM_META[this.heldItem].icon}` : '';
    const bombIcon = this.hasBomb ? ' 💣' : '';
    const titleText = this.isGhost ? `👻 ${this.name}` : `${this.name}${itemIcon}${bombIcon}`;

    ctx.font = 'bold 22px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(titleText.slice(0, 14), 128, 36);

    if (this.isGhost) {
      ctx.font = 'bold 17px "Noto Sans TC", sans-serif';
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('背後靈復仇中', 128, 66);
    } else {
      // 12-unit classic NS-Shaft HP bar
      const barX = 34;
      const barY = 50;
      const segW = 14;
      const gap = 1.6;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i < this.hp
          ? (this.hp <= 4 ? '#ef4444' : this.hp <= 7 ? '#facc15' : '#22c55e')
          : 'rgba(255,255,255,0.18)';
        ctx.fillRect(barX + i * (segW + gap), barY, segW, 16);
      }
    }

    this.labelTex.needsUpdate = true;
  }

  updateAppearance(newApp, newName) {
    if (newName !== undefined) {
      this.name = newName;
    }
    if (newApp) {
      this.appearance = { ...this.appearance, ...newApp };
      this.buildCharacterModel();
    }
    this.refreshOverheadLabel();
  }

  setGhostMode(isGhost) {
    if (this.isGhost === isGhost) return;
    this.isGhost = isGhost;
    this.ghostTail.visible = isGhost;
    this.dropRing.visible = !isGhost;
    if (isGhost) {
      this.dropLine.visible = false;
    }
    this.bodyRoot.scale.setScalar(isGhost ? 0.78 : 1.0);
    this.refreshOverheadLabel();
  }

  updateLandingProjection(groundY) {
    if (this.isGhost) {
      this.dropRing.visible = false;
      this.dropLine.visible = false;
      return;
    }
    const charY = this.group.position.y;
    const dist = charY - groundY;
    if (groundY !== null && dist >= 0 && dist < 24) {
      this.dropRing.visible = true;
      this.dropRing.position.y = -dist + 0.05;
      const scale = Math.max(0.55, 1.15 - dist * 0.025);
      this.dropRing.scale.setScalar(scale);

      if (dist > 0.35) {
        this.dropLine.visible = true;
        this.dropLine.scale.y = dist;
      } else {
        this.dropLine.visible = false;
      }
    } else {
      this.dropRing.visible = true;
      this.dropRing.position.y = 0.03;
      this.dropLine.visible = false;
    }
  }

  animate(dt, isMoving, isGrounded) {
    // Squish bounce recovery (when stomped on head!)
    if (this.squishTimer > 0) {
      this.squishTimer = Math.max(0, this.squishTimer - dt);
      this.bodyRoot.scale.set(1.35, 0.48, 1.35);
    } else if (!this.isGhost) {
      this.bodyRoot.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 12));
    }

    // Ice block state
    this.iceBlock.visible = this.frozenTimer > 0 && !this.isGhost;
    if (this.frozenTimer > 0) {
      this.frozenTimer = Math.max(0, this.frozenTimer - dt);
    }

    // Time Bomb flash
    this.bombGroup.visible = this.hasBomb && !this.isGhost;
    if (this.hasBomb) {
      const pulse = 1 + Math.sin(performance.now() * 0.025) * 0.25;
      this.bombSpark.scale.setScalar(pulse);
    }

    // Limb animation
    if (this.isGhost) {
      this.bodyRoot.position.y = 0.2 + Math.sin(performance.now() * 0.006) * 0.16;
      this.ghostTail.rotation.y += dt * 3;
      return;
    } else {
      this.bodyRoot.position.y = 0;
    }

    if (this.punchAnimTimer > 0) {
      this.punchAnimTimer = Math.max(0, this.punchAnimTimer - dt);
      this.rightArm.rotation.x = -Math.PI * 0.65;
      this.leftArm.rotation.x = -Math.PI * 0.45;
    } else if (!isGrounded) {
      // Jumping / falling pose
      this.leftArm.rotation.x = -Math.PI * 0.72;
      this.rightArm.rotation.x = -Math.PI * 0.72;
      this.leftLeg.rotation.x = 0.35;
      this.rightLeg.rotation.x = -0.35;
    } else if (isMoving) {
      this.walkCycle += dt * 14;
      const swing = Math.sin(this.walkCycle) * 0.65;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.8;
      this.rightArm.rotation.x = swing * 0.8;
    } else {
      this.leftLeg.rotation.x *= 0.82;
      this.rightLeg.rotation.x *= 0.82;
      this.leftArm.rotation.x *= 0.82;
      this.rightArm.rotation.x *= 0.82;
    }
  }
}

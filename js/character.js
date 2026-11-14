import * as THREE from 'three';

export const CUSTOMIZATION_CATALOG = {
  genders: [
    { id: 'male', label: '👦 少年' },
    { id: 'female', label: '👧 少女' },
    { id: 'quirky', label: '😎 潮人' }
  ],
  hairs: [
    { id: 'spiky', label: '⚡ 刺蝟頭' },
    { id: 'twintails', label: '🎀 雙馬尾' },
    { id: 'afro', label: '🪩 爆炸頭' },
    { id: 'pompadour', label: '🛵 飛機頭' },
    { id: 'helmet', label: '⛑️ 工地帽' },
    { id: 'crown', label: '👑 國王冠' },
    { id: 'bald', label: '💡 大光頭' }
  ],
  hairColors: [
    { id: '#1e293b', label: '曜石黑' },
    { id: '#f59e0b', label: '閃耀金' },
    { id: '#ef4444', label: '熱血紅' },
    { id: '#3b82f6', label: '電光藍' },
    { id: '#ec4899', label: '櫻花粉' },
    { id: '#10b981', label: '薄荷綠' },
    { id: '#a855f7', label: '星幻紫' },
    { id: '#f8fafc', label: '極地銀' }
  ],
  tops: [
    { id: 'classic_tee', label: '🎽 紅頭帶熱血T' },
    { id: 'uniform', label: '🎒 台灣高中制服' },
    { id: 'hawaiian', label: '🌴 墾丁花襯衫' },
    { id: 'hoodie', label: '🧥 街頭連帽T' },
    { id: 'jersey', label: '🏀 23號球衣' },
    { id: 'tank', label: '💪 台客吊嘎' }
  ],
  bottoms: [
    { id: 'jeans', label: '👖 丹寧褲+潮鞋' },
    { id: 'slippers', label: '🩴 海灘褲+藍白拖' },
    { id: 'skirt', label: '👗 高校百褶裙' },
    { id: 'track', label: '🏃 三線運動褲' },
    { id: 'overalls', label: '🔧 吊帶工裝褲' }
  ],
  suits: [
    { id: 'none', label: '✨ 自由混搭 (上衣+下身)' },
    { id: 'dino', label: '🦖 暴龍充氣裝' },
    { id: 'banana', label: '🍌 黃金香蕉裝' },
    { id: 'astronaut', label: '🧑‍🚀 太空宇航服' },
    { id: 'ninja', label: '🥷 疾風忍者裝' },
    { id: 'bear', label: '🐻 台灣黑熊裝' },
    { id: 'gold', label: '💰 純金土豪裝' }
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
  const useSuit = allowSuit && Math.random() < 0.34;
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

// Cached procedural pattern textures for detailed shirts
const textureCache = new Map();

function getShirtTexture(topType) {
  if (textureCache.has(topType)) return textureCache.get(topType);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');

  if (topType === 'hawaiian') {
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, 0, 128, 128);
    // Tropical hibiscus flowers & leaves
    const colors = ['#f43f5e', '#facc15', '#ffffff', '#10b981'];
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc((i * 37) % 120 + 4, (i * 53) % 120 + 4, 8 + (i % 5), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (topType === 'jersey') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 120, 120);
    ctx.fillStyle = '#fef08a';
    ctx.font = '900 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('23', 64, 84);
  } else if (topType === 'classic_tee') {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(0, 0, 128, 18);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(64, 68, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  textureCache.set(topType, tex);
  return tex;
}

export class CharacterAvatar {
  constructor({ id, name = '玩家', isLocal = false, showNameplate = true, appearance = {} }) {
    this.id = id;
    this.name = name;
    this.isLocal = isLocal;
    this.showNameplate = showNameplate;
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
    this.punchAnimTimer = 0;
    this.walkCycle = 0;
    this.blinkTimer = Math.random() * 3;
    this.eyeGroups = [];

    this.group = new THREE.Group();
    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    this.buildLandingGuide();
    this.buildCharacterModel();
    this.buildStatusAttachments();
    this.buildOverheadLabel();
  }

  buildLandingGuide() {
    const ringGeo = new THREE.RingGeometry(0.42, 0.62, 28);
    ringGeo.rotateX(-Math.PI / 2);
    this.dropRingMat = new THREE.MeshBasicMaterial({
      color: this.isLocal ? 0x22c55e : 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: this.isLocal ? 0.92 : 0.42,
      depthWrite: false
    });
    this.dropRing = new THREE.Mesh(ringGeo, this.dropRingMat);
    this.dropRing.position.y = 0.02;
    this.group.add(this.dropRing);

    const lineGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6);
    lineGeo.translate(0, -0.5, 0);
    this.dropLineMat = new THREE.MeshBasicMaterial({
      color: this.isLocal ? 0x4ade80 : 0x38bdf8,
      transparent: true,
      opacity: this.isLocal ? 0.55 : 0.18,
      depthWrite: false
    });
    this.dropLine = new THREE.Mesh(lineGeo, this.dropLineMat);
    this.dropLine.visible = false;
    this.group.add(this.dropLine);
  }

  clearBodyModel() {
    this.eyeGroups = [];
    while (this.bodyRoot.children.length > 0) {
      const child = this.bodyRoot.children[0];
      this.bodyRoot.remove(child);
    }
  }

  buildCharacterModel() {
    this.clearBodyModel();
    const app = this.appearance;
    const isSuit = app.suit && app.suit !== 'none';

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe0c8, roughness: 0.48, metalness: 0.04 });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.68 });
    const hairMat = new THREE.MeshStandardMaterial({ color: app.hairColor || '#1e293b', roughness: 0.36, metalness: 0.12 });

    // Determine Torso & Costume Materials
    let torsoColor = 0xffffff;
    let accentColor = 0xef4444;
    let sleeveColor = 0xffffff;
    let torsoMap = null;

    if (isSuit) {
      if (app.suit === 'dino') { torsoColor = 0x22c55e; accentColor = 0xfacc15; sleeveColor = 0x16a34a; }
      else if (app.suit === 'banana') { torsoColor = 0xfacc15; accentColor = 0xa16207; sleeveColor = 0xfef08a; }
      else if (app.suit === 'astronaut') { torsoColor = 0xf8fafc; accentColor = 0x2563eb; sleeveColor = 0xe2e8f0; }
      else if (app.suit === 'ninja') { torsoColor = 0x1e1b4b; accentColor = 0xdc2626; sleeveColor = 0x0f172a; }
      else if (app.suit === 'bear') { torsoColor = 0x18181b; accentColor = 0xffffff; sleeveColor = 0x27272a; }
      else if (app.suit === 'gold') { torsoColor = 0xfbbf24; accentColor = 0xfef08a; sleeveColor = 0xf59e0b; }
    } else {
      if (app.top === 'classic_tee') {
        torsoColor = 0xffffff; accentColor = 0xef4444; sleeveColor = 0xf8fafc;
        torsoMap = getShirtTexture('classic_tee');
      } else if (app.top === 'uniform') {
        torsoColor = 0xfefce8; accentColor = 0x1e3a8a; sleeveColor = 0xfefce8;
      } else if (app.top === 'hawaiian') {
        torsoColor = 0xffffff; accentColor = 0xf43f5e; sleeveColor = 0x06b6d4;
        torsoMap = getShirtTexture('hawaiian');
      } else if (app.top === 'hoodie') {
        torsoColor = 0x7c3aed; accentColor = 0xddd6fe; sleeveColor = 0x6d28d9;
      } else if (app.top === 'jersey') {
        torsoColor = 0xffffff; accentColor = 0xfef08a; sleeveColor = 0xffe0c8;
        torsoMap = getShirtTexture('jersey');
      } else if (app.top === 'tank') {
        torsoColor = 0xf8fafc; accentColor = 0x38bdf8; sleeveColor = 0xffe0c8;
      }
    }

    const metalness = app.suit === 'gold' ? 0.78 : app.suit === 'astronaut' ? 0.25 : 0.08;
    const roughness = app.suit === 'gold' ? 0.2 : 0.42;

    const torsoMat = new THREE.MeshStandardMaterial({
      color: torsoColor,
      map: torsoMap,
      roughness,
      metalness
    });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.35, metalness });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.45, metalness });

    // Lower body colors
    let pantsColor = 0x2563eb;
    let shoeColor = 0xef4444;
    if (isSuit) {
      pantsColor = torsoColor;
      shoeColor = accentColor;
    } else {
      if (app.bottom === 'jeans') { pantsColor = 0x1d4ed8; shoeColor = 0xef4444; }
      else if (app.bottom === 'slippers') { pantsColor = 0x0d9488; shoeColor = 0x2563eb; }
      else if (app.bottom === 'skirt') { pantsColor = 0x1e293b; shoeColor = 0xf43f5e; }
      else if (app.bottom === 'track') { pantsColor = 0x111827; shoeColor = 0xfacc15; }
      else if (app.bottom === 'overalls') { pantsColor = 0xd97706; shoeColor = 0x78350f; }
    }
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.48, metalness });
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // ================= 1. SCULPTED LEGS & DETAILED FOOTWEAR =================
    this.leftLeg = new THREE.Group();
    this.rightLeg = new THREE.Group();
    this.leftLeg.position.set(-0.19, 0.56, 0);
    this.rightLeg.position.set(0.19, 0.56, 0);

    const buildSingleLeg = () => {
      const legGroup = new THREE.Group();
      const isBareLeg = !isSuit && (app.bottom === 'skirt' || app.bottom === 'slippers');

      // Shorts / Pants upper cuff
      const upperGeo = new THREE.CylinderGeometry(0.13, 0.12, 0.22, 12);
      upperGeo.translate(0, -0.11, 0);
      legGroup.add(new THREE.Mesh(upperGeo, pantsMat));

      // Calf
      const calfGeo = new THREE.CylinderGeometry(0.11, 0.095, 0.24, 12);
      calfGeo.translate(0, -0.32, 0);
      legGroup.add(new THREE.Mesh(calfGeo, isBareLeg ? skinMat : pantsMat));

      // Side stripe for track pants
      if (!isSuit && app.bottom === 'track') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.08), whiteMat);
        stripe.position.set(0.11, -0.22, 0);
        legGroup.add(stripe);
      }

      // High socks for skirt
      if (!isSuit && app.bottom === 'skirt') {
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.098, 0.16, 12), whiteMat);
        sock.position.set(0, -0.36, 0);
        legGroup.add(sock);
      }

      // Footwear: Taiwanese Blue-White Slippers vs Sculpted Sneakers
      if (!isSuit && app.bottom === 'slippers') {
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), skinMat);
        foot.scale.set(1, 0.6, 1.4);
        foot.position.set(0, -0.46, 0.05);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.36), shoeMat);
        sole.position.set(0, -0.5, 0.05);
        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.14, 12, 1, true, 0, Math.PI), whiteMat);
        strap.rotation.z = Math.PI / 2;
        strap.rotation.y = Math.PI / 2;
        strap.position.set(0, -0.46, 0.06);
        legGroup.add(foot, sole, strap);
      } else {
        // Sculpted 3D Sneaker with white sole & tongue
        const sneakerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 14), shoeMat);
        sneakerBody.scale.set(1, 1, 1.35);
        sneakerBody.position.set(0, -0.45, 0.04);

        const sneakerToe = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), whiteMat);
        sneakerToe.scale.set(1.0, 0.65, 1.1);
        sneakerToe.position.set(0, -0.47, 0.14);

        const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.135, 0.045, 14), whiteMat);
        sole.scale.set(1.04, 1, 1.42);
        sole.position.set(0, -0.51, 0.05);

        legGroup.add(sneakerBody, sneakerToe, sole);
      }
      return legGroup;
    };

    this.leftLeg.add(buildSingleLeg());
    this.rightLeg.add(buildSingleLeg());
    this.bodyRoot.add(this.leftLeg, this.rightLeg);

    // ================= 2. SCULPTED TORSO & OUTFIT DETAILS =================
    if (app.suit === 'banana') {
      // Curved 3D Giant Banana Suit
      const bananaBody = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 1.15, 16), torsoMat);
      bananaBody.position.y = 1.02;
      const bananaTop = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.45, 14), torsoMat);
      bananaTop.position.y = 1.82;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.18, 10), accentMat);
      stem.position.y = 2.08;
      this.bodyRoot.add(bananaBody, bananaTop, stem);
    } else {
      // Rounded Chibi Torso + Hips/Pelvis
      const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.29, 0.22, 16), pantsMat);
      pelvis.position.y = 0.62;
      this.bodyRoot.add(pelvis);

      const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.33, 0.56, 18), torsoMat);
      chest.scale.set(1.08, 1, 0.82);
      chest.position.y = 0.96;
      this.bodyRoot.add(chest);

      const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), torsoMat);
      shoulders.scale.set(1.12, 0.42, 0.82);
      shoulders.position.y = 1.22;
      this.bodyRoot.add(shoulders);
    }

    // Specific Top / Suit 3D Accessories
    if (!isSuit) {
      if (app.bottom === 'skirt') {
        const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.34, 18, 1, true), pantsMat);
        skirt.position.y = 0.62;
        this.bodyRoot.add(skirt);
      }
      if (app.bottom === 'overalls') {
        // Suspenders + front bib
        const bib = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.04), pantsMat);
        bib.position.set(0, 0.88, 0.26);
        this.bodyRoot.add(bib);
      }
      if (app.top === 'uniform') {
        // Red necktie + green Taiwanese high school Crossbody / Backpack
        const tie = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 4), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
        tie.rotation.x = Math.PI;
        tie.position.set(0, 1.02, 0.27);
        const bag = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.44, 0.22),
          new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 })
        );
        bag.position.set(0, 0.94, -0.28);
        this.bodyRoot.add(tie, bag);
      } else if (app.top === 'hoodie') {
        // Hoodie kangaroo pocket + drawstrings
        const hoodBack = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), torsoMat);
        hoodBack.position.set(0, 1.24, -0.18);
        this.bodyRoot.add(hoodBack);
      }
    } else {
      // Suit Accessories
      if (app.suit === 'dino') {
        // Plump Dino Tail + Back Spikes + Yellow Belly Patch
        const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.48, 12), accentMat);
        belly.position.set(0, 0.94, 0.08);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.78, 12), torsoMat);
        tail.rotation.x = Math.PI * 0.42;
        tail.position.set(0, 0.68, -0.45);
        this.bodyRoot.add(belly, tail);
        for (let i = 0; i < 3; i++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), accentMat);
          sp.rotation.x = -Math.PI * 0.45;
          sp.position.set(0, 1.12 - i * 0.18, -0.28 - i * 0.06);
          this.bodyRoot.add(sp);
        }
      } else if (app.suit === 'bear') {
        // Taiwan Formosan Black Bear iconic V-shaped white chest mark + round tail
        const vL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.05), whiteMat);
        vL.position.set(-0.08, 1.02, 0.26);
        vL.rotation.z = -0.48;
        const vR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.05), whiteMat);
        vR.position.set(0.08, 1.02, 0.26);
        vR.rotation.z = 0.48;
        this.bodyRoot.add(vL, vR);
      } else if (app.suit === 'astronaut') {
        // Oxygen life-support backpack + chest control unit
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.26), whiteMat);
        pack.position.set(0, 0.98, -0.28);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.06), accentMat);
        panel.position.set(0, 1.0, 0.26);
        this.bodyRoot.add(pack, panel);
      } else if (app.suit === 'ninja') {
        // Red flowing scarf + twin crossed katanas on back
        const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.065, 8, 16), accentMat);
        scarfRing.rotation.x = Math.PI / 2;
        scarfRing.position.set(0, 1.24, 0);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 });
        const katana1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8), bladeMat);
        katana1.position.set(0, 1.04, -0.26);
        katana1.rotation.z = 0.55;
        const katana2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8), bladeMat);
        katana2.position.set(0, 1.04, -0.28);
        katana2.rotation.z = -0.55;
        this.bodyRoot.add(scarfRing, katana1, katana2);
      } else if (app.suit === 'gold') {
        const chain = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.05, 10, 20),
          new THREE.MeshStandardMaterial({ color: 0xfef08a, metalness: 0.9, roughness: 0.1 })
        );
        chain.rotation.x = Math.PI / 2;
        chain.position.set(0, 1.18, 0.06);
        this.bodyRoot.add(chain);
      }
    }

    // ================= 3. SCULPTED ARMS & 3D HANDS =================
    this.leftArm = new THREE.Group();
    this.rightArm = new THREE.Group();
    this.leftArm.position.set(-0.39, 1.16, 0);
    this.rightArm.position.set(0.39, 1.16, 0);

    const buildSingleArm = (isLeft) => {
      const armG = new THREE.Group();
      const isSleeveless = !isSuit && (app.top === 'tank' || app.top === 'jersey');

      // Upper sleeve
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.085, 0.24, 12),
        isSleeveless ? skinMat : sleeveMat
      );
      upper.position.y = -0.12;
      armG.add(upper);

      // Forearm
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.075, 0.22, 12),
        isSuit || app.top === 'hoodie' ? sleeveMat : skinMat
      );
      lower.position.y = -0.32;
      armG.add(lower);

      // Cute 3D Hand + Thumb
      const handMat = isSuit && app.suit !== 'banana' ? accentMat : skinMat;
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), handMat);
      fist.position.y = -0.45;
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), handMat);
      thumb.position.set(isLeft ? 0.07 : -0.07, -0.43, 0.05);
      armG.add(fist, thumb);
      return armG;
    };

    this.leftArm.add(buildSingleArm(true));
    this.rightArm.add(buildSingleArm(false));
    this.bodyRoot.add(this.leftArm, this.rightArm);

    // ================= 4. DETAILED CHIBI HEAD, LAYERED EYES & EARS =================
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.58, 0);

    // Sculpted rounded Chibi head
    const headBaseMat = app.suit === 'bear' ? torsoMat : skinMat;
    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 20), headBaseMat);
    headSphere.scale.set(1.06, 0.96, 0.98);
    this.headGroup.add(headSphere);

    // Cute 3D Ears
    if (app.suit !== 'astronaut' && app.suit !== 'dino' && app.suit !== 'banana') {
      const earGeo = new THREE.SphereGeometry(0.08, 10, 10);
      const earL = new THREE.Mesh(earGeo, headBaseMat);
      const earR = new THREE.Mesh(earGeo, headBaseMat);
      earL.scale.set(0.55, 1.1, 0.8);
      earR.scale.set(0.55, 1.1, 0.8);
      earL.position.set(-0.37, -0.02, 0);
      earR.position.set(0.37, -0.02, 0);
      this.headGroup.add(earL, earR);
    }

    // 3D Nose button
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 10, 10),
      app.suit === 'bear' ? whiteMat : skinMat
    );
    nose.position.set(0, -0.03, 0.35);
    this.headGroup.add(nose);

    // Expressive Layered Eyes (Sclera + Iris + Pupil + Anime Highlight!)
    const buildDetailedEye = (xOffset) => {
      const eyeG = new THREE.Group();
      eyeG.position.set(xOffset, 0.03, 0.32);

      const sclera = new THREE.Mesh(
        new THREE.SphereGeometry(0.072, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      sclera.scale.set(1.0, 1.22, 0.55);

      const irisColor = app.gender === 'female' ? 0x2563eb : 0x0f172a;
      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.052, 12, 10),
        new THREE.MeshBasicMaterial({ color: irisColor })
      );
      iris.scale.set(1.0, 1.2, 0.5);
      iris.position.z = 0.022;

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x020617 })
      );
      pupil.scale.set(1.0, 1.15, 0.5);
      pupil.position.z = 0.034;

      // White anime eye sparkle
      const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      shine.position.set(0.02, 0.03, 0.052);

      eyeG.add(sclera, iris, pupil, shine);

      // Eyelashes for female
      if (app.gender === 'female') {
        const lash = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.025, 0.03),
          new THREE.MeshBasicMaterial({ color: 0x0f172a })
        );
        lash.position.set(xOffset > 0 ? 0.02 : -0.02, 0.085, 0.02);
        lash.rotation.z = xOffset > 0 ? -0.18 : 0.18;
        eyeG.add(lash);
      }

      this.eyeGroups.push(eyeG);
      return eyeG;
    };

    this.headGroup.add(buildDetailedEye(-0.135), buildDetailedEye(0.135));

    // Quirky / Gold Boss Cool Sunglasses
    if (app.gender === 'quirky' || app.suit === 'gold') {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 });
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.9, roughness: 0.1 });
      const lLens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.04), lensMat);
      const rLens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.04), lensMat);
      lLens.position.set(-0.135, 0.04, 0.36);
      rLens.position.set(0.135, 0.04, 0.36);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.045), frameMat);
      bridge.position.set(0, 0.08, 0.365);
      this.headGroup.add(lLens, rLens, bridge);
    }

    // Rosy Blush & Cute Mouth
    const blushL = new THREE.Mesh(new THREE.CircleGeometry(0.052, 12), blushMat);
    const blushR = new THREE.Mesh(new THREE.CircleGeometry(0.052, 12), blushMat);
    blushL.position.set(-0.21, -0.06, 0.325);
    blushR.position.set(0.21, -0.06, 0.325);
    blushL.rotation.y = -0.35;
    blushR.rotation.y = 0.35;
    this.headGroup.add(blushL, blushR);

    // Happy Mouth Smile
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.048, 0.014, 8, 12, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x991b1b })
    );
    mouth.rotation.x = Math.PI;
    mouth.position.set(0, -0.1, 0.34);
    this.headGroup.add(mouth);

    // Eyebrows
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.026, 0.03), hairMat);
    const browR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.026, 0.03), hairMat);
    browL.position.set(-0.135, 0.145, 0.33);
    browR.position.set(0.135, 0.145, 0.33);
    browL.rotation.z = app.gender === 'male' ? -0.16 : 0.06;
    browR.rotation.z = app.gender === 'male' ? 0.16 : -0.06;
    this.headGroup.add(browL, browR);

    // Classic NS-Shaft Red Headband with knot tails!
    if (!isSuit && app.top === 'classic_tee') {
      const headbandMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
      const bandRing = new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 0.085, 24, 1, true), headbandMat);
      bandRing.scale.set(1.06, 1, 0.98);
      bandRing.position.y = 0.16;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), headbandMat);
      knot.position.set(0.28, 0.16, -0.25);
      this.headGroup.add(bandRing, knot);
    }

    // ================= 5. DETAILED HAIR & SUIT HEADGEAR =================
    if (app.suit === 'astronaut') {
      const helmetShell = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 24, 20),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.2 })
      );
      const visorGlass = new THREE.Mesh(
        new THREE.SphereGeometry(0.39, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.75, roughness: 0.1, transparent: true, opacity: 0.62 })
      );
      visorGlass.rotation.x = Math.PI / 2;
      visorGlass.position.z = 0.09;
      this.headGroup.add(helmetShell, visorGlass);
    } else if (app.suit === 'dino') {
      const dinoHood = new THREE.Mesh(
        new THREE.SphereGeometry(0.41, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.65),
        torsoMat
      );
      dinoHood.rotation.x = -0.35;
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.34), torsoMat);
      snout.position.set(0, 0.28, 0.22);
      // Cute white dino teeth along rim
      for (let i = -2; i <= 2; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 4), whiteMat);
        tooth.rotation.x = Math.PI;
        tooth.position.set(i * 0.09, 0.18, 0.36);
        this.headGroup.add(tooth);
      }
      for (let i = 0; i < 3; i++) {
        const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), accentMat);
        crest.position.set(0, 0.42 - i * 0.08, 0.05 - i * 0.2);
        crest.rotation.x = -i * 0.35;
        this.headGroup.add(crest);
      }
      this.headGroup.add(dinoHood, snout);
    } else if (app.suit === 'bear') {
      const earGeo = new THREE.SphereGeometry(0.14, 14, 14);
      const earL = new THREE.Mesh(earGeo, torsoMat);
      const earR = new THREE.Mesh(earGeo, torsoMat);
      earL.position.set(-0.28, 0.32, 0);
      earR.position.set(0.28, 0.32, 0);
      this.headGroup.add(earL, earR);
    } else if (app.suit === 'ninja') {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.385, 20, 16), torsoMat);
      hood.scale.set(1.06, 0.98, 1.0);
      // Mask covering lower face, leaving eyes open
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.075, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
      );
      plate.position.set(0, 0.19, 0.36);
      this.headGroup.add(hood, plate);
    } else if (app.suit !== 'banana') {
      this.buildDetailedHair(app.hair, hairMat);
    }

    this.bodyRoot.add(this.headGroup);
  }

  buildDetailedHair(hairType, hairMat) {
    if (hairType === 'bald') {
      // Shiny highlight spot on bald head!
      const shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      );
      shine.position.set(-0.14, 0.26, 0.22);
      this.headGroup.add(shine);
      return;
    }

    // Hair Scalp Base Cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.378, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    cap.scale.set(1.06, 0.98, 1.0);
    cap.rotation.x = -0.15;
    this.headGroup.add(cap);

    if (hairType === 'spiky') {
      // Multi-angle anime hero spikes + front bangs
      const spikeConfigs = [
        [0, 0.42, 0.12, 0.25, 0],
        [-0.2, 0.38, 0.08, 0.15, 0.42],
        [0.2, 0.38, 0.08, 0.15, -0.42],
        [-0.32, 0.26, -0.02, 0, 0.78],
        [0.32, 0.26, -0.02, 0, -0.78],
        [0, 0.36, -0.18, -0.45, 0],
        [-0.14, 0.24, 0.32, 0.85, 0.2],
        [0.14, 0.24, 0.32, 0.85, -0.2]
      ];
      spikeConfigs.forEach(([sx, sy, sz, rx, rz]) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.32, 7), hairMat);
        cone.position.set(sx, sy, sz);
        cone.rotation.set(rx, 0, rz);
        this.headGroup.add(cone);
      });
    } else if (hairType === 'twintails') {
      // Cute front bangs + red hair ribbons + long sculpted twin tails
      for (let i = -1; i <= 1; i++) {
        const bang = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), hairMat);
        bang.rotation.x = Math.PI * 0.88;
        bang.position.set(i * 0.12, 0.2, 0.33);
        this.headGroup.add(bang);
      }
      const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.3 });
      [-1, 1].forEach((side) => {
        const bow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), ribbonMat);
        bow.scale.set(1.4, 0.9, 0.9);
        bow.position.set(side * 0.36, 0.16, -0.04);

        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.62, 12), hairMat);
        tail.rotation.x = Math.PI;
        tail.rotation.z = side * 0.42;
        tail.position.set(side * 0.48, -0.08, -0.06);
        this.headGroup.add(bow, tail);
      });
    } else if (hairType === 'afro') {
      // Multi-puff voluminous disco afro
      const mainPuff = new THREE.Mesh(new THREE.SphereGeometry(0.49, 20, 18), hairMat);
      mainPuff.position.set(0, 0.24, -0.03);
      this.headGroup.add(mainPuff);
      const subPositions = [
        [-0.28, 0.28, 0.12], [0.28, 0.28, 0.12],
        [0, 0.42, 0.14], [-0.24, 0.38, -0.18], [0.24, 0.38, -0.18]
      ];
      subPositions.forEach(([px, py, pz]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), hairMat);
        puff.position.set(px, py, pz);
        this.headGroup.add(puff);
      });
    } else if (hairType === 'pompadour') {
      // Classic delinquent sculpted pompadour roll
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.56, 14), hairMat);
      roll.rotation.z = Math.PI / 2;
      roll.scale.set(1.0, 0.85, 1.5);
      roll.position.set(0, 0.34, 0.22);
      this.headGroup.add(roll);
    } else if (hairType === 'helmet') {
      const helmetMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.25, metalness: 0.15 });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.41, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54),
        helmetMat
      );
      dome.position.set(0, 0.12, 0);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.45, 0.05, 20), helmetMat);
      brim.scale.set(1, 1, 1.18);
      brim.position.set(0, 0.14, 0.05);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.65), helmetMat);
      ridge.position.set(0, 0.48, 0);
      this.headGroup.add(dome, brim, ridge);
    } else if (hairType === 'crown') {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.85, roughness: 0.15 });
      const gemMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.23, 0.22, 12), goldMat);
      baseRing.position.set(0, 0.4, 0);
      this.headGroup.add(baseRing);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 4), goldMat);
        point.position.set(Math.cos(ang) * 0.22, 0.54, Math.sin(ang) * 0.22);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), gemMat);
        gem.position.set(Math.cos(ang) * 0.25, 0.39, Math.sin(ang) * 0.25);
        this.headGroup.add(point, gem);
      }
    }
  }

  buildStatusAttachments() {
    // 1. Ice Freeze Shell
    const iceGeo = new THREE.BoxGeometry(1.1, 2.05, 1.1);
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.5,
      roughness: 0.12
    });
    this.iceBlock = new THREE.Mesh(iceGeo, iceMat);
    this.iceBlock.position.y = 1.0;
    this.iceBlock.visible = false;
    this.group.add(this.iceBlock);

    // 2. Time Bomb above head
    this.bombGroup = new THREE.Group();
    const bombBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.25, metalness: 0.6 })
    );
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    spark.position.y = 0.3;
    this.bombSpark = spark;
    this.bombGroup.add(bombBall, spark);
    this.bombGroup.position.set(0, 2.32, 0);
    this.bombGroup.visible = false;
    this.group.add(this.bombGroup);

    // 3. Ghost Aura Cone
    const ghostGeo = new THREE.ConeGeometry(0.5, 1.35, 14);
    ghostGeo.rotateX(Math.PI);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.55
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
    this.labelSprite.scale.set(2.4, 0.9, 1);
    this.labelSprite.position.set(0, 2.52, 0);
    this.labelSprite.renderOrder = 999;
    this.labelSprite.visible = this.showNameplate;
    this.group.add(this.labelSprite);

    this.refreshOverheadLabel();
  }

  refreshOverheadLabel() {
    if (!this.labelCtx) return;
    const ctx = this.labelCtx;
    ctx.clearRect(0, 0, 256, 96);

    ctx.fillStyle = this.isGhost
      ? 'rgba(88, 28, 135, 0.84)'
      : this.isLocal
      ? 'rgba(15, 23, 42, 0.88)'
      : 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    const rx = 18, ry = 8, rw = 220, rh = 74, rr = 16;
    ctx.moveTo(rx + rr, ry);
    ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
    ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
    ctx.arcTo(rx, ry + rh, rx, ry, rr);
    ctx.arcTo(rx, ry, rx + rw, ry, rr);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = this.isGhost ? '#c084fc' : this.isLocal ? '#4ade80' : '#38bdf8';
    ctx.stroke();

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
      this.dropRing.position.y = -dist + 0.04;
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
    // Natural eye blinking animation
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2.6 + Math.random() * 2.4;
    }
    const isBlinking = this.blinkTimer < 0.13;
    this.eyeGroups.forEach((eg) => {
      eg.scale.y = isBlinking ? 0.12 : 1.0;
    });

    // Squish bounce recovery
    if (this.squishTimer > 0) {
      this.squishTimer = Math.max(0, this.squishTimer - dt);
      this.bodyRoot.scale.set(1.38, 0.46, 1.38);
    } else if (!this.isGhost) {
      this.bodyRoot.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 14));
    }

    this.iceBlock.visible = this.frozenTimer > 0 && !this.isGhost;
    if (this.frozenTimer > 0) {
      this.frozenTimer = Math.max(0, this.frozenTimer - dt);
    }

    this.bombGroup.visible = this.hasBomb && !this.isGhost;
    if (this.hasBomb) {
      const pulse = 1 + Math.sin(performance.now() * 0.028) * 0.25;
      this.bombSpark.scale.setScalar(pulse);
    }

    if (this.isGhost) {
      this.bodyRoot.position.y = 0.2 + Math.sin(performance.now() * 0.007) * 0.16;
      this.ghostTail.rotation.y += dt * 3.5;
      return;
    }

    if (this.punchAnimTimer > 0) {
      this.punchAnimTimer = Math.max(0, this.punchAnimTimer - dt);
      this.rightArm.rotation.x = -Math.PI * 0.68;
      this.leftArm.rotation.x = -Math.PI * 0.45;
    } else if (!isGrounded) {
      this.bodyRoot.position.y = 0;
      this.leftArm.rotation.x = -Math.PI * 0.75;
      this.rightArm.rotation.x = -Math.PI * 0.75;
      this.leftLeg.rotation.x = 0.42;
      this.rightLeg.rotation.x = -0.42;
    } else if (isMoving) {
      this.walkCycle += dt * 18;
      const swing = Math.sin(this.walkCycle) * 0.75;
      this.bodyRoot.position.y = Math.abs(Math.cos(this.walkCycle)) * 0.06;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.85;
      this.rightArm.rotation.x = swing * 0.85;
    } else {
      // Subtle breathing idle motion
      const breathe = Math.sin(performance.now() * 0.004) * 0.03;
      this.bodyRoot.position.y = Math.max(0, breathe);
      this.leftLeg.rotation.x *= 0.8;
      this.rightLeg.rotation.x *= 0.8;
      this.leftArm.rotation.x = Math.sin(performance.now() * 0.003) * 0.06;
      this.rightArm.rotation.x = -Math.sin(performance.now() * 0.003) * 0.06;
      this.leftArm.rotation.z = 0.1;
      this.rightArm.rotation.z = -0.1;
    }
  }
}

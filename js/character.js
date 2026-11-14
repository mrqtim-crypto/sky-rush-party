import * as THREE from 'three';

export const POSE_LIST = [
  { id: 'stand', name: '標準站姿', icon: '🧍', desc: '一般站立與移動姿勢' },
  { id: 'ball', name: '縮頭球體', icon: '⚽', desc: '縮成圓球（融入阻尼器球、石頭、燈球）' },
  { id: 'cone', name: '尖塔三角錐', icon: '⚠️', desc: '雙手合十尖頂（融入三角錐、車柱、欄杆）' },
  { id: 'box', name: '方塊抱膝蹲', icon: '📦', desc: '折成方箱（融入變電箱、垃圾桶、舞台音箱）' },
  { id: 'flat', name: '極限平板趴', icon: '➖', desc: '完全攤平貼地（融入斑馬線、地磚、水池底）' },
  { id: 'corner', name: 'L型直角折', icon: '📐', desc: '90度折腰（融入公園長椅、階梯、LOVE轉角）' },
  { id: 'wall', name: '壁虎貼牆姿', icon: '🦎', desc: '扁平貼壁（融入紀念館大柱、101玻璃牆）' },
  { id: 'guard', name: '衛兵敬禮姿', icon: '💂', desc: '立正敬禮不動（混入國父紀念館禮兵台）' },
  { id: 'bboy', name: '街舞Freeze', icon: '🤸', desc: '單手倒立定格（混入迴廊街舞少年雕像）' }
];

// Create crisp name tag sprite above character (Hidden for enemies when Chameleon is hidden!)
function createNameSprite(name, role = 'chameleon') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = role === 'hunter' ? 'rgba(220, 38, 38, 0.85)' : 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(18, 10, 220, 44, 22);
  ctx.fill();

  ctx.strokeStyle = role === 'hunter' ? '#fca5a5' : '#38bdf8';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = 'bold 24px "Segoe UI", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const prefix = role === 'hunter' ? '🩴 ' : '';
  ctx.fillText((prefix + name).slice(0, 10), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.set(0, 2.75, 0);
  return sprite;
}

// Build iconic 3D Taiwanese Blue-and-White Slipper (國民藍白拖)
function createBlueWhiteSlipperMesh() {
  const group = new THREE.Group();

  // Sole (Blue bottom, white top layer)
  const soleBlueGeo = new THREE.BoxGeometry(0.46, 0.08, 1.05);
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });

  const soleBlue = new THREE.Mesh(soleBlueGeo, blueMat);
  soleBlue.position.set(0, 0, 0.35);
  group.add(soleBlue);

  const soleWhiteGeo = new THREE.BoxGeometry(0.44, 0.05, 1.02);
  const soleWhite = new THREE.Mesh(soleWhiteGeo, whiteMat);
  soleWhite.position.set(0, 0.05, 0.35);
  group.add(soleWhite);

  // Classic White & Blue Straps across instep
  const strapGeo = new THREE.TorusGeometry(0.21, 0.065, 8, 16, Math.PI);
  const strap1 = new THREE.Mesh(strapGeo, whiteMat);
  strap1.rotation.y = Math.PI * 0.5;
  strap1.position.set(0, 0.07, 0.22);
  group.add(strap1);

  const strap2 = new THREE.Mesh(strapGeo, blueMat);
  strap2.rotation.y = Math.PI * 0.5;
  strap2.position.set(0, 0.07, 0.48);
  group.add(strap2);

  return group;
}

export class ChameleonAvatar {
  constructor(name = '變色龍', role = 'chameleon') {
    this.name = name;
    this.role = role; // 'chameleon' | 'hunter'
    this.poseId = 'stand';
    this.tiltAngle = 0; // Pitch tilt in radians (-PI/2 to PI/2)
    this.isMoving = false;
    this.walkPhase = 0;
    this.swingTimer = 0;
    this.stunnedTimer = 0;

    // 6 Body Parts Colors & Roughness:
    // [0:Head, 1:Chest, 2:Belly, 3:Arms, 4:Thighs, 5:Calves]
    this.partColors = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];
    this.partRoughness = [0.35, 0.35, 0.35, 0.35, 0.35, 0.35];
    this.partMetalness = [0.05, 0.05, 0.05, 0.05, 0.05, 0.05];

    this.root = new THREE.Group();
    this.posePivot = new THREE.Group();
    this.root.add(this.posePivot);

    // Create 6 independent materials for the 6 body segments
    this.partMaterials = [];
    for (let i = 0; i < 6; i++) {
      this.partMaterials.push(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.35,
          metalness: 0.05
        })
      );
    }

    this.buildBodyMeshes();
    this.buildHunterGear();

    this.nameSprite = createNameSprite(this.name, this.role);
    this.root.add(this.nameSprite);

    this.setRole(this.role);
    this.applyPose('stand');
  }

  buildBodyMeshes() {
    // 0: Head
    this.headGroup = new THREE.Group();
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 16), this.partMaterials[0]);
    headMesh.scale.set(0.95, 1.08, 0.95);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);
    this.posePivot.add(this.headGroup);

    // 1: Chest (Upper Torso)
    this.chestGroup = new THREE.Group();
    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.38), this.partMaterials[1]);
    chestMesh.castShadow = true;
    this.chestGroup.add(chestMesh);
    this.posePivot.add(this.chestGroup);

    // 2: Belly (Lower Torso / Pelvis)
    this.bellyGroup = new THREE.Group();
    const bellyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.36), this.partMaterials[2]);
    bellyMesh.castShadow = true;
    this.bellyGroup.add(bellyMesh);
    this.posePivot.add(this.bellyGroup);

    // 3: Arms (Left & Right)
    this.leftArm = new THREE.Group();
    const lArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.48, 8, 12), this.partMaterials[3]);
    lArmMesh.position.y = -0.24;
    lArmMesh.castShadow = true;
    this.leftArm.add(lArmMesh);
    this.posePivot.add(this.leftArm);

    this.rightArm = new THREE.Group();
    const rArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.48, 8, 12), this.partMaterials[3]);
    rArmMesh.position.y = -0.24;
    rArmMesh.castShadow = true;
    this.rightArm.add(rArmMesh);
    this.posePivot.add(this.rightArm);

    // 4: Thighs (Left & Right Upper Legs)
    this.leftThigh = new THREE.Group();
    const lThighMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.32, 8, 12), this.partMaterials[4]);
    lThighMesh.position.y = -0.18;
    lThighMesh.castShadow = true;
    this.leftThigh.add(lThighMesh);
    this.posePivot.add(this.leftThigh);

    this.rightThigh = new THREE.Group();
    const rThighMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.32, 8, 12), this.partMaterials[4]);
    rThighMesh.position.y = -0.18;
    rThighMesh.castShadow = true;
    this.rightThigh.add(rThighMesh);
    this.posePivot.add(this.rightThigh);

    // 5: Calves (Left & Right Lower Legs)
    this.leftCalf = new THREE.Group();
    const lCalfMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.32, 8, 12), this.partMaterials[5]);
    lCalfMesh.position.y = -0.18;
    lCalfMesh.castShadow = true;
    this.leftCalf.add(lCalfMesh);
    this.posePivot.add(this.leftCalf);

    this.rightCalf = new THREE.Group();
    const rCalfMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.32, 8, 12), this.partMaterials[5]);
    rCalfMesh.position.y = -0.18;
    rCalfMesh.castShadow = true;
    this.rightCalf.add(rCalfMesh);
    this.posePivot.add(this.rightCalf);
  }

  buildHunterGear() {
    this.hunterGear = new THREE.Group();

    // Red Hunter Headband on Head
    const bandGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.12, 18);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
    this.headband = new THREE.Mesh(bandGeo, redMat);
    this.headband.position.set(0, 0.1, 0);
    this.headGroup.add(this.headband);

    // Hunter Eyes
    const eyeGeo = new THREE.SphereGeometry(0.055, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
    this.leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.leftEye.position.set(-0.11, 0.02, 0.29);
    this.rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    this.rightEye.position.set(0.11, 0.02, 0.29);
    this.headGroup.add(this.leftEye, this.rightEye);

    // Giant Blue-and-White Slipper attached to Right Arm
    this.slipperWeapon = createBlueWhiteSlipperMesh();
    this.slipperWeapon.position.set(0, -0.52, 0.15);
    this.slipperWeapon.rotation.x = Math.PI * 0.25;
    this.slipperWeapon.scale.set(1.45, 1.45, 1.45);
    this.rightArm.add(this.slipperWeapon);

    // Dizzy Stars for 4-second Wrong-Hit Penalty
    this.stunStars = new THREE.Group();
    const starGeo = new THREE.OctahedronGeometry(0.12, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(starGeo, starMat);
      const angle = (i / 4) * Math.PI * 2;
      s.position.set(Math.cos(angle) * 0.55, 2.35, Math.sin(angle) * 0.55);
      this.stunStars.add(s);
    }
    this.stunStars.visible = false;
    this.root.add(this.stunStars);
  }

  setRole(role) {
    this.role = role;
    const isHunter = role === 'hunter';

    this.headband.visible = isHunter;
    this.leftEye.visible = isHunter;
    this.rightEye.visible = isHunter;
    this.slipperWeapon.visible = isHunter;

    if (isHunter) {
      // Hunter uniform colors (Taiwanese Patrol Uncle style)
      this.setAllParts([
        { color: '#fde68a', roughness: 0.4, metalness: 0.0 }, // Head skin
        { color: '#0284c7', roughness: 0.5, metalness: 0.1 }, // Blue patrol vest
        { color: '#1e293b', roughness: 0.6, metalness: 0.0 }, // Belt/Shorts
        { color: '#fde68a', roughness: 0.4, metalness: 0.0 }, // Arms
        { color: '#1e293b', roughness: 0.6, metalness: 0.0 }, // Thighs
        { color: '#38bdf8', roughness: 0.5, metalness: 0.0 }  // Slippers/Calves
      ]);
      this.applyPose('stand');
      this.setTilt(0);
    }

    // Rebuild name tag for new role
    if (this.nameSprite) {
      this.root.remove(this.nameSprite);
    }
    this.nameSprite = createNameSprite(this.name, this.role);
    this.root.add(this.nameSprite);
  }

  // Reset to 100% Pure White Chameleon at start of round
  resetToPureWhite() {
    const whiteParts = Array.from({ length: 6 }, () => ({
      color: '#ffffff',
      roughness: 0.32,
      metalness: 0.04
    }));
    this.setAllParts(whiteParts);
    this.applyPose('stand');
    this.setTilt(0);
  }

  setAllParts(partDataArray) {
    for (let i = 0; i < 6; i++) {
      const d = partDataArray[i] || partDataArray[0];
      if (!d) continue;
      this.partColors[i] = d.color || '#ffffff';
      this.partRoughness[i] = d.roughness !== undefined ? d.roughness : 0.4;
      this.partMetalness[i] = d.metalness !== undefined ? d.metalness : 0.05;

      this.partMaterials[i].color.set(this.partColors[i]);
      this.partMaterials[i].roughness = this.partRoughness[i];
      this.partMaterials[i].metalness = this.partMetalness[i];
    }
  }

  setSingleColor(hexColor, roughness = 0.45, metalness = 0.05) {
    const arr = Array.from({ length: 6 }, () => ({
      color: hexColor,
      roughness,
      metalness
    }));
    this.setAllParts(arr);
  }

  // Return world-space center coordinates of each of the 6 body parts for Surroundings Auto-Blend Raycasting
  getPartWorldCenters() {
    this.root.updateMatrixWorld(true);
    const groups = [
      this.headGroup,
      this.chestGroup,
      this.bellyGroup,
      this.leftArm,
      this.leftThigh,
      this.leftCalf
    ];
    return groups.map((g) => {
      const v = new THREE.Vector3();
      g.getWorldPosition(v);
      return v;
    });
  }

  setTilt(radians) {
    this.tiltAngle = Math.max(-Math.PI * 0.5, Math.min(Math.PI * 0.5, radians));
    this.posePivot.rotation.x = this.tiltAngle;
  }

  // Transform the 6 body segments to break humanoid silhouette!
  applyPose(poseId) {
    this.poseId = poseId || 'stand';

    // Reset defaults first
    const parts = [
      this.headGroup,
      this.chestGroup,
      this.bellyGroup,
      this.leftArm,
      this.rightArm,
      this.leftThigh,
      this.rightThigh,
      this.leftCalf,
      this.rightCalf
    ];
    parts.forEach((p) => {
      p.position.set(0, 0, 0);
      p.rotation.set(0, 0, 0);
      p.scale.set(1, 1, 1);
    });

    switch (this.poseId) {
      case 'ball':
        // 1. 縮頭球體姿：捲成一顆緊密圓球（適合阻尼器球、花圃石頭、燈飾）
        this.chestGroup.position.set(0, 0.52, 0);
        this.chestGroup.scale.set(1.15, 1.15, 1.25);
        this.bellyGroup.position.set(0, 0.36, 0.05);
        this.bellyGroup.scale.set(1.15, 1.1, 1.25);
        this.headGroup.position.set(0, 0.56, 0.12);
        this.headGroup.scale.set(1.2, 1.1, 1.2);
        this.leftArm.position.set(-0.28, 0.58, 0.1);
        this.leftArm.rotation.set(0.8, 0, -0.5);
        this.rightArm.position.set(0.28, 0.58, 0.1);
        this.rightArm.rotation.set(0.8, 0, 0.5);
        this.leftThigh.position.set(-0.2, 0.35, -0.1);
        this.leftThigh.rotation.set(1.4, 0, 0);
        this.rightThigh.position.set(0.2, 0.35, -0.1);
        this.rightThigh.rotation.set(1.4, 0, 0);
        this.leftCalf.position.set(-0.18, 0.25, 0.15);
        this.leftCalf.rotation.set(-1.5, 0, 0);
        this.rightCalf.position.set(0.18, 0.25, 0.15);
        this.rightCalf.rotation.set(-1.5, 0, 0);
        break;

      case 'cone':
        // 2. 尖塔三角錐姿：上尖下寬（完美偽裝成交通三角錐、車柱）
        this.headGroup.position.set(0, 1.55, 0);
        this.headGroup.scale.set(0.62, 1.15, 0.62);
        this.leftArm.position.set(-0.12, 1.72, 0);
        this.leftArm.rotation.set(0, 0, -0.18);
        this.rightArm.position.set(0.12, 1.72, 0);
        this.rightArm.rotation.set(0, 0, 0.18);
        this.chestGroup.position.set(0, 1.12, 0);
        this.chestGroup.scale.set(0.78, 1.1, 0.85);
        this.bellyGroup.position.set(0, 0.68, 0);
        this.bellyGroup.scale.set(1.08, 1.1, 1.12);
        this.leftThigh.position.set(-0.26, 0.42, 0);
        this.leftThigh.scale.set(1.35, 1.0, 1.35);
        this.rightThigh.position.set(0.26, 0.42, 0);
        this.rightThigh.scale.set(1.35, 1.0, 1.35);
        this.leftCalf.position.set(-0.34, 0.15, 0);
        this.leftCalf.scale.set(1.6, 0.7, 1.6);
        this.rightCalf.position.set(0.34, 0.15, 0);
        this.rightCalf.scale.set(1.6, 0.7, 1.6);
        break;

      case 'box':
        // 3. 方塊抱膝蹲：正方體箱型（偽裝變電箱、垃圾桶、舞台音箱）
        this.chestGroup.position.set(0, 0.78, 0);
        this.chestGroup.scale.set(1.25, 1.15, 1.35);
        this.bellyGroup.position.set(0, 0.34, 0);
        this.bellyGroup.scale.set(1.32, 1.15, 1.42);
        this.headGroup.position.set(0, 0.82, 0);
        this.headGroup.scale.set(0.85, 0.65, 0.85);
        this.leftArm.position.set(-0.38, 0.78, 0);
        this.rightArm.position.set(0.38, 0.78, 0);
        this.leftThigh.position.set(-0.26, 0.42, 0.16);
        this.rightThigh.position.set(0.26, 0.42, 0.16);
        this.leftCalf.position.set(-0.26, 0.24, -0.16);
        this.rightCalf.position.set(0.26, 0.24, -0.16);
        break;

      case 'flat':
        // 4. 極限平板趴：完全貼平地面（融入斑馬線、地磚、水池底）
        this.headGroup.position.set(0, 0.1, 0.78);
        this.headGroup.scale.set(1.1, 0.32, 1.1);
        this.chestGroup.position.set(0, 0.1, 0.32);
        this.chestGroup.scale.set(1.2, 0.28, 1.25);
        this.bellyGroup.position.set(0, 0.1, -0.16);
        this.bellyGroup.scale.set(1.18, 0.28, 1.25);
        this.leftArm.position.set(-0.42, 0.1, 0.45);
        this.leftArm.rotation.x = Math.PI * 0.5;
        this.leftArm.scale.set(1, 1, 0.35);
        this.rightArm.position.set(0.42, 0.1, 0.45);
        this.rightArm.rotation.x = Math.PI * 0.5;
        this.rightArm.scale.set(1, 1, 0.35);
        this.leftThigh.position.set(-0.22, 0.1, -0.45);
        this.leftThigh.rotation.x = Math.PI * 0.5;
        this.rightThigh.position.set(0.22, 0.1, -0.45);
        this.rightThigh.rotation.x = Math.PI * 0.5;
        this.leftCalf.position.set(-0.22, 0.1, -0.85);
        this.leftCalf.rotation.x = Math.PI * 0.5;
        this.rightCalf.position.set(0.22, 0.1, -0.85);
        this.rightCalf.rotation.x = Math.PI * 0.5;
        break;

      case 'corner':
        // 5. L型直角折腰：90度直角（卡進公園長椅、階梯、LOVE字母轉角）
        this.headGroup.position.set(0, 1.18, -0.25);
        this.chestGroup.position.set(0, 0.85, -0.25);
        this.chestGroup.scale.set(1.2, 1.0, 0.7);
        this.bellyGroup.position.set(0, 0.52, -0.12);
        this.leftArm.position.set(-0.38, 0.52, 0.2);
        this.leftArm.rotation.x = Math.PI * 0.5;
        this.rightArm.position.set(0.38, 0.52, 0.2);
        this.rightArm.rotation.x = Math.PI * 0.5;
        this.leftThigh.position.set(-0.22, 0.48, 0.28);
        this.leftThigh.rotation.x = Math.PI * 0.5;
        this.rightThigh.position.set(0.22, 0.48, 0.28);
        this.rightThigh.rotation.x = Math.PI * 0.5;
        this.leftCalf.position.set(-0.22, 0.38, 0.48);
        this.rightCalf.position.set(0.22, 0.38, 0.48);
        break;

      case 'wall':
        // 6. 壁虎貼牆姿：極度扁平垂直貼牆（融入紀念館大柱、玻璃帷幕、海報看板）
        this.headGroup.position.set(0, 1.65, -0.15);
        this.headGroup.scale.set(1.1, 1.1, 0.32);
        this.chestGroup.position.set(0, 1.22, -0.15);
        this.chestGroup.scale.set(1.25, 1.1, 0.28);
        this.bellyGroup.position.set(0, 0.78, -0.15);
        this.bellyGroup.scale.set(1.2, 1.1, 0.28);
        this.leftArm.position.set(-0.55, 1.45, -0.15);
        this.leftArm.rotation.z = -0.85;
        this.leftArm.scale.set(1, 1, 0.32);
        this.rightArm.position.set(0.55, 1.45, -0.15);
        this.rightArm.rotation.z = 0.85;
        this.rightArm.scale.set(1, 1, 0.32);
        this.leftThigh.position.set(-0.28, 0.55, -0.15);
        this.leftThigh.scale.set(1, 1, 0.32);
        this.rightThigh.position.set(0.28, 0.55, -0.15);
        this.rightThigh.scale.set(1, 1, 0.32);
        this.leftCalf.position.set(-0.32, 0.22, -0.15);
        this.leftCalf.scale.set(1, 1, 0.32);
        this.rightCalf.position.set(0.32, 0.22, -0.15);
        this.rightCalf.scale.set(1, 1, 0.32);
        break;

      case 'guard':
        // 7. 衛兵立正敬禮姿（混入國父紀念館禮兵台、百貨模特兒）
        this.headGroup.position.set(0, 1.72, 0);
        this.chestGroup.position.set(0, 1.26, 0);
        this.bellyGroup.position.set(0, 0.82, 0);
        this.leftArm.position.set(-0.42, 1.42, 0);
        this.rightArm.position.set(0.42, 1.48, 0.12);
        this.rightArm.rotation.set(-2.3, 0, -0.45); // Salute!
        this.leftThigh.position.set(-0.15, 0.62, 0);
        this.rightThigh.position.set(0.15, 0.62, 0);
        this.leftCalf.position.set(-0.15, 0.28, 0);
        this.rightCalf.position.set(0.15, 0.28, 0);
        break;

      case 'bboy':
        // 8. 街舞單手倒立 Freeze（混入國父紀念館迴廊街舞少年）
        this.headGroup.position.set(0, 0.42, 0);
        this.chestGroup.position.set(0, 0.78, 0);
        this.chestGroup.rotation.z = 0.25;
        this.bellyGroup.position.set(0.1, 1.18, 0);
        this.bellyGroup.rotation.z = 0.35;
        this.leftArm.position.set(-0.22, 0.55, 0);
        this.leftArm.rotation.z = 0.1;
        this.rightArm.position.set(0.48, 0.95, 0);
        this.rightArm.rotation.z = 1.9;
        this.leftThigh.position.set(-0.15, 1.55, 0);
        this.leftThigh.rotation.z = 2.5;
        this.rightThigh.position.set(0.45, 1.52, 0);
        this.rightThigh.rotation.z = -2.2;
        this.leftCalf.position.set(-0.45, 1.85, 0);
        this.leftCalf.rotation.z = 2.5;
        this.rightCalf.position.set(0.75, 1.82, 0);
        this.rightCalf.rotation.z = -2.2;
        break;

      case 'stand':
      default:
        // 標準人形站立
        this.headGroup.position.set(0, 1.68, 0);
        this.chestGroup.position.set(0, 1.22, 0);
        this.bellyGroup.position.set(0, 0.80, 0);
        this.leftArm.position.set(-0.44, 1.42, 0);
        this.rightArm.position.set(0.44, 1.42, 0);
        this.leftThigh.position.set(-0.18, 0.60, 0);
        this.rightThigh.position.set(0.18, 0.60, 0);
        this.leftCalf.position.set(-0.18, 0.28, 0);
        this.rightCalf.position.set(0.18, 0.28, 0);
        break;
    }
  }

  triggerSlipperSwing() {
    this.swingTimer = 0.36;
  }

  update(dt, isMoving = false) {
    this.isMoving = isMoving;

    // Stunned spinning stars animation (when Hunter hits wrong prop)
    if (this.stunnedTimer > 0) {
      this.stunnedTimer = Math.max(0, this.stunnedTimer - dt);
      this.stunStars.visible = true;
      this.stunStars.rotation.y += dt * 6.5;
    } else {
      this.stunStars.visible = false;
    }

    // Running leg/arm swing when moving in stand pose (or Hunter chasing)
    if (isMoving && (this.poseId === 'stand' || this.role === 'hunter')) {
      this.walkPhase += dt * 11;
      const swing = Math.sin(this.walkPhase) * 0.55;
      this.leftThigh.rotation.x = swing;
      this.rightThigh.rotation.x = -swing;
      this.leftCalf.rotation.x = swing * 0.6;
      this.rightCalf.rotation.x = -swing * 0.6;
      this.leftArm.rotation.x = -swing * 0.7;
      if (this.swingTimer <= 0) {
        this.rightArm.rotation.x = swing * 0.7;
      }
    } else if (this.poseId === 'stand') {
      this.leftThigh.rotation.x = 0;
      this.rightThigh.rotation.x = 0;
      this.leftCalf.rotation.x = 0;
      this.rightCalf.rotation.x = 0;
      this.leftArm.rotation.x = 0;
      if (this.swingTimer <= 0) {
        this.rightArm.rotation.x = 0;
      }
    }

    // Blue-White Slipper Smash Animation
    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      const t = 1 - this.swingTimer / 0.36;
      const arc = Math.sin(t * Math.PI);
      this.rightArm.rotation.x = -Math.PI * 0.85 * arc;
      this.rightArm.rotation.z = -0.25 * arc;
    }
  }

  serializeAppearance() {
    return {
      role: this.role,
      poseId: this.poseId,
      tiltAngle: Number(this.tiltAngle.toFixed(2)),
      colors: this.partColors,
      roughness: this.partRoughness,
      metalness: this.partMetalness
    };
  }

  applyRemoteAppearance(data) {
    if (!data) return;
    if (data.role && data.role !== this.role) {
      this.setRole(data.role);
    }
    if (data.poseId && data.poseId !== this.poseId) {
      this.applyPose(data.poseId);
    }
    if (data.tiltAngle !== undefined) {
      this.setTilt(data.tiltAngle);
    }
    if (Array.isArray(data.colors) && data.colors.length === 6) {
      const partData = data.colors.map((c, idx) => ({
        color: c,
        roughness: Array.isArray(data.roughness) ? data.roughness[idx] : 0.4,
        metalness: Array.isArray(data.metalness) ? data.metalness[idx] : 0.05
      }));
      this.setAllParts(partData);
    }
  }
}

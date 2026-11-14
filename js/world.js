import * as THREE from 'three';

export class LandmarkWorld {
  constructor(scene) {
    this.scene = scene;
    this.mapId = 'taipei101';
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.paintableMeshes = []; // Meshes that can be sampled by Eyedropper / Auto-Camo
    this.decoyPropMeshes = []; // Real scene props that trigger Hunter's 4s wrong-hit penalty
    this.colliders = [];       // Simple circle/box colliders { x, z, r }
    this.hidingSpots = [];     // Curated spots for AI or quick hints { x, z, rotY, poseId, colors }
    this.fireworks = [];
    this.fountainParticles = null;
    this.hunterGateMesh = null;
  }

  clearWorld() {
    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children[0];
      this.worldGroup.remove(child);
    }
    this.paintableMeshes = [];
    this.decoyPropMeshes = [];
    this.colliders = [];
    this.hidingSpots = [];
    this.fireworks = [];
    this.hunterGateMesh = null;
  }

  registerMesh(mesh, hexColor, roughness = 0.5, metalness = 0.05, isDecoyProp = true) {
    mesh.userData.paintColor = hexColor;
    mesh.userData.roughness = roughness;
    mesh.userData.metalness = metalness;
    mesh.userData.isDecoyProp = isDecoyProp;
    this.paintableMeshes.push(mesh);
    if (isDecoyProp) {
      this.decoyPropMeshes.push(mesh);
    }
    return mesh;
  }

  makeMat(hexColor, roughness = 0.5, metalness = 0.05) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(hexColor),
      roughness,
      metalness
    });
  }

  buildMap(mapId = 'taipei101', seed = 12345) {
    this.clearWorld();
    this.mapId = mapId;

    if (mapId === 'sys_hall') {
      this.buildSunYatSenHall(seed);
    } else {
      this.buildTaipei101Plaza(seed);
    }

    this.buildHunterHoldingGate();
    this.buildFireworksSystem();
  }

  // ==================== MAP 1: 台北 101 跨年信義廣場 ====================
  buildTaipei101Plaza(seed) {
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.011);

    // 1. Main Plaza Ground (Xinyi District Tiled Plaza + Asphalt Road)
    const groundMat = this.makeMat('#334155', 0.85, 0.05);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(84, 84), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.registerMesh(ground, '#334155', 0.85, 0.05, false);
    this.worldGroup.add(ground);

    // Red Carpet Brick Walkway toward 101
    const walkwayMat = this.makeMat('#991b1b', 0.75, 0.05);
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 46), walkwayMat);
    walkway.position.set(0, 0.03, -4);
    walkway.receiveShadow = true;
    this.registerMesh(walkway, '#991b1b', 0.75, 0.05, false);
    this.worldGroup.add(walkway);

    // Xinyi Road Asphalt Strip & White Zebra Crossing (斑馬線)
    const roadMat = this.makeMat('#1e293b', 0.9, 0.02);
    const road = new THREE.Mesh(new THREE.BoxGeometry(76, 0.05, 10), roadMat);
    road.position.set(0, 0.025, 18);
    this.registerMesh(road, '#1e293b', 0.9, 0.02, false);
    this.worldGroup.add(road);

    const stripeMat = this.makeMat('#f8fafc', 0.6, 0.05);
    for (let i = -5; i <= 5; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 4.2), stripeMat);
      stripe.position.set(i * 2.1, 0.04, 18);
      this.registerMesh(stripe, '#f8fafc', 0.6, 0.05, false);
      this.worldGroup.add(stripe);
    }
    // Hiding spot on Zebra Crossing (Flat Plank!)
    this.hidingSpots.push({
      x: 4.2, z: 18, rotY: 0, poseId: 'flat',
      colors: ['#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc'],
      roughness: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]
    });

    // 2. Iconic Taipei 101 Skyscraper at North Edge (z = -32)
    this.buildTaipei101Tower(0, -32);

    // 3. Giant Red "LOVE" Sculpture on Green Hedge Base (West Plaza: x = -14, z = -4)
    this.buildLoveSculpture(-14, -4);

    // 4. YouBike 2.0 Station (East Sidewalk: x = 14, z = 8)
    this.buildYouBikeStation(14, 8);

    // 5. 101 Damper Baby (風阻尼器吉祥物) Golden Stage (East Plaza: x = 15, z = -8)
    this.buildDamperBabyStage(15, -8);

    // 6. Traffic Cone Array (紅白三角錐陣列)
    const coneCoords = [
      [-8, 12], [-6.2, 12], [-4.4, 12], // Leave [-2.6, 12] for a Chameleon!
      [6, 12], [7.8, 12], [9.6, 12],
      [-18, 6], [-18, 4], [18, -2], [18, -4]
    ];
    coneCoords.forEach(([cx, cz]) => this.buildTrafficCone(cx, cz));
    this.hidingSpots.push({
      x: -2.6, z: 12, rotY: 0, poseId: 'cone',
      colors: ['#ea580c', '#ea580c', '#f8fafc', '#ea580c', '#ea580c', '#1e293b'],
      roughness: [0.45, 0.45, 0.3, 0.45, 0.45, 0.8]
    });

    // 7. Taipei Dual-Color Trash Cans & Painted Transformer Boxes (分類垃圾桶與彩繪變電箱)
    const boxCoords = [
      [-7, 2], [7, 2], [-7, -12], [7, -12]
    ];
    boxCoords.forEach(([bx, bz], idx) => {
      if (idx % 2 === 0) {
        this.buildTaipeiTrashBins(bx, bz);
      } else {
        this.buildTransformerBox(bx, bz);
      }
    });
    this.hidingSpots.push({
      x: -8.3, z: 2, rotY: 0, poseId: 'box',
      colors: ['#0284c7', '#16a34a', '#16a34a', '#16a34a', '#334155', '#334155'],
      roughness: [0.4, 0.4, 0.4, 0.4, 0.7, 0.7]
    });

    // 8. Central Water Fountain (信義噴水池: x = 0, z = -4)
    this.buildPlazaFountain(0, -4);

    // 9. Outdoor Cafe Umbrellas & Night Market Sausage Cart (戶外咖啡座與烤香腸攤車)
    this.buildCafeZone(-15, -16);
    this.buildSausageCart(14, -18);

    // 10. Perimeter Flowerbeds & Benches
    this.buildPerimeterWallsAndBenches();
  }

  buildTaipei101Tower(x, z) {
    const tower = new THREE.Group();
    tower.position.set(x, 0, z);

    const glassMat = this.makeMat('#0d9488', 0.2, 0.65);
    const frameMat = this.makeMat('#38bdf8', 0.3, 0.5);
    const goldMat = this.makeMat('#eab308', 0.25, 0.8);

    // Base Podium
    const base = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 11), glassMat);
    base.position.y = 2.5;
    this.registerMesh(base, '#0d9488', 0.2, 0.65, true);
    tower.add(base);

    // 8 Bamboo Segments
    for (let i = 0; i < 8; i++) {
      const segY = 5 + i * 3.4;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 3.6, 3.3, 4), glassMat);
      seg.rotation.y = Math.PI / 4;
      seg.position.y = segY + 1.65;
      this.registerMesh(seg, '#0d9488', 0.2, 0.65, true);
      tower.add(seg);

      const rim = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.28, 6.8), frameMat);
      rim.position.y = segY + 3.3;
      this.registerMesh(rim, '#38bdf8', 0.3, 0.5, true);
      tower.add(rim);

      if (i === 1) {
        // Iconic Ancient Coin Emblem
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 18), goldMat);
        coin.rotation.x = Math.PI / 2;
        coin.position.set(0, segY + 1.5, 4.1);
        this.registerMesh(coin, '#eab308', 0.25, 0.8, true);
        tower.add(coin);
      }
    }

    // Spire
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.2, 8, 8), frameMat);
    spire.position.y = 36;
    tower.add(spire);

    this.worldGroup.add(tower);
    this.colliders.push({ x, z, r: 6.2 });
  }

  buildLoveSculpture(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Green Hedge Base
    const hedgeMat = this.makeMat('#15803d', 0.85, 0.02);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.75, 3.6), hedgeMat);
    hedge.position.y = 0.375;
    hedge.castShadow = true;
    this.registerMesh(hedge, '#15803d', 0.85, 0.02, true);
    group.add(hedge);

    // Red Metal LOVE blocks
    const redMat = this.makeMat('#dc2626', 0.3, 0.35);
    const blockPositions = [
      [-1.8, 1.6, 0, 0.6, 1.8, 0.8], // L vertical
      [-1.2, 0.95, 0, 1.2, 0.55, 0.8], // L horizontal
      [0.3, 1.6, 0, 1.5, 1.8, 0.8], // O block
      [2.0, 1.6, 0, 1.3, 1.8, 0.8]  // V/E block
    ];
    blockPositions.forEach(([bx, by, bz, w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), redMat);
      m.position.set(bx, by, bz);
      m.castShadow = true;
      this.registerMesh(m, '#dc2626', 0.3, 0.35, true);
      group.add(m);
    });

    this.worldGroup.add(group);
    this.colliders.push({ x, z, r: 2.5 });

    // Hiding spot right on the LOVE corner (Red upper body, Green lower body!)
    this.hidingSpots.push({
      x: x - 0.8, z: z + 1.1, rotY: 0, poseId: 'corner',
      colors: ['#dc2626', '#dc2626', '#dc2626', '#dc2626', '#15803d', '#15803d'],
      roughness: [0.3, 0.3, 0.3, 0.3, 0.85, 0.85]
    });
  }

  buildYouBikeStation(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const kioskMat = this.makeMat('#f59e0b', 0.35, 0.2);
    const frameMat = this.makeMat('#94a3b8', 0.4, 0.6);
    const wheelMat = this.makeMat('#1e293b', 0.7, 0.1);

    for (let i = 0; i < 5; i++) {
      const bz = (i - 2) * 2.1;
      // Dock Pillar
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.15, 0.32), frameMat);
      pillar.position.set(-1.1, 0.58, bz);
      this.registerMesh(pillar, '#94a3b8', 0.4, 0.6, true);
      group.add(pillar);

      const pillarTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.36), kioskMat);
      pillarTop.position.set(-1.1, 1.22, bz);
      this.registerMesh(pillarTop, '#f59e0b', 0.35, 0.2, true);
      group.add(pillarTop);

      // Leave dock #2 empty so a Chameleon can pretend to be a YouBike!
      if (i === 2) continue;

      // YouBike Body (Orange-Yellow frame + Black wheels)
      const bikeFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.28), kioskMat);
      bikeFrame.position.set(0, 0.65, bz);
      bikeFrame.castShadow = true;
      this.registerMesh(bikeFrame, '#f59e0b', 0.35, 0.2, true);
      group.add(bikeFrame);

      const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 14), wheelMat);
      w1.rotation.x = Math.PI / 2;
      w1.position.set(-0.5, 0.36, bz);
      this.registerMesh(w1, '#1e293b', 0.7, 0.1, true);
      group.add(w1);

      const w2 = w1.clone();
      w2.position.set(0.5, 0.36, bz);
      this.registerMesh(w2, '#1e293b', 0.7, 0.1, true);
      group.add(w2);
    }

    this.worldGroup.add(group);
    this.hidingSpots.push({
      x, z, rotY: Math.PI / 2, poseId: 'box',
      colors: ['#f59e0b', '#f59e0b', '#f59e0b', '#94a3b8', '#1e293b', '#1e293b'],
      roughness: [0.35, 0.35, 0.35, 0.4, 0.7, 0.7]
    });
  }

  buildDamperBabyStage(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Stage Base
    const stageMat = this.makeMat('#7c2d12', 0.6, 0.1);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.0, 0.5, 24), stageMat);
    stage.position.y = 0.25;
    this.registerMesh(stage, '#7c2d12', 0.6, 0.1, true);
    group.add(stage);

    // Giant Golden Wind Damper Sphere (風阻尼器金球)
    const goldMat = this.makeMat('#eab308', 0.22, 0.75);
    const damper = new THREE.Mesh(new THREE.SphereGeometry(1.45, 22, 18), goldMat);
    damper.position.set(0, 2.1, 0);
    damper.castShadow = true;
    this.registerMesh(damper, '#eab308', 0.22, 0.75, true);
    group.add(damper);

    // Mini Damper Baby Mascot Balls around the stage
    const mascotColors = ['#eab308', '#ef4444', '#38bdf8'];
    mascotColors.forEach((col, i) => {
      const angle = (i / 3) * Math.PI * 1.4 - 0.5;
      const mMat = this.makeMat(col, 0.3, 0.3);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), mMat);
      ball.position.set(Math.cos(angle) * 2.4, 0.95, Math.sin(angle) * 2.4);
      ball.castShadow = true;
      this.registerMesh(ball, col, 0.3, 0.3, true);
      group.add(ball);
    });

    this.worldGroup.add(group);
    this.colliders.push({ x, z, r: 1.6 });

    // Hiding spot as a Golden Damper Ball!
    this.hidingSpots.push({
      x: x - 1.8, z: z + 1.6, rotY: 0, poseId: 'ball',
      colors: ['#eab308', '#eab308', '#eab308', '#eab308', '#eab308', '#7c2d12'],
      roughness: [0.25, 0.25, 0.25, 0.25, 0.25, 0.6]
    });
  }

  buildTrafficCone(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const baseMat = this.makeMat('#1e293b', 0.8, 0.05);
    const orangeMat = this.makeMat('#ea580c', 0.4, 0.05);
    const whiteMat = this.makeMat('#f8fafc', 0.3, 0.1);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.75), baseMat);
    base.position.y = 0.07;
    this.registerMesh(base, '#1e293b', 0.8, 0.05, true);
    group.add(base);

    const lowerCone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.55, 14), orangeMat);
    lowerCone.position.y = 0.4;
    this.registerMesh(lowerCone, '#ea580c', 0.4, 0.05, true);
    group.add(lowerCone);

    const whiteBand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.32, 14), whiteMat);
    whiteBand.position.y = 0.82;
    this.registerMesh(whiteBand, '#f8fafc', 0.3, 0.1, true);
    group.add(whiteBand);

    const topCone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, 0.45, 14), orangeMat);
    topCone.position.y = 1.2;
    topCone.castShadow = true;
    this.registerMesh(topCone, '#ea580c', 0.4, 0.05, true);
    group.add(topCone);

    this.worldGroup.add(group);
  }

  buildTaipeiTrashBins(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const greenMat = this.makeMat('#16a34a', 0.45, 0.1);
    const blueMat = this.makeMat('#0284c7', 0.45, 0.1);

    const bin1 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.15, 0.65), greenMat);
    bin1.position.set(-0.42, 0.58, 0);
    bin1.castShadow = true;
    this.registerMesh(bin1, '#16a34a', 0.45, 0.1, true);
    group.add(bin1);

    const bin2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.15, 0.65), blueMat);
    bin2.position.set(0.42, 0.58, 0);
    bin2.castShadow = true;
    this.registerMesh(bin2, '#0284c7', 0.45, 0.1, true);
    group.add(bin2);

    this.worldGroup.add(group);
  }

  buildTransformerBox(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const baseMat = this.makeMat('#64748b', 0.8, 0.1);
    const greenBoxMat = this.makeMat('#059669', 0.5, 0.2);
    const stripeMat = this.makeMat('#facc15', 0.4, 0.1);

    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.0), baseMat);
    ped.position.y = 0.15;
    this.registerMesh(ped, '#64748b', 0.8, 0.1, true);
    group.add(ped);

    const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 0.88), greenBoxMat);
    box.position.y = 0.85;
    box.castShadow = true;
    this.registerMesh(box, '#059669', 0.5, 0.2, true);
    group.add(box);

    const warning = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 0.9), stripeMat);
    warning.position.y = 0.55;
    this.registerMesh(warning, '#facc15', 0.4, 0.1, true);
    group.add(warning);

    this.worldGroup.add(group);
  }

  buildPlazaFountain(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const rimMat = this.makeMat('#cbd5e1', 0.6, 0.1);
    const waterMat = this.makeMat('#0ea5e9', 0.15, 0.4);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.48, 28), rimMat);
    rim.position.y = 0.24;
    this.registerMesh(rim, '#cbd5e1', 0.6, 0.1, true);
    group.add(rim);

    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.42, 28), waterMat);
    water.position.y = 0.26;
    this.registerMesh(water, '#0ea5e9', 0.15, 0.4, false);
    group.add(water);

    this.worldGroup.add(group);
  }

  buildCafeZone(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const poleMat = this.makeMat('#e2e8f0', 0.4, 0.5);
    const umbrellaColors = ['#ec4899', '#8b5cf6'];

    for (let i = 0; i < 2; i++) {
      const ox = i * 5.2;
      const uCol = umbrellaColors[i % umbrellaColors.length];
      const uMat = this.makeMat(uCol, 0.5, 0.05);

      const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 16), poleMat);
      table.position.set(ox, 0.85, 0);
      this.registerMesh(table, '#e2e8f0', 0.4, 0.5, true);
      group.add(table);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 10), poleMat);
      pole.position.set(ox, 1.4, 0);
      this.registerMesh(pole, '#e2e8f0', 0.4, 0.5, true);
      group.add(pole);

      const top = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.85, 12), uMat);
      top.position.set(ox, 2.8, 0);
      top.castShadow = true;
      this.registerMesh(top, uCol, 0.5, 0.05, true);
      group.add(top);
    }

    this.worldGroup.add(group);
  }

  buildSausageCart(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const cartMat = this.makeMat('#dc2626', 0.5, 0.1);
    const signMat = this.makeMat('#fef08a', 0.4, 0.05);

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), cartMat);
    body.position.y = 0.65;
    body.castShadow = true;
    this.registerMesh(body, '#dc2626', 0.5, 0.1, true);
    group.add(body);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.2), signMat);
    sign.position.set(0, 1.9, 0);
    this.registerMesh(sign, '#fef08a', 0.4, 0.05, true);
    group.add(sign);

    this.worldGroup.add(group);
  }

  // ==================== MAP 2: 國父紀念館與翠湖迴廊 ====================
  buildSunYatSenHall(seed) {
    this.scene.background = new THREE.Color(0x1e293b);
    this.scene.fog = new THREE.FogExp2(0x1e293b, 0.011);

    // 1. Zhongshan Park Stone Ground
    const groundMat = this.makeMat('#475569', 0.85, 0.03);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(84, 84), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.registerMesh(ground, '#475569', 0.85, 0.03, false);
    this.worldGroup.add(ground);

    // Central White Granite Avenue
    const aveMat = this.makeMat('#cbd5e1', 0.75, 0.05);
    const ave = new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 48), aveMat);
    ave.position.set(0, 0.03, -4);
    this.registerMesh(ave, '#cbd5e1', 0.75, 0.05, false);
    this.worldGroup.add(ave);

    // 2. Iconic Sun Yat-sen Memorial Hall Main Palace (橘黃琉璃瓦飛簷 + 白牆大柱)
    this.buildMemorialHallBuilding(0, -30);

    // 3. Honor Guard Platform (禮兵交接台: x = 0, z = -15)
    this.buildHonorGuardPlatform(0, -15);

    // 4. West Corridor Street Dance Zone (迴廊街舞練舞鏡與音箱區: x = -15, z = -6)
    this.buildStreetDanceCorridor(-15, -6);

    // 5. East Emerald Lake & Koi Pond (翠湖錦鯉池與假山奇石: x = 15, z = -6)
    this.buildEmeraldLake(15, -6);

    // 6. Park Benches, Stone Lions & Traffic Cones
    const coneSpots = [[-8, 10], [-6, 10], [6, 10], [8, 10]];
    coneSpots.forEach(([cx, cz]) => this.buildTrafficCone(cx, cz));

    this.buildPerimeterWallsAndBenches();
  }

  buildMemorialHallBuilding(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const whiteWallMat = this.makeMat('#f8fafc', 0.65, 0.05);
    const roofGoldMat = this.makeMat('#d97706', 0.35, 0.25);
    const redDoorMat = this.makeMat('#991b1b', 0.5, 0.1);

    // Main White Hall Base
    const hall = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 12), whiteWallMat);
    hall.position.y = 4;
    this.registerMesh(hall, '#f8fafc', 0.65, 0.05, true);
    group.add(hall);

    // Grand White Pillars in Front
    for (let i = -3; i <= 3; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 8, 16), whiteWallMat);
      col.position.set(i * 3.6, 4, 6.8);
      col.castShadow = true;
      this.registerMesh(col, '#f8fafc', 0.65, 0.05, true);
      group.add(col);
    }

    // Palace Red Doors
    const door = new THREE.Mesh(new THREE.BoxGeometry(6, 5.5, 0.4), redDoorMat);
    door.position.set(0, 2.75, 6.1);
    this.registerMesh(door, '#991b1b', 0.5, 0.1, true);
    group.add(door);

    // Iconic Golden-Orange Curved Palace Roof (橘黃琉璃瓦屋頂)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(19, 5.5, 4), roofGoldMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 10.5;
    this.registerMesh(roof, '#d97706', 0.35, 0.25, true);
    group.add(roof);

    this.worldGroup.add(group);
    this.colliders.push({ x, z, r: 8 });

    // Hiding spot flattened against White Pillar
    this.hidingSpots.push({
      x: x + 3.6, z: z + 7.5, rotY: 0, poseId: 'wall',
      colors: ['#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc', '#cbd5e1'],
      roughness: [0.65, 0.65, 0.65, 0.65, 0.65, 0.75]
    });
  }

  buildHonorGuardPlatform(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const pedMat = this.makeMat('#991b1b', 0.6, 0.1);
    const guardUniformMat = this.makeMat('#1d4ed8', 0.4, 0.2);
    const helmetMat = this.makeMat('#e2e8f0', 0.2, 0.8);

    const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 2.6), pedMat);
    base.position.y = 0.2;
    this.registerMesh(base, '#991b1b', 0.6, 0.1, true);
    group.add(base);

    // Put a statue on the Left pedestal (-1.8), leave Right pedestal (+1.8) empty for a player in Guard Salute pose!
    const statueBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.35, 0.42), guardUniformMat);
    statueBody.position.set(-1.8, 1.08, 0);
    statueBody.castShadow = true;
    this.registerMesh(statueBody, '#1d4ed8', 0.4, 0.2, true);
    group.add(statueBody);

    const statueHead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), helmetMat);
    statueHead.position.set(-1.8, 1.98, 0);
    this.registerMesh(statueHead, '#e2e8f0', 0.2, 0.8, true);
    group.add(statueHead);

    this.worldGroup.add(group);
    this.hidingSpots.push({
      x: x + 1.8, z, rotY: 0, poseId: 'guard',
      colors: ['#e2e8f0', '#1d4ed8', '#1d4ed8', '#1d4ed8', '#1d4ed8', '#991b1b'],
      roughness: [0.2, 0.4, 0.4, 0.4, 0.4, 0.6]
    });
  }

  buildStreetDanceCorridor(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const mirrorMat = this.makeMat('#94a3b8', 0.1, 0.85);
    const speakerMat = this.makeMat('#18181b', 0.6, 0.2);
    const neonMat = this.makeMat('#a855f7', 0.3, 0.3);

    // Practice Wall Mirror
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 9.5), mirrorMat);
    mirror.position.set(-2.5, 1.6, 0);
    this.registerMesh(mirror, '#94a3b8', 0.1, 0.85, true);
    group.add(mirror);

    // Boombox Speakers
    for (let i = -1; i <= 1; i += 2) {
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.85), speakerMat);
      spk.position.set(-1.2, 0.55, i * 2.6);
      spk.castShadow = true;
      this.registerMesh(spk, '#18181b', 0.6, 0.2, true);
      group.add(spk);

      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 14), neonMat);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(-1.18, 0.65, i * 2.6);
      this.registerMesh(ring, '#a855f7', 0.3, 0.3, true);
      group.add(ring);
    }

    this.worldGroup.add(group);
    this.hidingSpots.push({
      x: x - 1.2, z, rotY: Math.PI / 2, poseId: 'box',
      colors: ['#18181b', '#a855f7', '#18181b', '#18181b', '#18181b', '#18181b'],
      roughness: [0.6, 0.3, 0.6, 0.6, 0.6, 0.6]
    });
  }

  buildEmeraldLake(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const waterMat = this.makeMat('#0d9488', 0.2, 0.3);
    const rockMat = this.makeMat('#15803d', 0.85, 0.05);
    const koiRedMat = this.makeMat('#ef4444', 0.3, 0.1);

    const pond = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.16, 24), waterMat);
    pond.position.y = 0.08;
    this.registerMesh(pond, '#0d9488', 0.2, 0.3, false);
    group.add(pond);

    // Mossy Rocks around Emerald Lake
    const rockOffsets = [
      [-3.5, 2.2], [3.2, -2.5], [2.8, 3.0], [-2.5, -3.2]
    ];
    rockOffsets.forEach(([rx, rz]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), rockMat);
      rock.position.set(rx, 0.55, rz);
      rock.castShadow = true;
      this.registerMesh(rock, '#15803d', 0.85, 0.05, true);
      group.add(rock);
    });

    // Giant Koi Fish in Pond
    const koi = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 8, 12), koiRedMat);
    koi.rotation.x = Math.PI / 2;
    koi.position.set(-1.2, 0.18, 0.5);
    this.registerMesh(koi, '#ef4444', 0.3, 0.1, true);
    group.add(koi);

    this.worldGroup.add(group);
    this.hidingSpots.push({
      x: x + 1.5, z: z - 0.8, rotY: 0.5, poseId: 'ball',
      colors: ['#15803d', '#15803d', '#15803d', '#15803d', '#0d9488', '#0d9488'],
      roughness: [0.85, 0.85, 0.85, 0.85, 0.2, 0.2]
    });
  }

  buildPerimeterWallsAndBenches() {
    const benchWoodMat = this.makeMat('#b45309', 0.7, 0.05);
    const benchLegMat = this.makeMat('#334155', 0.8, 0.2);

    const benchPositions = [
      [-10, 6, 0],
      [10, 6, 0],
      [-10, -10, 0],
      [10, -10, 0]
    ];

    benchPositions.forEach(([bx, bz, rot]) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);
      bGroup.rotation.y = rot;

      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.7), benchWoodMat);
      seat.position.set(0, 0.48, 0);
      seat.castShadow = true;
      this.registerMesh(seat, '#b45309', 0.7, 0.05, true);
      bGroup.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.15), benchWoodMat);
      back.position.set(0, 0.82, -0.28);
      back.castShadow = true;
      this.registerMesh(back, '#b45309', 0.7, 0.05, true);
      bGroup.add(back);

      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.65), benchLegMat);
      leg1.position.set(-0.95, 0.24, 0);
      this.registerMesh(leg1, '#334155', 0.8, 0.2, true);
      bGroup.add(leg1);

      const leg2 = leg1.clone();
      leg2.position.set(0.95, 0.24, 0);
      this.registerMesh(leg2, '#334155', 0.8, 0.2, true);
      bGroup.add(leg2);

      this.worldGroup.add(bGroup);
    });

    // Hiding spot on Park Bench using L-Corner pose!
    this.hidingSpots.push({
      x: -10, z: 6.05, rotY: 0, poseId: 'corner',
      colors: ['#b45309', '#b45309', '#b45309', '#b45309', '#334155', '#334155'],
      roughness: [0.7, 0.7, 0.7, 0.7, 0.8, 0.8]
    });
  }

  // Hunter Holding Zone at South Metro Exit (x = 0, z = 28) during 90-second Hide Phase
  buildHunterHoldingGate() {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, 28);

    const frameMat = this.makeMat('#0284c7', 0.4, 0.3);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.45, 5.5), frameMat);
    roof.position.y = 3.4;
    this.registerMesh(roof, '#0284c7', 0.4, 0.3, false);
    gateGroup.add(roof);

    // Translucent Laser Barrier that locks Hunters inside during first 90s
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide
    });
    this.hunterGateMesh = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.2, 0.15), barrierMat);
    this.hunterGateMesh.position.set(0, 1.6, -2.6);
    gateGroup.add(this.hunterGateMesh);

    this.worldGroup.add(gateGroup);
  }

  setHunterGateLocked(locked) {
    if (this.hunterGateMesh) {
      this.hunterGateMesh.visible = Boolean(locked);
    }
  }

  buildFireworksSystem() {
    const geo = new THREE.BufferGeometry();
    const count = 120;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 32;
      positions[i * 3 + 1] = 12 + Math.random() * 22;
      positions[i * 3 + 2] = -24 + (Math.random() - 0.5) * 16;

      const c = new THREE.Color().setHSL(Math.random(), 0.95, 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.65,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });

    this.fireworksPoints = new THREE.Points(geo, mat);
    this.fireworksPoints.visible = false;
    this.worldGroup.add(this.fireworksPoints);
  }

  update(dt, isFrenzy = false) {
    if (this.fireworksPoints) {
      this.fireworksPoints.visible = isFrenzy;
      if (isFrenzy) {
        this.fireworksPoints.rotation.y += dt * 0.45;
      }
    }
  }

  // ==================== SMART 6-PART SURROUNDINGS AUTO-CAMO ====================
  // Casts directional rays from each of the Chameleon's 6 body parts to sample adjacent walls/props/ground
  sampleSurroundingColorsForParts(partWorldCenters) {
    const raycaster = new THREE.Raycaster();
    raycaster.near = 0.01;
    raycaster.far = 3.8;

    const directions = [
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-0.7, -0.5, -0.7).normalize(),
      new THREE.Vector3(0.7, -0.5, 0.7).normalize()
    ];

    return partWorldCenters.map((center, partIdx) => {
      let bestHit = null;
      let bestDist = Infinity;

      // Prioritize horizontal prop hits for upper body parts, and downward hits for lower legs/flat poses
      for (let dIdx = 0; dIdx < directions.length; dIdx++) {
        const dir = directions[dIdx];
        raycaster.set(center, dir);
        const hits = raycaster.intersectObjects(this.paintableMeshes, false);
        if (hits.length > 0) {
          const h = hits[0];
          // Give slight priority to decorative props over flat floor if within 1.8m
          const isProp = Boolean(h.object.userData.isDecoyProp);
          const weightedDist = isProp ? h.distance * 0.55 : h.distance + (partIdx < 4 ? 0.6 : 0);
          if (weightedDist < bestDist) {
            bestDist = weightedDist;
            bestHit = h.object;
          }
        }
      }

      if (bestHit && bestHit.userData.paintColor) {
        return {
          color: bestHit.userData.paintColor,
          roughness: bestHit.userData.roughness ?? 0.5,
          metalness: bestHit.userData.metalness ?? 0.05
        };
      }

      // Fallback ground tone
      return {
        color: this.mapId === 'sys_hall' ? '#475569' : '#334155',
        roughness: 0.8,
        metalness: 0.05
      };
    });
  }
}

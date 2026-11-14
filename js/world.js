import * as THREE from 'three';

export class LandmarkWorld {
  constructor(scene) {
    this.scene = scene;
    this.mapId = 'taipei101';
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.paintableMeshes = []; // Meshes that can be sampled by Eyedropper / Auto-Camo
    this.decoyPropMeshes = []; // Real scene props that trigger Hunter's 4s wrong-hit penalty
    this.walkablePlatforms = []; // { minX, maxX, minZ, maxZ, minY, maxY, isRamp, rampDir }
    this.solidBoxes = [];        // { minX, maxX, minZ, maxZ, maxY } for maze wall sight-blockers
    this.hidingSpots = [];       // Curated spots for AI Chameleons { x, y, z, rotY, poseId, colors, roughness }
    this.movingVehicles = [];    // Dynamic buses / garbage trucks / mini-trains
    this.fireworksPoints = null;
    this.hunterGateMesh = null;
    this.matCache = new Map();
  }

  clearWorld() {
    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children[0];
      this.worldGroup.remove(child);
    }
    this.paintableMeshes = [];
    this.decoyPropMeshes = [];
    this.walkablePlatforms = [];
    this.solidBoxes = [];
    this.hidingSpots = [];
    this.movingVehicles = [];
    this.hunterGateMesh = null;
  }

  makeMat(hexColor, roughness = 0.5, metalness = 0.05) {
    const key = `${hexColor}_${roughness}_${metalness}`;
    if (this.matCache.has(key)) return this.matCache.get(key);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hexColor),
      roughness,
      metalness
    });
    this.matCache.set(key, mat);
    return mat;
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

  // Register an elevated walkable surface or ramp
  addPlatform(minX, maxX, minZ, maxZ, topY, isRamp = false, rampDir = 'x+', bottomY = 0) {
    this.walkablePlatforms.push({
      minX, maxX, minZ, maxZ, topY, bottomY, isRamp, rampDir
    });
  }

  // Register a solid wall/container collider that blocks horizontal walking unless player is above maxY
  addSolidBox(cx, cz, width, depth, maxY = 2.8) {
    this.solidBoxes.push({
      minX: cx - width / 2,
      maxX: cx + width / 2,
      minZ: cz - depth / 2,
      maxZ: cz + depth / 2,
      maxY
    });
  }

  // Compute ground/platform elevation at (x, z) given current player y
  getSurfaceHeightAt(x, z, currentY = 0) {
    let bestY = 0;

    for (let i = 0; i < this.walkablePlatforms.length; i++) {
      const p = this.walkablePlatforms[i];
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        let surfY = p.topY;
        if (p.isRamp) {
          let t = 0;
          if (p.rampDir === 'x+') t = (x - p.minX) / Math.max(0.01, p.maxX - p.minX);
          else if (p.rampDir === 'x-') t = (p.maxX - x) / Math.max(0.01, p.maxX - p.minX);
          else if (p.rampDir === 'z+') t = (z - p.minZ) / Math.max(0.01, p.maxZ - p.minZ);
          else if (p.rampDir === 'z-') t = (p.maxZ - z) / Math.max(0.01, p.maxZ - p.minZ);
          t = Math.max(0, Math.min(1, t));
          surfY = p.bottomY + t * (p.topY - p.bottomY);
        }
        // Player can step onto this surface if they are at/above it or within step-up tolerance (0.85m)
        if (currentY + 0.85 >= surfY && surfY > bestY) {
          bestY = surfY;
        }
      }
    }

    // Check moving vehicle tops too!
    for (let i = 0; i < this.movingVehicles.length; i++) {
      const v = this.movingVehicles[i];
      const vx = v.group.position.x;
      const vz = v.group.position.z;
      if (Math.abs(x - vx) <= v.halfW && Math.abs(z - vz) <= v.halfD) {
        if (currentY + 0.95 >= v.topY && v.topY > bestY) {
          bestY = v.topY;
        }
      }
    }

    return bestY;
  }

  // Resolve horizontal collision against solid maze walls/containers
  resolveHorizontalCollision(x, y, z, radius = 0.38) {
    let nx = x;
    let nz = z;

    for (let i = 0; i < this.solidBoxes.length; i++) {
      const b = this.solidBoxes[i];
      if (y >= b.maxY - 0.15) continue; // Player is on top of this container/platform!

      const closestX = Math.max(b.minX, Math.min(nx, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const dx = nx - closestX;
      const dz = nz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = radius - dist;
        nx += (dx / dist) * overlap;
        nz += (dz / dist) * overlap;
      }
    }

    return { x: nx, z: nz };
  }

  buildMap(mapId = 'taipei101', seed = 12345) {
    this.clearWorld();
    this.mapId = mapId;

    if (mapId === 'sys_hall') {
      this.buildSunYatSenHallDense(seed);
    } else {
      this.buildTaipei101PlazaDense(seed);
    }

    this.buildHunterHoldingGate();
    this.buildFireworksSystem();
  }

  // ============================================================================
  // MAP 1: 台北 101 信義商圈（高密度立體迷宮版：二樓空橋＋貨櫃市集＋機車海＋夾娃娃機＋搖滾區＋雙層巴士）
  // ============================================================================
  buildTaipei101PlazaDense(seed) {
    this.scene.background = new THREE.Color(0x0b1120);
    this.scene.fog = new THREE.FogExp2(0x0b1120, 0.0085);

    // 1. Base Plaza Ground + Multi-colored Tile Zones
    const groundMat = this.makeMat('#334155', 0.85, 0.05);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.registerMesh(ground, '#334155', 0.85, 0.05, false);
    this.worldGroup.add(ground);

    // Central Red Carpet VIP Boulevard
    const redCarpet = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.06, 52), this.makeMat('#991b1b', 0.75, 0.05));
    redCarpet.position.set(0, 0.03, -2);
    this.registerMesh(redCarpet, '#991b1b', 0.75, 0.05, false);
    this.worldGroup.add(redCarpet);

    // Xinyi Road (z = 19) with Bus Lanes & Double Zebra Crossings
    this.buildXinyiRoadAndCrossings(19);

    // 2. Iconic Taipei 101 Skyscraper & Mall Podium (z = -34)
    this.buildTaipei101Tower(0, -34);

    // 3. 🌉 信義商圈二樓百貨空橋系統 (2nd-Floor Skybridge Network at y = 3.4)
    this.buildXinyiSkybridgeSystem();

    // 4. 📦 西南區：信義文創貨櫃市集迷宮 (Container Market Maze Alley: x = -22..-8, z = 2..14)
    this.buildContainerMarketMaze(-16, 8);

    // 5. 🕹️ 東南區：台灣夾娃娃機店面迷宮＆彈珠台夜市街 (Claw Machine Arcade & Night Market Alley: x = 8..24, z = 2..14)
    this.buildClawMachineAndNightMarketMaze(16, 8);

    // 6. 🛵 信義路整排機車停車格海 (18 Scooters Row with Empty Camo Gaps!)
    this.buildScooterParkingRow(-18, 15.2, 10);
    this.buildScooterParkingRow(8, 15.2, 8);

    // 7. 🎤 跨年演唱會主舞台 ＆ 24人螢光棒觀眾搖滾區 (Concert Stage & Crowd Maze: x = 0, z = -18)
    this.buildConcertStageAndCrowd(0, -18);

    // 8. ❤️ 巨型 LOVE 雕塑花圃迷宮 (x = -14, z = -6) & 🟡 101 阻尼器金球快閃店 (x = 14, z = -6)
    this.buildLoveSculptureMaze(-14, -6);
    this.buildDamperBabyStage(14, -6);

    // 9. 🚲 擴充版 YouBike 2.0 租借大站 (10 車柱陣列) & 🚌 公車專用道候車亭
    this.buildYouBikeStation(23, -4, 8);
    this.buildBusShelter(-12, 16.2, '台北101/世貿站');
    this.buildBusShelter(12, 16.2, '信義商圈空橋站');

    // 10. 🚌 動態行駛車輛：台北紅色雙層觀光巴士 ＆ 台灣黃色環保垃圾車
    this.buildMovingSightseeingBus(-28, 19.2, 1);
    this.buildMovingGarbageTruck(28, 21.8, -1);

    // 11. 密集街景細節：三角錐陣列、台北市分類垃圾桶群、台電彩繪變電箱、郵筒、廣告燈箱柱
    this.scatterStreetFurnitureTaipei101();
  }

  buildXinyiRoadAndCrossings(roadZ) {
    const roadMat = this.makeMat('#1e293b', 0.9, 0.02);
    const road = new THREE.Mesh(new THREE.BoxGeometry(88, 0.05, 8.5), roadMat);
    road.position.set(0, 0.025, roadZ);
    this.registerMesh(road, '#1e293b', 0.9, 0.02, false);
    this.worldGroup.add(road);

    // Yellow Double Center Line
    const yellowMat = this.makeMat('#facc15', 0.5, 0.05);
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(86, 0.065, 0.35), yellowMat);
    centerLine.position.set(0, 0.035, roadZ);
    this.registerMesh(centerLine, '#facc15', 0.5, 0.05, false);
    this.worldGroup.add(centerLine);

    // Two Zebra Crossings (West x = -6..6, East x = 16..22)
    const stripeMat = this.makeMat('#f8fafc', 0.6, 0.05);
    for (let i = -4; i <= 4; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 7.6), stripeMat);
      stripe.position.set(i * 1.8, 0.04, roadZ);
      this.registerMesh(stripe, '#f8fafc', 0.6, 0.05, false);
      this.worldGroup.add(stripe);
    }
    this.hidingSpots.push({
      x: 3.6, y: 0, z: roadZ, rotY: 0, poseId: 'flat',
      colors: ['#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc', '#f8fafc'],
      roughness: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]
    });
  }

  // 🌉 信義商圈二樓百貨空橋系統 (2F Elevated Skybridge + Escalator Ramps + Glass Railings + Overhead Signs)
  buildXinyiSkybridgeSystem() {
    const bridgeY = 3.4;
    const deckMat = this.makeMat('#475569', 0.65, 0.2);
    const beamMat = this.makeMat('#0f172a', 0.5, 0.5);
    const glassMat = this.makeMat('#38bdf8', 0.15, 0.7);
    const neonPinkMat = this.makeMat('#ec4899', 0.25, 0.2);
    const neonAmberMat = this.makeMat('#f59e0b', 0.25, 0.2);

    // Main East-West Skybridge Deck spanning x = -24 to +24 at z = -11 (width 4.4m)
    const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(48, 0.35, 4.4), deckMat);
    mainDeck.position.set(0, bridgeY - 0.175, -11);
    mainDeck.castShadow = true;
    mainDeck.receiveShadow = true;
    this.registerMesh(mainDeck, '#475569', 0.65, 0.2, true);
    this.worldGroup.add(mainDeck);
    this.addPlatform(-24, 24, -13.2, -8.8, bridgeY, false);

    // North-South Connector Bridge on West (x = -22, z = -11 to +3) and East (x = 22, z = -11 to +3)
    [-22, 22].forEach((bx) => {
      const sideDeck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 14), deckMat);
      sideDeck.position.set(bx, bridgeY - 0.175, -4);
      sideDeck.castShadow = true;
      this.registerMesh(sideDeck, '#475569', 0.65, 0.2, true);
      this.worldGroup.add(sideDeck);
      this.addPlatform(bx - 2.1, bx + 2.1, -11, 3, bridgeY, false);

      // Escalator Ramps leading from z = 11 (y = 0) up to z = 3 (y = 3.4)!
      const rampLen = 8.8;
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, rampLen), beamMat);
      rampMesh.position.set(bx, bridgeY / 2, 7.0);
      rampMesh.rotation.x = Math.atan2(bridgeY, 8.0);
      this.registerMesh(rampMesh, '#0f172a', 0.5, 0.5, true);
      this.worldGroup.add(rampMesh);
      this.addPlatform(bx - 1.6, bx + 1.6, 3.0, 11.0, bridgeY, true, 'z-', 0);
    });

    // Central Stair/Ramp from Plaza Center (x = -3..3, z = -8.8 down to z = -2.5)
    const centerRamp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 6.8), neonAmberMat);
    centerRamp.position.set(0, bridgeY / 2, -5.6);
    centerRamp.rotation.x = Math.atan2(bridgeY, 6.3);
    this.registerMesh(centerRamp, '#f59e0b', 0.25, 0.2, true);
    this.worldGroup.add(centerRamp);
    this.addPlatform(-1.7, 1.7, -8.8, -2.5, bridgeY, true, 'z-', 0);

    // Skybridge Glass Railings & Colorful Advertising Panels (Great 2F Camouflage Spots!)
    for (let x = -20; x <= 20; x += 5) {
      const railN = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.05, 0.16), glassMat);
      railN.position.set(x, bridgeY + 0.52, -13.1);
      this.registerMesh(railN, '#38bdf8', 0.15, 0.7, true);
      this.worldGroup.add(railN);

      if (Math.abs(x) > 2) {
        const adMat = (x / 5) % 2 === 0 ? neonPinkMat : neonAmberMat;
        const adCol = (x / 5) % 2 === 0 ? '#ec4899' : '#f59e0b';
        const railS = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.05, 0.18), adMat);
        railS.position.set(x, bridgeY + 0.52, -8.9);
        this.registerMesh(railS, adCol, 0.25, 0.2, true);
        this.worldGroup.add(railS);
      }

      // Support Pillars under Skybridge (Creates shaded columns to hide behind!)
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, bridgeY, 12), beamMat);
      pillar.position.set(x, bridgeY / 2, -11);
      pillar.castShadow = true;
      this.registerMesh(pillar, '#0f172a', 0.5, 0.5, true);
      this.worldGroup.add(pillar);
      this.addSolidBox(x, -11, 0.9, 0.9, bridgeY - 0.1);
    }

    // Add 2nd-floor Hiding Spot on Skybridge!
    this.hidingSpots.push({
      x: -10, y: bridgeY, z: -9.2, rotY: 0, poseId: 'wall',
      colors: ['#ec4899', '#ec4899', '#ec4899', '#38bdf8', '#475569', '#475569'],
      roughness: [0.25, 0.25, 0.25, 0.15, 0.65, 0.65]
    });
  }

  // 📦 文創貨櫃市集迷宮 (Multi-Colored Shipping Container Maze + 2F Rooftop Access)
  buildContainerMarketMaze(centerX, centerZ) {
    const containers = [
      { dx: -5.5, dz: -3.0, w: 6.2, d: 2.6, h: 2.6, col: '#ec4899' }, // Pink container
      { dx: -1.2, dz: 1.5, w: 2.6, d: 6.2, h: 2.6, col: '#0284c7' },  // Blue vertical container (forms L-alley!)
      { dx: 4.2, dz: -2.2, w: 5.5, d: 2.6, h: 2.6, col: '#eab308' },  // Yellow container
      { dx: 4.2, dz: 2.8, w: 5.5, d: 2.6, h: 2.6, col: '#10b981' },   // Mint Green container (forms narrow alley!)
      // 2nd-story stacked container on top of Pink container!
      { dx: -5.5, dz: -3.0, w: 5.8, d: 2.5, h: 2.4, y0: 2.6, col: '#8b5cf6' }
    ];

    containers.forEach((c) => {
      const y0 = c.y0 || 0;
      const cx = centerX + c.dx;
      const cz = centerZ + c.dz;
      const mat = this.makeMat(c.col, 0.45, 0.25);
      const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), mat);
      box.position.set(cx, y0 + c.h / 2, cz);
      box.castShadow = true;
      box.receiveShadow = true;
      this.registerMesh(box, c.col, 0.45, 0.25, true);
      this.worldGroup.add(box);

      // White/Dark accent stripes on containers for multi-color blending
      const trimMat = this.makeMat('#f8fafc', 0.3, 0.1);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(c.w + 0.06, 0.35, c.d + 0.06), trimMat);
      trim.position.set(cx, y0 + c.h - 0.35, cz);
      this.registerMesh(trim, '#f8fafc', 0.3, 0.1, true);
      this.worldGroup.add(trim);

      this.addPlatform(cx - c.w / 2, cx + c.w / 2, cz - c.d / 2, cz + c.d / 2, y0 + c.h, false);
      if (y0 === 0) {
        this.addSolidBox(cx, cz, c.w, c.d, c.h);
      }
    });

    // Ramp up to the Yellow Container Roof!
    const rampX = centerX + 4.2;
    const rampZ = centerZ - 4.8;
    const rampMat = this.makeMat('#b45309', 0.7, 0.1);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.25, 2.2), rampMat);
    ramp.position.set(rampX, 1.3, rampZ);
    ramp.rotation.z = Math.atan2(2.6, 4.2);
    this.registerMesh(ramp, '#b45309', 0.7, 0.1, true);
    this.worldGroup.add(ramp);
    this.addPlatform(rampX - 2.2, rampX + 2.2, rampZ - 1.1, rampZ + 1.1, 2.6, true, 'x+', 0);

    // Colorful Oil Drums & Wooden Crates inside the Container Maze Alley
    const drumColors = ['#ef4444', '#facc15', '#3b82f6', '#10b981', '#a855f7'];
    const drumOffsets = [
      [-2.8, -1.5], [-2.8, -0.4], [1.2, -0.5], [1.2, 0.8], [-4.5, 1.2], [6.5, 0.4]
    ];
    drumOffsets.forEach(([ox, oz], idx) => {
      const col = drumColors[idx % drumColors.length];
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 1.15, 14),
        this.makeMat(col, 0.4, 0.3)
      );
      drum.position.set(centerX + ox, 0.58, centerZ + oz);
      drum.castShadow = true;
      this.registerMesh(drum, col, 0.4, 0.3, true);
      this.worldGroup.add(drum);
    });

    this.hidingSpots.push({
      x: centerX + 1.2, y: 0, z: centerZ + 2.1, rotY: 0, poseId: 'box',
      colors: ['#10b981', '#10b981', '#0284c7', '#10b981', '#334155', '#334155'],
      roughness: [0.45, 0.45, 0.45, 0.45, 0.8, 0.8]
    });
  }

  // 🕹️ 台灣夾娃娃機店面迷宮 ＆ 夜市攤位街 (Players can stand INSIDE Claw Machine Cabinets!)
  buildClawMachineAndNightMarketMaze(centerX, centerZ) {
    const cabinetColors = ['#f43f5e', '#38bdf8', '#facc15', '#a855f7', '#10b981', '#fb923c'];

    // Build 2 rows of 4 Giant Taiwanese Claw Machines (夾娃娃機台陣) forming an arcade corridor!
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const mx = centerX - 4.5 + i * 2.8;
        const mz = centerZ - 2.6 + row * 5.2;
        const col = cabinetColors[(row * 4 + i) % cabinetColors.length];
        this.buildSingleClawMachine(mx, mz, col, (row + i) % 2 === 0);
      }
    }

    // Night Market Food Stalls surrounding the East Alley (大雞排、烤香腸、珍珠奶茶、彈珠台)
    const stalls = [
      { dx: -6.5, dz: 0, rot: Math.PI / 2, roofCol: '#dc2626', bodyCol: '#fef08a' },
      { dx: 6.2, dz: -1.5, rot: -Math.PI / 2, roofCol: '#0284c7', bodyCol: '#f8fafc' },
      { dx: 6.2, dz: 2.5, rot: -Math.PI / 2, roofCol: '#16a34a', bodyCol: '#fde68a' }
    ];
    stalls.forEach((s) => {
      const sx = centerX + s.dx;
      const sz = centerZ + s.dz;
      const grp = new THREE.Group();
      grp.position.set(sx, 0, sz);
      grp.rotation.y = s.rot;

      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.15, 1.6), this.makeMat(s.bodyCol, 0.5, 0.1));
      body.position.y = 0.58;
      body.castShadow = true;
      this.registerMesh(body, s.bodyCol, 0.5, 0.1, true);
      grp.add(body);

      const awning = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.45, 1.9), this.makeMat(s.roofCol, 0.4, 0.1));
      awning.position.y = 2.35;
      awning.castShadow = true;
      this.registerMesh(awning, s.roofCol, 0.4, 0.1, true);
      grp.add(awning);

      // Red Plastic Night Market Stools (紅塑膠板凳群)
      const stoolMat = this.makeMat('#dc2626', 0.4, 0.05);
      for (let k = -1; k <= 1; k++) {
        const stool = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.46, 0.48), stoolMat);
        stool.position.set(k * 1.05, 0.23, 1.35);
        this.registerMesh(stool, '#dc2626', 0.4, 0.05, true);
        grp.add(stool);
      }

      this.worldGroup.add(grp);
      this.addSolidBox(sx, sz, 1.6, 3.0, 2.4);
    });

    // Hiding spot INSIDE a Claw Machine as a Ball Plushie!
    this.hidingSpots.push({
      x: centerX - 1.7, y: 0.7, z: centerZ - 2.6, rotY: 0, poseId: 'ball',
      colors: ['#f43f5e', '#facc15', '#38bdf8', '#f43f5e', '#facc15', '#f43f5e'],
      roughness: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3]
    });
  }

  buildSingleClawMachine(x, z, cabinetHex, leaveSpotForPlayer = false) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);

    const cabMat = this.makeMat(cabinetHex, 0.35, 0.2);
    const darkMat = this.makeMat('#1e293b', 0.6, 0.2);

    // Lower Coin Box Base (Walkable / Jumpable height y = 0.72 so players can hop inside the display booth!)
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.72, 1.55), cabMat);
    base.position.y = 0.36;
    base.castShadow = true;
    this.registerMesh(base, cabinetHex, 0.35, 0.2, true);
    grp.add(base);
    this.addPlatform(x - 0.82, x + 0.82, z - 0.78, z + 0.78, 0.72, false);

    // Top Canopy
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.38, 1.6), cabMat);
    top.position.y = 2.45;
    this.registerMesh(top, cabinetHex, 0.35, 0.2, true);
    grp.add(top);

    // Back Panel
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.14), darkMat);
    back.position.set(0, 1.5, -0.7);
    this.registerMesh(back, '#1e293b', 0.6, 0.2, true);
    grp.add(back);

    // Colorful Plushie Balls inside the Claw Machine!
    const plushColors = ['#f43f5e', '#facc15', '#38bdf8', '#a855f7', '#4ade80'];
    const plushCount = leaveSpotForPlayer ? 2 : 4;
    for (let i = 0; i < plushCount; i++) {
      const pCol = plushColors[(i + Math.floor(Math.abs(x))) % plushColors.length];
      const plush = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), this.makeMat(pCol, 0.3, 0.1));
      plush.position.set((i % 2 === 0 ? -0.36 : 0.36), 1.02, (i < 2 ? -0.25 : 0.25));
      this.registerMesh(plush, pCol, 0.3, 0.1, true);
      grp.add(plush);
    }

    this.worldGroup.add(grp);
  }

  // 🛵 台灣街頭整排機車格陣 (Dense Scooter Parking Row with Empty Gaps for Chameleons!)
  buildScooterParkingRow(startX, z, count = 10) {
    const scooterColors = ['#ef4444', '#0284c7', '#f8fafc', '#eab308', '#10b981', '#ec4899', '#64748b'];
    const seatMat = this.makeMat('#1e293b', 0.7, 0.1);
    const lineMat = this.makeMat('#f8fafc', 0.6, 0.05);

    for (let i = 0; i < count; i++) {
      const sx = startX + i * 1.35;

      // White Parking Grid Box on Asphalt
      const gridLine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 2.1), lineMat);
      gridLine.position.set(sx, 0.025, z);
      this.registerMesh(gridLine, '#f8fafc', 0.6, 0.05, false);
      this.worldGroup.add(gridLine);

      // Leave slot #4 empty so a Chameleon can park themselves as a Scooter!
      if (i === 4) {
        this.hidingSpots.push({
          x: sx, y: 0, z, rotY: 0, poseId: 'corner',
          colors: ['#1e293b', '#ef4444', '#ef4444', '#1e293b', '#ef4444', '#1e293b'],
          roughness: [0.7, 0.3, 0.3, 0.7, 0.3, 0.8]
        });
        continue;
      }

      const col = scooterColors[i % scooterColors.length];
      const bodyMat = this.makeMat(col, 0.3, 0.35);

      const sGrp = new THREE.Group();
      sGrp.position.set(sx, 0, z);

      // Scooter Rear Body & Front Shield
      const rear = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.65, 1.15), bodyMat);
      rear.position.set(0, 0.52, -0.2);
      rear.castShadow = true;
      this.registerMesh(rear, col, 0.3, 0.35, true);
      sGrp.add(rear);

      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.82), seatMat);
      seat.position.set(0, 0.9, -0.25);
      this.registerMesh(seat, '#1e293b', 0.7, 0.1, true);
      sGrp.add(seat);

      const front = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.15, 0.32), bodyMat);
      front.position.set(0, 0.75, 0.45);
      front.castShadow = true;
      this.registerMesh(front, col, 0.3, 0.35, true);
      sGrp.add(front);

      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.25), seatMat);
      headlight.position.set(0, 1.35, 0.45);
      this.registerMesh(headlight, '#1e293b', 0.7, 0.1, true);
      sGrp.add(headlight);

      this.worldGroup.add(sGrp);
    }
  }

  // 🎤 跨年演唱會主舞台 ＆ 24人螢光棒觀眾搖滾區 (Dense Crowd Mannequin Array!)
  buildConcertStageAndCrowd(centerX, centerZ) {
    const stageMat = this.makeMat('#1e1b4b', 0.5, 0.3);
    const stageDeck = new THREE.Mesh(new THREE.BoxGeometry(15, 1.1, 6.5), stageMat);
    stageDeck.position.set(centerX, 0.55, centerZ - 4);
    stageDeck.castShadow = true;
    this.registerMesh(stageDeck, '#1e1b4b', 0.5, 0.3, true);
    this.worldGroup.add(stageDeck);
    this.addPlatform(centerX - 7.5, centerX + 7.5, centerZ - 7.2, centerZ - 0.8, 1.1, false);

    // Stage Steps
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.55, 1.6), this.makeMat('#ec4899', 0.4, 0.2));
    step.position.set(centerX, 0.28, centerZ - 0.2);
    this.registerMesh(step, '#ec4899', 0.4, 0.2, true);
    this.worldGroup.add(step);
    this.addPlatform(centerX - 2.1, centerX + 2.1, centerZ - 1.0, centerZ + 0.6, 0.55, false);

    // Pixel Art LED Backdrop Wall (Multi-color grid for wall-flatten camouflage!)
    const ledColors = ['#ec4899', '#38bdf8', '#facc15', '#a855f7', '#10b981', '#ef4444'];
    for (let gx = -3; gx <= 3; gx++) {
      for (let gy = 0; gy < 3; gy++) {
        const col = ledColors[Math.abs(gx + gy * 2) % ledColors.length];
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.45, 0.4), this.makeMat(col, 0.2, 0.3));
        panel.position.set(centerX + gx * 2.0, 1.85 + gy * 1.5, centerZ - 6.8);
        this.registerMesh(panel, col, 0.2, 0.3, true);
        this.worldGroup.add(panel);
      }
    }

    // 20 Raincoated Concert Crowd Figures in Front of Stage (4 rows x 5 cols, with 2 empty slots!)
    const coatColors = ['#facc15', '#38bdf8', '#ec4899', '#a855f7', '#4ade80'];
    for (let r = 0; r < 3; r++) {
      for (let c = -2; c <= 2; c++) {
        const fx = centerX + c * 2.3;
        const fz = centerZ + 2.2 + r * 2.1;
        const col = coatColors[Math.abs(r * 3 + c) % coatColors.length];

        if (r === 1 && c === 1) {
          // Leave this spot empty for a Chameleon player to blend into the concert crowd!
          this.hidingSpots.push({
            x: fx, y: 0, z: fz, rotY: Math.PI, poseId: 'guard',
            colors: [col, col, col, '#f43f5e', '#1e293b', '#1e293b'],
            roughness: [0.35, 0.35, 0.35, 0.2, 0.7, 0.7]
          });
          continue;
        }

        const fanGrp = new THREE.Group();
        fanGrp.position.set(fx, 0, fz);

        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.36), this.makeMat('#1e293b', 0.7, 0.1));
        legs.position.y = 0.32;
        this.registerMesh(legs, '#1e293b', 0.7, 0.1, true);
        fanGrp.add(legs);

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.82, 0.42), this.makeMat(col, 0.35, 0.1));
        torso.position.y = 1.05;
        torso.castShadow = true;
        this.registerMesh(torso, col, 0.35, 0.1, true);
        fanGrp.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), this.makeMat(col, 0.35, 0.1));
        head.position.y = 1.68;
        this.registerMesh(head, col, 0.35, 0.1, true);
        fanGrp.add(head);

        // Raised Neon Glowstick Arm!
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8), this.makeMat('#f43f5e', 0.1, 0.1));
        stick.position.set(0.38, 1.75, 0);
        this.registerMesh(stick, '#f43f5e', 0.1, 0.1, true);
        fanGrp.add(stick);

        this.worldGroup.add(fanGrp);
      }
    }
  }

  buildBusShelter(x, z, stopName) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);

    const frameMat = this.makeMat('#1e293b', 0.5, 0.5);
    const adMat = this.makeMat('#06b6d4', 0.2, 0.2);
    const roofMat = this.makeMat('#0284c7', 0.3, 0.4);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 2.2), roofMat);
    roof.position.y = 2.65;
    roof.castShadow = true;
    this.registerMesh(roof, '#0284c7', 0.3, 0.4, true);
    grp.add(roof);
    this.addPlatform(x - 2.6, x + 2.6, z - 1.1, z + 1.1, 2.75, false);

    // Lightbox Ad Wall on Back
    const adBox = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.2, 0.25), adMat);
    adBox.position.set(0, 1.3, -0.85);
    adBox.castShadow = true;
    this.registerMesh(adBox, '#06b6d4', 0.2, 0.2, true);
    grp.add(adBox);

    // Waiting Bench
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.55), frameMat);
    bench.position.set(0, 0.23, -0.35);
    this.registerMesh(bench, '#1e293b', 0.5, 0.5, true);
    grp.add(bench);

    this.worldGroup.add(grp);
  }

  // 🚌 動態行駛：台北紅色雙層觀光巴士 (Players can jump on & ride!)
  buildMovingSightseeingBus(startX, z, dir = 1) {
    const grp = new THREE.Group();
    grp.position.set(startX, 0, z);

    const redMat = this.makeMat('#dc2626', 0.3, 0.3);
    const winMat = this.makeMat('#38bdf8', 0.15, 0.8);
    const darkMat = this.makeMat('#0f172a', 0.7, 0.2);

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.5, 2.5), redMat);
    lowerBody.position.y = 0.95;
    lowerBody.castShadow = true;
    this.registerMesh(lowerBody, '#dc2626', 0.3, 0.3, true);
    grp.add(lowerBody);

    const winBand = new THREE.Mesh(new THREE.BoxGeometry(7.24, 0.7, 2.54), winMat);
    winBand.position.y = 1.95;
    this.registerMesh(winBand, '#38bdf8', 0.15, 0.8, true);
    grp.add(winBand);

    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.65, 2.5), redMat);
    upperDeck.position.y = 2.55;
    this.registerMesh(upperDeck, '#dc2626', 0.3, 0.3, true);
    grp.add(upperDeck);

    // Wheels
    [-2.2, 2.2].forEach((wx) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 2.65, 14), darkMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.48, 0);
      this.registerMesh(wheel, '#0f172a', 0.7, 0.2, true);
      grp.add(wheel);
    });

    this.worldGroup.add(grp);
    this.movingVehicles.push({
      group: grp,
      dir,
      speed: 4.2,
      minX: -36,
      maxX: 36,
      halfW: 3.6,
      halfD: 1.3,
      topY: 2.88
    });
  }

  // 🚛 動態行駛：台灣經典黃色環保垃圾車
  buildMovingGarbageTruck(startX, z, dir = -1) {
    const grp = new THREE.Group();
    grp.position.set(startX, 0, z);

    const yellowMat = this.makeMat('#eab308', 0.35, 0.25);
    const whiteMat = this.makeMat('#f8fafc', 0.4, 0.2);
    const greenMat = this.makeMat('#16a34a', 0.5, 0.1);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 2.3), whiteMat);
    cab.position.set(dir * 2.1, 1.25, 0);
    cab.castShadow = true;
    this.registerMesh(cab, '#f8fafc', 0.4, 0.2, true);
    grp.add(cab);

    const tank = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 2.35), yellowMat);
    tank.position.set(-dir * 1.1, 1.35, 0);
    tank.castShadow = true;
    this.registerMesh(tank, '#eab308', 0.35, 0.25, true);
    grp.add(tank);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.35, 2.4), greenMat);
    stripe.position.set(-dir * 1.1, 0.9, 0);
    this.registerMesh(stripe, '#16a34a', 0.5, 0.1, true);
    grp.add(stripe);

    this.worldGroup.add(grp);
    this.movingVehicles.push({
      group: grp,
      dir,
      speed: 3.4,
      minX: -36,
      maxX: 36,
      halfW: 3.3,
      halfD: 1.25,
      topY: 2.45
    });
  }

  buildTaipei101Tower(x, z) {
    const tower = new THREE.Group();
    tower.position.set(x, 0, z);

    const glassMat = this.makeMat('#0d9488', 0.2, 0.65);
    const frameMat = this.makeMat('#38bdf8', 0.3, 0.5);
    const goldMat = this.makeMat('#eab308', 0.25, 0.8);

    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 12), glassMat);
    base.position.y = 3.0;
    this.registerMesh(base, '#0d9488', 0.2, 0.65, true);
    tower.add(base);

    for (let i = 0; i < 8; i++) {
      const segY = 6 + i * 3.5;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 3.8, 3.4, 4), glassMat);
      seg.rotation.y = Math.PI / 4;
      seg.position.y = segY + 1.7;
      this.registerMesh(seg, '#0d9488', 0.2, 0.65, true);
      tower.add(seg);

      const rim = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 7.2), frameMat);
      rim.position.y = segY + 3.4;
      this.registerMesh(rim, '#38bdf8', 0.3, 0.5, true);
      tower.add(rim);

      if (i === 1) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.35, 18), goldMat);
        coin.rotation.x = Math.PI / 2;
        coin.position.set(0, segY + 1.6, 4.4);
        this.registerMesh(coin, '#eab308', 0.25, 0.8, true);
        tower.add(coin);
      }
    }

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.3, 9, 8), frameMat);
    spire.position.y = 38;
    tower.add(spire);

    this.worldGroup.add(tower);
    this.addSolidBox(x, z, 14, 12, 10);
  }

  buildLoveSculptureMaze(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const hedgeMat = this.makeMat('#15803d', 0.85, 0.02);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.85, 4.2), hedgeMat);
    hedge.position.y = 0.425;
    hedge.castShadow = true;
    this.registerMesh(hedge, '#15803d', 0.85, 0.02, true);
    group.add(hedge);
    this.addPlatform(x - 3.6, x + 3.6, z - 2.1, z + 2.1, 0.85, false);

    // Surrounding L-shaped Hedge Maze Walls!
    const mazeHedges = [
      [-4.8, 0, 1.2, 1.4, 5.5],
      [4.8, 0, 1.2, 1.4, 5.5],
      [0, 3.4, 6.2, 1.4, 1.2]
    ];
    mazeHedges.forEach(([hx, hz, w, h, d]) => {
      const mh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hedgeMat);
      mh.position.set(hx, h / 2, hz);
      mh.castShadow = true;
      this.registerMesh(mh, '#15803d', 0.85, 0.02, true);
      group.add(mh);
    });

    const redMat = this.makeMat('#dc2626', 0.3, 0.35);
    const blocks = [
      [-2.0, 1.8, 0, 0.65, 2.0, 0.9],
      [-1.3, 1.1, 0, 1.3, 0.6, 0.9],
      [0.3, 1.8, 0, 1.6, 2.0, 0.9],
      [2.1, 1.8, 0, 1.4, 2.0, 0.9]
    ];
    blocks.forEach(([bx, by, bz, w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), redMat);
      m.position.set(bx, by, bz);
      m.castShadow = true;
      this.registerMesh(m, '#dc2626', 0.3, 0.35, true);
      group.add(m);
    });

    this.worldGroup.add(group);
    this.hidingSpots.push({
      x: x - 0.8, y: 0.85, z: z + 0.5, rotY: 0, poseId: 'corner',
      colors: ['#dc2626', '#dc2626', '#dc2626', '#dc2626', '#15803d', '#15803d'],
      roughness: [0.3, 0.3, 0.3, 0.3, 0.85, 0.85]
    });
  }

  buildDamperBabyStage(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const stageMat = this.makeMat('#7c2d12', 0.6, 0.1);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.6, 0.65, 24), stageMat);
    stage.position.y = 0.325;
    this.registerMesh(stage, '#7c2d12', 0.6, 0.1, true);
    group.add(stage);
    this.addPlatform(x - 3.8, x + 3.8, z - 3.8, z + 3.8, 0.65, false);

    const goldMat = this.makeMat('#eab308', 0.22, 0.75);
    const damper = new THREE.Mesh(new THREE.SphereGeometry(1.55, 22, 18), goldMat);
    damper.position.set(0, 2.2, 0);
    damper.castShadow = true;
    this.registerMesh(damper, '#eab308', 0.22, 0.75, true);
    group.add(damper);

    // 7 Damper Baby Mascot Balls in a circle (leaving 1 gap for a Ball-pose Chameleon!)
    const mascotColors = ['#eab308', '#ef4444', '#38bdf8', '#10b981', '#ec4899', '#a855f7'];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bx = Math.cos(angle) * 2.9;
      const bz = Math.sin(angle) * 2.9;
      if (i === 2) {
        this.hidingSpots.push({
          x: x + bx, y: 0.65, z: z + bz, rotY: 0, poseId: 'ball',
          colors: ['#eab308', '#eab308', '#eab308', '#eab308', '#eab308', '#7c2d12'],
          roughness: [0.25, 0.25, 0.25, 0.25, 0.25, 0.6]
        });
        continue;
      }
      const col = mascotColors[i % mascotColors.length];
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 14), this.makeMat(col, 0.3, 0.3));
      ball.position.set(bx, 1.15, bz);
      ball.castShadow = true;
      this.registerMesh(ball, col, 0.3, 0.3, true);
      group.add(ball);
    }

    this.worldGroup.add(group);
  }

  buildYouBikeStation(x, z, count = 8) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const kioskMat = this.makeMat('#f59e0b', 0.35, 0.2);
    const frameMat = this.makeMat('#94a3b8', 0.4, 0.6);
    const wheelMat = this.makeMat('#1e293b', 0.7, 0.1);

    for (let i = 0; i < count; i++) {
      const bz = (i - count / 2) * 1.85;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.15, 0.32), frameMat);
      pillar.position.set(-1.1, 0.58, bz);
      this.registerMesh(pillar, '#94a3b8', 0.4, 0.6, true);
      group.add(pillar);

      const pillarTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.36), kioskMat);
      pillarTop.position.set(-1.1, 1.22, bz);
      this.registerMesh(pillarTop, '#f59e0b', 0.35, 0.2, true);
      group.add(pillarTop);

      if (i === 3) continue; // Empty dock for Chameleon!

      const bikeFrame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.28), kioskMat);
      bikeFrame.position.set(0, 0.65, bz);
      bikeFrame.castShadow = true;
      this.registerMesh(bikeFrame, '#f59e0b', 0.35, 0.2, true);
      group.add(bikeFrame);

      const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12), wheelMat);
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
  }

  scatterStreetFurnitureTaipei101() {
    // Dense Traffic Cone Rows
    const conePositions = [
      [-6.5, 13.5], [-5.1, 13.5], [-3.7, 13.5], [-2.3, 13.5],
      [2.3, 13.5], [3.7, 13.5], [5.1, 13.5], [6.5, 13.5],
      [-6.5, 1.5], [-6.5, 0], [-6.5, -1.5],
      [6.5, 1.5], [6.5, 0], [6.5, -1.5]
    ];
    conePositions.forEach(([cx, cz]) => this.buildTrafficCone(cx, cz));
    this.hidingSpots.push({
      x: -0.9, y: 0, z: 13.5, rotY: 0, poseId: 'cone',
      colors: ['#ea580c', '#ea580c', '#f8fafc', '#ea580c', '#ea580c', '#1e293b'],
      roughness: [0.4, 0.4, 0.3, 0.4, 0.4, 0.8]
    });

    // Trash Bins & Painted Transformer Boxes
    const boxSpots = [
      [-5.2, 6], [5.2, 6], [-5.2, -9], [5.2, -9], [-19, -2], [19, -12], [-9, 14], [9, 14]
    ];
    boxSpots.forEach(([bx, bz], i) => {
      if (i % 2 === 0) this.buildTaipeiTrashBins(bx, bz);
      else this.buildTransformerBox(bx, bz);
    });

    // Iconic Taiwan Red & Green Dual Mailboxes (中華郵政紅綠歪腰郵筒!)
    this.buildTaiwanMailboxes(-4.8, 10.5);
    this.buildTaiwanMailboxes(4.8, 10.5);
  }

  buildTaiwanMailboxes(x, z) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);

    const greenMat = this.makeMat('#16a34a', 0.35, 0.2);
    const redMat = this.makeMat('#dc2626', 0.35, 0.2);

    const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.35, 0.52), greenMat);
    m1.position.set(-0.38, 0.68, 0);
    m1.rotation.z = -0.12; // Cute tilted "歪腰郵筒" style!
    m1.castShadow = true;
    this.registerMesh(m1, '#16a34a', 0.35, 0.2, true);
    grp.add(m1);

    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.35, 0.52), redMat);
    m2.position.set(0.38, 0.68, 0);
    m2.rotation.z = -0.12;
    m2.castShadow = true;
    this.registerMesh(m2, '#dc2626', 0.35, 0.2, true);
    grp.add(m2);

    this.worldGroup.add(grp);
  }

  // ============================================================================
  // MAP 2: 國父紀念館與翠湖迴廊（高密度立體迷宮版：二樓長廊＋翠湖九曲橋涼亭＋廣場舞大陣＋街舞迷宮）
  // ============================================================================
  buildSunYatSenHallDense(seed) {
    this.scene.background = new THREE.Color(0x172554);
    this.scene.fog = new THREE.FogExp2(0x172554, 0.0085);

    // 1. Zhongshan Park Ground & Granite Pathways
    const groundMat = this.makeMat('#334155', 0.85, 0.03);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.registerMesh(ground, '#334155', 0.85, 0.03, false);
    this.worldGroup.add(ground);

    const aveMat = this.makeMat('#cbd5e1', 0.75, 0.05);
    const ave = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 54), aveMat);
    ave.position.set(0, 0.03, -2);
    this.registerMesh(ave, '#cbd5e1', 0.75, 0.05, false);
    this.worldGroup.add(ave);

    // 2. 🏛️ 國父紀念館主館 ＋ 二樓可登高大階梯露台 ＋ 東西雙層迴廊 (y = 3.2)
    this.buildMemorialHallAndElevatedCorridors(0, -30);

    // 3. 💂 禮兵交接大平台（8尊衛兵銅像陣列，留空位給玩家混入）
    this.buildHonorGuardPlatform(0, -14);

    // 4. 💃 中山公園「廣場舞阿嬤 20人方陣」＆ 紅色大音響 (x = 0, z = 2)
    this.buildSquareDanceFormation(0, 2);

    // 5. 🌉 東區：翠湖、九曲橋、八角琉璃瓦涼亭、30顆假山奇石與錦鯉群 (x = 16, z = -2)
    this.buildEmeraldLakeAndZigZagBridge(16, -2);

    // 6. 🪞 西區：迴廊街舞練舞鏡迷宮、重低音音箱塔、阿伯下棋石桌林 (x = -16, z = -2)
    this.buildStreetDanceMazeAndChessPark(-16, -2);

    // 7. 🦁 石獅子百柱步道 ＆ 園區遊園小火車 (Moving Park Train!)
    this.buildStoneLionPillarsRow();
    this.buildMovingGarbageTruck(-28, 19, 1);
  }

  buildMemorialHallAndElevatedCorridors(x, z) {
    const whiteMat = this.makeMat('#f8fafc', 0.65, 0.05);
    const roofGoldMat = this.makeMat('#d97706', 0.35, 0.25);
    const redMat = this.makeMat('#991b1b', 0.45, 0.1);
    const terraceY = 3.2;

    // Main Hall Building
    const hall = new THREE.Mesh(new THREE.BoxGeometry(30, 9, 12), whiteMat);
    hall.position.set(x, 4.5, z);
    this.registerMesh(hall, '#f8fafc', 0.65, 0.05, true);
    this.worldGroup.add(hall);
    this.addSolidBox(x, z, 30, 12, 9);

    // Golden Palace Curved Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(22, 6.0, 4), roofGoldMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, 12, z);
    this.registerMesh(roof, '#d97706', 0.35, 0.25, true);
    this.worldGroup.add(roof);

    // Walkable 2nd-Floor Front Terrace (z = -24 to -19) & East/West Elevated Wing Corridors!
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(46, 0.4, 5.2), whiteMat);
    terrace.position.set(x, terraceY - 0.2, z + 8.5);
    terrace.castShadow = true;
    this.registerMesh(terrace, '#f8fafc', 0.65, 0.05, true);
    this.worldGroup.add(terrace);
    this.addPlatform(x - 23, x + 23, z + 5.9, z + 11.1, terraceY, false);

    // Grand Center Staircase Ramp leading up to 2F Terrace (z = -12 to -18.9)
    const stairRamp = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.35, 7.2), redMat);
    stairRamp.position.set(x, terraceY / 2, z + 14.5);
    stairRamp.rotation.x = -Math.atan2(terraceY, 6.8);
    this.registerMesh(stairRamp, '#991b1b', 0.45, 0.1, true);
    this.worldGroup.add(stairRamp);
    this.addPlatform(x - 3.7, x + 3.7, z + 11.1, z + 18.0, terraceY, true, 'z-', 0);

    // 14 Grand Red & White Columns along the Terrace & Underpass
    for (let i = -5; i <= 5; i++) {
      const cx = i * 4.0;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 7.5, 14), i % 2 === 0 ? whiteMat : redMat);
      col.position.set(cx, 3.75, z + 10.6);
      col.castShadow = true;
      this.registerMesh(col, i % 2 === 0 ? '#f8fafc' : '#991b1b', 0.55, 0.05, true);
      this.worldGroup.add(col);
    }
  }

  buildHonorGuardPlatform(x, z) {
    const pedMat = this.makeMat('#991b1b', 0.6, 0.1);
    const uniformMat = this.makeMat('#1d4ed8', 0.4, 0.2);
    const whiteHelmetMat = this.makeMat('#e2e8f0', 0.2, 0.8);

    const base = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.45, 3.4), pedMat);
    base.position.set(x, 0.225, z);
    this.registerMesh(base, '#991b1b', 0.6, 0.1, true);
    this.worldGroup.add(base);
    this.addPlatform(x - 5.2, x + 5.2, z - 1.7, z + 1.7, 0.45, false);

    // 5 Honor Guard Statues in a row (leaving slot i = 1 empty for a Guard-pose Chameleon!)
    for (let i = -2; i <= 2; i++) {
      const gx = x + i * 2.1;
      if (i === 1) {
        this.hidingSpots.push({
          x: gx, y: 0.45, z, rotY: 0, poseId: 'guard',
          colors: ['#e2e8f0', '#1d4ed8', '#1d4ed8', '#1d4ed8', '#1d4ed8', '#991b1b'],
          roughness: [0.2, 0.4, 0.4, 0.4, 0.4, 0.6]
        });
        continue;
      }
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.32, 0.42), uniformMat);
      body.position.set(gx, 1.12, z);
      body.castShadow = true;
      this.registerMesh(body, '#1d4ed8', 0.4, 0.2, true);
      this.worldGroup.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), whiteHelmetMat);
      head.position.set(gx, 2.0, z);
      this.registerMesh(head, '#e2e8f0', 0.2, 0.8, true);
      this.worldGroup.add(head);
    }
  }

  // 💃 廣場舞阿嬤 16人方陣 (Square Dance Formation!)
  buildSquareDanceFormation(centerX, centerZ) {
    const outfitColors = ['#ec4899', '#a855f7', '#f43f5e', '#10b981'];
    const pantsMat = this.makeMat('#1e293b', 0.7, 0.05);

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const dx = centerX - 3.6 + c * 2.4;
        const dz = centerZ - 3.0 + r * 2.2;
        const col = outfitColors[(r + c) % outfitColors.length];

        if (r === 2 && c === 2) {
          this.hidingSpots.push({
            x: dx, y: 0, z: dz, rotY: Math.PI, poseId: 'guard',
            colors: ['#fde68a', col, col, '#ef4444', '#1e293b', '#1e293b'],
            roughness: [0.4, 0.4, 0.4, 0.3, 0.7, 0.7]
          });
          continue;
        }

        const dGrp = new THREE.Group();
        dGrp.position.set(dx, 0, dz);

        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.35), pantsMat);
        legs.position.y = 0.31;
        this.registerMesh(legs, '#1e293b', 0.7, 0.05, true);
        dGrp.add(legs);

        const top = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.78, 0.4), this.makeMat(col, 0.4, 0.1));
        top.position.y = 1.0;
        top.castShadow = true;
        this.registerMesh(top, col, 0.4, 0.1, true);
        dGrp.add(top);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 12), this.makeMat('#fde68a', 0.4, 0.05));
        head.position.y = 1.62;
        this.registerMesh(head, '#fde68a', 0.4, 0.05, true);
        dGrp.add(head);

        // Red Dancing Fan in Hand
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.05, 0.08, 10), this.makeMat('#ef4444', 0.3, 0.1));
        fan.rotation.x = Math.PI / 2;
        fan.position.set(0.42, 1.55, 0.15);
        this.registerMesh(fan, '#ef4444', 0.3, 0.1, true);
        dGrp.add(fan);

        this.worldGroup.add(dGrp);
      }
    }
  }

  // 🌉 翠湖、九曲橋、八角涼亭與假山奇石群
  buildEmeraldLakeAndZigZagBridge(centerX, centerZ) {
    const waterMat = this.makeMat('#0d9488', 0.2, 0.3);
    const rockMat = this.makeMat('#15803d', 0.85, 0.05);
    const bridgeMat = this.makeMat('#f8fafc', 0.6, 0.1);
    const roofGoldMat = this.makeMat('#d97706', 0.35, 0.25);
    const redPillarMat = this.makeMat('#dc2626', 0.4, 0.1);

    // Expanded Emerald Lake Pond
    const pond = new THREE.Mesh(new THREE.BoxGeometry(16, 0.14, 22), waterMat);
    pond.position.set(centerX, 0.07, centerZ);
    this.registerMesh(pond, '#0d9488', 0.2, 0.3, false);
    this.worldGroup.add(pond);

    // Elevated Nine-Turn Bridge (九曲橋 at y = 1.05) + Ramps
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 18), bridgeMat);
    bridgeDeck.position.set(centerX, 0.95, centerZ);
    bridgeDeck.castShadow = true;
    this.registerMesh(bridgeDeck, '#f8fafc', 0.6, 0.1, true);
    this.worldGroup.add(bridgeDeck);
    this.addPlatform(centerX - 1.6, centerX + 1.6, centerZ - 9, centerZ + 9, 1.06, false);

    // Ramps onto Nine-Turn Bridge at South & North ends
    const rampS = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 2.8), bridgeMat);
    rampS.position.set(centerX, 0.5, centerZ + 10.2);
    rampS.rotation.x = Math.atan2(1.06, 2.6);
    this.registerMesh(rampS, '#f8fafc', 0.6, 0.1, true);
    this.worldGroup.add(rampS);
    this.addPlatform(centerX - 1.6, centerX + 1.6, centerZ + 9, centerZ + 11.6, 1.06, true, 'z-', 0);

    // Central Octagonal Pavilion (翠湖八角涼亭)
    const pavFloor = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.3, 8), bridgeMat);
    pavFloor.position.set(centerX, 1.0, centerZ);
    this.registerMesh(pavFloor, '#f8fafc', 0.6, 0.1, true);
    this.worldGroup.add(pavFloor);
    this.addPlatform(centerX - 3.0, centerX + 3.0, centerZ - 3.0, centerZ + 3.0, 1.15, false);

    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.8, 10), redPillarMat);
      col.position.set(centerX + Math.cos(ang) * 2.4, 2.4, centerZ + Math.sin(ang) * 2.4);
      this.registerMesh(col, '#dc2626', 0.4, 0.1, true);
      this.worldGroup.add(col);
    }

    const pavRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.1, 8), roofGoldMat);
    pavRoof.position.set(centerX, 4.5, centerZ);
    pavRoof.castShadow = true;
    this.registerMesh(pavRoof, '#d97706', 0.35, 0.25, true);
    this.worldGroup.add(pavRoof);

    // 16 Mossy Rocks & Koi Fish in Emerald Lake
    for (let i = 0; i < 16; i++) {
      const rx = centerX + (i % 2 === 0 ? -5.2 : 5.2) + (Math.sin(i * 3) * 1.4);
      const rz = centerZ - 8.5 + i * 1.15;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 + (i % 3) * 0.2, 1), rockMat);
      rock.position.set(rx, 0.55, rz);
      rock.castShadow = true;
      this.registerMesh(rock, '#15803d', 0.85, 0.05, true);
      this.worldGroup.add(rock);
    }

    this.hidingSpots.push({
      x: centerX - 4.2, y: 0, z: centerZ + 1.5, rotY: 0, poseId: 'ball',
      colors: ['#15803d', '#15803d', '#15803d', '#15803d', '#0d9488', '#0d9488'],
      roughness: [0.85, 0.85, 0.85, 0.85, 0.2, 0.2]
    });
  }

  // 🪞 西側迴廊街舞鏡迷宮 ＆ 中山公園下棋涼亭林
  buildStreetDanceMazeAndChessPark(centerX, centerZ) {
    const mirrorMat = this.makeMat('#94a3b8', 0.1, 0.85);
    const speakerMat = this.makeMat('#18181b', 0.6, 0.2);
    const neonMat = this.makeMat('#a855f7', 0.3, 0.3);

    // L-Shaped Practice Mirror Maze Walls
    const mirrorWalls = [
      [-4.5, -4, 0.4, 3.0, 8.0],
      [-0.5, -8, 8.0, 3.0, 0.4],
      [-4.5, 5, 0.4, 3.0, 8.0],
      [2.5, 1, 0.4, 3.0, 7.0]
    ];
    mirrorWalls.forEach(([mx, mz, w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mirrorMat);
      m.position.set(centerX + mx, h / 2, centerZ + mz);
      m.castShadow = true;
      this.registerMesh(m, '#94a3b8', 0.1, 0.85, true);
      this.worldGroup.add(m);
      this.addSolidBox(centerX + mx, centerZ + mz, w, d, h);
    });

    // 8 Boombox Speaker Stacks
    for (let i = -3; i <= 3; i++) {
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.15, 0.88), speakerMat);
      spk.position.set(centerX - 3.2, 0.58, centerZ + i * 2.6);
      spk.castShadow = true;
      this.registerMesh(spk, '#18181b', 0.6, 0.2, true);
      this.worldGroup.add(spk);

      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.92, 12), neonMat);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(centerX - 3.18, 0.68, centerZ + i * 2.6);
      this.registerMesh(ring, '#a855f7', 0.3, 0.3, true);
      this.worldGroup.add(ring);
    }

    this.hidingSpots.push({
      x: centerX - 3.2, y: 0, z: centerZ + 1.3, rotY: Math.PI / 2, poseId: 'box',
      colors: ['#18181b', '#a855f7', '#18181b', '#18181b', '#18181b', '#18181b'],
      roughness: [0.6, 0.3, 0.6, 0.6, 0.6, 0.6]
    });
  }

  buildStoneLionPillarsRow() {
    const stoneMat = this.makeMat('#94a3b8', 0.75, 0.1);
    const goldBallMat = this.makeMat('#eab308', 0.3, 0.5);

    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const px = i * 3.2;
      const pz = 12.5;

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.1, 0.65), stoneMat);
      post.position.set(px, 0.55, pz);
      post.castShadow = true;
      this.registerMesh(post, '#94a3b8', 0.75, 0.1, true);
      this.worldGroup.add(post);

      const lionBall = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), i % 2 === 0 ? stoneMat : goldBallMat);
      lionBall.position.set(px, 1.35, pz);
      this.registerMesh(lionBall, i % 2 === 0 ? '#94a3b8' : '#eab308', 0.4, 0.3, true);
      this.worldGroup.add(lionBall);
    }
  }

  // ==================== SHARED PROPS & SYSTEMS ====================
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

    const lowerCone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.55, 12), orangeMat);
    lowerCone.position.y = 0.4;
    this.registerMesh(lowerCone, '#ea580c', 0.4, 0.05, true);
    group.add(lowerCone);

    const whiteBand = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.32, 12), whiteMat);
    whiteBand.position.y = 0.82;
    this.registerMesh(whiteBand, '#f8fafc', 0.3, 0.1, true);
    group.add(whiteBand);

    const topCone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, 0.45, 12), orangeMat);
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

  buildHunterHoldingGate() {
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, 29);

    const frameMat = this.makeMat('#0284c7', 0.4, 0.3);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.45, 5.5), frameMat);
    roof.position.y = 3.4;
    this.registerMesh(roof, '#0284c7', 0.4, 0.3, false);
    gateGroup.add(roof);

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
    const count = 160;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 42;
      positions[i * 3 + 1] = 12 + Math.random() * 24;
      positions[i * 3 + 2] = -26 + (Math.random() - 0.5) * 18;

      const c = new THREE.Color().setHSL(Math.random(), 0.95, 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.72,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });

    this.fireworksPoints = new THREE.Points(geo, mat);
    this.fireworksPoints.visible = false;
    this.worldGroup.add(this.fireworksPoints);
  }

  update(dt, isFrenzy = false) {
    // Animate moving vehicles (Sightseeing Bus & Garbage Truck)
    for (let i = 0; i < this.movingVehicles.length; i++) {
      const v = this.movingVehicles[i];
      v.group.position.x += v.dir * v.speed * dt;
      if (v.dir > 0 && v.group.position.x > v.maxX) {
        v.group.position.x = v.minX;
      } else if (v.dir < 0 && v.group.position.x < v.minX) {
        v.group.position.x = v.maxX;
      }
    }

    if (this.fireworksPoints) {
      this.fireworksPoints.visible = isFrenzy;
      if (isFrenzy) {
        this.fireworksPoints.rotation.y += dt * 0.45;
      }
    }
  }

  // ==================== SMART 6-PART SURROUNDINGS AUTO-CAMO ====================
  sampleSurroundingColorsForParts(partWorldCenters) {
    const raycaster = new THREE.Raycaster();
    raycaster.near = 0.01;
    raycaster.far = 4.2;

    const directions = [
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-0.7, -0.4, -0.7).normalize(),
      new THREE.Vector3(0.7, -0.4, 0.7).normalize()
    ];

    return partWorldCenters.map((center, partIdx) => {
      let bestHit = null;
      let bestDist = Infinity;

      for (let dIdx = 0; dIdx < directions.length; dIdx++) {
        const dir = directions[dIdx];
        raycaster.set(center, dir);
        const hits = raycaster.intersectObjects(this.paintableMeshes, false);
        if (hits.length > 0) {
          const h = hits[0];
          const isProp = Boolean(h.object.userData.isDecoyProp);
          const weightedDist = isProp ? h.distance * 0.48 : h.distance + (partIdx < 4 ? 0.65 : 0);
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

      return {
        color: '#334155',
        roughness: 0.8,
        metalness: 0.05
      };
    });
  }
}

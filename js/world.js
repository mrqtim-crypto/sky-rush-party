import * as THREE from 'three';

export class SeededRandom {
  constructor(seed = 123456) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export const PLATFORM_TYPES = {
  normal: { label: '安全階梯', color: 0x3b82f6, edge: 0x60a5fa },
  spike: { label: '尖刺釘板', color: 0x991b1b, edge: 0xef4444 },
  spring: { label: '高彈力彈簧', color: 0xca8a04, edge: 0xfacc15 },
  cracked: { label: '碎裂玻璃磚', color: 0x64748b, edge: 0x94a3b8 },
  conveyor_left: { label: '左向輸送帶', color: 0x0d9488, edge: 0x2dd4bf },
  conveyor_right: { label: '右向輸送帶', color: 0x0d9488, edge: 0x2dd4bf },
  ice: { label: '極地滑冰磚', color: 0x38bdf8, edge: 0xe0f2fe },
  lava: { label: '熔岩燙腳磚', color: 0xea580c, edge: 0xf97316 },
  catapult: { label: '狂暴彈射板', color: 0x9333ea, edge: 0xc084fc }
};

// Tighter vertical gap for fast-paced arcade action!
export const FLOOR_VERTICAL_GAP = 2.55;

export class AbyssWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.platforms = new Map();
    this.bananas = [];
    this.rocks = [];
    this.maxGeneratedFloor = 0;
    this.rng = new SeededRandom(101010);

    this.ceilingY = 4.5;
    this.conveyorReversed = false;
    this.speedBoostTimer = 0;

    this.buildShaftEnvironment();
    this.buildSpikedCeiling();
  }

  buildShaftEnvironment() {
    this.envGroup = new THREE.Group();
    this.root.add(this.envGroup);

    this.wallRingGroup = new THREE.Group();
    this.root.add(this.wallRingGroup);

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.7,
      metalness: 0.3
    });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });

    const corners = [
      [-9.6, -5.2],
      [9.6, -5.2],
      [-9.6, 4.8],
      [9.6, 4.8]
    ];

    corners.forEach(([cx, cz], idx) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.9, 140, 0.9), pillarMat);
      col.position.set(cx, -40, cz);
      this.wallRingGroup.add(col);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 140, 0.16),
        idx < 2 ? neonMat : neonPinkMat
      );
      strip.position.set(cx * 0.94, -40, cz * 0.94);
      this.wallRingGroup.add(strip);
    });

    this.depthRings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    for (let i = 0; i < 18; i++) {
      const backBar = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.18, 0.18), ringMat);
      backBar.position.set(0, -i * 5, -5.2);
      this.wallRingGroup.add(backBar);
      this.depthRings.push(backBar);
    }
  }

  buildSpikedCeiling() {
    this.ceilingGroup = new THREE.Group();

    const baseGeo = new THREE.BoxGeometry(19.0, 1.2, 9.6);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x7f1d1d,
      roughness: 0.35,
      metalness: 0.6
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.6;
    this.ceilingGroup.add(baseMesh);

    const hazardBar = new THREE.Mesh(
      new THREE.BoxGeometry(19.1, 0.28, 9.7),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    hazardBar.position.y = 0.08;
    this.ceilingGroup.add(hazardBar);

    const spikeGeo = new THREE.ConeGeometry(0.45, 1.25, 6);
    spikeGeo.rotateX(Math.PI);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.75,
      roughness: 0.2,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.35
    });

    for (let x = -8.2; x <= 8.2; x += 1.35) {
      for (let z = -3.8; z <= 3.8; z += 1.9) {
        const sp = new THREE.Mesh(spikeGeo, spikeMat);
        sp.position.set(x, -0.58, z);
        this.ceilingGroup.add(sp);
      }
    }

    this.ceilingGroup.position.y = this.ceilingY;
    this.root.add(this.ceilingGroup);
  }

  resetWorld(seed = 101010) {
    this.rng = new SeededRandom(seed);

    this.platforms.forEach((p) => {
      this.root.remove(p.group);
    });
    this.platforms.clear();

    this.bananas.forEach((b) => this.root.remove(b.mesh));
    this.bananas = [];

    this.rocks.forEach((r) => {
      this.root.remove(r.mesh);
      this.root.remove(r.warningLine);
    });
    this.rocks = [];

    this.maxGeneratedFloor = 0;
    this.ceilingY = 4.2;
    this.ceilingGroup.position.y = this.ceilingY;
    this.conveyorReversed = false;
    this.speedBoostTimer = 0;

    this.ensureFloorsUpTo(36);
  }

  ensureFloorsUpTo(targetFloor) {
    while (this.maxGeneratedFloor < targetFloor) {
      this.maxGeneratedFloor++;
      this.createFloorPlatform(this.maxGeneratedFloor);
    }
  }

  pickPlatformType(floorIndex) {
    if (floorIndex <= 2) return 'normal';
    const r = this.rng.next();
    const difficulty = Math.min(1, floorIndex / 35);
    if (r < 0.28 - difficulty * 0.07) return 'normal';
    if (r < 0.41) return 'spike';
    if (r < 0.53) return 'spring';
    if (r < 0.66) return 'cracked';
    if (r < 0.77) return this.rng.next() < 0.5 ? 'conveyor_left' : 'conveyor_right';
    if (r < 0.85) return 'ice';
    if (r < 0.93) return 'lava';
    return 'catapult';
  }

  createFloorPlatform(floorIndex) {
    const y = -floorIndex * FLOOR_VERTICAL_GAP;

    let x = 0;
    let z = 0;
    let w = 4.5;
    let d = 2.9;

    if (floorIndex === 1) {
      x = 0;
      z = 0;
      w = 8.8;
      d = 4.2;
    } else if (floorIndex === 2) {
      x = this.rng.range(-3.2, 3.2);
      z = this.rng.range(-1.2, 1.2);
      w = 5.6;
      d = 3.2;
    } else {
      x = this.rng.range(-5.8, 5.8);
      z = this.rng.range(-2.3, 2.3);
      w = this.rng.range(3.6, 5.1);
      d = this.rng.range(2.5, 3.3);
    }

    const type = this.pickPlatformType(floorIndex);
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const pMeta = PLATFORM_TYPES[type] || PLATFORM_TYPES.normal;

    const boxGeo = new THREE.BoxGeometry(w, 0.48, d);
    const boxMat = new THREE.MeshStandardMaterial({
      color: pMeta.color,
      roughness: type === 'ice' ? 0.12 : 0.45,
      metalness: type === 'ice' ? 0.35 : 0.15,
      transparent: type === 'cracked' || type === 'ice',
      opacity: type === 'cracked' ? 0.82 : type === 'ice' ? 0.88 : 1.0
    });
    const baseMesh = new THREE.Mesh(boxGeo, boxMat);
    group.add(baseMesh);

    const trimGeo = new THREE.BoxGeometry(w + 0.1, 0.14, d + 0.1);
    const trimMat = new THREE.MeshBasicMaterial({ color: pMeta.edge });
    const trimMesh = new THREE.Mesh(trimGeo, trimMat);
    trimMesh.position.y = 0.19;
    group.add(trimMesh);

    this.addPlatformVisuals(group, type, w, d);

    if (floorIndex % 5 === 0) {
      const sign = this.createFloorSignSprite(floorIndex);
      sign.position.set(0, 1.25, -d * 0.5 - 0.3);
      group.add(sign);
    }

    let itemBoxMesh = null;
    let hasItemBox = false;
    if (floorIndex >= 2 && this.rng.next() < 0.36) {
      hasItemBox = true;
      itemBoxMesh = this.createItemBoxMesh();
      itemBoxMesh.position.set(this.rng.range(-w * 0.25, w * 0.25), 0.9, 0);
      group.add(itemBoxMesh);
    }

    let switchType = null;
    let switchMesh = null;
    if (floorIndex >= 3 && !hasItemBox && this.rng.next() < 0.24) {
      switchType = this.rng.pick(['speed_up', 'reverse_belt', 'rockfall']);
      switchMesh = this.createSwitchMesh(switchType);
      switchMesh.position.set(0, 0.4, 0);
      group.add(switchMesh);
    }

    this.root.add(group);

    this.platforms.set(floorIndex, {
      floorIndex,
      type,
      x,
      y,
      z,
      w,
      d,
      group,
      baseMesh,
      trimMesh,
      hasItemBox,
      itemBoxMesh,
      switchType,
      switchCooldown: 0,
      switchMesh,
      crackedTimer: 0,
      isBroken: false,
      brokenRespawnTimer: 0,
      catapultCharge: 0
    });

    // Secondary staggered platform for high-speed route choices!
    if (floorIndex >= 2 && this.rng.next() < 0.62) {
      const sideX = x > 0 ? this.rng.range(-6.2, -2.0) : this.rng.range(2.0, 6.2);
      const sideZ = this.rng.range(-2.2, 2.2);
      const sideType = this.pickPlatformType(floorIndex + 1);
      const sideW = 3.5;
      const sideD = 2.5;
      const sideKey = floorIndex + 0.5;

      const sGroup = new THREE.Group();
      sGroup.position.set(sideX, y - 0.85, sideZ);
      const sMeta = PLATFORM_TYPES[sideType] || PLATFORM_TYPES.normal;
      const sBase = new THREE.Mesh(
        new THREE.BoxGeometry(sideW, 0.46, sideD),
        new THREE.MeshStandardMaterial({ color: sMeta.color, roughness: 0.45 })
      );
      const sTrim = new THREE.Mesh(
        new THREE.BoxGeometry(sideW + 0.08, 0.12, sideD + 0.08),
        new THREE.MeshBasicMaterial({ color: sMeta.edge })
      );
      sTrim.position.y = 0.18;
      sGroup.add(sBase, sTrim);
      this.addPlatformVisuals(sGroup, sideType, sideW, sideD);

      let sItemMesh = null;
      let sHasItem = false;
      if (this.rng.next() < 0.42) {
        sHasItem = true;
        sItemMesh = this.createItemBoxMesh();
        sItemMesh.position.set(0, 0.9, 0);
        sGroup.add(sItemMesh);
      }

      this.root.add(sGroup);
      this.platforms.set(sideKey, {
        floorIndex,
        type: sideType,
        x: sideX,
        y: y - 0.85,
        z: sideZ,
        w: sideW,
        d: sideD,
        group: sGroup,
        baseMesh: sBase,
        trimMesh: sTrim,
        hasItemBox: sHasItem,
        itemBoxMesh: sItemMesh,
        switchType: null,
        switchCooldown: 0,
        switchMesh: null,
        crackedTimer: 0,
        isBroken: false,
        brokenRespawnTimer: 0,
        catapultCharge: 0
      });
    }
  }

  addPlatformVisuals(group, type, w, d) {
    if (type === 'spike') {
      const spikeGeo = new THREE.ConeGeometry(0.22, 0.55, 5);
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.7, roughness: 0.25 });
      for (let sx = -w * 0.38; sx <= w * 0.38; sx += 0.65) {
        for (let sz = -d * 0.32; sz <= d * 0.32; sz += 0.65) {
          const sp = new THREE.Mesh(spikeGeo, spikeMat);
          sp.position.set(sx, 0.5, sz);
          group.add(sp);
        }
      }
    } else if (type === 'spring') {
      const padGeo = new THREE.CylinderGeometry(w * 0.34, w * 0.38, 0.25, 16);
      const padMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xca8a04, emissiveIntensity: 0.3 });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = 0.36;
      group.add(pad);
    } else if (type === 'conveyor_left' || type === 'conveyor_right') {
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      for (let i = -1; i <= 1; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.45, 3), arrowMat);
        cone.rotation.z = type === 'conveyor_left' ? Math.PI / 2 : -Math.PI / 2;
        cone.position.set(i * 1.0, 0.3, 0);
        group.add(cone);
      }
    } else if (type === 'lava') {
      const lavaTop = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.9, 0.12, d * 0.85),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      lavaTop.position.y = 0.25;
      group.add(lavaTop);
    } else if (type === 'catapult') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.1, 8, 18),
        new THREE.MeshBasicMaterial({ color: 0xf0abfc })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.28;
      group.add(ring);
    }
  }

  createItemBoxMesh() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.4
      })
    );
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.76, 0.76),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, wireframe: true })
    );
    g.add(box, frame);
    return g;
  }

  createSwitchMesh(switchType) {
    const colorMap = {
      speed_up: 0xef4444,
      reverse_belt: 0x38bdf8,
      rockfall: 0xf97316
    };
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.16, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.46, 0.24, 16),
      new THREE.MeshBasicMaterial({ color: colorMap[switchType] || 0xef4444 })
    );
    btn.position.y = 0.12;
    g.add(base, btn);
    return g;
  }

  createFloorSignSprite(floorIndex) {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.roundRect(6, 6, 180, 52, 12);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`B${String(floorIndex).padStart(3, '0')}F`, 96, 42);

    const tex = new THREE.CanvasTexture(canvas);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(2.3, 0.78, 1);
    return sp;
  }

  cursePlatform(floorKey, newType = 'cracked') {
    const p = this.platforms.get(floorKey);
    if (!p) return false;
    p.type = newType;
    const meta = PLATFORM_TYPES[newType] || PLATFORM_TYPES.spike;
    p.baseMesh.material.color.setHex(meta.color);
    p.trimMesh.material.color.setHex(meta.edge);
    this.addPlatformVisuals(p.group, newType, p.w, p.d);
    return true;
  }

  spawnBananaHazard(x, y, z, ownerId) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 0.3 })
    );
    cone.position.y = 0.28;
    g.add(cone);
    g.position.set(x, y, z);
    this.root.add(g);

    const id = 'b_' + Math.random().toString(36).slice(2, 8);
    this.bananas.push({ id, mesh: g, x, y, z, ownerId, createdAt: performance.now() });
    return id;
  }

  triggerRockfall(referenceY) {
    for (let i = 0; i < 5; i++) {
      const rx = -6.5 + i * 3.2 + (Math.random() - 0.5) * 1.4;
      const rz = (Math.random() - 0.5) * 4.2;
      const ry = referenceY + 6 + i * 1.8;

      const rockMesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.75, 0),
        new THREE.MeshStandardMaterial({
          color: 0xea580c,
          emissive: 0xdc2626,
          emissiveIntensity: 0.65,
          roughness: 0.4
        })
      );
      rockMesh.position.set(rx, ry, rz);

      const lineGeo = new THREE.CylinderGeometry(0.08, 0.08, 28, 6);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.38
      });
      const warningLine = new THREE.Mesh(lineGeo, lineMat);
      warningLine.position.set(rx, ry - 14, rz);

      this.root.add(rockMesh, warningLine);
      this.rocks.push({
        mesh: rockMesh,
        warningLine,
        x: rx,
        y: ry,
        z: rz,
        vy: -16.5
      });
    }
  }

  update(dt, lowestPlayerY) {
    const deepestFloorNeeded = Math.max(30, Math.ceil(Math.abs(lowestPlayerY) / FLOOR_VERTICAL_GAP) + 20);
    this.ensureFloorsUpTo(deepestFloorNeeded);

    this.wallRingGroup.position.y = Math.floor(lowestPlayerY / 5) * 5;

    if (this.speedBoostTimer > 0) {
      this.speedBoostTimer = Math.max(0, this.speedBoostTimer - dt);
    }

    // Fast-paced Spiked Ceiling descent!
    const currentFloorDepth = Math.max(1, Math.floor(Math.abs(this.ceilingY) / FLOOR_VERTICAL_GAP));
    const baseSpeed = 3.55 + Math.min(3.4, currentFloorDepth * 0.055);
    const mult = this.speedBoostTimer > 0 ? 1.6 : 1.0;
    this.ceilingY -= baseSpeed * mult * dt;

    // Keep ceiling pressing right behind the action if players drop super fast!
    if (this.ceilingY - lowestPlayerY > 13.5) {
      this.ceilingY -= (this.ceilingY - lowestPlayerY - 13.5) * Math.min(1, dt * 5);
    }

    this.ceilingGroup.position.y = this.ceilingY;

    for (const [key, p] of this.platforms.entries()) {
      if (p.y > this.ceilingY + 16) {
        this.root.remove(p.group);
        this.platforms.delete(key);
        continue;
      }

      if (p.itemBoxMesh && p.hasItemBox) {
        p.itemBoxMesh.rotation.y += dt * 3.2;
        p.itemBoxMesh.rotation.x += dt * 1.5;
      }

      if (p.switchCooldown > 0) {
        p.switchCooldown = Math.max(0, p.switchCooldown - dt);
      }

      if (p.isBroken) {
        p.brokenRespawnTimer -= dt;
        if (p.brokenRespawnTimer <= 0) {
          p.isBroken = false;
          p.crackedTimer = 0;
          p.group.visible = true;
          p.group.position.x = p.x;
        }
      } else if (p.crackedTimer > 0) {
        p.crackedTimer += dt;
        p.group.position.x = p.x + Math.sin(performance.now() * 0.1) * 0.18;
        if (p.crackedTimer >= 0.36) {
          p.isBroken = true;
          p.brokenRespawnTimer = 2.2;
          p.group.visible = false;
        }
      }
    }

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.y += r.vy * dt;
      r.mesh.position.y = r.y;
      r.mesh.rotation.x += dt * 6;
      r.mesh.rotation.z += dt * 5;
      r.warningLine.position.y = r.y - 12;

      if (r.y < lowestPlayerY - 25) {
        this.root.remove(r.mesh);
        this.root.remove(r.warningLine);
        this.rocks.splice(i, 1);
      }
    }
  }
}

import * as THREE from 'three';

export const TRACK_LENGTH = 560;
export const ROW_LEN = 4.0;
export const NUM_ROWS = Math.floor(TRACK_LENGTH / ROW_LEN);
export const LANE_WIDTH = 2.2;
export const NUM_LANES = 5; // indices 0..4 -> u = (lane - 2) * LANE_WIDTH
export const TRACK_HALF_WIDTH = (NUM_LANES * LANE_WIDTH) / 2;
export const UPPER_DECK_HEIGHT = 4.6;

// Deterministic PRNG for multiplayer synced track generation
function createRNG(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class TrackWorld {
  constructor(scene) {
    this.scene = scene;
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.mode = 'spiral'; // 'spiral' | 'tube'
    this.seed = 123456;

    this.rows = []; // Array of row objects
    this.upperRows = []; // Array of upper shortcut tiles
    this.fragileTiles = []; // Quick list for updating cracking/falling tiles
    this.obstacles = []; // Pendulums, sweepers, bumpers
    this.itemBoxes = []; // Collectible mystery boxes
    this.droppedTraps = []; // Player-dropped slime traps
    this.shockwaves = []; // Expanding visual shockwave rings
    this.scenery = []; // Floating islands / rings

    this.initSharedMaterials();
  }

  initSharedMaterials() {
    this.mats = {
      normalA: new THREE.MeshStandardMaterial({ color: '#2b3566', roughness: 0.35, metalness: 0.15 }),
      normalB: new THREE.MeshStandardMaterial({ color: '#37437a', roughness: 0.35, metalness: 0.15 }),
      rail: new THREE.MeshStandardMaterial({ color: '#00f0ff', emissive: '#00a8ff', emissiveIntensity: 0.6 }),
      fragile: new THREE.MeshStandardMaterial({
        color: '#66f7ff',
        emissive: '#00bcd4',
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.78,
        roughness: 0.15
      }),
      fragileWarn: new THREE.MeshStandardMaterial({
        color: '#ff2a6d',
        emissive: '#ff0044',
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.9
      }),
      ice: new THREE.MeshStandardMaterial({
        color: '#a8ecff',
        emissive: '#38b6ff',
        emissiveIntensity: 0.2,
        roughness: 0.06,
        metalness: 0.35
      }),
      slime: new THREE.MeshStandardMaterial({
        color: '#39ff14',
        emissive: '#1ea800',
        emissiveIntensity: 0.45,
        roughness: 0.25
      }),
      spring: new THREE.MeshStandardMaterial({
        color: '#ffbe0b',
        emissive: '#ff8800',
        emissiveIntensity: 0.65,
        roughness: 0.25
      }),
      boost: new THREE.MeshStandardMaterial({
        color: '#ff007f',
        emissive: '#ff007f',
        emissiveIntensity: 0.85
      }),
      upperDeck: new THREE.MeshStandardMaterial({
        color: '#ffd166',
        emissive: '#f77f00',
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.88
      }),
      hazard: new THREE.MeshStandardMaterial({
        color: '#ff2a6d',
        emissive: '#d90429',
        emissiveIntensity: 0.6,
        roughness: 0.25
      }),
      itemBox: new THREE.MeshStandardMaterial({
        color: '#ffbe0b',
        emissive: '#ff5400',
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.3
      })
    };

    this.tileGeo = new THREE.BoxGeometry(LANE_WIDTH - 0.08, 0.36, ROW_LEN - 0.08);
  }

  // Maps logical track coordinates (u, h, s) -> 3D world position & orientation
  // u: lateral [-5.5..+5.5], h: height above track, s: forward distance [0..TRACK_LENGTH]
  getTrackTransform(u, h, s) {
    if (this.mode === 'tube') {
      // 360-degree Half-Pipe / Cylinder Tube combined with gentle 3D wave
      const radius = 4.6;
      const angle = (u / TRACK_HALF_WIDTH) * (Math.PI * 0.78); // Up the walls and nearly to ceiling!
      const centerX = Math.sin(s * 0.02) * 8;
      const centerY = -s * 0.1 + Math.cos(s * 0.035) * 2.2 + radius;
      const centerZ = -s;

      const effR = Math.max(0.8, radius - h);
      const wx = centerX + Math.sin(angle) * effR;
      const wy = centerY - Math.cos(angle) * effR;
      const wz = centerZ;

      return {
        position: new THREE.Vector3(wx, wy, wz),
        roll: -angle,
        pitch: -0.1,
        yaw: Math.cos(s * 0.02) * 0.16
      };
    }

    // Default: 'spiral' (3D Spiral Rollercoaster with banked turns & vertical hills)
    const waveX = Math.sin(s * 0.028) * 14 + Math.sin(s * 0.011) * 9;
    const slopeY = -s * 0.15 + Math.sin(s * 0.045) * 3.2;
    const bankRoll = Math.cos(s * 0.028) * 0.26;
    const yaw = Math.cos(s * 0.028) * 0.35;

    const cosR = Math.cos(bankRoll);
    const sinR = Math.sin(bankRoll);

    const wx = waveX + u * cosR - h * sinR;
    const wy = slopeY + u * sinR + h * cosR;
    const wz = -s;

    return {
      position: new THREE.Vector3(wx, wy, wz),
      roll: bankRoll,
      pitch: -0.15 + Math.cos(s * 0.045) * 0.12,
      yaw
    };
  }

  getZoneInfo(s) {
    const ratio = s / TRACK_LENGTH;
    if (ratio < 0.18) return { name: '🌈 霓虹起跑彎道', id: 'start' };
    if (ratio < 0.38) return { name: '💎 易碎水晶浮橋 (高空捷徑開放)', id: 'crystal' };
    if (ratio < 0.58) return { name: '❄️ 極地溜冰場 & 巨型擺錘', id: 'ice' };
    if (ratio < 0.80) return { name: '🧪 黏液沼澤 & 旋轉激光陣', id: 'slime' };
    return { name: '⚡ 終極螺旋衝刺段', id: 'final' };
  }

  buildTrack(seed = 123456, mode = 'spiral') {
    this.seed = seed;
    this.mode = mode;

    // Clear previous objects
    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.rows = [];
    this.upperRows = [];
    this.fragileTiles = [];
    this.obstacles = [];
    this.itemBoxes = [];
    this.droppedTraps = [];
    this.shockwaves = [];

    const rng = createRNG(seed);

    for (let r = 0; r <= NUM_ROWS; r++) {
      const s = r * ROW_LEN;
      const zone = this.getZoneInfo(s).id;
      const rowTiles = [];

      // Decide if this row is a cliff gap
      const isGapRow =
        r > 12 &&
        r < NUM_ROWS - 10 &&
        ((r % 26 === 0) || (zone === 'final' && r % 19 === 0));

      for (let lane = 0; lane < NUM_LANES; lane++) {
        const u = (lane - 2) * LANE_WIDTH;
        let type = 'normal';

        if (r < 6 || r >= NUM_ROWS - 4) {
          type = 'normal';
        } else if (isGapRow) {
          // Leave 1 spring pad before gap or make full/partial gap
          type = rng() < 0.75 ? 'gap' : 'fragile';
        } else if (zone === 'crystal') {
          const roll = rng();
          if (roll < 0.48) type = 'fragile';
          else if (roll < 0.56) type = 'spring';
          else if (roll < 0.64) type = 'boost';
        } else if (zone === 'ice') {
          const roll = rng();
          if (roll < 0.68) type = 'ice';
          else if (roll < 0.75) type = 'spring';
          else if (roll < 0.82) type = 'boost';
        } else if (zone === 'slime') {
          const roll = rng();
          if (roll < 0.42) type = 'slime';
          else if (roll < 0.54) type = 'fragile';
          else if (roll < 0.62) type = 'spring';
        } else if (zone === 'final') {
          const roll = rng();
          if (roll < 0.35) type = 'fragile';
          else if (roll < 0.55) type = 'ice';
          else if (roll < 0.68) type = 'boost';
          else if (roll < 0.74) type = 'spring';
        } else {
          // Starter zone
          const roll = rng();
          if (roll < 0.1) type = 'boost';
          else if (roll < 0.16 && r > 8) type = 'spring';
        }

        if (type === 'gap') {
          rowTiles.push({ r, lane, u, s, type: 'gap', state: 'broken', mesh: null });
          continue;
        }

        let mat = (r + lane) % 2 === 0 ? this.mats.normalA : this.mats.normalB;
        if (type === 'fragile') mat = this.mats.fragile.clone();
        else if (type === 'ice') mat = this.mats.ice;
        else if (type === 'slime') mat = this.mats.slime;
        else if (type === 'spring') mat = this.mats.spring;
        else if (type === 'boost') mat = this.mats.boost;

        const mesh = new THREE.Mesh(this.tileGeo, mat);
        const tf = this.getTrackTransform(u, -0.18, s);
        mesh.position.copy(tf.position);
        mesh.rotation.set(tf.pitch, tf.yaw, tf.roll);
        mesh.receiveShadow = true;
        this.worldGroup.add(mesh);

        const tileObj = {
          r,
          lane,
          u,
          s,
          type,
          state: 'intact', // 'intact' | 'cracking' | 'broken'
          timer: 0,
          basePos: tf.position.clone(),
          baseRot: new THREE.Euler(tf.pitch, tf.yaw, tf.roll),
          mesh
        };

        if (type === 'fragile') {
          this.fragileTiles.push(tileObj);
        }

        rowTiles.push(tileObj);
      }
      this.rows.push(rowTiles);

      // Build Upper Sky Shortcut Deck on certain stretches (rows 22..52 and 78..106)
      const hasUpper = (r >= 22 && r <= 52) || (r >= 78 && r <= 106);
      const upperRow = [];
      if (hasUpper) {
        for (let lane = 1; lane <= 3; lane++) {
          const u = (lane - 2) * LANE_WIDTH;
          const isBoost = r % 6 === 0 && lane === 2;
          const mesh = new THREE.Mesh(
            this.tileGeo,
            isBoost ? this.mats.boost : this.mats.upperDeck
          );
          const tf = this.getTrackTransform(u, UPPER_DECK_HEIGHT - 0.18, s);
          mesh.position.copy(tf.position);
          mesh.rotation.set(tf.pitch, tf.yaw, tf.roll);
          this.worldGroup.add(mesh);
          upperRow.push({
            r,
            lane,
            u,
            s,
            type: isBoost ? 'boost' : 'upper',
            mesh
          });
        }
      }
      this.upperRows.push(upperRow);

      // Spawn Mystery Item Boxes every 14 rows
      if (r > 8 && r < NUM_ROWS - 8 && r % 14 === 0) {
        const boxLanes = [-1.5 * LANE_WIDTH, 0, 1.5 * LANE_WIDTH];
        boxLanes.forEach((bu) => {
          this.spawnItemBox(bu, 0.9, s);
        });
        if (hasUpper) {
          this.spawnItemBox(0, UPPER_DECK_HEIGHT + 0.9, s);
        }
      }

      // Spawn Dynamic Traps & Obstacles
      if (r > 10 && r < NUM_ROWS - 8) {
        if (r % 15 === 7) {
          // Swinging Giant Pendulum Hammer
          this.spawnPendulum(s, rng() * Math.PI * 2);
        } else if (r % 13 === 4) {
          // Low Rotating Laser Sweeper Bar (Must Jump!)
          this.spawnSweeper(s, rng() * Math.PI);
        } else if (r % 9 === 2) {
          // Bouncy Pinball Bumper Pillar
          const bu = (Math.floor(rng() * 5) - 2) * LANE_WIDTH;
          this.spawnBumper(bu, s);
        }
      }
    }

    // Build Finish Line Arch at NUM_ROWS * ROW_LEN
    this.buildFinishArch(NUM_ROWS * ROW_LEN);

    // Build Floating Scenery Islands & Sky Rings
    this.buildScenery(rng);
  }

  repositionTrackMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;

    // Update all tile transforms smoothly to match new mode
    for (const row of this.rows) {
      for (const tile of row) {
        if (!tile.mesh) continue;
        const tf = this.getTrackTransform(tile.u, -0.18, tile.s);
        tile.basePos.copy(tf.position);
        tile.baseRot.set(tf.pitch, tf.yaw, tf.roll);
        if (tile.state === 'intact') {
          tile.mesh.position.copy(tf.position);
          tile.mesh.rotation.copy(tile.baseRot);
        }
      }
    }

    for (const uRow of this.upperRows) {
      for (const tile of uRow) {
        const tf = this.getTrackTransform(tile.u, UPPER_DECK_HEIGHT - 0.18, tile.s);
        tile.mesh.position.copy(tf.position);
        tile.mesh.rotation.set(tf.pitch, tf.yaw, tf.roll);
      }
    }

    for (const box of this.itemBoxes) {
      const tf = this.getTrackTransform(box.u, box.h, box.s);
      box.basePos.copy(tf.position);
      box.mesh.position.copy(tf.position);
    }
  }

  spawnItemBox(u, h, s) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), this.mats.itemBox);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.05, 8, 20),
      this.mats.rail
    );
    group.add(box, ring);

    const tf = this.getTrackTransform(u, h, s);
    group.position.copy(tf.position);
    this.worldGroup.add(group);

    this.itemBoxes.push({
      u,
      h,
      s,
      active: true,
      respawnTimer: 0,
      basePos: tf.position.clone(),
      mesh: group
    });
  }

  spawnPendulum(s, phase) {
    const pivotGroup = new THREE.Group();
    const tf = this.getTrackTransform(0, 6.2, s);
    pivotGroup.position.copy(tf.position);

    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 5.2, 8),
      new THREE.MeshStandardMaterial({ color: '#e0e6ed' })
    );
    rod.position.y = -2.6;

    const hammer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 2.2, 16),
      this.mats.hazard
    );
    hammer.rotation.z = Math.PI / 2;
    hammer.position.y = -5.1;

    pivotGroup.add(rod, hammer);
    this.worldGroup.add(pivotGroup);

    this.obstacles.push({
      type: 'pendulum',
      s,
      u: 0,
      h: 1.1,
      phase,
      speed: 2.3,
      mesh: pivotGroup
    });
  }

  spawnSweeper(s, phase) {
    const group = new THREE.Group();
    const tf = this.getTrackTransform(0, 0.55, s);
    group.position.copy(tf.position);

    const centerHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.9, 12),
      this.mats.hazard
    );
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_HALF_WIDTH * 1.75, 0.28, 0.28),
      new THREE.MeshStandardMaterial({
        color: '#ff0055',
        emissive: '#ff0055',
        emissiveIntensity: 0.9
      })
    );
    group.add(centerHub, bar);
    this.worldGroup.add(group);

    this.obstacles.push({
      type: 'sweeper',
      s,
      u: 0,
      h: 0.55,
      phase,
      speed: 2.8,
      mesh: group
    });
  }

  spawnBumper(u, s) {
    const group = new THREE.Group();
    const tf = this.getTrackTransform(u, 0.7, s);
    group.position.copy(tf.position);
    group.rotation.set(tf.pitch, tf.yaw, tf.roll);

    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.65, 1.4, 16),
      this.mats.spring
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.12, 10, 20),
      this.mats.boost
    );
    ring.rotation.x = Math.PI / 2;
    group.add(cyl, ring);
    this.worldGroup.add(group);

    this.obstacles.push({
      type: 'bumper',
      s,
      u,
      h: 0.7,
      mesh: group
    });
  }

  spawnDroppedTrap(u, h, s, ownerId) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.1, 0.22, 16),
      this.mats.slime
    );
    const tf = this.getTrackTransform(u, h + 0.1, s);
    mesh.position.copy(tf.position);
    mesh.rotation.set(tf.pitch, tf.yaw, tf.roll);
    this.worldGroup.add(mesh);

    this.droppedTraps.push({
      u,
      h,
      s,
      ownerId,
      active: true,
      mesh
    });
  }

  spawnShockwave(u, h, s, color = '#00f0ff') {
    const geo = new THREE.RingGeometry(0.4, 0.85, 28);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(geo, mat);
    const tf = this.getTrackTransform(u, h + 0.15, s);
    mesh.position.copy(tf.position);
    mesh.rotation.set(tf.pitch + Math.PI / 2, tf.yaw, tf.roll);
    this.worldGroup.add(mesh);

    this.shockwaves.push({
      mesh,
      age: 0,
      maxAge: 0.45
    });
  }

  buildFinishArch(s) {
    const archGroup = new THREE.Group();
    const tf = this.getTrackTransform(0, 0, s);
    archGroup.position.copy(tf.position);
    archGroup.rotation.set(tf.pitch, tf.yaw, tf.roll);

    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 8, 16);
    const leftPillar = new THREE.Mesh(pillarGeo, this.mats.boost);
    leftPillar.position.set(-TRACK_HALF_WIDTH, 4, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, this.mats.boost);
    rightPillar.position.set(TRACK_HALF_WIDTH, 4, 0);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2.2, 1.4, 0.6),
      this.mats.itemBox
    );
    banner.position.set(0, 7.6, 0);

    archGroup.add(leftPillar, rightPillar, banner);
    this.worldGroup.add(archGroup);
  }

  buildScenery(rng) {
    // Decorative floating neon rings & low-poly pastel islands along the course
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#00f0ff',
      emissive: '#0088ff',
      emissiveIntensity: 0.5
    });
    const islandMat = new THREE.MeshStandardMaterial({
      color: '#4a3b7c',
      roughness: 0.7
    });

    for (let s = 25; s < TRACK_LENGTH; s += 32) {
      const tf = this.getTrackTransform(0, 0, s);

      // Giant portal ring around track
      const portal = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.25, 10, 32), ringMat);
      portal.position.copy(tf.position);
      portal.rotation.set(tf.pitch, tf.yaw, tf.roll);
      this.worldGroup.add(portal);

      // Side floating islands
      [-1, 1].forEach((side) => {
        const island = new THREE.Mesh(
          new THREE.ConeGeometry(3 + rng() * 3, 5 + rng() * 4, 6),
          islandMat
        );
        island.position.copy(tf.position);
        island.position.x += side * (16 + rng() * 10);
        island.position.y -= 4 + rng() * 6;
        island.rotation.x = Math.PI;
        this.worldGroup.add(island);
      });
    }
  }

  triggerFragileTile(r, lane, immediate = false) {
    const row = this.rows[r];
    if (!row || !row[lane]) return;
    const tile = row[lane];
    if (tile.type !== 'fragile' || tile.state === 'broken') return;

    if (immediate) {
      tile.state = 'broken';
      tile.timer = 0;
    } else if (tile.state === 'intact') {
      tile.state = 'cracking';
      tile.timer = 0;
      tile.mesh.material = this.mats.fragileWarn;
    }
  }

  getTileAt(u, h, s) {
    const r = Math.round(s / ROW_LEN);
    if (r < 0 || r >= this.rows.length) return null;

    const lane = Math.round(u / LANE_WIDTH + 2);
    if (lane < 0 || lane >= NUM_LANES) return null;

    // Check Upper Shortcut Deck first if player is elevated
    if (h >= UPPER_DECK_HEIGHT - 0.85) {
      const uRow = this.upperRows[r];
      if (uRow && uRow.length > 0 && lane >= 1 && lane <= 3) {
        const uTile = uRow.find((t) => t.lane === lane);
        if (uTile) {
          return { ...uTile, deckHeight: UPPER_DECK_HEIGHT };
        }
      }
    }

    const tile = this.rows[r][lane];
    if (!tile || tile.state === 'broken') return null;
    return { ...tile, deckHeight: 0 };
  }

  update(dt, time) {
    // 1. Update Fragile Crystal Tiles
    for (const tile of this.fragileTiles) {
      if (tile.state === 'cracking') {
        tile.timer += dt;
        // Shake warning
        tile.mesh.position.x = tile.basePos.x + Math.sin(time * 55) * 0.08;
        if (tile.timer >= 0.42) {
          tile.state = 'broken';
          tile.timer = 0;
        }
      } else if (tile.state === 'broken') {
        tile.timer += dt;
        tile.mesh.position.y -= dt * 14;
        tile.mesh.rotation.x += dt * 3;
        if (tile.timer >= 4.0) {
          // Respawn crystal tile
          tile.state = 'intact';
          tile.timer = 0;
          tile.mesh.material = this.mats.fragile;
          tile.mesh.position.copy(tile.basePos);
          tile.mesh.rotation.copy(tile.baseRot);
        }
      }
    }

    // 2. Update Dynamic Obstacles
    for (const obs of this.obstacles) {
      if (obs.type === 'pendulum') {
        const swingAngle = Math.sin(time * obs.speed + obs.phase) * 0.95;
        const tf = this.getTrackTransform(0, 6.2, obs.s);
        obs.mesh.position.copy(tf.position);
        obs.mesh.rotation.z = swingAngle;
        obs.u = Math.sin(swingAngle) * 5.1;
        obs.h = 6.2 - Math.cos(swingAngle) * 5.1;
      } else if (obs.type === 'sweeper') {
        const tf = this.getTrackTransform(0, 0.55, obs.s);
        obs.mesh.position.copy(tf.position);
        obs.mesh.rotation.y = time * obs.speed + obs.phase;
        obs.angle = obs.mesh.rotation.y;
      } else if (obs.type === 'bumper') {
        const tf = this.getTrackTransform(obs.u, 0.7, obs.s);
        obs.mesh.position.copy(tf.position);
        obs.mesh.rotation.set(tf.pitch, tf.yaw, tf.roll);
      }
    }

    // 3. Update Mystery Item Boxes
    for (const box of this.itemBoxes) {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
      } else {
        box.mesh.rotation.y += dt * 2.4;
        box.mesh.position.y = box.basePos.y + Math.sin(time * 4 + box.s) * 0.16;
      }
    }

    // 4. Update Expanding Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const p = sw.age / sw.maxAge;
      if (p >= 1) {
        this.worldGroup.remove(sw.mesh);
        this.shockwaves.splice(i, 1);
      } else {
        const scale = 1 + p * 5.5;
        sw.mesh.scale.set(scale, scale, 1);
        sw.mesh.material.opacity = (1 - p) * 0.85;
      }
    }
  }
}

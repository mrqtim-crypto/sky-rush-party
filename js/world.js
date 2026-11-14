import * as THREE from 'three';

// 2,600 meters -> approx 3.5 to 4.5 minutes per match!
export const TRACK_LENGTH = 2600;
export const ROW_LEN = 4.0;
export const NUM_ROWS = Math.floor(TRACK_LENGTH / ROW_LEN); // 650 rows
export const LANE_WIDTH = 2.2;
export const NUM_LANES = 5; // lanes 0, 1, 2, 3, 4 -> u = (lane - 2) * LANE_WIDTH
export const TRACK_HALF_WIDTH = (NUM_LANES * LANE_WIDTH) / 2;

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

    this.seed = 123456;
    this.rows = [];
    this.crumblingTiles = [];
    this.traps = []; // All traps: high_fire, high_gate, low_spikes, low_log, boulder, swing_axe, divider
    this.boostPads = [];
    this.shockwaves = [];

    this.initSharedAssets();
  }

  initSharedAssets() {
    this.mats = {
      sandA: new THREE.MeshStandardMaterial({ color: '#e6be8a', roughness: 0.75, metalness: 0.05 }),
      sandB: new THREE.MeshStandardMaterial({ color: '#d8ad75', roughness: 0.75, metalness: 0.05 }),
      branchLeft: new THREE.MeshStandardMaterial({ color: '#ecc878', roughness: 0.65 }),
      branchRight: new THREE.MeshStandardMaterial({ color: '#cfa068', roughness: 0.75 }),
      curb: new THREE.MeshStandardMaterial({ color: '#b5834c', roughness: 0.8 }),
      dividerWall: new THREE.MeshStandardMaterial({ color: '#9c6b3b', roughness: 0.75 }),
      crumble: new THREE.MeshStandardMaterial({ color: '#c47d52', roughness: 0.85 }),
      crumbleWarn: new THREE.MeshStandardMaterial({
        color: '#ff4d29',
        emissive: '#cc2200',
        emissiveIntensity: 0.6
      }),
      quicksand: new THREE.MeshStandardMaterial({
        color: '#c28e38',
        emissive: '#4a3208',
        emissiveIntensity: 0.25,
        roughness: 0.9
      }),
      scarabBoost: new THREE.MeshStandardMaterial({
        color: '#00e5ff',
        emissive: '#00a8cc',
        emissiveIntensity: 0.75,
        roughness: 0.2
      }),
      gold: new THREE.MeshStandardMaterial({
        color: '#ffd166',
        roughness: 0.28,
        metalness: 0.65
      }),
      fireBeam: new THREE.MeshStandardMaterial({
        color: '#ff5400',
        emissive: '#ff2200',
        emissiveIntensity: 1.1
      }),
      stoneTrap: new THREE.MeshStandardMaterial({
        color: '#7f5539',
        roughness: 0.8
      }),
      spikeMetal: new THREE.MeshStandardMaterial({
        color: '#d90429',
        emissive: '#660011',
        emissiveIntensity: 0.35,
        metalness: 0.5,
        roughness: 0.3
      }),
      boulder: new THREE.MeshStandardMaterial({
        color: '#8d6346',
        roughness: 0.85
      })
    };

    this.tileGeo = new THREE.BoxGeometry(LANE_WIDTH - 0.06, 0.4, ROW_LEN - 0.06);
  }

  // Clean, readable single-layer path with gentle scenic curves (no disorienting tilt)
  getTrackTransform(u, h, s) {
    const gentleCurveX = Math.sin(s * 0.008) * 9.0;
    const gentleSlopeY = Math.sin(s * 0.015) * 1.2;
    const yaw = Math.cos(s * 0.008) * 0.072;

    return {
      position: new THREE.Vector3(gentleCurveX + u, gentleSlopeY + h, -s),
      roll: 0,
      pitch: 0,
      yaw
    };
  }

  getZoneInfo(s) {
    const ratio = s / TRACK_LENGTH;
    if (ratio < 0.20) return { name: '🏜️ 第一章：獅身人面像沙道', id: 'sphinx' };
    if (ratio < 0.40) return { name: '🏛️ 第二章：阿努比斯雙岔迴廊 (左右支線)', id: 'anubis' };
    if (ratio < 0.60) return { name: '🔥 第三章：太陽神火焰機關室', id: 'fire' };
    if (ratio < 0.80) return { name: '🪨 第四章：法老巨石墓道 (左右支線)', id: 'boulder' };
    return { name: '👑 最終章：黃金金字塔王座廳', id: 'finale' };
  }

  buildTrack(seed = 123456) {
    this.seed = seed;

    while (this.worldGroup.children.length > 0) {
      this.worldGroup.remove(this.worldGroup.children[0]);
    }
    this.rows = [];
    this.crumblingTiles = [];
    this.traps = [];
    this.shockwaves = [];

    const rng = createRNG(seed);

    for (let r = 0; r <= NUM_ROWS; r++) {
      const s = r * ROW_LEN;
      const rowTiles = [];

      // Determine if this row is inside a Split Branch Section (左右支線分流，之後匯合回主線)
      // Occurs periodically for 14 rows every 46 rows
      const branchCycle = r % 46;
      const isBranchSection = r > 20 && r < NUM_ROWS - 20 && branchCycle >= 14 && branchCycle <= 28;

      // Occasional pit gap row (not inside branch walls)
      const isPitRow = !isBranchSection && r > 18 && r < NUM_ROWS - 12 && r % 38 === 0;

      for (let lane = 0; lane < NUM_LANES; lane++) {
        const u = (lane - 2) * LANE_WIDTH;

        // If inside a split branch section, lane 2 (center) is a stone divider wall separating Left Branch (0,1) & Right Branch (3,4)!
        if (isBranchSection && lane === 2) {
          const wallMesh = new THREE.Mesh(
            new THREE.BoxGeometry(LANE_WIDTH * 0.88, 2.6, ROW_LEN),
            this.mats.dividerWall
          );
          const tf = this.getTrackTransform(u, 1.1, s);
          wallMesh.position.copy(tf.position);
          wallMesh.rotation.y = tf.yaw;
          this.worldGroup.add(wallMesh);

          // Add golden top trim on divider
          if (branchCycle === 14 || branchCycle === 28) {
            const statue = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), this.mats.gold);
            statue.position.copy(tf.position);
            statue.position.y += 2.1;
            this.worldGroup.add(statue);
          }

          rowTiles.push({
            r,
            lane,
            u,
            s,
            type: 'wall',
            state: 'intact',
            mesh: wallMesh
          });
          continue;
        }

        let type = 'normal';
        if (r < 8 || r > NUM_ROWS - 6) {
          type = 'normal';
        } else if (isPitRow && (lane === 1 || lane === 3)) {
          type = 'gap';
        } else if (isBranchSection) {
          // Left branch (lanes 0,1): High-speed Scarab route with boost pads
          // Right branch (lanes 3,4): Steady route with quicksand/crumble
          if (lane < 2 && branchCycle % 5 === 0 && lane === 0) {
            type = 'boost';
          } else if (lane > 2 && branchCycle % 6 === 0 && lane === 4) {
            type = 'quicksand';
          }
        } else {
          const roll = rng();
          if (roll < 0.08) type = 'crumble';
          else if (roll < 0.14) type = 'quicksand';
          else if (roll < 0.18) type = 'boost';
        }

        if (type === 'gap') {
          rowTiles.push({ r, lane, u, s, type: 'gap', state: 'broken', mesh: null });
          continue;
        }

        let mat = (r + lane) % 2 === 0 ? this.mats.sandA : this.mats.sandB;
        if (isBranchSection && lane < 2) mat = this.mats.branchLeft;
        else if (isBranchSection && lane > 2) mat = this.mats.branchRight;
        if (type === 'crumble') mat = this.mats.crumble.clone();
        else if (type === 'quicksand') mat = this.mats.quicksand;
        else if (type === 'boost') mat = this.mats.scarabBoost;

        const mesh = new THREE.Mesh(this.tileGeo, mat);
        const tf = this.getTrackTransform(u, -0.2, s);
        mesh.position.copy(tf.position);
        mesh.rotation.y = tf.yaw;
        mesh.receiveShadow = true;
        this.worldGroup.add(mesh);

        const tileObj = {
          r,
          lane,
          u,
          s,
          type,
          state: 'intact',
          timer: 0,
          basePos: tf.position.clone(),
          mesh
        };

        if (type === 'crumble') {
          this.crumblingTiles.push(tileObj);
        }

        rowTiles.push(tileObj);
      }

      this.rows.push(rowTiles);

      // Decorative sandstone side curbs & periodic Pyramid Pillars / Torches
      if (r % 8 === 0) {
        this.spawnSidePillars(s);
      }

      // Spawn Egyptian Traps cleanly spaced every 5-6 rows so screen stays clean & readable
      if (r > 10 && r < NUM_ROWS - 8 && r % 5 === 0) {
        if (isBranchSection) {
          // Separate traps for Left Branch and Right Branch!
          if (r % 10 === 0) {
            this.spawnBranchHighFire(s, -1.5 * LANE_WIDTH, LANE_WIDTH * 2); // Left branch: Crouch!
            this.spawnBranchLowSpikes(s, 1.5 * LANE_WIDTH, LANE_WIDTH * 2); // Right branch: Jump!
          } else {
            this.spawnBranchLowSpikes(s, -1.5 * LANE_WIDTH, LANE_WIDTH * 2);
            this.spawnBranchHighGate(s, 1.5 * LANE_WIDTH, LANE_WIDTH * 2);
          }
        } else {
          // Main 5-lane corridor traps
          const trapRoll = rng();
          if (trapRoll < 0.24) {
            // 1. HIGH TRAP: Overhead Fire Beam -> MUST CROUCH (蹲下)!
            this.spawnHighFireBeam(s);
          } else if (trapRoll < 0.46) {
            // 2. HIGH TRAP: Low Hanging Stone Gate -> MUST CROUCH (蹲下)!
            this.spawnHighStoneGate(s);
          } else if (trapRoll < 0.68) {
            // 3. LOW TRAP: Rolling Spike Log -> MUST JUMP (跳躍)!
            this.spawnLowRollingLog(s);
          } else if (trapRoll < 0.85) {
            // 4. LOW TRAP: Floor Spikes across 3 lanes -> JUMP or DODGE!
            const centerLane = (Math.floor(rng() * 3) - 1) * LANE_WIDTH;
            this.spawnBranchLowSpikes(s, centerLane, LANE_WIDTH * 3);
          } else {
            // 5. LANE TRAP: Swinging Golden Axe or Giant Rolling Boulder -> LEFT/RIGHT!
            if (rng() < 0.5) {
              this.spawnSwingingAxe(s, rng() * Math.PI * 2);
            } else {
              const bLane = (Math.floor(rng() * 5) - 2) * LANE_WIDTH;
              this.spawnBoulder(s, bLane);
            }
          }
        }
      }
    }

    this.buildSceneryPyramids();
    this.buildFinishPharaohGate(NUM_ROWS * ROW_LEN);
  }

  spawnSidePillars(s) {
    const tf = this.getTrackTransform(0, 0, s);
    [-1, 1].forEach((side) => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.52, 4.5, 8),
        this.mats.curb
      );
      col.position.set(tf.position.x + side * (TRACK_HALF_WIDTH + 0.9), tf.position.y + 2.1, tf.position.z);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), this.mats.gold);
      cap.position.set(col.position.x, col.position.y + 2.3, col.position.z);

      this.worldGroup.add(col, cap);
    });
  }

  // HIGH TRAP 1: Overhead Fire Beam (h = 1.05..2.0) -> Players MUST CROUCH (蹲下) to pass!
  spawnHighFireBeam(s) {
    this.spawnBranchHighFire(s, 0, TRACK_HALF_WIDTH * 1.9);
  }

  spawnBranchHighFire(s, centerU, width) {
    const group = new THREE.Group();
    const tf = this.getTrackTransform(centerU, 0, s);
    group.position.copy(tf.position);
    group.rotation.y = tf.yaw;

    // Side braziers
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 2.4, 0.5),
        this.mats.stoneTrap
      );
      post.position.set(side * (width / 2), 1.2, 0);
      group.add(post);
    });

    // Horizontal Flame Beam at head level (y = 1.35)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, width, 12),
      this.mats.fireBeam
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 1.35;
    group.add(beam);

    this.worldGroup.add(group);
    this.traps.push({
      type: 'high_fire',
      name: '火焰橫樑 (請按蹲下 ⬇️)',
      s,
      uMin: centerU - width / 2,
      uMax: centerU + width / 2,
      mesh: group
    });
  }

  // HIGH TRAP 2: Low Hanging Stone Gate -> Players MUST CROUCH (蹲下)!
  spawnHighStoneGate(s) {
    this.spawnBranchHighGate(s, 0, TRACK_HALF_WIDTH * 1.9);
  }

  spawnBranchHighGate(s, centerU, width) {
    const group = new THREE.Group();
    const tf = this.getTrackTransform(centerU, 0, s);
    group.position.copy(tf.position);
    group.rotation.y = tf.yaw;

    // Hanging sandstone block leaving only 0.95m clearance underneath
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.6, 0.9),
      this.mats.stoneTrap
    );
    lintel.position.y = 1.85;

    const goldStripe = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.05, 0.22, 0.95),
      this.mats.gold
    );
    goldStripe.position.y = 1.12;

    group.add(lintel, goldStripe);
    this.worldGroup.add(group);

    this.traps.push({
      type: 'high_gate',
      name: '壓頂石門 (請按蹲下 ⬇️)',
      s,
      uMin: centerU - width / 2,
      uMax: centerU + width / 2,
      mesh: group
    });
  }

  // LOW TRAP 1: Floor Spikes -> Players MUST JUMP (跳躍)!
  spawnBranchLowSpikes(s, centerU, width) {
    const group = new THREE.Group();
    const tf = this.getTrackTransform(centerU, 0, s);
    group.position.copy(tf.position);
    group.rotation.y = tf.yaw;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.12, 1.1),
      this.mats.stoneTrap
    );
    base.position.y = 0.06;
    group.add(base);

    const spikeGeo = new THREE.ConeGeometry(0.18, 0.72, 8);
    const count = Math.floor(width / 0.55);
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Mesh(spikeGeo, this.mats.spikeMetal);
      sp.position.set(-width / 2 + 0.3 + i * 0.55, 0.42, 0);
      group.add(sp);
    }

    this.worldGroup.add(group);
    this.traps.push({
      type: 'low_spikes',
      name: '地刺機關 (請按跳躍 ⬆️)',
      s,
      uMin: centerU - width / 2,
      uMax: centerU + width / 2,
      mesh: group
    });
  }

  // LOW TRAP 2: Low Rolling Spike Log -> Players MUST JUMP (跳躍)!
  spawnLowRollingLog(s) {
    const width = TRACK_HALF_WIDTH * 1.85;
    const group = new THREE.Group();
    const tf = this.getTrackTransform(0, 0.42, s);
    group.position.copy(tf.position);
    group.rotation.y = tf.yaw;

    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, width, 14),
      this.mats.stoneTrap
    );
    log.rotation.z = Math.PI / 2;

    const goldRingLeft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.3, 14),
      this.mats.gold
    );
    goldRingLeft.rotation.z = Math.PI / 2;
    goldRingLeft.position.x = -width * 0.3;

    const goldRingRight = goldRingLeft.clone();
    goldRingRight.position.x = width * 0.3;

    group.add(log, goldRingLeft, goldRingRight);
    this.worldGroup.add(group);

    this.traps.push({
      type: 'low_log',
      name: '尖刺滾木 (請按跳躍 ⬆️)',
      s,
      uMin: -width / 2,
      uMax: width / 2,
      mesh: group
    });
  }

  // LANE TRAP 1: Swinging Golden Pharaoh Axe -> Dodge Left/Right!
  spawnSwingingAxe(s, phase) {
    const pivot = new THREE.Group();
    const tf = this.getTrackTransform(0, 5.4, s);
    pivot.position.copy(tf.position);
    pivot.rotation.y = tf.yaw;

    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8),
      this.mats.gold
    );
    rod.position.y = -2.2;

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.3, 1.8),
      this.mats.spikeMetal
    );
    blade.position.y = -4.3;

    pivot.add(rod, blade);
    this.worldGroup.add(pivot);

    this.traps.push({
      type: 'swing_axe',
      name: '法老巨擺斧',
      s,
      u: 0,
      h: 1.0,
      phase,
      speed: 2.1,
      mesh: pivot
    });
  }

  // LANE TRAP 2: Giant Rolling Sandstone Boulder -> Dodge Left/Right!
  spawnBoulder(s, laneU) {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.05, 1),
      this.mats.boulder
    );
    const tf = this.getTrackTransform(laneU, 1.05, s);
    mesh.position.copy(tf.position);
    this.worldGroup.add(mesh);

    this.traps.push({
      type: 'boulder',
      name: '法老滾石',
      s,
      baseU: laneU,
      u: laneU,
      h: 1.05,
      mesh
    });
  }

  buildSceneryPyramids() {
    // Distant monumental Great Pyramids on both sides of the desert horizon
    const pyrMat = new THREE.MeshStandardMaterial({
      color: '#d4a359',
      roughness: 0.85
    });

    for (let s = 120; s < TRACK_LENGTH; s += 240) {
      [-1, 1].forEach((side) => {
        const size = 38 + (s % 25);
        const pyr = new THREE.Mesh(new THREE.ConeGeometry(size, size * 1.1, 4), pyrMat);
        pyr.position.set(side * 85, size * 0.45 - 6, -s);
        pyr.rotation.y = Math.PI / 4;
        this.worldGroup.add(pyr);
      });
    }
  }

  buildFinishPharaohGate(s) {
    const group = new THREE.Group();
    const tf = this.getTrackTransform(0, 0, s);
    group.position.copy(tf.position);
    group.rotation.y = tf.yaw;

    const pillarGeo = new THREE.BoxGeometry(1.5, 8.5, 1.5);
    const leftP = new THREE.Mesh(pillarGeo, this.mats.gold);
    leftP.position.set(-TRACK_HALF_WIDTH, 4.25, 0);
    const rightP = new THREE.Mesh(pillarGeo, this.mats.gold);
    rightP.position.set(TRACK_HALF_WIDTH, 4.25, 0);

    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2.3, 1.8, 1.8),
      this.mats.gold
    );
    topBeam.position.set(0, 8.2, 0);

    group.add(leftP, rightP, topBeam);
    this.worldGroup.add(group);
  }

  spawnShockwave(u, h, s, color = '#ffd166') {
    const geo = new THREE.RingGeometry(0.4, 0.85, 24);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(geo, mat);
    const tf = this.getTrackTransform(u, h + 0.15, s);
    mesh.position.copy(tf.position);
    mesh.rotation.x = Math.PI / 2;
    this.worldGroup.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.4 });
  }

  triggerCrumbleTile(r, lane) {
    const row = this.rows[r];
    if (!row || !row[lane]) return;
    const tile = row[lane];
    if (tile.type !== 'crumble' || tile.state !== 'intact') return;
    tile.state = 'cracking';
    tile.timer = 0;
    tile.mesh.material = this.mats.crumbleWarn;
  }

  getTileAt(u, s) {
    const r = Math.round(s / ROW_LEN);
    if (r < 0 || r >= this.rows.length) return null;
    const lane = Math.round(u / LANE_WIDTH + 2);
    if (lane < 0 || lane >= NUM_LANES) return null;
    const tile = this.rows[r][lane];
    if (!tile || tile.state === 'broken') return null;
    return tile;
  }

  update(dt, time) {
    // 1. Update crumbling sandstone tiles
    for (const tile of this.crumblingTiles) {
      if (tile.state === 'cracking') {
        tile.timer += dt;
        tile.mesh.position.x = tile.basePos.x + Math.sin(time * 50) * 0.07;
        if (tile.timer >= 0.55) {
          tile.state = 'broken';
          tile.timer = 0;
        }
      } else if (tile.state === 'broken') {
        tile.timer += dt;
        tile.mesh.position.y -= dt * 12;
        if (tile.timer >= 4.0) {
          tile.state = 'intact';
          tile.timer = 0;
          tile.mesh.material = this.mats.crumble;
          tile.mesh.position.copy(tile.basePos);
        }
      }
    }

    // 2. Animate dynamic traps
    for (const trap of this.traps) {
      if (trap.type === 'swing_axe') {
        const angle = Math.sin(time * trap.speed + trap.phase) * 0.88;
        trap.mesh.rotation.z = angle;
        trap.u = Math.sin(angle) * 4.3;
        trap.h = 5.4 - Math.cos(angle) * 4.3;
      } else if (trap.type === 'boulder') {
        trap.u = trap.baseU + Math.sin(time * 1.8 + trap.s) * 2.2;
        const tf = this.getTrackTransform(trap.u, 1.05, trap.s);
        trap.mesh.position.copy(tf.position);
        trap.mesh.rotation.x -= dt * 4;
        trap.mesh.rotation.z -= dt * 2;
      } else if (trap.type === 'low_log') {
        trap.mesh.children[0].rotation.x += dt * 5;
      }
    }

    // 3. Shockwave rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const p = sw.age / sw.maxAge;
      if (p >= 1) {
        this.worldGroup.remove(sw.mesh);
        this.shockwaves.splice(i, 1);
      } else {
        const sc = 1 + p * 4.5;
        sw.mesh.scale.set(sc, sc, 1);
        sw.mesh.material.opacity = (1 - p) * 0.85;
      }
    }
  }
}

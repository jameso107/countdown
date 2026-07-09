import * as THREE from 'three';
import { WALL_H, ROOM_B } from './world.js';
import { audio } from './audio.js';

const BALL_R = 0.12;
const GRAVITY = 9.8;
const MAX_BALLS = 7;

const RIM = { x: 25.95, y: 3.05, z: 0, r: 0.33, tube: 0.025 };
const BOARD = { x0: 26.34, x1: 26.4, y0: 2.85, y1: 3.9, z0: -0.75, z1: 0.75 };

function makeBallTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8722a';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#5a2c10';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();          // equator
  [64, 192].forEach((x) => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }); // meridians
  [[0, 40], [128, 40], [256, 40]].forEach(([x]) => {
    g.beginPath(); g.arc(x, 64, 46, 0, Math.PI * 2); g.stroke();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeScoreboard() {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 224;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  function draw(score, best, flash) {
    g.fillStyle = flash ? '#2a2410' : '#0c1024';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = flash ? '#ffd98e' : 'rgba(55,224,255,0.8)';
    g.lineWidth = 6;
    g.strokeRect(10, 10, c.width - 20, c.height - 20);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '34px Georgia, serif';
    g.fillStyle = 'rgba(55,224,255,0.9)';
    g.fillText('SCORE', 240, 62);
    g.fillText('BEST STREAK', 550, 62);
    g.font = 'bold 100px Menlo, Consolas, monospace';
    g.fillStyle = flash ? '#ffe9b8' : '#fdf6e3';
    g.shadowColor = flash ? '#f0a35e' : 'rgba(55,224,255,0.7)';
    g.shadowBlur = 20;
    g.fillText(String(score), 240, 148);
    g.fillText(String(best), 550, 148);
    g.shadowBlur = 0;
    tex.needsUpdate = true;
  }
  draw(0, 0, false);
  return { texture: tex, draw };
}

export class Game {
  constructor(scene, camera, world, player) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.colliders = world.ballColliders;

    this.score = 0;
    this.streak = 0;
    this.best = 0;
    this.balls = [];
    this.bursts = [];
    this.charge = { active: false, t: 0 };
    this.handTimer = 0;
    this.flashUntil = 0;

    this.powerwrap = document.getElementById('powerwrap');
    this.powerbar = document.getElementById('powerbar');
    this.toast = document.getElementById('toast');
    this.toastTimer = null;

    this.ballTex = makeBallTexture();
    this.ballGeo = new THREE.SphereGeometry(BALL_R, 24, 16);
    this.ballMat = new THREE.MeshStandardMaterial({ map: this.ballTex, roughness: 0.72 });

    this.#buildHoop();
    this.#wireInput();

    // ball held in hand (slightly scaled down so it doesn't dominate the view)
    this.held = new THREE.Mesh(this.ballGeo, this.ballMat);
    this.held.scale.setScalar(0.85);
    scene.add(this.held);
  }

  // -------------------------------------------------------------------------
  #buildHoop() {
    const s = this.scene;

    // backboard (white with orange target box)
    const bc = document.createElement('canvas');
    bc.width = 256; bc.height = 180;
    const bg = bc.getContext('2d');
    bg.fillStyle = '#f4f6fa'; bg.fillRect(0, 0, 256, 180);
    bg.strokeStyle = '#e8722a'; bg.lineWidth = 10;
    bg.strokeRect(8, 8, 240, 164);
    bg.lineWidth = 7;
    bg.strokeRect(88, 92, 80, 62);
    const boardTex = new THREE.CanvasTexture(bc);
    boardTex.colorSpace = THREE.SRGBColorSpace;

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, BOARD.z1 - BOARD.z0),
      [
        new THREE.MeshStandardMaterial({ color: 0xd8dce6 }), // +x (wall side)
        new THREE.MeshStandardMaterial({ map: boardTex }),   // -x (front)
        new THREE.MeshStandardMaterial({ color: 0xd8dce6 }),
        new THREE.MeshStandardMaterial({ color: 0xd8dce6 }),
        new THREE.MeshStandardMaterial({ color: 0xd8dce6 }),
        new THREE.MeshStandardMaterial({ color: 0xd8dce6 }),
      ]
    );
    board.position.set((BOARD.x0 + BOARD.x1) / 2, (BOARD.y0 + BOARD.y1) / 2, 0);
    s.add(board);
    this.colliders.push({ ...BOARD });

    // mount arm
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x444a5c, metalness: 0.6, roughness: 0.4 })
    );
    arm.position.set(26.7, 3.6, 0);
    s.add(arm);

    // rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(RIM.r, RIM.tube, 12, 36),
      new THREE.MeshStandardMaterial({ color: 0xe8571e, metalness: 0.5, roughness: 0.35 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(RIM.x, RIM.y, RIM.z);
    s.add(rim);

    // net
    const net = new THREE.Mesh(
      new THREE.CylinderGeometry(RIM.r - 0.01, 0.17, 0.46, 10, 5, true),
      new THREE.MeshBasicMaterial({ color: 0xf0f0f0, wireframe: true, transparent: true, opacity: 0.45 })
    );
    net.position.set(RIM.x, RIM.y - 0.24, RIM.z);
    s.add(net);

    // scoreboard on the wall above
    this.scoreboard = makeScoreboard();
    const sb = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.67),
      new THREE.MeshBasicMaterial({ map: this.scoreboard.texture })
    );
    sb.rotation.y = -Math.PI / 2;
    sb.position.set(ROOM_B.x1 - 0.03, 4.25, 0);
    s.add(sb);

    // court markings: free-throw arc decal on floor
    const arcGeo = new THREE.RingGeometry(2.2, 2.28, 48, 1, 0, Math.PI);
    const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0xf0a35e, transparent: true, opacity: 0.55 }));
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = Math.PI / 2;
    arc.position.set(RIM.x - 1.2, 0.012, 0);
    s.add(arc);
  }

  #wireInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.player.locked) this.#chargeStart();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.#chargeEnd();
    });
    const btn = document.getElementById('throwbtn');
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.#chargeStart(); }, { passive: false });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.#chargeEnd(); }, { passive: false });
  }

  #chargeStart() {
    if (!this.player.active || this.charge.active || !this.held.visible) return;
    this.charge.active = true;
    this.charge.t = 0.18;
    this.powerwrap.style.opacity = '1';
  }

  #chargeEnd() {
    if (!this.charge.active) return;
    this.charge.active = false;
    this.powerwrap.style.opacity = '0';
    this.#throw(this.charge.t);
  }

  #throw(power) {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const vel = dir.clone().add(new THREE.Vector3(0, 0.32, 0)).normalize().multiplyScalar(5.2 + 10.6 * power);

    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.position.copy(this.held.position);
    this.scene.add(mesh);
    this.balls.push({
      mesh,
      pos: mesh.position,
      vel,
      prevY: mesh.position.y,
      age: 0,
      restTime: 0,
      scored: false,
      fading: 0,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
    });

    if (this.balls.length > MAX_BALLS) {
      const old = this.balls.shift();
      this.scene.remove(old.mesh);
    }

    this.held.visible = false;
    this.handTimer = 0.7;
    audio.whoosh();
  }

  #onScore() {
    this.score += 1;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    this.flashUntil = performance.now() + 500;
    this.scoreboard.draw(this.score, this.best, true);
    audio.chime();
    this.#burst();

    const msg = this.streak >= 5 ? 'UNSTOPPABLE ♥' : this.streak >= 3 ? 'ON FIRE!' : this.streak === 2 ? 'HEATING UP!' : 'SWISH!';
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 1200);
  }

  #burst() {
    const N = 26;
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = RIM.x; pos[i * 3 + 1] = RIM.y; pos[i * 3 + 2] = RIM.z;
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.6, (Math.random() - 0.5) * 3));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffd98e, size: 0.06, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0, max: 0.85 });
  }

  // -------------------------------------------------------------------------
  update(dt) {
    // charging
    if (this.charge.active) {
      this.charge.t = Math.min(1, this.charge.t + dt / 1.15);
      this.powerbar.style.width = `${Math.round(this.charge.t * 100)}%`;
    }

    // held ball follows the camera
    if (!this.held.visible) {
      this.handTimer -= dt;
      if (this.handTimer <= 0) this.held.visible = true;
    }
    if (this.held.visible) {
      const pull = this.charge.active ? 0.1 * this.charge.t : 0;
      // keep the ball on-screen on narrow (portrait) viewports
      const hx = Math.min(0.42, 0.45 * this.camera.aspect);
      this.held.position.set(hx, -0.37, -0.95 + pull).applyMatrix4(this.camera.matrixWorld);
      this.held.rotation.copy(this.camera.rotation);
    }

    // balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.age += dt;

      if (b.fading > 0) {
        b.fading -= dt;
        const k = Math.max(0.001, b.fading / 0.35);
        b.mesh.scale.setScalar(k);
        if (b.fading <= 0) {
          this.scene.remove(b.mesh);
          this.balls.splice(i, 1);
          if (!b.scored) this.streak = 0;
        }
        continue;
      }

      // substep fast balls so they can't tunnel through walls or the rim plane
      const steps = Math.min(8, Math.max(1, Math.ceil((b.vel.length() * dt) / 0.05)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        b.prevY = b.pos.y;
        b.vel.y -= GRAVITY * h;
        b.pos.addScaledVector(b.vel, h);

        // floor
        if (b.pos.y < BALL_R) {
          b.pos.y = BALL_R;
          if (b.vel.y < -0.4) {
            audio.thud(Math.min(1, -b.vel.y / 6));
            b.vel.y = -b.vel.y * 0.62;
            b.vel.x *= 0.82;
            b.vel.z *= 0.82;
          } else {
            b.vel.y = 0;
          }
        }
        // ceiling
        if (b.pos.y > WALL_H - BALL_R) {
          b.pos.y = WALL_H - BALL_R;
          if (b.vel.y > 0) b.vel.y = -b.vel.y * 0.5;
        }

        // gentle aim assist: descending balls close above the rim drift toward it
        if (!b.scored && b.vel.y < 0 && b.pos.y > RIM.y && b.pos.y < RIM.y + 0.9) {
          const ax = RIM.x - b.pos.x, az = RIM.z - b.pos.z;
          const ad = Math.hypot(ax, az);
          if (ad > 0.02 && ad < 0.55) {
            b.vel.x += (ax / ad) * 2.4 * h;
            b.vel.z += (az / ad) * 2.4 * h;
          }
        }

        this.#collideWalls(b);
        this.#collideRim(b);

        // scoring: crossed the rim plane downward, inside the ring
        if (!b.scored && b.vel.y < 0 && b.prevY > RIM.y && b.pos.y <= RIM.y) {
          const dx = b.pos.x - RIM.x, dz = b.pos.z - RIM.z;
          if (dx * dx + dz * dz < (RIM.r - 0.03) ** 2) {
            b.scored = true;
            this.#onScore();
          }
        }
      }

      b.mesh.rotation.x += b.spin.x * b.vel.length() * dt;
      b.mesh.rotation.z += b.spin.z * b.vel.length() * dt;

      // rolling friction
      if (b.pos.y <= BALL_R + 0.002 && Math.abs(b.vel.y) < 0.05) {
        const f = Math.max(0, 1 - 2.2 * dt);
        b.vel.x *= f;
        b.vel.z *= f;
      }

      // despawn
      const speed = b.vel.length();
      if (speed < 0.12 && b.pos.y <= BALL_R + 0.01) b.restTime += dt; else b.restTime = 0;
      if (b.age > 15 || b.restTime > 2.2) b.fading = 0.35;
    }

    // score flash decay
    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.flashUntil = 0;
      this.scoreboard.draw(this.score, this.best, false);
    }

    // particle bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.life += dt;
      const arr = burst.points.geometry.attributes.position.array;
      for (let j = 0; j < burst.vel.length; j++) {
        burst.vel[j].y -= 5 * dt;
        arr[j * 3] += burst.vel[j].x * dt;
        arr[j * 3 + 1] += burst.vel[j].y * dt;
        arr[j * 3 + 2] += burst.vel[j].z * dt;
      }
      burst.points.geometry.attributes.position.needsUpdate = true;
      burst.points.material.opacity = Math.max(0, 1 - burst.life / burst.max);
      if (burst.life >= burst.max) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        burst.points.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  #collideWalls(b) {
    for (const box of this.colliders) {
      const cx = Math.max(box.x0, Math.min(b.pos.x, box.x1));
      const cy = Math.max(box.y0, Math.min(b.pos.y, box.y1));
      const cz = Math.max(box.z0, Math.min(b.pos.z, box.z1));
      const dx = b.pos.x - cx, dy = b.pos.y - cy, dz = b.pos.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= BALL_R * BALL_R) continue;
      if (d2 < 1e-12) {
        // ball center is inside the box — eject along the shallowest face
        const faces = [
          [box.x1 - b.pos.x, () => { b.pos.x = box.x1 + BALL_R; if (b.vel.x < 0) b.vel.x = -b.vel.x * 0.55; }],
          [b.pos.x - box.x0, () => { b.pos.x = box.x0 - BALL_R; if (b.vel.x > 0) b.vel.x = -b.vel.x * 0.55; }],
          [box.y1 - b.pos.y, () => { b.pos.y = box.y1 + BALL_R; if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.55; }],
          [b.pos.y - box.y0, () => { b.pos.y = box.y0 - BALL_R; if (b.vel.y > 0) b.vel.y = -b.vel.y * 0.55; }],
          [box.z1 - b.pos.z, () => { b.pos.z = box.z1 + BALL_R; if (b.vel.z < 0) b.vel.z = -b.vel.z * 0.55; }],
          [b.pos.z - box.z0, () => { b.pos.z = box.z0 - BALL_R; if (b.vel.z > 0) b.vel.z = -b.vel.z * 0.55; }],
        ];
        faces.sort((a, bb) => a[0] - bb[0])[0][1]();
        continue;
      }
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d, nz = dz / d;
      b.pos.set(cx + nx * BALL_R, cy + ny * BALL_R, cz + nz * BALL_R);
      const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
      if (vn < 0) {
        const k = 1.55 * vn; // restitution 0.55
        b.vel.x -= k * nx;
        b.vel.y -= k * ny;
        b.vel.z -= k * nz;
        if (-vn > 1.4) audio.thud(Math.min(1, -vn / 7));
      }
    }
  }

  #collideRim(b) {
    const dx = b.pos.x - RIM.x, dz = b.pos.z - RIM.z;
    const dh = Math.hypot(dx, dz);
    // nearest point on the rim circle; directly on the axis every circle point is
    // equidistant, so pick an arbitrary one (must NOT collapse to the center)
    const ux = dh > 1e-4 ? dx / dh : 1;
    const uz = dh > 1e-4 ? dz / dh : 0;
    const cx = RIM.x + ux * RIM.r;
    const cz = RIM.z + uz * RIM.r;
    const ex = b.pos.x - cx, ey = b.pos.y - RIM.y, ez = b.pos.z - cz;
    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const minD = BALL_R + RIM.tube;
    if (d < minD && d > 1e-6) {
      const nx = ex / d, ny = ey / d, nz = ez / d;
      b.pos.set(cx + nx * minD, RIM.y + ny * minD, cz + nz * minD);
      const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
      if (vn < 0) {
        const k = 1.32 * vn; // deadened rim (restitution 0.32) so near-makes drop in
        b.vel.x -= k * nx;
        b.vel.y -= k * ny;
        b.vel.z -= k * nz;
        if (-vn > 1.2) audio.thud(0.5);
      }
    }
  }
}

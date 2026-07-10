import * as THREE from 'three';
import { audio } from './audio.js';
import { net, PARTNER } from './net.js';
import { COLS, ROWS, emptyBoard, applyDrop, winningLine, isFull } from './connect4Rules.js';

const PITCH = 0.09;
const DISC_R = 0.04;
const DISC_T = 0.03;
const SPAWN_Y = 1.5;

const COLORS = { james: 0xe8c98a, hannah: 0xe05a72 }; // gold / rose

function makeHoleTexture() {
  const c = document.createElement('canvas');
  c.width = 700; c.height = 600; // 100 px per 0.1 m on the 0.70 × 0.60 panel
  const g = c.getContext('2d');
  g.fillStyle = '#232a4e';
  g.fillRect(0, 0, 700, 600);
  g.strokeStyle = 'rgba(232,201,138,0.65)';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 690, 590);
  g.globalCompositeOperation = 'destination-out';
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      g.beginPath();
      g.arc(350 + 90 * (col - 3), 600 - (75 + 90 * row), 34, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class ConnectFour {
  constructor(scene, camera, canvas, world, player, interact) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.player = player;
    this.anchor = world.connect4.anchor;
    this.seatSpecs = world.connect4.seats;
    this.seatedHere = false;

    interact.register({
      x: this.anchor.x, z: this.anchor.z, range: 2.2,
      prompt: 'Press E — play Connect Four ♥', icon: '🔴',
      activate: () => this.#sit(),
    });

    this.seq = 0;
    this.state = {
      phase: 'idle', // 'idle' | 'playing' | 'done'
      seats: { james: false, hannah: false },
      turn: 'james',
      firstPlayer: 'james',
      board: emptyBoard(),
    };
    this.winLine = null;      // derived from state.board, recomputed on apply
    this.discMeshes = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
    this.actives = [];        // falling discs
    this.pulses = [];         // winning-disc materials being pulsed
    this.pulseT = 0;

    this.#buildBoard();
    this.#wireUI();
    this.#wireNet();
    this.#render();
  }

  get me() { return net.me ?? 'james'; }
  get partner() { return PARTNER[this.me]; }
  get bothSeated() { return this.state.seats.james && this.state.seats.hannah; }
  get canAct() { return this.state.phase === 'playing' && this.state.turn === this.me && this.bothSeated; }

  #colZ(col) { return this.anchor.z + (col - 3) * PITCH; }
  #rowY(row) { return this.anchor.y + 0.075 + row * PITCH; }

  // ---------------------------------------------------------------------------
  #buildBoard() {
    const { x, z } = this.anchor;
    const centerY = this.anchor.y + 0.3;

    const holeTex = makeHoleTexture();
    const panelMat = new THREE.MeshStandardMaterial({
      map: holeTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6,
    });
    const panelGeo = new THREE.PlaneGeometry(0.7, 0.6);
    [[x + 0.025, Math.PI / 2], [x - 0.025, -Math.PI / 2]].forEach(([px, ry]) => {
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(px, centerY, z);
      panel.rotation.y = ry;
      this.scene.add(panel);
    });

    // gold rails: two sides + bottom (top stays open for drops)
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb98d4f, roughness: 0.4, metalness: 0.6 });
    [z - 0.36, z + 0.36].forEach((rz) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.025), railMat);
      rail.position.set(x, centerY, rz);
      this.scene.add(rail);
    });
    const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.745), railMat);
    bottomRail.position.set(x, this.anchor.y + 0.01, z);
    this.scene.add(bottomRail);

    // invisible raycast targets, one per column (never added to the scene)
    this.hitboxes = [];
    const hbGeo = new THREE.BoxGeometry(0.3, 0.7, PITCH);
    for (let col = 0; col < COLS; col++) {
      const hb = new THREE.Mesh(hbGeo);
      hb.position.set(x, centerY + 0.04, this.#colZ(col));
      hb.userData.col = col;
      hb.updateMatrixWorld(true);
      this.hitboxes.push(hb);
    }

    this.discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_T, 24);
    this.discMats = {
      james: new THREE.MeshStandardMaterial({ color: COLORS.james, roughness: 0.4, metalness: 0.25 }),
      hannah: new THREE.MeshStandardMaterial({ color: COLORS.hannah, roughness: 0.4, metalness: 0.25 }),
    };

    this.ghost = new THREE.Mesh(
      this.discGeo,
      new THREE.MeshStandardMaterial({ color: COLORS.james, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.ghost.rotation.z = Math.PI / 2; // disc axis along x — board faces east/west
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.raycaster = new THREE.Raycaster();
  }

  #makeDisc(who) {
    const mesh = new THREE.Mesh(this.discGeo, this.discMats[who]);
    mesh.rotation.z = Math.PI / 2;
    this.scene.add(mesh);
    return mesh;
  }

  #clearDiscs() {
    for (const col of this.discMeshes) {
      for (const mesh of col) if (mesh) this.scene.remove(mesh);
    }
    this.discMeshes = Array.from({ length: COLS }, () => Array(ROWS).fill(null));
    this.actives = [];
    this.pulses = [];
  }

  // rebuild every disc instantly from state (snapshot recovery)
  #layoutDiscs() {
    this.#clearDiscs();
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const who = this.state.board[c][r];
        if (!who) continue;
        const mesh = this.#makeDisc(who);
        mesh.position.set(this.anchor.x, this.#rowY(r), this.#colZ(c));
        this.discMeshes[c][r] = mesh;
      }
    }
    if (this.winLine) this.#startPulse();
  }

  #startPulse() {
    this.pulses = this.winLine
      .map(([c, r]) => this.discMeshes[c][r])
      .filter(Boolean)
      .map((mesh) => {
        const mat = mesh.material.clone();
        mat.emissive = new THREE.Color(mat.color);
        mesh.material = mat;
        return mat;
      });
    this.pulseT = 0;
  }

  // ---------------------------------------------------------------------------
  #raycastColumn(event) {
    const ndc = {
      x: (event.clientX / window.innerWidth) * 2 - 1,
      y: -(event.clientY / window.innerHeight) * 2 + 1,
    };
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitboxes, false)[0];
    return hit ? hit.object.userData.col : null;
  }

  #wireUI() {
    this.panel = document.getElementById('c4');
    this.statusEl = document.getElementById('c4-status');
    this.bannerEl = document.getElementById('c4-banner');

    const colsRow = document.getElementById('c4-cols');
    this.colBtns = [];
    for (let i = 0; i < COLS; i++) {
      const b = document.createElement('button');
      b.className = 'c4-col';
      b.textContent = '↓';
      b.addEventListener('click', () => this.#drop(this.#btnCol(i)));
      colsRow.appendChild(b);
      this.colBtns.push(b);
    }

    document.getElementById('c4-stand').addEventListener('click', () => this.#stand());
    document.getElementById('c4-rematch').addEventListener('click', () => this.#rematch());

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.seatedHere) this.#stand();
    });

    // click the 3D board directly (cursor is free while seated)
    this.canvas.addEventListener('click', (e) => {
      if (!this.seatedHere || !this.canAct) return;
      const col = this.#raycastColumn(e);
      if (col !== null) this.#drop(col);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.player.touchMode) return;
      if (!this.seatedHere || !this.canAct) { this.ghost.visible = false; return; }
      const col = this.#raycastColumn(e);
      const open = col !== null && this.state.board[col][ROWS - 1] === null;
      this.ghost.visible = open;
      if (open) {
        this.ghost.material.color.setHex(COLORS[this.me]);
        this.ghost.position.set(this.anchor.x, SPAWN_Y, this.#colZ(col));
      }
    });
  }

  // the screen-left column button must mean the player's left: james faces -x
  // (his left is +z, column 6), hannah faces +x (her left is -z, column 0)
  #btnCol(i) {
    return this.me === 'james' ? COLS - 1 - i : i;
  }

  #wireNet() {
    net.on('hello', () => {
      if (this.seq > 0) net.send('c4:snapshot', { seq: this.seq, state: this.state });
    });
    net.on('c4:snapshot', ({ seq, state }) => {
      if (seq <= this.seq) return;
      this.seq = seq;
      this.state = state;
      this.state.seats[this.me] = this.seatedHere;
      this.winLine = winningLine(this.state.board);
      this.#maybeStart();
      this.#layoutDiscs();
      this.#render();
    });
    net.on('c4:sit', ({ from, seq }) => {
      this.state.seats[from] = true;
      this.seq = Math.max(this.seq, seq ?? 0);
      this.#maybeStart();
      this.#render();
    });
    net.on('c4:stand', ({ from, seq }) => {
      this.state.seats[from] = false;
      this.seq = Math.max(this.seq, seq ?? 0);
      this.#render();
    });
    net.on('c4:drop', ({ from, seq, col }) => {
      if (from !== this.state.turn || this.state.phase !== 'playing') return;
      this.seq = Math.max(this.seq, seq);
      this.#applyDrop(from, col);
    });
    net.on('c4:rematch', ({ seq }) => {
      this.seq = Math.max(this.seq, seq);
      this.#applyRematch();
    });
    net.on('peer-leave', () => {
      this.state.seats[this.partner] = false;
      this.#render();
    });
  }

  // ---------------------------------------------------------------------------
  #sit() {
    if (this.player.seated) return;
    this.seatedHere = true;
    this.player.sit(this.seatSpecs[this.me]);
    document.body.classList.add('seated');
    this.panel.classList.remove('hidden');
    this.state.seats[this.me] = true;
    this.seq++;
    net.send('c4:sit', { seq: this.seq });
    this.#maybeStart();
    this.#render();
  }

  #stand() {
    if (!this.seatedHere) return;
    this.seatedHere = false;
    document.body.classList.remove('seated');
    this.panel.classList.add('hidden');
    this.ghost.visible = false;
    this.state.seats[this.me] = false;
    this.seq++;
    net.send('c4:stand', { seq: this.seq });
    this.player.stand();
    this.#render();
  }

  // both clients run this deterministically whenever the seats change
  #maybeStart() {
    if (this.state.phase !== 'idle' || !this.bothSeated) return;
    this.state.phase = 'playing';
    this.state.turn = this.state.firstPlayer;
  }

  #drop(col) {
    if (!this.canAct) return;
    if (this.state.board[col][ROWS - 1] !== null) return;
    this.seq++;
    net.send('c4:drop', { seq: this.seq, col });
    this.#applyDrop(this.me, col);
  }

  #applyDrop(who, col) {
    const row = applyDrop(this.state.board, col, who);
    if (row < 0) return;

    const mesh = this.#makeDisc(who);
    mesh.position.set(this.anchor.x, SPAWN_Y, this.#colZ(col));
    this.discMeshes[col][row] = mesh;
    this.actives.push({ mesh, vy: 0, restY: this.#rowY(row), row, bounced: false });

    const line = winningLine(this.state.board);
    if (line) {
      this.state.phase = 'done';
      this.winLine = line;
      this.#startPulse();
      audio.chime();
    } else if (isFull(this.state.board)) {
      this.state.phase = 'done';
      this.winLine = null;
    } else {
      this.state.turn = PARTNER[who];
    }
    this.ghost.visible = false;
    this.#render();
  }

  #rematch() {
    if (this.state.phase !== 'done') return;
    this.seq++;
    net.send('c4:rematch', { seq: this.seq });
    this.#applyRematch();
  }

  #applyRematch() {
    const s = this.state;
    if (s.phase !== 'done') return;
    s.board = emptyBoard();
    this.winLine = null;
    s.firstPlayer = PARTNER[s.firstPlayer];
    s.turn = s.firstPlayer;
    s.phase = this.bothSeated ? 'playing' : 'idle';
    this.#clearDiscs();
    this.#render();
  }

  // ---------------------------------------------------------------------------
  #render() {
    const s = this.state;

    let status;
    if (!this.bothSeated) {
      status = s.phase === 'playing'
        ? `waiting for ${s.seats[this.me] ? this.partner : this.me} to come back ♥`
        : `waiting for ${this.partner} ♥${net.enabled ? '' : ' (realtime not configured)'}`;
    } else if (s.phase === 'done') {
      status = 'game over ♥';
    } else if (s.turn === this.me) {
      status = 'your turn — pick a column!';
    } else {
      status = `${s.turn}'s turn ♥`;
    }
    this.statusEl.textContent = status;

    this.colBtns.forEach((b, i) => {
      const col = this.#btnCol(i);
      b.disabled = !this.canAct || s.board[col][ROWS - 1] !== null;
    });

    if (s.phase === 'done') {
      const msg = this.winLine
        ? `${s.board[this.winLine[0][0]][this.winLine[0][1]]} wins ♥`
        : `it's a draw ♥`;
      this.bannerEl.querySelector('.msg').textContent = msg;
      this.bannerEl.classList.remove('hidden');
    } else {
      this.bannerEl.classList.add('hidden');
    }
    if (!this.canAct) this.ghost.visible = false;
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    for (let i = this.actives.length - 1; i >= 0; i--) {
      const a = this.actives[i];
      a.vy -= 9.8 * dt;
      a.mesh.position.y += a.vy * dt;
      if (a.mesh.position.y <= a.restY && a.vy < 0) {
        a.mesh.position.y = a.restY;
        if (!a.bounced) {
          a.bounced = true;
          a.vy = -a.vy * 0.35;
          audio.plink(0.8 + a.row * 0.06);
        } else {
          this.actives.splice(i, 1);
        }
      }
    }

    if (this.pulses.length) {
      this.pulseT += dt;
      const glow = 0.25 + 0.2 * Math.sin(this.pulseT * 4);
      for (const mat of this.pulses) mat.emissiveIntensity = glow;
    }
  }
}

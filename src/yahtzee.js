import * as THREE from 'three';
import { audio } from './audio.js';
import { net, PARTNER } from './net.js';
import { CATEGORIES, LABELS, emptyCard, scoreCategory, totals, cardFull } from './yahtzeeRules.js';

const DIE = 0.13;
const FACE_CHARS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const SIT_RANGE = 2.8;
const TUMBLE_TIME = 0.55;
const SETTLE_TIME = 0.35;

// BoxGeometry material order is [+x, -x, +y, -y, +z, -z]; opposite faces sum to 7.
const FACE_VALUES = [1, 6, 2, 5, 3, 4];

// orientation that brings each value to face +y (up)
const FACE_UP = {
  1: new THREE.Euler(0, 0, Math.PI / 2),
  2: new THREE.Euler(0, 0, 0),
  3: new THREE.Euler(-Math.PI / 2, 0, 0),
  4: new THREE.Euler(Math.PI / 2, 0, 0),
  5: new THREE.Euler(Math.PI, 0, 0),
  6: new THREE.Euler(0, 0, -Math.PI / 2),
};

function makePipTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f5efdf';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(58,42,74,0.22)';
  g.lineWidth = 5;
  g.strokeRect(3, 3, 122, 122);
  const L = 34, C = 64, R = 94;
  const spots = {
    1: [[C, C]],
    2: [[L, L], [R, R]],
    3: [[L, L], [C, C], [R, R]],
    4: [[L, L], [R, L], [L, R], [R, R]],
    5: [[L, L], [R, L], [C, C], [L, R], [R, R]],
    6: [[L, L], [L, C], [L, R], [R, L], [R, C], [R, R]],
  }[n];
  g.fillStyle = n === 1 ? '#e05a72' : '#3a2a4a';
  for (const [x, y] of spots) {
    g.beginPath();
    g.arc(x, y, n === 1 ? 16 : 12, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export class Yahtzee {
  constructor(scene, camera, world, player) {
    this.scene = scene;
    this.player = player;
    this.center = world.yahtzee.tableCenter;
    this.seatSpecs = world.yahtzee.seats;

    this.seq = 0;
    this.state = {
      phase: 'idle', // 'idle' | 'playing' | 'done'
      seats: { james: false, hannah: false },
      turn: 'james',
      firstPlayer: 'james',
      rollsLeft: 3,
      dice: [1, 2, 3, 4, 5],
      held: [false, false, false, false, false],
      cards: { james: emptyCard(), hannah: emptyCard() },
    };

    this.near = false;
    this.anims = [null, null, null, null, null];

    this.#buildDice();
    this.#wireUI();
    this.#wireNet();
    this.#layoutDice(true);
    this.#render();
  }

  get me() { return net.me ?? 'james'; }
  get partner() { return PARTNER[this.me]; }
  get bothSeated() { return this.state.seats.james && this.state.seats.hannah; }
  get canAct() { return this.state.phase === 'playing' && this.state.turn === this.me && this.bothSeated; }

  // ---------------------------------------------------------------------------
  #buildDice() {
    const geo = new THREE.BoxGeometry(DIE, DIE, DIE);
    const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: makePipTexture(v), roughness: 0.35 }));
    this.dice = [];
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(geo, mats);
      this.scene.add(mesh);
      this.dice.push(mesh);
    }
  }

  #faceQuat(value) {
    const q = new THREE.Quaternion().setFromEuler(FACE_UP[value]);
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    return spin.multiply(q);
  }

  #restPos(i) {
    const c = this.center;
    const y = c.y + DIE / 2 + 0.002;
    if (this.state.held[i]) {
      // held dice slide to the turn owner's edge of the felt
      const side = this.state.turn === 'james' ? 1 : -1; // james sits at +z
      return new THREE.Vector3(c.x + (i - 2) * 0.17, y, c.z + side * 0.58);
    }
    return new THREE.Vector3(c.x + (i - 2) * 0.19, y, c.z);
  }

  // Move every non-tumbling die toward its rest slot: instantly, or with a slide.
  #layoutDice(instant = false) {
    for (let i = 0; i < 5; i++) {
      if (this.anims[i]?.mode === 'tumble') continue;
      const rest = this.#restPos(i);
      const mesh = this.dice[i];
      if (instant) {
        this.anims[i] = null;
        mesh.position.copy(rest);
        mesh.quaternion.copy(this.#faceQuat(this.state.dice[i]));
      } else if (mesh.position.distanceTo(rest) > 0.01) {
        this.anims[i] = {
          mode: 'settle', t: 0, dur: 0.25,
          fromPos: mesh.position.clone(), fromQuat: mesh.quaternion.clone(),
          toPos: rest, toQuat: mesh.quaternion.clone(),
        };
      }
    }
  }

  #startTumble(i) {
    const mesh = this.dice[i];
    this.anims[i] = {
      mode: 'tumble', t: 0,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5),
      angVel: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16),
      toPos: this.#restPos(i), toQuat: this.#faceQuat(this.state.dice[i]),
    };
    mesh.position.y += 0.02;
  }

  // ---------------------------------------------------------------------------
  #wireUI() {
    this.panel = document.getElementById('yahtzee');
    this.statusEl = document.getElementById('yz-status');
    this.rollBtn = document.getElementById('yz-roll');
    this.cardEl = document.getElementById('yz-card');
    this.bannerEl = document.getElementById('yz-banner');
    this.promptEl = document.getElementById('prompt');
    this.sitBtn = document.getElementById('sitbtn');

    const diceRow = document.getElementById('yz-dice');
    this.dieBtns = [];
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button');
      b.className = 'yz-die';
      b.addEventListener('click', () => this.#hold(i));
      diceRow.appendChild(b);
      this.dieBtns.push(b);
    }

    this.rollBtn.addEventListener('click', () => this.#roll());
    document.getElementById('yz-stand').addEventListener('click', () => this.#stand());
    document.getElementById('yz-rematch').addEventListener('click', () => this.#rematch());
    this.sitBtn.addEventListener('click', () => this.#sit());

    this.cardEl.addEventListener('click', (e) => {
      const td = e.target.closest('td.preview');
      if (td?.dataset.cat) this.#score(td.dataset.cat);
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.near && !this.player.seated && this.player.active) this.#sit();
      else if (e.code === 'Escape' && this.player.seated) this.#stand();
    });
  }

  #wireNet() {
    net.on('hello', () => {
      if (this.seq > 0) net.send('snapshot', { seq: this.seq, state: this.state });
    });
    net.on('snapshot', ({ seq, state }) => {
      if (seq <= this.seq) return;
      this.seq = seq;
      this.state = state;
      this.state.seats[this.me] = this.player.seated;
      this.#maybeStart();
      this.#layoutDice(true);
      this.#render();
    });
    net.on('sit', ({ from, seq }) => {
      this.state.seats[from] = true;
      this.seq = Math.max(this.seq, seq ?? 0);
      this.#maybeStart();
      this.#render();
    });
    net.on('stand', ({ from, seq }) => {
      this.state.seats[from] = false;
      this.seq = Math.max(this.seq, seq ?? 0);
      this.#render();
    });
    net.on('roll', ({ from, seq, values }) => {
      if (from !== this.state.turn) return;
      this.seq = Math.max(this.seq, seq);
      this.#applyRoll(values);
    });
    net.on('hold', ({ from, seq, i, held }) => {
      if (from !== this.state.turn) return;
      this.seq = Math.max(this.seq, seq);
      this.state.held[i] = held;
      this.#layoutDice();
      this.#render();
    });
    net.on('score', ({ from, seq, cat }) => {
      if (from !== this.state.turn) return;
      this.seq = Math.max(this.seq, seq);
      this.#applyScore(from, cat);
    });
    net.on('rematch', ({ seq }) => {
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
    this.player.sit(this.seatSpecs[this.me]);
    document.body.classList.add('seated');
    this.panel.classList.remove('hidden');
    this.promptEl.style.display = 'none';
    this.sitBtn.style.display = 'none';
    this.state.seats[this.me] = true;
    this.seq++;
    net.send('sit', { seq: this.seq });
    this.#maybeStart();
    this.#render();
  }

  #stand() {
    if (!this.player.seated) return;
    document.body.classList.remove('seated');
    this.panel.classList.add('hidden');
    this.state.seats[this.me] = false;
    this.seq++;
    net.send('stand', { seq: this.seq });
    this.player.stand();
    this.#render();
  }

  // both clients run this deterministically whenever the seats change
  #maybeStart() {
    if (this.state.phase !== 'idle' || !this.bothSeated) return;
    this.state.phase = 'playing';
    this.state.turn = this.state.firstPlayer;
    this.state.rollsLeft = 3;
    this.state.held = [false, false, false, false, false];
  }

  #roll() {
    if (!this.canAct || this.state.rollsLeft <= 0) return;
    const values = this.state.dice.map((v, i) =>
      this.state.held[i] ? v : 1 + Math.floor(Math.random() * 6));
    this.seq++;
    net.send('roll', { seq: this.seq, values });
    this.#applyRoll(values);
  }

  #applyRoll(values) {
    this.state.dice = values;
    this.state.rollsLeft--;
    for (let i = 0; i < 5; i++) if (!this.state.held[i]) this.#startTumble(i);
    audio.dice();
    this.#render();
  }

  #hold(i) {
    if (!this.canAct || this.state.rollsLeft >= 3 || this.state.rollsLeft <= 0) return;
    this.state.held[i] = !this.state.held[i];
    this.seq++;
    net.send('hold', { seq: this.seq, i, held: this.state.held[i] });
    this.#layoutDice();
    this.#render();
  }

  #score(cat) {
    if (!this.canAct || this.state.rollsLeft >= 3) return;
    if (this.state.cards[this.me][cat] !== null) return;
    this.seq++;
    net.send('score', { seq: this.seq, cat });
    this.#applyScore(this.me, cat);
  }

  #applyScore(who, cat) {
    const s = this.state;
    s.cards[who][cat] = scoreCategory(cat, s.dice);
    if (cardFull(s.cards.james) && cardFull(s.cards.hannah)) {
      s.phase = 'done';
      audio.chime();
    } else {
      s.turn = PARTNER[who];
      s.rollsLeft = 3;
      s.held = [false, false, false, false, false];
      this.#layoutDice();
    }
    this.#render();
  }

  #rematch() {
    if (this.state.phase !== 'done') return;
    this.seq++;
    net.send('rematch', { seq: this.seq });
    this.#applyRematch();
  }

  #applyRematch() {
    const s = this.state;
    if (s.phase !== 'done') return;
    s.cards = { james: emptyCard(), hannah: emptyCard() };
    s.firstPlayer = PARTNER[s.firstPlayer];
    s.turn = s.firstPlayer;
    s.rollsLeft = 3;
    s.held = [false, false, false, false, false];
    s.phase = this.bothSeated ? 'playing' : 'idle';
    this.#layoutDice();
    this.#render();
  }

  // ---------------------------------------------------------------------------
  #render() {
    const s = this.state;
    const rolled = s.rollsLeft < 3;

    // status line
    let status;
    if (!this.bothSeated) {
      status = s.phase === 'playing'
        ? `waiting for ${s.seats[this.me] ? this.partner : this.me} to come back ♥`
        : `waiting for ${this.partner} ♥${net.enabled ? '' : ' (realtime not configured)'}`;
    } else if (s.phase === 'done') {
      status = 'game over ♥';
    } else if (s.turn === this.me) {
      status = s.rollsLeft === 3 ? 'your turn — roll the dice!'
        : s.rollsLeft > 0 ? `your turn · ${s.rollsLeft} roll${s.rollsLeft > 1 ? 's' : ''} left`
        : 'pick a score ↓';
    } else {
      status = `${s.turn}'s turn ♥`;
    }
    this.statusEl.textContent = status;

    // dice + roll button
    const canHold = this.canAct && rolled && s.rollsLeft > 0;
    this.dieBtns.forEach((b, i) => {
      b.textContent = FACE_CHARS[s.dice[i]];
      b.classList.toggle('held', s.held[i]);
      b.disabled = !canHold;
    });
    this.rollBtn.disabled = !(this.canAct && s.rollsLeft > 0);
    this.rollBtn.textContent = s.rollsLeft > 0 && s.phase === 'playing' ? `Roll (${s.rollsLeft})` : 'Roll';

    // scorecard
    const canScore = this.canAct && rolled;
    const cell = (who, cat) => {
      const val = s.cards[who][cat];
      if (val !== null) return `<td class="num">${val}</td>`;
      if (who === this.me && canScore) {
        return `<td class="num preview" data-cat="${cat}">${scoreCategory(cat, s.dice)}</td>`;
      }
      return `<td class="num"></td>`;
    };
    const meJ = this.me === 'james' ? ' class="me"' : '';
    const meH = this.me === 'hannah' ? ' class="me"' : '';
    let html = `<tr><th></th><th${meJ}>James</th><th${meH}>Hannah</th></tr>`;
    for (const cat of CATEGORIES) {
      html += `<tr><td>${LABELS[cat]}</td>${cell('james', cat)}${cell('hannah', cat)}</tr>`;
    }
    const tj = totals(s.cards.james), th = totals(s.cards.hannah);
    html += `<tr class="total"><td>Upper (63 → +35)</td><td class="num">${tj.upper}</td><td class="num">${th.upper}</td></tr>`;
    html += `<tr class="total"><td>Bonus</td><td class="num">${tj.bonus}</td><td class="num">${th.bonus}</td></tr>`;
    html += `<tr class="total"><td>Total</td><td class="num">${tj.grand}</td><td class="num">${th.grand}</td></tr>`;
    this.cardEl.innerHTML = html;

    // winner banner
    if (s.phase === 'done') {
      const msg = tj.grand === th.grand ? `it's a tie ♥ ${tj.grand} all`
        : tj.grand > th.grand ? `james wins ♥ ${tj.grand} — ${th.grand}`
        : `hannah wins ♥ ${th.grand} — ${tj.grand}`;
      this.bannerEl.querySelector('.msg').textContent = msg;
      this.bannerEl.classList.remove('hidden');
    } else {
      this.bannerEl.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  update(dt) {
    // proximity prompt
    const p = this.player;
    const near = !p.seated && p.active &&
      Math.hypot(p.pos.x - this.center.x, p.pos.z - this.center.z) < SIT_RANGE;
    if (near !== this.near) {
      this.near = near;
      if (p.touchMode) {
        this.sitBtn.style.display = near ? 'block' : 'none';
      } else {
        this.promptEl.textContent = 'Press E — play Yahtzee ♥';
        this.promptEl.style.display = near ? 'block' : 'none';
      }
    }

    // dice animation
    const restY = this.center.y + DIE / 2 + 0.002;
    for (let i = 0; i < 5; i++) {
      const a = this.anims[i];
      if (!a) continue;
      const mesh = this.dice[i];
      a.t += dt;

      if (a.mode === 'tumble') {
        a.vel.y -= 9.8 * dt;
        mesh.position.addScaledVector(a.vel, dt);
        if (mesh.position.y < restY && a.vel.y < 0) {
          mesh.position.y = restY;
          a.vel.y *= -0.45;
          a.vel.x *= 0.7;
          a.vel.z *= 0.7;
          audio.thud(0.25);
        }
        mesh.rotation.x += a.angVel.x * dt;
        mesh.rotation.y += a.angVel.y * dt;
        mesh.rotation.z += a.angVel.z * dt;
        if (a.t >= TUMBLE_TIME) {
          this.anims[i] = {
            mode: 'settle', t: 0, dur: SETTLE_TIME,
            fromPos: mesh.position.clone(), fromQuat: mesh.quaternion.clone(),
            toPos: a.toPos, toQuat: a.toQuat,
          };
        }
      } else { // settle / slide
        const k = Math.min(1, a.t / a.dur);
        const e = k * k * (3 - 2 * k); // smoothstep
        mesh.position.lerpVectors(a.fromPos, a.toPos, e);
        mesh.quaternion.slerpQuaternions(a.fromQuat, a.toQuat, e);
        if (k >= 1) this.anims[i] = null;
      }
    }
  }
}

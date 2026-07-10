import * as THREE from 'three';
import { audio } from './audio.js';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.35;
const WALK_SPEED = 3.4;
const RUN_SPEED = 5.4;
const LOOK_SENS = 0.0022;
const TOUCH_LOOK_SENS = 0.0045;

export class Player {
  constructor(camera, canvas, colliders) {
    this.camera = camera;
    this.canvas = canvas;
    this.colliders = colliders;

    this.pos = new THREE.Vector3(0, 0, 4.6);
    this.vel = new THREE.Vector3();
    this.yaw = 0;      // facing -z (the countdown wall)
    this.pitch = 0;
    this.keys = new Set();
    this.locked = false;
    this.touchMode = false;
    this.started = false;
    this.seated = false;
    this.seatEye = 1.35;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    // touch state
    this.moveTouch = null; // { id, ox, oy, dx, dy }
    this.lookTouch = null; // { id, x, y }

    this.camera.rotation.order = 'YXZ';
    this.#applyCamera();
    this.#wireOverlay();
    this.#wireKeyboard();
    this.#wireMouse();
    if (this.isTouch) this.#wireTouch();
  }

  get active() {
    return this.locked || (this.touchMode && this.started);
  }

  // Sitting freezes movement and pins the camera to a seat pose. On desktop it
  // exits pointer lock so the game overlay's buttons are clickable.
  sit({ x, z, yaw, pitch, eye }) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
    this.seatEye = eye;
    this.seated = true;
    this.keys.clear();
    if (this.locked) document.exitPointerLock?.();
    this.#applyCamera();
  }

  stand() {
    this.seated = false;
    if (!this.touchMode && this.started) {
      // re-lock can be refused (e.g. too soon after an ESC unlock) — fall back
      // to the pause overlay so the player is never stranded cursor-less
      const p = this.canvas.requestPointerLock?.();
      p?.catch?.(() => this.overlay.classList.remove('hidden'));
    }
  }

  // -------------------------------------------------------------------------
  #wireOverlay() {
    const overlay = document.getElementById('overlay');
    const enter = document.getElementById('enter');
    const hints = document.getElementById('hints');
    const subtitle = document.getElementById('subtitle');
    const hintbar = document.getElementById('hintbar');
    this.overlay = overlay;

    hints.innerHTML = this.isTouch
      ? 'Left side of screen — walk &nbsp;·&nbsp; right side — look around<br/>Find the arcade and hold 🏀 to shoot hoops'
      : 'WASD — walk &nbsp;·&nbsp; mouse — look around<br/>Find the arcade → hold click to shoot hoops';

    enter.addEventListener('click', () => {
      audio.unlock();
      this.started = true;
      if (this.isTouch) {
        this.touchMode = true;
        document.body.classList.add('touch');
        overlay.classList.add('hidden');
      } else {
        this.canvas.requestPointerLock?.();
      }
    });

    if (!this.isTouch) {
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === this.canvas;
        // seated: pointer lock was released on purpose so the game panel is
        // clickable — don't show the pause overlay
        overlay.classList.toggle('hidden', this.locked || this.seated);
        hintbar.style.display = this.locked ? 'block' : 'none';
        if (!this.locked && this.started && !this.seated) {
          subtitle.textContent = 'Paused — step back inside?';
          enter.textContent = 'Keep Walking';
        }
        this.keys.clear();
      });
      document.addEventListener('pointerlockerror', () => {
        // pointer lock unavailable — fall back to touch-style controls
        this.touchMode = true;
        this.started = true;
        document.body.classList.add('touch');
        overlay.classList.add('hidden');
      });
    }
  }

  #wireKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  #wireMouse() {
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * LOOK_SENS;
      this.pitch -= e.movementY * LOOK_SENS;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }

  #wireTouch() {
    const joy = document.getElementById('joystick');
    const stick = document.getElementById('stick');
    const throwbtn = document.getElementById('throwbtn');

    document.addEventListener('touchstart', (e) => {
      if (!this.touchMode || this.seated) return;
      for (const t of e.changedTouches) {
        if (t.target === throwbtn) continue;
        if (t.target.closest?.('#yahtzee, #sitbtn')) continue;
        if (t.clientX < window.innerWidth * 0.45 && !this.moveTouch) {
          this.moveTouch = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
          joy.style.left = `${t.clientX - 58}px`;
          joy.style.top = `${t.clientY - 58}px`;
          joy.style.bottom = 'auto';
        } else if (!this.lookTouch) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!this.touchMode || this.seated) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.moveTouch && t.identifier === this.moveTouch.id) {
          const dx = t.clientX - this.moveTouch.ox;
          const dy = t.clientY - this.moveTouch.oy;
          const len = Math.hypot(dx, dy);
          const max = 52;
          const k = len > max ? max / len : 1;
          this.moveTouch.dx = (dx * k) / max;
          this.moveTouch.dy = (dy * k) / max;
          stick.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.yaw -= (t.clientX - this.lookTouch.x) * TOUCH_LOOK_SENS;
          this.pitch -= (t.clientY - this.lookTouch.y) * TOUCH_LOOK_SENS;
          this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (this.moveTouch && t.identifier === this.moveTouch.id) {
          this.moveTouch = null;
          stick.style.transform = 'translate(0px, 0px)';
          joy.style.left = '36px';
          joy.style.top = 'auto';
          joy.style.bottom = '44px';
        }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);
  }

  // -------------------------------------------------------------------------
  update(dt) {
    if (this.seated) {
      this.#applyCamera();
      return;
    }
    let fwd = 0, strafe = 0;
    if (this.active) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
      if (this.moveTouch) {
        fwd += -this.moveTouch.dy;
        strafe += this.moveTouch.dx;
      }
    }

    const len = Math.hypot(fwd, strafe);
    if (len > 1) { fwd /= len; strafe /= len; }

    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = running ? RUN_SPEED : WALK_SPEED;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const target = new THREE.Vector3(
      (-sin * fwd + cos * strafe) * speed,
      0,
      (-cos * fwd - sin * strafe) * speed
    );

    const damp = 1 - Math.exp(-12 * dt);
    this.vel.lerp(target, damp);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.#collide();
    this.#applyCamera();
  }

  #collide() {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.colliders) {
        const cx = Math.max(b.x0, Math.min(this.pos.x, b.x1));
        const cz = Math.max(b.z0, Math.min(this.pos.z, b.z1));
        let dx = this.pos.x - cx;
        let dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        if (d2 < 1e-9) {
          // center inside the box — push out along the shallowest axis
          const pushRight = b.x1 - this.pos.x, pushLeft = this.pos.x - b.x0;
          const pushFar = b.z1 - this.pos.z, pushNear = this.pos.z - b.z0;
          const m = Math.min(pushRight, pushLeft, pushFar, pushNear);
          if (m === pushRight) this.pos.x = b.x1 + RADIUS;
          else if (m === pushLeft) this.pos.x = b.x0 - RADIUS;
          else if (m === pushFar) this.pos.z = b.z1 + RADIUS;
          else this.pos.z = b.z0 - RADIUS;
        } else {
          const d = Math.sqrt(d2);
          this.pos.x = cx + (dx / d) * RADIUS;
          this.pos.z = cz + (dz / d) * RADIUS;
        }
      }
    }
  }

  #applyCamera() {
    this.camera.position.set(this.pos.x, this.seated ? this.seatEye : EYE_HEIGHT, this.pos.z);
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
  }
}

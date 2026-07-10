import * as THREE from 'three';
import { net, PARTNER } from './net.js';

// The partner, rendered as a floating glowing heart with a name tag.
// Driven entirely by throttled 'pose' broadcasts; positions are lerped so the
// 10 Hz updates read as smooth motion.

function makeHeartGeometry() {
  const s = new THREE.Shape();
  // classic heart curve, ~1 unit tall, centered
  s.moveTo(0, 0.35);
  s.bezierCurveTo(0, 0.6, -0.5, 0.6, -0.5, 0.25);
  s.bezierCurveTo(-0.5, -0.05, -0.15, -0.3, 0, -0.5);
  s.bezierCurveTo(0.15, -0.3, 0.5, -0.05, 0.5, 0.25);
  s.bezierCurveTo(0.5, 0.6, 0, 0.6, 0, 0.35);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 16 });
  geo.center();
  geo.scale(0.34, 0.34, 0.34);
  return geo;
}

function makeNameTag(name) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '58px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(224,90,114,0.9)';
  g.shadowBlur = 18;
  g.fillStyle = '#e8c98a';
  g.fillText(`${name} ♥`, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.1, 0.275, 1);
  return sprite;
}

export class RemoteAvatar {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const heart = new THREE.Mesh(
      makeHeartGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xe05a72, emissive: 0xe05a72, emissiveIntensity: 0.55, roughness: 0.35 })
    );
    this.heart = heart;
    this.group.add(heart);

    const glow = new THREE.PointLight(0xe05a72, 2, 3, 1.6);
    glow.position.y = 0.1;
    this.group.add(glow);

    this.tag = null; // built lazily once we know who the partner is
    this.target = { x: 0, z: 0, yaw: 0, seated: false };
    this.hasPose = false;
    this.t = 0;

    this.presenceEl = document.getElementById('presence');

    net.on('pose', (p) => {
      this.target = p;
      if (!this.hasPose) {
        this.hasPose = true;
        this.group.position.set(p.x, 1.45, p.z);
        this.group.rotation.y = p.yaw;
        this.group.visible = true;
      }
    });
    net.on('peer-join', (name) => {
      if (!this.tag) {
        this.tag = makeNameTag(name);
        this.tag.position.y = 0.55;
        this.group.add(this.tag);
      }
      this.presenceEl.textContent = `${name} is here ♥`;
      this.presenceEl.style.display = 'block';
    });
    net.on('peer-leave', () => {
      this.group.visible = false;
      this.hasPose = false;
      this.presenceEl.style.display = 'none';
    });
    net.on('double-join', () => {
      this.presenceEl.textContent = `you're already inside in another tab`;
      this.presenceEl.style.display = 'block';
    });
  }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    const k = 1 - Math.exp(-10 * dt);
    const hover = this.target.seated ? 1.15 : 1.45 + Math.sin(this.t * 2) * 0.06;
    this.group.position.x += (this.target.x - this.group.position.x) * k;
    this.group.position.z += (this.target.z - this.group.position.z) * k;
    this.group.position.y += (hover - this.group.position.y) * k;
    // shortest-arc yaw lerp
    let d = this.target.yaw - this.group.rotation.y;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.group.rotation.y += d * k;
  }
}

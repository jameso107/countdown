import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Game } from './game.js';
import { initNet, net, getIdentity, setIdentity } from './net.js';
import { RemoteAvatar } from './avatar.js';
import { Interact } from './interact.js';
import { Yahtzee } from './yahtzee.js';
import { ConnectFour } from './connect4.js';

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e1a);
scene.fog = new THREE.Fog(0x0b0e1a, 22, 60);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 120);

// portrait screens get a wider FOV so rooms don't feel like corridors
function fitFov() {
  camera.fov = camera.aspect < 1 ? 84 : 72;
  camera.updateProjectionMatrix();
}
fitFov();

const world = buildWorld(scene);
const player = new Player(camera, renderer.domElement, world.playerColliders);
const game = new Game(scene, camera, world, player);

initNet();
const avatar = new RemoteAvatar(scene);
const interact = new Interact(player);
const yahtzee = new Yahtzee(scene, camera, world, player, interact);
const connect4 = new ConnectFour(scene, camera, renderer.domElement, world, player, interact);

// first visit with realtime configured: ask who this is before they step inside
if (net.enabled && !getIdentity()) {
  const who = document.getElementById('who');
  const enter = document.getElementById('enter');
  const subtitle = document.getElementById('subtitle');
  subtitle.textContent = "who's stepping inside?";
  enter.style.display = 'none';
  who.style.display = 'flex';
  who.addEventListener('click', (e) => {
    const btn = e.target.closest('.who-btn');
    if (!btn) return;
    setIdentity(btn.dataset.who);
    who.style.display = 'none';
    enter.style.display = '';
    subtitle.textContent = `welcome, ${btn.dataset.who} ♥`;
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  fitFov();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// debug handle (used by dev tooling; harmless in production)
window.__countdown = { player, game, world, camera, scene, renderer, yahtzee, connect4, interact, avatar, net };

let lastTime = 0;
let lastCountdownDraw = 0;

renderer.setAnimationLoop((time) => {
  const dt = Math.min(Math.max(time - lastTime, 0) / 1000, 0.05);
  lastTime = time;
  player.update(dt);
  game.update(dt);
  yahtzee.update(dt);
  connect4.update(dt);
  interact.update();
  avatar.update(dt);
  net.tickPose(player, dt);
  world.motes.update(dt);

  const now = Date.now();
  if (now - lastCountdownDraw >= 250) {
    world.countdown.draw(now);
    lastCountdownDraw = now;
  }

  renderer.render(scene, camera);
});

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Game } from './game.js';

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  fitFov();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// debug handle (used by dev tooling; harmless in production)
window.__countdown = { player, game, world, camera, scene, renderer };

let lastTime = 0;
let lastCountdownDraw = 0;

renderer.setAnimationLoop((time) => {
  const dt = Math.min(Math.max(time - lastTime, 0) / 1000, 0.05);
  lastTime = time;
  player.update(dt);
  game.update(dt);
  world.motes.update(dt);

  const now = Date.now();
  if (now - lastCountdownDraw >= 250) {
    world.countdown.draw(now);
    lastCountdownDraw = now;
  }

  renderer.render(scene, camera);
});

import * as THREE from 'three';
import { PHOTOS } from './photos.js';

// ---------------------------------------------------------------------------
// Layout (meters). Two rooms joined by a short hallway along +x.
// ---------------------------------------------------------------------------
export const WALL_H = 4.6;
export const DOOR_H = 3.2;
const T = 0.3; // wall thickness

export const ROOM_A = { x0: -9, x1: 9, z0: -7, z1: 7 };   // gallery
export const ROOM_B = { x0: 13, x1: 27, z0: -7, z1: 7 };  // arcade
export const HALL = { x0: 9, x1: 13, z0: -1.4, z1: 1.4 };
export const ROOM_C = { x0: 15, x1: 25, z0: 11, z1: 19 };    // the parlor (game room)
export const HALL2 = { x0: 18.6, x1: 21.4, z0: 7, z1: 11 };  // south hallway to the parlor

export const TARGET_DATE = new Date('2026-08-23T12:00:00-04:00'); // Sunday, August 23, noon Eastern

const texLoader = new THREE.TextureLoader();

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rows = 8, rowH = c.height / rows;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let r = 0; r < rows; r++) {
    const shade = 38 + rand() * 16;
    g.fillStyle = `rgb(${shade + 14},${shade - 2},${shade - 14})`;
    g.fillRect(0, r * rowH, c.width, rowH);
    // plank joints (staggered)
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, r * rowH, c.width, 2);
    const joint = rand() * c.width;
    g.fillRect(joint, r * rowH, 2, rowH);
    // grain
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const y = r * rowH + rand() * rowH;
      g.moveTo(0, y);
      g.bezierCurveTo(c.width * 0.3, y + rand() * 6 - 3, c.width * 0.7, y + rand() * 6 - 3, c.width, y);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(9, 4);
  tex.anisotropy = 8;
  return tex;
}

function makeTextPanel(text, { w = 512, h = 128, fg = '#ffd9e8', glow = '#e05a8a', bg = 'rgba(12,10,24,0.92)', font = 52 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = glow;
  g.lineWidth = 4;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.font = `${font}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = glow;
  g.shadowBlur = 22;
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Countdown display (canvas texture, redrawn ~4x/sec)
// ---------------------------------------------------------------------------
function makeCountdown() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 448;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const pad = (n) => String(n).padStart(2, '0');

  function draw(now) {
    const W = c.width, H = c.height;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#131836');
    grad.addColorStop(1, '#0a0d20');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(232,201,138,0.85)';
    g.lineWidth = 5;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.strokeStyle = 'rgba(232,201,138,0.28)';
    g.lineWidth = 1.5;
    g.strokeRect(26, 26, W - 52, H - 52);

    g.textAlign = 'center';
    g.shadowBlur = 0;

    // header
    g.font = '46px Georgia, serif';
    g.fillStyle = '#e8c98a';
    g.fillText('J A M E S   ♥   H A N N A H', W / 2, 88);

    const ms = TARGET_DATE.getTime() - now;
    if (ms <= 0) {
      g.font = 'bold 92px Georgia, serif';
      g.fillStyle = '#ffe9b8';
      g.shadowColor = '#f0a35e';
      g.shadowBlur = 34;
      g.fillText("IT'S HAPPENING!", W / 2, 250);
      g.shadowBlur = 0;
      g.font = '40px Georgia, serif';
      g.fillStyle = '#e8a0b4';
      g.fillText('♥  ♥  ♥', W / 2, 340);
    } else {
      const s = Math.floor(ms / 1000);
      const days = Math.floor(s / 86400);
      const hrs = Math.floor((s % 86400) / 3600);
      const min = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const units = [[pad(days), 'DAYS'], [pad(hrs), 'HOURS'], [pad(min), 'MINUTES'], [pad(sec), 'SECONDS']];
      const xs = [170, 398, 626, 854];

      g.font = 'bold 118px Menlo, Consolas, monospace';
      g.shadowColor = 'rgba(240,180,100,0.9)';
      g.shadowBlur = 26;
      g.fillStyle = '#fdf6e3';
      units.forEach(([val], i) => g.fillText(val, xs[i], 250));
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(232,201,138,0.75)';
      [284, 512, 740].forEach((x) => g.fillText(':', x, 242));

      g.font = '25px Georgia, serif';
      g.fillStyle = '#b8a273';
      units.forEach(([, label], i) => g.fillText(label, xs[i], 306));
    }

    g.font = '30px Georgia, serif';
    g.fillStyle = '#d9c08c';
    g.fillText('A U G U S T   2 3 ,   2 0 2 6   ·   N O O N   E A S T E R N', c.width / 2, 396);

    tex.needsUpdate = true;
  }

  draw(Date.now());
  return { texture: tex, draw };
}

// ---------------------------------------------------------------------------
// Picture frames
// ---------------------------------------------------------------------------
const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b1e12, roughness: 0.55, metalness: 0.25 });
const matBoardMat = new THREE.MeshStandardMaterial({ color: 0xf1ead9, roughness: 0.95 });

function makeFrame(photo, size = 1.5) {
  const group = new THREE.Group();
  const s = size / Math.max(photo.w, photo.h);
  const pw = photo.w * s, ph = photo.h * s;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.18, ph + 0.18, 0.07), frameMat);
  frame.position.z = 0.035;
  group.add(frame);

  const matBoard = new THREE.Mesh(new THREE.PlaneGeometry(pw + 0.09, ph + 0.09), matBoardMat);
  matBoard.position.z = 0.0715;
  group.add(matBoard);

  const tex = texLoader.load(photo.file);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = new THREE.Mesh(
    new THREE.PlaneGeometry(pw, ph),
    new THREE.MeshBasicMaterial({ map: tex, color: 0xf2f2f2 })
  );
  img.position.z = 0.073;
  group.add(img);
  return group;
}

// wall helpers: sign = direction the wall face points (into the room)
const zWall = (at, sign) => ({ type: 'z', at, sign });
const xWall = (at, sign) => ({ type: 'x', at, sign });

function placeOnWall(obj, wall, u, y) {
  if (wall.type === 'z') {
    obj.position.set(u, y, wall.at + wall.sign * 0.002);
    obj.rotation.y = wall.sign > 0 ? 0 : Math.PI;
  } else {
    obj.position.set(wall.at + wall.sign * 0.002, y, u);
    obj.rotation.y = wall.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

function seededShuffle(arr) {
  const a = [...arr];
  let s = 1234567;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
export function buildWorld(scene) {
  const playerColliders = [];
  const ballColliders = [];

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x424b6e, roughness: 0.92 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x272d4a, roughness: 0.9 });

  function addWall(x0, x1, y0, y1, z0, z1, mat = wallMat, { player = true, ball = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
    const b = { x0, x1, y0, y1, z0, z1 };
    if (player && y0 < 1.9) playerColliders.push(b);
    if (ball) ballColliders.push(b);
    return mesh;
  }

  // outer shell
  addWall(ROOM_A.x0 - T, ROOM_B.x1 + T, 0, WALL_H, ROOM_A.z0 - T, ROOM_A.z0, accentMat); // north (countdown wall)
  addWall(ROOM_A.x0 - T, HALL2.x0, 0, WALL_H, ROOM_A.z1, ROOM_A.z1 + T);                 // south, west of parlor door
  addWall(HALL2.x1, ROOM_B.x1 + T, 0, WALL_H, ROOM_A.z1, ROOM_A.z1 + T);                 // south, east of parlor door
  addWall(ROOM_A.x0 - T, ROOM_A.x0, 0, WALL_H, ROOM_A.z0, ROOM_A.z1);                    // west
  addWall(ROOM_B.x1, ROOM_B.x1 + T, 0, WALL_H, ROOM_B.z0, ROOM_B.z1);                    // east (hoop wall)
  // solid blocks between the two rooms, with hallway gap
  addWall(HALL.x0, HALL.x1, 0, WALL_H, ROOM_A.z0 - T, HALL.z0);
  addWall(HALL.x0, HALL.x1, 0, WALL_H, HALL.z1, ROOM_A.z1 + T);
  addWall(HALL.x0, HALL.x1, DOOR_H, WALL_H, HALL.z0, HALL.z1, wallMat, { player: false }); // door header

  // south annex: hallway to the parlor + the parlor itself
  addWall(HALL2.x0, HALL2.x1, DOOR_H, WALL_H, ROOM_A.z1, ROOM_C.z0, wallMat, { player: false }); // hall2 header
  addWall(ROOM_C.x0 - T, HALL2.x0, 0, WALL_H, ROOM_A.z1 + T, ROOM_C.z0);  // hall2 side block, west
  addWall(HALL2.x1, ROOM_C.x1 + T, 0, WALL_H, ROOM_A.z1 + T, ROOM_C.z0); // hall2 side block, east
  addWall(ROOM_C.x0 - T, ROOM_C.x0, 0, WALL_H, ROOM_C.z0, ROOM_C.z1);    // parlor west
  addWall(ROOM_C.x1, ROOM_C.x1 + T, 0, WALL_H, ROOM_C.z0, ROOM_C.z1);    // parlor east
  addWall(ROOM_C.x0 - T, ROOM_C.x1 + T, 0, WALL_H, ROOM_C.z1, ROOM_C.z1 + T, accentMat); // parlor south

  // floor & ceiling
  const floorTex = makeFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_B.x1 - ROOM_A.x0 + 2 * T, ROOM_A.z1 - ROOM_A.z0 + 2 * T),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM_A.x0 + ROOM_B.x1) / 2, 0, 0);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_B.x1 - ROOM_A.x0 + 2 * T, ROOM_A.z1 - ROOM_A.z0 + 2 * T),
    new THREE.MeshStandardMaterial({ color: 0x141828, roughness: 1 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((ROOM_A.x0 + ROOM_B.x1) / 2, WALL_H, 0);
  scene.add(ceiling);

  // annex floor & ceiling (hall2 + parlor, south of the main slab)
  const annexW = ROOM_C.x1 - ROOM_C.x0 + 2 * T;
  const annexD = ROOM_C.z1 + T - (ROOM_A.z1 + T);
  const annexCx = (ROOM_C.x0 + ROOM_C.x1) / 2;
  const annexCz = (ROOM_A.z1 + T + ROOM_C.z1 + T) / 2;
  const annexFloorTex = makeFloorTexture();
  annexFloorTex.repeat.set(annexW / 4, annexD / 3.65); // match main slab plank density
  const annexFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(annexW, annexD),
    new THREE.MeshStandardMaterial({ map: annexFloorTex, roughness: 0.85 })
  );
  annexFloor.rotation.x = -Math.PI / 2;
  annexFloor.position.set(annexCx, 0, annexCz);
  scene.add(annexFloor);

  const annexCeiling = new THREE.Mesh(
    new THREE.PlaneGeometry(annexW, annexD),
    new THREE.MeshStandardMaterial({ color: 0x141828, roughness: 1 })
  );
  annexCeiling.rotation.x = Math.PI / 2;
  annexCeiling.position.set(annexCx, WALL_H, annexCz);
  scene.add(annexCeiling);

  // -------------------------------------------------------------------------
  // Countdown wall
  // -------------------------------------------------------------------------
  const countdown = makeCountdown();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(7.3, 3.3, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0b0e1e, roughness: 0.4, metalness: 0.4 })
  );
  panel.position.set(0, 2.5, ROOM_A.z0 + 0.05);
  scene.add(panel);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(6.9, 6.9 * (448 / 1024)),
    new THREE.MeshBasicMaterial({ map: countdown.texture })
  );
  screen.position.set(0, 2.5, ROOM_A.z0 + 0.105);
  scene.add(screen);

  // -------------------------------------------------------------------------
  // Photo frames — 2 featured beside the countdown + 27 across the walls
  // -------------------------------------------------------------------------
  const byName = Object.fromEntries(PHOTOS.map((p) => [p.file.split('/').pop(), p]));
  const featured = [byName['proposal.jpg'], byName['cover.jpg']].filter(Boolean);
  const rest = seededShuffle(PHOTOS.filter((p) => !featured.includes(p)));

  const wallSpecs = [
    { wall: zWall(ROOM_A.z0, 1), slots: [-6.4, 6.4], y: 2.3, size: 2.1, photos: featured }, // beside countdown
    { wall: xWall(ROOM_A.x0, 1), slots: [-5.25, -1.75, 1.75, 5.25], y: 2.0 },   // gallery west
    { wall: zWall(ROOM_A.z1, -1), slots: [-6, -3, 0, 3, 6], y: 2.0 },           // gallery south
    { wall: xWall(HALL.x0, -1), slots: [-5.3, -3, 3, 5.3], y: 2.0 },            // gallery east (door wall)
    { wall: zWall(HALL.z0, 1), slots: [11], y: 2.0, size: 1.1 },                // hallway
    { wall: zWall(HALL.z1, -1), slots: [11], y: 2.0, size: 1.1 },               // hallway
    { wall: xWall(ROOM_B.x0, 1), slots: [-5.3, -3, 3, 5.3], y: 2.0 },           // arcade west (door wall)
    { wall: zWall(ROOM_B.z0, 1), slots: [15.6, 18.6, 21.6, 24.6], y: 2.0 },     // arcade north
    { wall: zWall(ROOM_B.z1, -1), slots: [15.4, 17.0, 23.0, 24.8], y: 2.0 },    // arcade south (clears parlor door)
  ];

  let cursor = 0;
  for (const spec of wallSpecs) {
    const pool = spec.photos || null;
    spec.slots.forEach((u, i) => {
      const photo = pool ? pool[i] : rest[cursor++];
      if (!photo) return;
      const frame = makeFrame(photo, spec.size || 1.5);
      placeOnWall(frame, spec.wall, u, spec.y);
      scene.add(frame);
    });
  }

  // -------------------------------------------------------------------------
  // Door signs
  // -------------------------------------------------------------------------
  const signA = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: makeTextPanel('THE ARCADE  →', { fg: '#ffd9e8', glow: '#e05a8a' }), transparent: false })
  );
  placeOnWall(signA, xWall(HALL.x0, -1), 0, DOOR_H + 0.55);
  scene.add(signA);

  const signB = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: makeTextPanel('←  THE GALLERY', { fg: '#ffe9c0', glow: '#e8a35e' }) })
  );
  placeOnWall(signB, xWall(HALL.x1, 1), 0, DOOR_H + 0.55);
  scene.add(signB);

  const signC = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: makeTextPanel('THE PARLOR  ↓', { fg: '#ffd9e8', glow: '#e05a72' }) })
  );
  placeOnWall(signC, zWall(ROOM_B.z1, -1), (HALL2.x0 + HALL2.x1) / 2, DOOR_H + 0.55);
  scene.add(signC);

  const signC2 = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: makeTextPanel('↑  THE ARCADE', { fg: '#ffe9c0', glow: '#e8a35e' }) })
  );
  placeOnWall(signC2, zWall(ROOM_C.z0, 1), (HALL2.x0 + HALL2.x1) / 2, DOOR_H + 0.55);
  scene.add(signC2);

  const signGameNight = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.8),
    new THREE.MeshBasicMaterial({ map: makeTextPanel('GAME NIGHT ♥', { fg: '#ffd9e8', glow: '#e05a72' }) })
  );
  placeOnWall(signGameNight, zWall(ROOM_C.z1, -1), (ROOM_C.x0 + ROOM_C.x1) / 2, 3.1);
  scene.add(signGameNight);

  // -------------------------------------------------------------------------
  // Parlor furniture — game table + stools
  // -------------------------------------------------------------------------
  const TABLE = { x: (ROOM_C.x0 + ROOM_C.x1) / 2, z: (ROOM_C.z0 + ROOM_C.z1) / 2 }; // (20, 15)
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6, metalness: 0.1 });
  const feltMat = new THREE.MeshStandardMaterial({ color: 0x1a2342, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xb98d4f, roughness: 0.4, metalness: 0.6 });

  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.07, 40), woodMat);
  tableTop.position.set(TABLE.x, 0.78, TABLE.z);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.015, 40), feltMat);
  felt.position.set(TABLE.x, 0.816, TABLE.z);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.018, 10, 48), trimMat);
  trim.rotation.x = Math.PI / 2;
  trim.position.set(TABLE.x, 0.824, TABLE.z);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.75, 16), woodMat);
  column.position.set(TABLE.x, 0.375, TABLE.z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.06, 24), woodMat);
  base.position.set(TABLE.x, 0.03, TABLE.z);
  scene.add(tableTop, felt, trim, column, base);

  const tableBox = { x0: TABLE.x - 0.95, x1: TABLE.x + 0.95, y0: 0, y1: 0.85, z0: TABLE.z - 0.95, z1: TABLE.z + 0.95 };
  playerColliders.push(tableBox);
  ballColliders.push(tableBox);

  const stoolMat = new THREE.MeshStandardMaterial({ color: 0x52395c, roughness: 0.8 });
  const addStool = (sx, sz) => {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 20), stoolMat);
    seat.position.set(sx, 0.52, sz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 12), woodMat);
    leg.position.set(sx, 0.26, sz);
    scene.add(seat, leg);
  };
  addStool(TABLE.x, TABLE.z - 1.55);
  addStool(TABLE.x, TABLE.z + 1.55);

  // Connect Four stand in the parlor's west half (board itself lives in connect4.js)
  const C4 = { x: 16.8, z: 15 };
  const c4Column = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.82, 12), woodMat);
  c4Column.position.set(C4.x, 0.41, C4.z);
  const c4Base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 20), woodMat);
  c4Base.position.set(C4.x, 0.025, C4.z);
  const c4Top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.8), woodMat);
  c4Top.position.set(C4.x, 0.8, C4.z);
  scene.add(c4Column, c4Base, c4Top);
  addStool(C4.x + 1.15, C4.z);
  addStool(C4.x - 1.15, C4.z);

  const c4Box = { x0: C4.x - 0.16, x1: C4.x + 0.16, y0: 0, y1: 1.5, z0: C4.z - 0.42, z1: C4.z + 0.42 };
  playerColliders.push(c4Box);
  ballColliders.push(c4Box);

  // -------------------------------------------------------------------------
  // Lighting
  // -------------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x232035, 0.85));

  const galleryLight = new THREE.PointLight(0xffd9a0, 58, 0, 1.8);
  galleryLight.position.set(0, WALL_H - 0.55, 0);
  scene.add(galleryLight);

  const spot = new THREE.SpotLight(0xfff0d0, 55, 0, 0.62, 0.55, 1.6);
  spot.position.set(0, WALL_H - 0.35, -2.2);
  spot.target.position.set(0, 2.3, ROOM_A.z0);
  scene.add(spot, spot.target);

  const hallLight = new THREE.PointLight(0xffc0d8, 9, 0, 1.8);
  hallLight.position.set(11, DOOR_H - 0.3, 0);
  scene.add(hallLight);

  const arcadeLight = new THREE.PointLight(0xcfd8ff, 52, 0, 1.8);
  arcadeLight.position.set(20, WALL_H - 0.55, 0);
  scene.add(arcadeLight);

  const parlorLight = new THREE.PointLight(0xffd9c0, 42, 0, 1.8);
  parlorLight.position.set(20, WALL_H - 0.55, 15);
  scene.add(parlorLight);

  const hall2Light = new THREE.PointLight(0xffc0d8, 8, 0, 1.8);
  hall2Light.position.set(20, DOOR_H - 0.3, 9);
  scene.add(hall2Light);

  // ceiling fixtures (emissive discs under the point lights)
  const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffe9c8 });
  [[0, 0], [20, 0], [20, 15]].forEach(([x, z]) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), fixtureMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, WALL_H - 0.02, z);
    scene.add(disc);
  });

  // neon trim in the arcade
  const neonPink = new THREE.MeshBasicMaterial({ color: 0xff4d9e });
  const neonCyan = new THREE.MeshBasicMaterial({ color: 0x37e0ff });
  const trimN = new THREE.Mesh(new THREE.BoxGeometry(ROOM_B.x1 - ROOM_B.x0 - 0.4, 0.06, 0.06), neonPink);
  trimN.position.set((ROOM_B.x0 + ROOM_B.x1) / 2, 4.05, ROOM_B.z0 + 0.06);
  const trimS = new THREE.Mesh(new THREE.BoxGeometry(ROOM_B.x1 - ROOM_B.x0 - 0.4, 0.06, 0.06), neonCyan);
  trimS.position.set((ROOM_B.x0 + ROOM_B.x1) / 2, 4.05, ROOM_B.z1 - 0.06);
  scene.add(trimN, trimS);

  // -------------------------------------------------------------------------
  // Floating dust motes
  // -------------------------------------------------------------------------
  const MOTES = 140;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = new Float32Array(MOTES * 2);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = ROOM_A.x0 + Math.random() * (ROOM_B.x1 - ROOM_A.x0);
    motePos[i * 3 + 1] = 0.3 + Math.random() * (WALL_H - 0.8);
    motePos[i * 3 + 2] = ROOM_A.z0 + Math.random() * (ROOM_A.z1 - ROOM_A.z0);
    moteSeed[i * 2] = Math.random() * Math.PI * 2;
    moteSeed[i * 2 + 1] = 0.05 + Math.random() * 0.1;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteCanvas = document.createElement('canvas');
  moteCanvas.width = moteCanvas.height = 32;
  const mg = moteCanvas.getContext('2d');
  const grad = mg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  mg.fillStyle = grad;
  mg.fillRect(0, 0, 32, 32);
  const moteTex = new THREE.CanvasTexture(moteCanvas);
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffe2b0, size: 0.035, map: moteTex, transparent: true, opacity: 0.45,
    sizeAttenuation: true, depthWrite: false,
  }));
  scene.add(motes);

  let moteT = 0;
  const moteUpdate = (dt) => {
    moteT += dt;
    const arr = moteGeo.attributes.position.array;
    for (let i = 0; i < MOTES; i++) {
      arr[i * 3 + 1] += moteSeed[i * 2 + 1] * dt;
      arr[i * 3] += Math.sin(moteT * 0.5 + moteSeed[i * 2]) * 0.02 * dt;
      if (arr[i * 3 + 1] > WALL_H - 0.3) arr[i * 3 + 1] = 0.3;
    }
    moteGeo.attributes.position.needsUpdate = true;
  };

  return {
    playerColliders,
    ballColliders,
    countdown,
    motes: { update: moteUpdate },
    yahtzee: {
      tableCenter: new THREE.Vector3(TABLE.x, 0.824, TABLE.z),
      seats: {
        james: { x: TABLE.x, z: TABLE.z + 1.55, yaw: 0, pitch: -0.42, eye: 1.35 },        // south stool, faces -z
        hannah: { x: TABLE.x, z: TABLE.z - 1.55, yaw: Math.PI, pitch: -0.42, eye: 1.35 }, // north stool, faces +z
      },
    },
    connect4: {
      anchor: new THREE.Vector3(C4.x, 0.825, C4.z),
      seats: {
        james: { x: C4.x + 1.15, z: C4.z, yaw: Math.PI / 2, pitch: -0.2, eye: 1.35 },   // east stool, faces -x
        hannah: { x: C4.x - 1.15, z: C4.z, yaw: -Math.PI / 2, pitch: -0.2, eye: 1.35 }, // west stool, faces +x
      },
    },
  };
}

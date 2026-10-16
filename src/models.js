// Low-poly models for Gidi Hop: vehicles, boats, roadside props, houses and ₦ coins.
// One unit is one tile. Vehicles are built pointing along +x, sitting on y = 0.
import * as THREE from 'three';

export const PALETTE = {
  danfo: '#f7c600',
  black: '#1c1c1c',
  glass: '#2e3b4a',
  keke: '#2f9e44',
  asphalt: '#4a4d52',
  asphaltDark: '#3f4247',
  line: '#f2efe6',
  sidewalk: '#c8643b',
  sidewalkAlt: '#bd5c35',
  curb: '#d9d2c3',
  lagoon: '#1fa3a3',
  gutterWater: '#4f6b3a',
  concrete: '#9a958b',
  plank: '#8a5a2b',
  canoe: '#6b4423',
  canoeInside: '#4a2e16',
  gravel: '#7d6a58',
  rail: '#b8b8b8',
  sleeper: '#5a4030',
  palmTrunk: '#8b6b45',
  palmLeaf: '#3f8f3a',
  wood: '#9c6b3c',
  gold: '#f2b705',
};

const materials = new Map();
/** Shared flat-shaded material per colour, so hundreds of tiles cost a handful of materials. */
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!materials.has(key)) materials.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return materials.get(key);
}

const geometries = new Map();
function boxGeo(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w, h, d));
  return geometries.get(key);
}
function cylGeo(rt, rb, h, seg = 10) {
  const key = `c${rt}|${rb}|${h}|${seg}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geometries.get(key);
}
function coneGeo(r, h, seg = 8) {
  const key = `k${r}|${h}|${seg}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.ConeGeometry(r, h, seg));
  return geometries.get(key);
}
function sphereGeo(r, w = 8, h = 6) {
  const key = `s${r}|${w}|${h}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.SphereGeometry(r, w, h));
  return geometries.get(key);
}

/** A box mesh (shared geometry) placed at x, y, z in parent. */
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), typeof color === 'string' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cone(parent, r, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(coneGeo(r, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sphere(parent, r, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(sphereGeo(r), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function wheel(parent, r, w, x, z) {
  const m = cyl(parent, r, r, w, PALETTE.black, x, r, z, 10);
  m.rotation.x = Math.PI / 2;
  return m;
}

const SHIRTS = ['#e8590c', '#1971c2', '#c2255c', '#2b8a3e', '#f8f9fa', '#7048e8', '#e03131'];
const SKINS = ['#5c3a21', '#8d5524', '#a0662f', '#c68642'];
const pickFrom = (list, rand) => list[Math.floor(rand() * list.length)];

/** A little blocky rider or passenger: body, head and an optional helmet or cap. */
function person(parent, x, y, z, rand, { helmet = false, scale = 1 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.scale.setScalar(scale);
  box(g, 0.22, 0.32, 0.26, pickFrom(SHIRTS, rand), 0, 0.16, 0);
  const skin = pickFrom(SKINS, rand);
  box(g, 0.17, 0.17, 0.17, skin, 0, 0.42, 0);
  if (helmet) box(g, 0.2, 0.1, 0.2, rand() < 0.5 ? '#c92a2a' : '#212529', 0, 0.53, 0);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------- vehicles

/** Lagos danfo bus: yellow with two black stripes, about 2.5 tiles long. */
export function danfo(rand) {
  const g = new THREE.Group();
  const Y = PALETTE.danfo;
  box(g, 2.5, 0.62, 0.86, Y, 0, 0.55, 0); // body
  box(g, 2.52, 0.06, 0.88, PALETTE.black, 0, 0.38, 0); // stripes
  box(g, 2.52, 0.06, 0.88, PALETTE.black, 0, 0.62, 0);
  box(g, 2.3, 0.22, 0.84, Y, -0.05, 0.97, 0); // upper body with windows
  box(g, 1.9, 0.16, 0.87, PALETTE.glass, -0.15, 0.98, 0); // side windows
  box(g, 0.05, 0.18, 0.7, PALETTE.glass, 1.1, 0.98, 0); // windscreen
  box(g, 2.3, 0.05, 0.84, '#e0b400', -0.05, 1.1, 0); // roof
  box(g, 1.2, 0.05, 0.6, '#5c4a32', -0.3, 1.16, 0); // roof rack
  box(g, 0.06, 0.08, 0.14, '#fff8d6', 1.26, 0.5, 0.3, false); // headlights
  box(g, 0.06, 0.08, 0.14, '#fff8d6', 1.26, 0.5, -0.3, false);
  box(g, 0.06, 0.1, 0.8, PALETTE.black, 1.27, 0.3, 0); // bumper
  for (const x of [-0.8, 0.8]) for (const z of [-0.36, 0.36]) wheel(g, 0.17, 0.14, x, z);
  // the conductor hanging out of the open side door, on the side facing the camera
  if (rand() < 0.7) {
    box(g, 0.4, 0.5, 0.02, '#1f1f1f', 0.35, 0.72, 0.435, false); // open doorway
    const c = person(g, 0.35, 0.5, 0.52, rand, { scale: 1.1 });
    c.rotation.z = -0.25;
  }
  g.userData = { len: 2.5, kind: 'danfo' };
  return g;
}

/** Okada: a motorbike with a rider and sometimes a passenger. Short and fast. */
export function okada(rand) {
  const g = new THREE.Group();
  const paint = rand() < 0.5 ? '#c92a2a' : '#1c1c1c';
  wheel(g, 0.17, 0.07, -0.34, 0);
  wheel(g, 0.17, 0.07, 0.34, 0);
  box(g, 0.62, 0.14, 0.14, paint, 0, 0.36, 0); // frame
  box(g, 0.2, 0.18, 0.18, '#adb5bd', -0.02, 0.28, 0); // engine
  box(g, 0.36, 0.07, 0.2, '#212529', -0.1, 0.46, 0); // seat
  box(g, 0.05, 0.25, 0.05, '#adb5bd', 0.3, 0.52, 0); // fork
  box(g, 0.05, 0.04, 0.4, '#212529', 0.3, 0.65, 0); // handlebar
  person(g, 0, 0.48, 0, rand, { helmet: true });
  if (rand() < 0.5) person(g, -0.2, 0.48, 0, rand);
  g.userData = { len: 0.9, kind: 'okada' };
  return g;
}

/** Keke (tricycle taxi): green and yellow with a black canopy. */
export function keke(rand) {
  const g = new THREE.Group();
  const green = rand() < 0.75 ? PALETTE.keke : '#1971c2';
  box(g, 1.15, 0.45, 0.72, green, -0.05, 0.42, 0);
  box(g, 1.17, 0.08, 0.74, PALETTE.danfo, -0.05, 0.5, 0); // yellow band
  box(g, 0.35, 0.3, 0.3, green, 0.55, 0.42, 0); // nose
  box(g, 1.0, 0.06, 0.78, PALETTE.black, -0.1, 1.08, 0); // canopy
  for (const x of [-0.55, 0.35]) for (const z of [-0.34, 0.34]) box(g, 0.04, 0.45, 0.04, PALETTE.black, x, 0.85, z);
  box(g, 0.04, 0.3, 0.6, PALETTE.glass, 0.38, 0.85, 0); // windscreen
  person(g, 0.15, 0.55, 0, rand);
  wheel(g, 0.15, 0.1, 0.62, 0);
  wheel(g, 0.15, 0.1, -0.45, -0.32);
  wheel(g, 0.15, 0.1, -0.45, 0.32);
  g.userData = { len: 1.4, kind: 'keke' };
  return g;
}

export const VEHICLES = { danfo, okada, keke };

/** A three-car commuter train in green and white. */
export function train() {
  const g = new THREE.Group();
  const CAR = 4.2;
  for (let i = 0; i < 3; i++) {
    const x = -i * (CAR + 0.15);
    box(g, CAR, 0.9, 0.9, i === 0 ? '#2b8a3e' : '#37b24d', x, 0.75, 0);
    box(g, CAR + 0.02, 0.12, 0.92, '#f8f9fa', x, 0.62, 0);
    box(g, CAR - 0.6, 0.22, 0.93, PALETTE.glass, x, 0.98, 0);
    box(g, CAR, 0.08, 0.86, '#868e96', x, 1.24, 0);
    for (const dx of [-1.4, 1.4]) for (const z of [-0.36, 0.36]) wheel(g, 0.16, 0.12, x + dx, z);
  }
  box(g, 0.4, 0.5, 0.8, '#2b8a3e', CAR / 2 + 0.15, 0.6, 0); // nose
  box(g, 0.08, 0.1, 0.18, '#fff3bf', CAR / 2 + 0.36, 0.55, 0, false);
  const len = 3 * CAR + 0.3 + 0.6;
  g.children.forEach((c) => (c.position.x += len / 2 - CAR / 2 - 0.35));
  g.userData = { len, kind: 'train' };
  return g;
}

// ---------------------------------------------------------------- boats & planks

/** A wooden dugout canoe, sometimes with a fisherman, len tiles long. */
export function canoe(len, rand) {
  const g = new THREE.Group();
  box(g, len - 0.4, 0.22, 0.74, PALETTE.canoe, 0, 0.05, 0);
  box(g, len - 0.6, 0.06, 0.56, PALETTE.canoeInside, 0, 0.15, 0, false);
  for (const side of [-1, 1]) {
    const nose = cone(g, 0.37, 0.4, PALETTE.canoe, side * (len / 2 - 0.2), 0.05, 0, 4);
    nose.rotation.set(0, 0, -side * Math.PI / 2);
    nose.rotation.x = Math.PI / 4;
    nose.scale.set(0.6, 1, 1);
  }
  if (len >= 2.5 && rand() < 0.5) {
    const p = person(g, len / 2 - 0.45, 0.16, 0, rand, { scale: 0.9 });
    p.rotation.y = Math.PI / 2;
  }
  g.userData = { len, kind: 'canoe' };
  return g;
}

/** A plank floating along the gutter. */
export function plank(len) {
  const g = new THREE.Group();
  box(g, len, 0.1, 0.62, PALETTE.plank, 0, 0.02, 0);
  box(g, len, 0.02, 0.06, '#6b4423', 0, 0.075, 0.12, false);
  box(g, len, 0.02, 0.06, '#6b4423', 0, 0.075, -0.12, false);
  g.userData = { len, kind: 'plank' };
  return g;
}

// ---------------------------------------------------------------- roadside props (one tile each)

const UMBRELLAS = ['#e03131', '#1c7ed6', '#f59f00', '#37b24d', '#ae3ec9', '#f76707'];
const GOODS = ['#e03131', '#f76707', '#fab005', '#2f9e44', '#862e9c'];

/** A market stall: table, goods and a big umbrella. */
function stall(rand) {
  const g = new THREE.Group();
  box(g, 0.78, 0.08, 0.62, PALETTE.wood, 0, 0.42, 0);
  for (const x of [-0.32, 0.32]) for (const z of [-0.25, 0.25]) box(g, 0.05, 0.4, 0.05, '#6b4423', x, 0.2, z);
  for (let i = 0; i < 5; i++) {
    sphere(g, 0.08, pickFrom(GOODS, rand), -0.25 + i * 0.125, 0.52, (rand() - 0.5) * 0.3);
  }
  cyl(g, 0.025, 0.025, 1.0, '#dee2e6', 0, 0.85, 0);
  const u = cone(g, 0.62, 0.28, pickFrom(UMBRELLAS, rand), 0, 1.38, 0, 8);
  u.castShadow = true;
  return g;
}

/** A palm tree. */
function palm(rand) {
  const g = new THREE.Group();
  let y = 0;
  let x = 0;
  const lean = (rand() - 0.5) * 0.12;
  for (let i = 0; i < 5; i++) {
    const seg = cyl(g, 0.09 - i * 0.008, 0.11 - i * 0.008, 0.36, PALETTE.palmTrunk, x, y + 0.18, 0, 6);
    seg.rotation.z = lean;
    y += 0.34;
    x -= lean * 0.34;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand();
    const leaf = new THREE.Group();
    leaf.position.set(x, y + 0.05, 0);
    leaf.rotation.y = a;
    const l = box(leaf, 0.75, 0.04, 0.2, i % 2 ? PALETTE.palmLeaf : '#4caf50', 0.36, -0.08, 0);
    l.rotation.z = -0.4;
    g.add(leaf);
  }
  sphere(g, 0.1, '#6d4c1f', x, y - 0.05, 0);
  return g;
}

/** A blue water drum. */
function drum() {
  const g = new THREE.Group();
  cyl(g, 0.3, 0.3, 0.7, '#1c7ed6', 0, 0.35, 0, 12);
  cyl(g, 0.31, 0.31, 0.05, '#1864ab', 0, 0.55, 0, 12);
  cyl(g, 0.31, 0.31, 0.05, '#1864ab', 0, 0.2, 0, 12);
  cyl(g, 0.1, 0.1, 0.05, '#1864ab', 0, 0.72, 0, 8);
  return g;
}

/** "I better pass my neighbour": a small petrol generator. */
function generator() {
  const g = new THREE.Group();
  box(g, 0.6, 0.38, 0.42, '#e03131', 0, 0.24, 0);
  box(g, 0.5, 0.1, 0.36, '#212529', 0, 0.48, 0);
  box(g, 0.62, 0.04, 0.04, '#212529', 0, 0.6, 0.18);
  box(g, 0.62, 0.04, 0.04, '#212529', 0, 0.6, -0.18);
  box(g, 0.04, 0.12, 0.04, '#212529', 0.29, 0.54, 0.18);
  box(g, 0.04, 0.12, 0.04, '#212529', -0.29, 0.54, 0.18);
  box(g, 0.04, 0.12, 0.04, '#212529', 0.29, 0.54, -0.18);
  box(g, 0.04, 0.12, 0.04, '#212529', -0.29, 0.54, -0.18);
  box(g, 0.14, 0.14, 0.02, '#f8f9fa', -0.12, 0.28, 0.215, false);
  return g;
}

/** A stack of yellow jerry cans. */
function jerrycans(rand) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    box(g, 0.24, 0.36, 0.34, '#fcc419', -0.26 + i * 0.27, 0.18, (rand() - 0.5) * 0.1);
    box(g, 0.06, 0.06, 0.06, '#e8590c', -0.26 + i * 0.27, 0.39, 0.1);
  }
  return g;
}

const PROPS = [
  [stall, 4],
  [palm, 3],
  [drum, 1.5],
  [generator, 1],
  [jerrycans, 1],
];
const PROP_TOTAL = PROPS.reduce((s, [, w]) => s + w, 0);

/** A random roadside obstacle that fills one tile. */
export function prop(rand) {
  let r = rand() * PROP_TOTAL;
  for (const [make, w] of PROPS) {
    if ((r -= w) <= 0) return make(rand);
  }
  return stall(rand);
}

// ---------------------------------------------------------------- houses outside the play area

const WALLS = ['#f4e3c1', '#a5d8ff', '#ffd8a8', '#d3f9d8', '#ffc9c9', '#e9ecef', '#fff3bf'];

/** A low Lagos house: painted walls, a rusty zinc roof, a door and windows. Depth fits one row. */
export function house(rand, width) {
  const g = new THREE.Group();
  const h = 0.9 + rand() * 0.9;
  box(g, width, h, 0.9, pickFrom(WALLS, rand), 0, h / 2, 0);
  const roof = new THREE.Mesh(coneGeo(1, 1, 4), mat(rand() < 0.5 ? '#8c6d5a' : '#9e9e9e'));
  roof.scale.set(width * 0.75, 0.45, 0.68);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + 0.22;
  roof.castShadow = true;
  g.add(roof);
  box(g, 0.28, 0.5, 0.02, '#5c3d2e', 0, 0.25, 0.46, false); // door
  for (const x of [-width / 2 + 0.35, width / 2 - 0.35]) {
    if (Math.abs(x) > 0.3) box(g, 0.26, 0.24, 0.02, PALETTE.glass, x, Math.min(h - 0.3, 0.6), 0.46, false);
  }
  if (h > 1.4 && rand() < 0.5) box(g, 0.5, 0.35, 0.3, '#ced4da', width / 4, h + 0.4, 0); // water tank on the roof
  return g;
}

// ---------------------------------------------------------------- coins & signs

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let coinMats = null;
function coinMaterials(gold) {
  coinMats ??= {};
  const key = gold ? 'gold' : 'normal';
  if (!coinMats[key]) {
    const base = gold ? '#ffb000' : '#f2c94c';
    const face = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = gold ? '#b35c00' : '#b8860b';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = gold ? '#8a3c00' : '#8a6100';
      ctx.font = 'bold 76px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₦', w / 2, h / 2 + 4);
    });
    const faceMat = new THREE.MeshLambertMaterial({ map: face, emissive: base, emissiveIntensity: 0.25 });
    coinMats[key] = [mat(gold ? '#d98e04' : '#d4a72c', { emissive: base, emissiveIntensity: 0.2 }), faceMat, faceMat];
  }
  return coinMats[key];
}

/** A spinning ₦ coin. Gold ones are bigger and worth 5. */
export function coin(gold = false) {
  const r = gold ? 0.27 : 0.21;
  const m = new THREE.Mesh(cylGeo(r, r, 0.06, 20), coinMaterials(gold));
  m.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  g.position.y = 0.45;
  m.castShadow = true;
  g.userData = { gold, value: gold ? 5 : 1 };
  return g;
}

/** A green Lagos road sign on two posts, e.g. "OSHODI · 50". */
export function signboard(place, distance) {
  const g = new THREE.Group();
  for (const x of [-0.6, 0.6]) box(g, 0.07, 1.3, 0.07, '#adb5bd', x, 0.65, 0);
  const tex = canvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = '#1b6e3a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f8f9fa';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#f8f9fa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText(place, w / 2, h / 2 - 22);
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(`${distance} hops`, w / 2, h / 2 + 50);
  });
  const board = new THREE.Mesh(boxGeo(1.7, 0.64, 0.06), [
    mat('#1b6e3a'), mat('#1b6e3a'), mat('#1b6e3a'), mat('#1b6e3a'),
    new THREE.MeshLambertMaterial({ map: tex }), mat('#1b6e3a'),
  ]);
  board.position.y = 1.45;
  board.castShadow = true;
  g.add(board);
  return g;
}

/** A level-crossing light post: returns the group and its two lamps for flashing. */
export function crossingLight() {
  const g = new THREE.Group();
  box(g, 0.08, 1.2, 0.08, '#f8f9fa', 0, 0.6, 0);
  box(g, 0.5, 0.12, 0.06, '#f8f9fa', 0, 1.15, 0.05);
  box(g, 0.5, 0.05, 0.065, '#e03131', 0, 1.15, 0.05, false);
  const lamps = [-0.2, 0.2].map((x) => {
    const m = new THREE.Mesh(sphereGeo(0.08), new THREE.MeshLambertMaterial({ color: '#5c1a1a', emissive: '#000000' }));
    m.position.set(x, 1.0, 0.08);
    g.add(m);
    return m;
  });
  return { group: g, lamps };
}

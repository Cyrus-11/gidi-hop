// The three.js scene and the gameplay: hopping, riding canoes, getting hit, the camera that
// keeps pushing forward, and little effects (dust, splashes, coins).
import * as THREE from 'three';
import { World, COLS, LANE_Y, isWater } from './world.js';
import { buildHuman } from './character.js';
import { sfx } from './audio.js';
import { danfo } from './models.js';

const HOP_TIME = 0.14; // seconds per hop
const CHAR_SCALE = 0.6; // start.ng people are ~1.75 m; this makes them about a tile tall
const FACING = { forward: Math.PI, back: 0, left: -Math.PI / 2, right: Math.PI / 2 };
const STEP = { forward: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] };

const DEATHS = {
  danfo: 'Danfo don jam you!',
  keke: 'Keke no dey brake o!',
  okada: 'Okada knock you down!',
  train: 'Train no dey wait for anybody!',
  lagoon: 'You fall inside lagoon!',
  gutter: 'Gutter swallow you!',
  drift: 'Canoe carry you comot!',
  caught: 'Agbero catch you. You too slow!',
};

export class Game {
  constructor(canvas, { seed, onUpdate = () => {}, onDeath = () => {}, onEvent = () => {} } = {}) {
    this.onUpdate = onUpdate;
    this.onDeath = onDeath;
    this.onEvent = onEvent; // { type: 'nearMiss', x, y } with x, y in screen pixels
    this.fixedSeed = seed; // set by ?seed= so every run is the same street
    this.invincible = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f3d3a4');
    this.scene.fog = new THREE.Fog('#f3d3a4', 18, 34);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 80);

    // warm late-afternoon light
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#8a6a4a', 1.5));
    this.sun = new THREE.DirectionalLight('#ffd9a8', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    // dim the strips outside the play area so the edges read clearly
    const shade = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
    this.edges = [-1, 1].map((side) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), shade);
      m.rotation.x = -Math.PI / 2;
      m.position.set(side * (COLS + 0.5 + 5), 0.135, 0);
      m.renderOrder = 1;
      this.scene.add(m);
      return m;
    });

    this.effects = [];
    this.clock = new THREE.Clock();
    this.time = 0;
    this.player = null;
    this.human = null;
    this.state = 'menu';
    this.resize();
    addEventListener('resize', () => this.resize());
    this.reset(seed);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Dress the player in a start.ng style (theirs, or the guest look). */
  setStyle(style) {
    const old = this.human;
    this.human = buildHuman(style);
    this.human.root.scale.setScalar(CHAR_SCALE);
    if (old) {
      this.playerMesh.remove(old.root);
      old.dispose();
    }
    this.playerMesh.add(this.human.root);
  }

  /** A fresh street and the player back at the start, facing the camera on the menu. */
  reset(seed = this.fixedSeed ?? Math.floor(Math.random() * 1e9)) {
    this.world?.dispose();
    for (const e of this.effects) this.scene.remove(e.mesh);
    this.effects = [];
    this.world = new World(this.scene, seed);
    if (!this.playerMesh) {
      this.playerMesh = new THREE.Group();
      this.scene.add(this.playerMesh);
    }
    this.playerMesh.scale.set(1, 1, 1);
    this.playerMesh.rotation.set(0, 0, 0);
    this.player = {
      row: 0, x: 0, y: LANE_Y.sidewalk, facing: 'back',
      hop: null, queue: [], floater: null, dead: false, deathAt: 0,
      maxRow: 0, coins: 0, left: null,
    };
    this.paused = false;
    this.focus = 0; // the row the camera looks at; it creeps forward on its own
    this.started = false;
    this.camX = 0;
    this.state = 'menu';
    this.placePlayer();
    this.snapCamera();
    this.emit();
  }

  /** Starts a run; a seed (the daily street) always builds a fresh street from it. */
  start(seed) {
    if (this.state === 'playing') return;
    if (seed !== undefined) this.reset(seed);
    else if (this.player.dead || this.player.maxRow > 0) this.reset(this.fixedSeed);
    this.state = 'playing';
    this.paused = false;
    this.player.facing = 'forward';
    sfx.start();
  }

  get run() {
    return { hops: this.player.maxRow, coins: this.player.coins };
  }

  emit() {
    this.onUpdate(this.run);
  }

  // ---- input

  move(dir) {
    if (this.state !== 'playing' || this.player.dead || this.paused) return;
    const p = this.player;
    if (p.hop) {
      if (p.queue.length < 1) p.queue.push(dir);
      return;
    }
    this.hop(dir);
  }

  hop(dir) {
    const p = this.player;
    const [dx, dr] = STEP[dir];
    p.facing = dir;
    const toRow = p.row + dr;
    const target = this.world.row(toRow);
    if (!target) return;
    let toX = p.x + dx;
    if (!isWater(target.type)) toX = Math.round(toX);
    // can't hop into a stall, off the side of the street, or back past the start
    const blocked = isWater(target.type) ? Math.abs(toX) > COLS + 0.4 : this.world.isBlocked(toRow, toX);
    if (blocked) {
      p.hop = { fromX: p.x, toX: p.x, fromRow: p.row, toRow: p.row, fromY: p.y, toY: p.y, t: 0, bump: true };
      sfx.bump();
      return;
    }
    p.hop = { fromX: p.x, toX, fromRow: p.row, toRow, fromY: p.y, toY: target.y, t: 0 };
    p.floater = null;
    // remember the lane we're leaving, for near misses
    const from = this.world.row(p.row);
    p.left = toRow !== p.row && (from?.type === 'road' || from?.type === 'rail') ? { row: p.row, x: p.x, at: this.time } : null;
    this.started = true;
    sfx.hop();
  }

  land() {
    const p = this.player;
    const h = p.hop;
    p.hop = null;
    if (h.bump) return this.nextQueued();
    p.row = h.toRow;
    p.x = h.toX;
    p.y = h.toY;
    const row = this.world.row(p.row);
    if (isWater(row.type)) {
      const f = this.world.floaterAt(p.row, p.x);
      if (!f) return this.die(row.type);
      p.floater = f;
      p.floatOffset = p.x - f.x;
      this.splashFx(p.x, -p.row, row.y, 6, '#ffffff');
    } else {
      this.dustFx(p.x, -p.row, row.y);
      const coin = this.world.takeCoin(p.row, Math.round(p.x));
      if (coin) this.collect(coin, row);
    }
    if (p.row > p.maxRow) p.maxRow = p.row;
    this.emit();
    this.nextQueued();
  }

  nextQueued() {
    const p = this.player;
    const next = p.queue.shift();
    if (next && !p.dead) this.hop(next);
  }

  collect(coin, row) {
    const p = this.player;
    p.coins += coin.userData.value;
    sfx.coin(coin.userData.gold);
    // the coin flies up, spinning, and fades
    const world = new THREE.Vector3();
    coin.getWorldPosition(world);
    row.group.remove(coin);
    coin.position.copy(world);
    this.scene.add(coin);
    this.effects.push({ mesh: coin, age: 0, life: 0.5, kind: 'coin', vy: 3 });
  }

  die(reason) {
    const p = this.player;
    if (p.dead) return;
    if (this.invincible && reason !== 'caught') return;
    p.dead = true;
    p.hop = null;
    p.queue = [];
    p.deathAt = this.time;
    p.deathKind = reason;
    if (reason === 'lagoon' || reason === 'gutter' || reason === 'drift') {
      sfx.splash();
      this.splashFx(p.x, -p.row, this.world.row(p.row)?.y ?? 0, 18, reason === 'gutter' ? '#9bb07a' : '#c9f2f2');
    } else if (reason === 'caught') {
      sfx.caught();
    } else {
      sfx.hit();
    }
    this.state = 'dead';
    setTimeout(() => this.onDeath({ ...this.run, reason, message: DEATHS[reason] || 'Ouch!' }), 900);
  }

  // ---- every frame

  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const p = this.player;
    if (this.frozen) {
      this.human?.update(this.time, p.hop ? p.hop.t : -1);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.world.update(dt, p.row);
    for (const e of this.world.events.splice(0)) {
      if (e.type === 'bell') sfx.bell();
      if (e.type === 'train') sfx.train();
    }

    if (this.state === 'playing' && !p.dead) this.step(dt);
    this.updateEffects(dt);
    this.placePlayer(dt);
    this.updateCamera(dt);
    this.world.ensure(p.row, Math.floor(this.focus));
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    const p = this.player;
    if (p.hop) {
      p.hop.t += dt / HOP_TIME;
      if (p.hop.t >= 1) this.land();
    } else if (p.floater) {
      // ride the canoe; fall in if it carries you off the side
      p.x = p.floater.x + p.floatOffset;
      if (Math.abs(p.x) > COLS + 0.6) this.die('drift');
    }
    if (p.dead) return;

    // traffic and trains: check the row the player is (mostly) on
    const h = p.hop;
    const row = h ? (h.t < 0.5 ? h.fromRow : h.toRow) : p.row;
    const x = h ? THREE.MathUtils.lerp(h.fromX, h.toX, h.t) : p.x;
    const hit = this.world.hitAt(row, x);
    if (hit) {
      if (h) {
        p.row = row;
        p.x = x;
        p.y = this.world.row(row).y;
      }
      return this.die(hit.kind);
    }
    this.honk(row, x);
    this.nearMiss();

    // the camera keeps creeping forward; fall too far behind and the agbero gets you
    if (this.started) {
      const d = Math.min(1, p.maxRow / 250);
      this.focus += (0.32 + d * 0.55) * dt;
    }
    this.focus = Math.max(this.focus, THREE.MathUtils.lerp(this.focus, p.row, Math.min(1, dt * 4)));
    if (p.row < this.focus - 4.2) this.die('caught');
  }

  /** A vehicle or train rushing through the spot you just hopped out of: +₦1 and a pop-up. */
  nearMiss() {
    const p = this.player;
    const left = p.left;
    if (!left) return;
    if (this.time - left.at > 0.6) {
      p.left = null;
      return;
    }
    if (p.hop && p.hop.t < 0.5) return; // still in that lane
    const lane = this.world.row(left.row);
    const close = lane.type === 'rail'
      ? lane.train?.state === 'pass' && Math.abs(lane.train.x - left.x) < lane.train.len / 2 + 0.4
      : lane.movers.some((m) => Math.abs(m.x - left.x) < m.len / 2 + 0.35);
    if (!close) return;
    p.left = null;
    p.coins += 1;
    sfx.coin();
    this.emit();
    this.onEvent({ type: 'nearMiss', ...this.screenPos() });
  }

  /** Where the player is on screen, in CSS pixels. */
  screenPos() {
    const v = this.playerMesh.position.clone();
    v.y += 1.1;
    v.project(this.camera);
    const el = this.renderer.domElement;
    return { x: (v.x + 1) / 2 * el.clientWidth, y: (1 - v.y) / 2 * el.clientHeight };
  }

  pause() {
    if (this.state !== 'playing' || this.player.dead) return false;
    this.paused = true;
    return true;
  }

  resume() {
    this.paused = false;
    this.clock.getDelta(); // don't count the time spent paused
  }

  honk(row, x) {
    const now = this.time;
    for (const r of [row - 1, row + 1]) {
      const lane = this.world.row(r);
      if (lane?.type !== 'road') continue;
      for (const m of lane.movers) {
        const ahead = (x - m.x) * lane.dir;
        if (m.kind !== 'okada' && ahead > 0 && ahead < 2.8 && now > m.honkAt) {
          m.honkAt = now + 4;
          if (Math.random() < 0.5) sfx.horn();
        }
      }
    }
  }

  placePlayer() {
    const p = this.player;
    const g = this.playerMesh;
    let x = p.x;
    let z = -p.row;
    let y = p.y;
    let hopT = -1;
    let squash = 1;
    if (p.hop) {
      const t = Math.min(1, p.hop.t);
      hopT = t;
      x = THREE.MathUtils.lerp(p.hop.fromX, p.hop.toX, t);
      z = -THREE.MathUtils.lerp(p.hop.fromRow, p.hop.toRow, t);
      y = THREE.MathUtils.lerp(p.hop.fromY, p.hop.toY, t) + Math.sin(t * Math.PI) * (p.hop.bump ? 0.12 : 0.42);
      if (p.hop.bump) {
        const [dx, dr] = STEP[p.facing];
        const k = Math.sin(t * Math.PI) * 0.18;
        x += dx * k;
        z -= dr * k;
      }
      squash = 1 + Math.sin(t * Math.PI) * 0.12;
    } else if (p.floater) {
      y = p.floater.mesh.position.y + 0.1;
    }
    g.position.set(x, y, z);
    // turn smoothly toward where we're going
    const want = this.state === 'menu' ? 0 : FACING[p.facing];
    let diff = want - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, 0.4 + (this.state === 'menu' ? 0 : 0.5));
    g.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    if (p.dead) this.deathPose();
    this.human?.update(this.time, hopT);
  }

  deathPose() {
    const p = this.player;
    const g = this.playerMesh;
    const k = Math.min(1, (this.time - p.deathAt) / 0.18);
    if (p.deathKind === 'caught') {
      const t = this.time - p.deathAt;
      g.position.y += t * t * 6;
      g.rotation.z = Math.sin(t * 10) * 0.3;
    } else if (['lagoon', 'gutter', 'drift'].includes(p.deathKind)) {
      g.position.y -= Math.min(1.2, (this.time - p.deathAt) * 1.5);
    } else {
      g.scale.set(1 + 0.4 * k, 1 - 0.85 * k, 1 + 0.4 * k); // flat as a pancake
    }
  }

  updateCamera(dt = 1) {
    const p = this.player;
    const menu = this.state === 'menu';
    const aspect = this.camera.aspect;
    // portrait screens need the camera further back to fit the street's width
    const dist = menu ? 7.5 : aspect < 1 ? 13 + (1 - aspect) * 9 : 13;
    const look = new THREE.Vector3(this.camX, 0, -(menu ? p.row : this.focus) - (menu ? 0.6 : 2.2));
    this.camX += (THREE.MathUtils.clamp(p.x * 0.45, -2.5, 2.5) - this.camX) * Math.min(1, dt * 3);
    const pos = new THREE.Vector3(look.x + dist * 0.18, dist * (menu ? 0.42 : 0.78), look.z + dist * (menu ? 0.85 : 0.62));
    this.camera.position.lerp(pos, Math.min(1, dt * 5));
    this.camLook ??= look.clone();
    this.camLook.lerp(look, Math.min(1, dt * 5));
    this.camera.lookAt(this.camLook);
    this.sun.position.set(look.x - 6, 12, look.z + 7);
    this.sun.target.position.copy(look);
    for (const e of this.edges) e.position.z = look.z;
  }

  snapCamera() {
    this.camLook = null;
    this.camera.position.set(0, 20, 20);
    for (let i = 0; i < 60; i++) this.updateCamera(1);
  }

  resize() {
    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- little effects

  dustFx(x, z, y) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(dustGeo, new THREE.MeshLambertMaterial({ color: '#e8d2b0', transparent: true, opacity: 0.8 }));
      const a = Math.random() * Math.PI * 2;
      m.position.set(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2);
      this.scene.add(m);
      this.effects.push({ mesh: m, age: 0, life: 0.35, kind: 'dust', vx: Math.cos(a) * 0.8, vz: Math.sin(a) * 0.8, vy: 0.4 });
    }
  }

  splashFx(x, z, y, n, color) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(dustGeo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 }));
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.2;
      m.position.set(x, y + 0.1, z);
      this.scene.add(m);
      this.effects.push({ mesh: m, age: 0, life: 0.6, kind: 'splash', vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2 + Math.random() * 2 });
    }
  }

  updateEffects(dt) {
    this.effects = this.effects.filter((e) => {
      e.age += dt;
      const k = e.age / e.life;
      if (k >= 1) {
        this.scene.remove(e.mesh);
        if (e.kind !== 'coin') e.mesh.material.dispose();
        return false;
      }
      if (e.kind === 'coin') {
        e.mesh.position.y += e.vy * dt;
        e.mesh.rotation.y += dt * 18;
        e.mesh.scale.setScalar(1 - k * 0.6);
      } else {
        e.mesh.position.x += e.vx * dt;
        e.mesh.position.z += e.vz * dt;
        e.mesh.position.y += e.vy * dt;
        if (e.kind === 'splash') e.vy -= 9 * dt;
        e.mesh.material.opacity = 0.9 * (1 - k);
        e.mesh.scale.setScalar(e.kind === 'dust' ? 1 + k : 1 - k * 0.5);
      }
      return true;
    });
  }

  wave() {
    this.human?.wave();
  }

  /** ?cover: a still of the player mid-hop with a danfo bearing down, for cover.png. */
  stageCover() {
    this.reset(this.fixedSeed ?? 11);
    for (let i = 0; i < 90; i++) this.world.update(1 / 30, 0);
    let road = null;
    for (let r = 2; r < 14 && !road; r++) {
      const row = this.world.row(r);
      if (row?.type === 'road' && this.world.row(r - 1)?.type !== 'lagoon') road = row;
    }
    this.state = 'cover';
    const p = this.player;
    if (road) {
      // make it a danfo lane, with one bus bearing down on the player
      const dir = road.dir;
      for (const m of road.movers) road.group.remove(m.mesh);
      road.movers = [-2.2, -2.2 + 8].map((dx) => {
        const mesh = danfo(this.world.rand);
        mesh.rotation.y = dir > 0 ? 0 : Math.PI;
        mesh.position.x = -dir * dx * -1;
        road.group.add(mesh);
        return { mesh, x: mesh.position.x, len: 2.5, kind: 'danfo', honkAt: 0 };
      });
      p.row = road.r - 1;
      p.hop = { fromX: 0, toX: 0, fromRow: road.r - 1, toRow: road.r, fromY: this.world.row(road.r - 1).y, toY: road.y, t: 0.5 };
      for (const [c, coin] of road.coins) if (Math.abs(c) < 2) coin.visible = false;
    }
    p.facing = 'forward';
    this.focus = p.row;
    this.placePlayer();
    this.playerMesh.rotation.y = 0.75; // three-quarters toward the camera
    this.human.update(1.2, 0.5);
    const look = new THREE.Vector3(0.2, 1.2, -p.row - 1.6);
    this.camera.position.set(look.x + 2.2, 5.6, look.z + 5.6);
    this.camera.lookAt(look);
    this.sun.position.set(look.x - 6, 12, look.z + 7);
    this.sun.target.position.copy(look);
    for (const e of this.edges) e.position.z = look.z;
    this.frozen = true;
  }
}

const dustGeo = new THREE.IcosahedronGeometry(0.07, 0);

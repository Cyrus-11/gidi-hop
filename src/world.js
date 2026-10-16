// The endless Lagos street: rows of sidewalk, road, gutter, lagoon and rail, made as the
// player moves forward and thrown away once they're far behind.
// Row r sits at z = -r. Columns run from -COLS to COLS along x; one tile is one unit.
import * as THREE from 'three';
import * as M from './models.js';

export const COLS = 6; // playable columns: -6..6
const HALF = 16; // lanes are drawn (and traffic loops) from -16 to 16
const LOOP = HALF * 2;
const START = -HALF - 2; // movers loop from START to START + row.loop, mostly off screen at the ends
const AHEAD = 26; // rows built in front of the player
const BEHIND = 10; // rows kept behind the camera

export const LANE_Y = { sidewalk: 0.12, road: 0, rail: 0.06, gutter: -0.22, lagoon: -0.14 };
export const isWater = (type) => type === 'gutter' || type === 'lagoon';

const PLACES = ['YABA', 'OSHODI', 'OJUELEGBA', 'SURULERE', 'OBALENDE', 'MARINA', 'IKOYI', 'LEKKI', 'AJAH', 'IKEJA', 'MUSHIN', 'APAPA', 'OKOKOMAIKO', 'BADAGRY'];

/** Small seeded random numbers (mulberry32), so ?seed= gives the same street every time. */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.rand = makeRandom(seed);
    this.rows = new Map();
    this.root = new THREE.Group();
    scene.add(this.root);
    this.next = -8; // next row to build
    this.plan = []; // lane types queued up for the next rows
    this.lastSegment = 'sidewalk';
    this.time = 0;
    this.events = []; // sounds etc. for the game to play: { type, row }
    this.ensure(0);
  }

  difficulty(r) {
    return Math.min(1, Math.max(0, r) / 250);
  }

  // ---- lane planning

  planNext() {
    const r = this.next;
    const d = this.difficulty(r);
    const rand = this.rand;
    if (r < 3) return 'sidewalk';
    if (r % 50 === 0) {
      this.plan = [];
      this.lastSegment = 'sidewalk';
      return 'sidewalk';
    }
    if (this.plan.length) return this.plan.shift();
    // after a hazard, usually a sidewalk to breathe on
    if (this.lastSegment !== 'sidewalk' && rand() < 0.55 - d * 0.25) {
      this.lastSegment = 'sidewalk';
      return 'sidewalk';
    }
    const options = [
      ['sidewalk', this.lastSegment === 'sidewalk' ? 0.6 : 2],
      ['road', 4 + d * 2],
      ['gutter', r > 6 ? 1.2 : 0],
      ['lagoon', r > 12 ? 1.6 + d : 0],
      ['rail', r > 18 ? 0.9 + d * 0.5 : 0],
    ].filter(([t, w]) => w > 0 && (t !== this.lastSegment || t === 'road'));
    let pick = rand() * options.reduce((s, [, w]) => s + w, 0);
    let type = options[0][0];
    for (const [t, w] of options) {
      if ((pick -= w) <= 0) {
        type = t;
        break;
      }
    }
    let count = 1;
    if (type === 'road') count = 1 + Math.floor(rand() * (2 + d * 2.5));
    if (type === 'lagoon') count = 1 + Math.floor(rand() * (1.5 + d * 1.5));
    if (type === 'sidewalk') count = 1 + Math.floor(rand() * 2);
    // never run into the next milestone sidewalk
    count = Math.max(1, Math.min(count, 50 - (r % 50)));
    this.lastSegment = type;
    for (let i = 1; i < count; i++) this.plan.push(type);
    return type;
  }

  /** Builds rows until there are AHEAD rows in front of `playerRow`, and drops old ones. */
  ensure(playerRow, cameraRow = playerRow) {
    while (this.next <= playerRow + AHEAD) {
      const type = this.planNext();
      this.buildRow(this.next, type);
      this.next++;
    }
    const keepFrom = Math.min(playerRow, cameraRow) - BEHIND;
    for (const [r, row] of this.rows) {
      if (r < keepFrom) {
        this.root.remove(row.group);
        this.rows.delete(r);
      }
    }
  }

  // ---- building rows

  buildRow(r, type) {
    const rand = this.rand;
    const d = this.difficulty(r);
    const group = new THREE.Group();
    group.position.z = -r;
    const row = { r, type, group, obstacles: new Set(), movers: [], coins: new Map(), y: LANE_Y[type] };
    const prev = this.rows.get(r - 1);

    if (type === 'sidewalk') {
      const color = r % 2 ? M.PALETTE.sidewalk : M.PALETTE.sidewalkAlt;
      M.box(group, LOOP, 0.32, 1, color, 0, LANE_Y.sidewalk - 0.16, 0, false);
      // a curb where the sidewalk meets something else
      if (prev && prev.type !== 'sidewalk') M.box(group, LOOP, 0.06, 0.08, M.PALETTE.curb, 0, LANE_Y.sidewalk + 0.02, 0.46, false);
      this.decorateSidewalk(row, r);
    } else if (type === 'road') {
      M.box(group, LOOP, 0.3, 1, r % 2 ? M.PALETTE.asphalt : M.PALETTE.asphaltDark, 0, -0.15, 0, false);
      if (prev?.type === 'road') {
        for (let x = -HALF + 0.5; x < HALF; x += 1.6) M.box(group, 0.7, 0.012, 0.07, M.PALETTE.line, x, 0.006, 0.5, false);
      }
      this.fillTraffic(row, d);
    } else if (type === 'rail') {
      M.box(group, LOOP, 0.3, 1, M.PALETTE.gravel, 0, LANE_Y.rail - 0.15, 0, false);
      for (let x = -HALF + 0.3; x < HALF; x += 0.6) M.box(group, 0.16, 0.05, 0.86, M.PALETTE.sleeper, x, LANE_Y.rail + 0.02, 0, false);
      for (const z of [-0.24, 0.24]) M.box(group, LOOP, 0.06, 0.06, M.PALETTE.rail, 0, LANE_Y.rail + 0.07, z, false);
      const lights = [];
      for (const x of [-(COLS + 1.2), COLS + 1.2]) {
        const l = M.crossingLight();
        l.group.position.set(x, LANE_Y.rail, 0.42);
        group.add(l.group);
        lights.push(...l.lamps);
      }
      const t = M.train();
      t.visible = false;
      group.add(t);
      const dir = rand() < 0.5 ? 1 : -1;
      t.rotation.y = dir > 0 ? 0 : Math.PI;
      row.train = { mesh: t, len: t.userData.len, dir, x: 0, state: 'idle', timer: 1.5 + rand() * 4, speed: 22 + d * 8 };
      row.lights = lights;
    } else if (type === 'gutter') {
      M.box(group, LOOP, 0.4, 1, M.PALETTE.concrete, 0, LANE_Y.gutter - 0.25, 0, false);
      M.box(group, LOOP, 0.02, 0.86, M.PALETTE.gutterWater, 0, LANE_Y.gutter - 0.03, 0, false);
      for (const z of [-0.47, 0.47]) M.box(group, LOOP, 0.4, 0.06, M.PALETTE.concrete, 0, -0.1, z, false);
      this.fillFloaters(row, d, 'plank');
    } else if (type === 'lagoon') {
      const water = M.box(group, LOOP, 0.3, 1, M.PALETTE.lagoon, 0, LANE_Y.lagoon - 0.2, 0, false);
      water.material = M.mat(r % 2 ? M.PALETTE.lagoon : '#1c9898');
      this.fillFloaters(row, d, 'canoe');
    }

    this.rows.set(r, row);
    this.root.add(group);
    return row;
  }

  decorateSidewalk(row, r) {
    const rand = this.rand;
    const { group } = row;
    // houses and palms just outside the play area on both sides
    for (const side of [-1, 1]) {
      let x = COLS + 1.2;
      while (x < HALF - 1) {
        const w = 1.4 + Math.floor(rand() * 3) * 0.4;
        if (rand() < 0.8) {
          const h = M.house(rand, w);
          h.position.set(side * (x + w / 2), LANE_Y.sidewalk, 0);
          group.add(h);
        } else {
          const p = M.prop(rand);
          p.position.set(side * (x + 0.5), LANE_Y.sidewalk, 0);
          group.add(p);
        }
        x += w + 0.25;
      }
    }
    // behind the start: a solid line of stalls so nobody walks off the back of the map
    let count;
    if (r <= -4) count = 2 * COLS + 1;
    else if (r >= -1 && r <= 1) count = 0;
    else count = Math.floor(rand() * (r < 10 ? 3 : 5));
    const cols = [];
    for (let c = -COLS; c <= COLS; c++) cols.push(c);
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    // keep the middle clear between the menu camera and the player at the start
    const usable = r < 0 && r > -4 ? cols.filter((c) => Math.abs(c) >= 3) : cols;
    for (const c of usable.slice(0, count)) {
      row.obstacles.add(c);
      const p = M.prop(rand);
      p.position.set(c, LANE_Y.sidewalk, (rand() - 0.5) * 0.1);
      p.rotation.y = (rand() - 0.5) * 0.6;
      group.add(p);
    }
    if (r > 0 && r % 50 === 0) {
      const sign = M.signboard(PLACES[(r / 50 - 1) % PLACES.length], r);
      sign.position.set(-(COLS + 0.9), LANE_Y.sidewalk, 0.15);
      group.add(sign);
    }
    this.maybeCoin(row);
  }

  maybeCoin(row) {
    const rand = this.rand;
    if (row.r < 2 || rand() > 0.32) return;
    const free = [];
    for (let c = -COLS; c <= COLS; c++) if (!row.obstacles.has(c)) free.push(c);
    if (!free.length) return;
    const c = free[Math.floor(rand() * free.length)];
    const coin = M.coin(rand() < 0.12);
    coin.position.set(c, row.y + 0.45, 0);
    row.group.add(coin);
    row.coins.set(c, coin);
  }

  fillTraffic(row, d) {
    const rand = this.rand;
    const roll = rand();
    const kind = roll < 0.45 ? 'danfo' : roll < 0.75 ? 'keke' : 'okada';
    const base = { danfo: 1.5, keke: 2.3, okada: 3.6 }[kind];
    const speed = (base + rand() * 1.2) * (1 + d * 0.9);
    const dir = rand() < 0.5 ? 1 : -1;
    const sample = M.VEHICLES[kind](rand);
    const len = sample.userData.len;
    // spread vehicles evenly around the lane's loop, with a gap of at least 3 tiles
    const L = LOOP + 4;
    const n = Math.max(1, Math.min(Math.floor(L / (len + 3)), 2 + Math.floor(rand() * (2 + d * 3))));
    const slot = L / n;
    const offset = rand() * L;
    for (let i = 0; i < n; i++) {
      const v = i === 0 ? sample : M.VEHICLES[kind](rand);
      const x = START + ((offset + i * slot + (rand() - 0.5) * (slot - len - 3)) % L + L) % L;
      v.rotation.y = dir > 0 ? 0 : Math.PI;
      v.position.set(x, 0, 0);
      row.group.add(v);
      row.movers.push({ mesh: v, x, len, kind, honkAt: 0 });
    }
    row.loop = L;
    row.speed = speed;
    row.dir = dir;
    this.maybeCoin(row);
  }

  fillFloaters(row, d, kind) {
    const rand = this.rand;
    const prev = this.rows.get(row.r - 1);
    // neighbouring lagoon lanes flow opposite ways
    const dir = prev && isWater(prev.type) && prev.dir ? -prev.dir : rand() < 0.5 ? 1 : -1;
    const speed = (kind === 'canoe' ? 0.9 : 1.1) + rand() * 0.9 + d * 1.0;
    // a chain of boats and gaps around the loop; gaps stay short enough to wait for
    let x = START;
    while (x < START + LOOP + 4) {
      const len = kind === 'canoe' ? 2 + Math.floor(rand() * 3) * 0.5 : 1.5 + Math.floor(rand() * 3) * 0.5;
      const m = kind === 'canoe' ? M.canoe(len, rand) : M.plank(len);
      const cx = x + len / 2;
      m.position.set(cx, row.y, 0);
      row.group.add(m);
      row.movers.push({ mesh: m, x: cx, len, kind });
      x += len + 1.2 + rand() * (1.4 + d * 1.6);
    }
    row.loop = x - START;
    row.speed = speed;
    row.dir = dir;
  }

  // ---- every frame

  update(dt, playerRow) {
    this.time += dt;
    for (const row of this.rows.values()) {
      if (row.movers.length) {
        const step = row.speed * row.dir * dt;
        for (const m of row.movers) {
          m.x = START + ((((m.x + step - START) % row.loop) + row.loop) % row.loop);
          m.mesh.position.x = m.x;
          if (isWater(row.type)) m.mesh.position.y = row.y + Math.sin(this.time * 2 + m.x) * 0.02;
        }
      }
      if (row.coins.size) {
        for (const c of row.coins.values()) {
          c.rotation.y += dt * 2.5;
          c.position.y = row.y + 0.45 + Math.sin(this.time * 3 + row.r) * 0.05;
        }
      }
      if (row.train) this.updateTrain(row, dt, playerRow);
    }
  }

  updateTrain(row, dt, playerRow) {
    const t = row.train;
    t.timer -= dt;
    const near = Math.abs(row.r - playerRow) < 7;
    if (t.state === 'idle' && t.timer <= 0) {
      t.state = 'warn';
      t.timer = 1.3;
      if (near) this.events.push({ type: 'bell', row: row.r });
    } else if (t.state === 'warn' && t.timer <= 0) {
      t.state = 'pass';
      t.x = -t.dir * (HALF + t.len / 2);
      t.mesh.visible = true;
      if (near) this.events.push({ type: 'train', row: row.r });
    } else if (t.state === 'pass') {
      t.x += t.dir * t.speed * dt;
      if (Math.abs(t.x) > HALF + t.len / 2 + 1) {
        t.state = 'idle';
        t.mesh.visible = false;
        t.timer = 3 + this.rand() * 4;
      }
    }
    t.mesh.position.set(t.x, LANE_Y.rail, 0);
    const on = t.state !== 'idle' && Math.floor(this.time * 6) % 2 === 0;
    row.lights.forEach((l, i) => {
      const lit = t.state !== 'idle' && (on ? i % 2 === 0 : i % 2 === 1);
      l.material.color.set(lit ? '#ff3b3b' : '#5c1a1a');
      l.material.emissive.set(lit ? '#ff2020' : '#000000');
    });
  }

  // ---- questions the game asks

  row(r) {
    return this.rows.get(r);
  }

  isBlocked(r, c) {
    if (c < -COLS || c > COLS) return true;
    const row = this.rows.get(r);
    return !row || row.obstacles.has(c);
  }

  /** The boat or plank under x on a water row, or null. */
  floaterAt(r, x) {
    const row = this.rows.get(r);
    if (!row || !isWater(row.type)) return null;
    for (const m of row.movers) if (Math.abs(m.x - x) < m.len / 2 + 0.05) return m;
    return null;
  }

  /** What hits a player standing at x on row r (a vehicle, a train), or null. */
  hitAt(r, x) {
    const row = this.rows.get(r);
    if (!row) return null;
    if (row.type === 'road') {
      for (const m of row.movers) if (Math.abs(m.x - x) < m.len / 2 + 0.22) return m;
    }
    if (row.train?.state === 'pass' && Math.abs(row.train.x - x) < row.train.len / 2 + 0.25) return { kind: 'train' };
    return null;
  }

  takeCoin(r, c) {
    const row = this.rows.get(r);
    const coin = row?.coins.get(c);
    if (!coin) return null;
    row.coins.delete(c);
    return coin;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

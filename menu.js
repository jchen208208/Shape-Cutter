// Landing page animations: a background where slashes streak across the
// screen and genuinely cut the drifting shapes and foods (via the real
// engine), plus live previews of both modes on the menu cards.
// Uses splitPolygon from engine.js and the sprite builders from foods.js.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOut = (t) => 1 - (1 - t) ** 3;

// miniature of the game's polygon generator
function miniPolygon(cx, cy, rMin, rMax) {
  const n = 6 + Math.floor(Math.random() * 4);
  const steps = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.5 + Math.random();
    steps.push(s);
    total += s;
  }
  const points = [];
  let angle = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    angle += (steps[i] / total) * Math.PI * 2;
    const r = rMin + Math.random() * (rMax - rMin);
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}

function centroid(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function tracePath(c, points) {
  c.beginPath();
  c.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
  c.closePath();
}

function drawCellsAt(c, cells, x0, y0, s) {
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (cells[y][x] === null) continue;
      c.fillStyle = cells[y][x];
      c.fillRect(x0 + x * s, y0 + y * s, s, s);
    }
  }
}

// --- background: parallax drifters that get slashed apart ---

const bg = document.getElementById('bg');
const bgc = bg.getContext('2d');

function sizeBg() {
  bg.width = innerWidth;
  bg.height = innerHeight;
}
sizeBg();
addEventListener('resize', sizeBg);

// mouse parallax, in [-1, 1]
const parallax = { x: 0, y: 0 };
addEventListener('mousemove', (e) => {
  parallax.x = (e.clientX / innerWidth) * 2 - 1;
  parallax.y = (e.clientY / innerHeight) * 2 - 1;
});

const DRIFT_COLORS = ['#e94560', '#f5a623', '#5f85db', '#8fbf58'];

// A drifter floats upward. Its outline lives in local coordinates centered
// on the origin (for foods, the traced sprite silhouette), so a slash can be
// transformed into local space and split it with the game engine.
function makeDrifter(anywhere) {
  const depth = 0.4 + Math.random() * 0.6; // 1 = near: bigger, faster, brighter
  const d = {
    depth,
    x: Math.random() * innerWidth,
    y: anywhere ? Math.random() * innerHeight : innerHeight + 90,
    vy: (10 + Math.random() * 14) * depth,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.4,
    alpha: 0.05 + 0.13 * depth,
    split: null, // {pieces, normal, age} after being slashed
    cells: null,
    cellSize: 0,
    poly: null,
    color: DRIFT_COLORS[Math.floor(Math.random() * DRIFT_COLORS.length)],
  };
  if (Math.random() < 0.45) {
    const sprite = buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]);
    d.cells = sprite.cells;
    d.cellSize = (1.1 + Math.random() * 1.3) * depth * 2;
    d.poly = sprite.polygon.map((p) => ({
      x: (p.x - FOOD_N / 2) * d.cellSize,
      y: (p.y - FOOD_N / 2) * d.cellSize,
    }));
  } else {
    d.poly = miniPolygon(0, 0, 10 * depth * 2, 26 * depth * 2);
  }
  return d;
}

const drifters = [];
for (let i = 0; i < 18; i++) drifters.push(makeDrifter(true));

// draw one piece of a drifter (or its whole outline) in local coordinates
function drawDrifterShape(d, points, offset) {
  bgc.save();
  if (offset) bgc.translate(offset.x, offset.y);
  if (d.cells) {
    tracePath(bgc, points);
    bgc.clip();
    const half = (FOOD_N / 2) * d.cellSize;
    drawCellsAt(bgc, d.cells, -half, -half, d.cellSize);
  } else {
    tracePath(bgc, points);
    bgc.fillStyle = d.color;
    bgc.fill();
  }
  bgc.restore();
}

const SPLIT_LIFE = 1.9; // seconds from slash to respawn

function drawDrifter(d, dt) {
  d.y -= d.vy * dt;
  d.rot += d.vr * dt;
  if (d.y < -100) {
    Object.assign(d, makeDrifter(false));
    return;
  }

  bgc.save();
  bgc.globalAlpha = d.alpha;
  bgc.translate(d.x + parallax.x * -34 * d.depth, d.y + parallax.y * -20 * d.depth);
  bgc.rotate(d.rot);

  if (d.split) {
    d.split.age += dt;
    if (d.split.age > SPLIT_LIFE) {
      bgc.restore();
      Object.assign(d, makeDrifter(false));
      return;
    }
    const k = easeOut(Math.min(d.split.age / 1.2, 1)) * 30;
    const fade = Math.min(1, (SPLIT_LIFE - d.split.age) / 0.7);
    bgc.globalAlpha = d.alpha * fade;
    d.split.pieces.forEach((piece, i) => {
      const s = i === 0 ? 1 : -1;
      drawDrifterShape(d, piece, {
        x: d.split.normal.x * k * s,
        y: d.split.normal.y * k * s,
      });
    });
  } else {
    drawDrifterShape(d, d.poly, null);
  }
  bgc.restore();
}

// --- slashes: a line streaks across the screen and cuts what it crosses ---

let slash = null; // {a, b, born}
let nextSlashAt = performance.now() + 1500;

function spawnSlash(now) {
  const th = Math.random() * Math.PI;
  const dir = { x: Math.cos(th), y: Math.sin(th) };
  const px = innerWidth * (0.15 + Math.random() * 0.7);
  const py = innerHeight * (0.15 + Math.random() * 0.7);
  const D = Math.hypot(innerWidth, innerHeight);
  const a = { x: px - dir.x * D, y: py - dir.y * D };
  const b = { x: px + dir.x * D, y: py + dir.y * D };
  slash = { a, b, born: now };

  // cut every drifter the line crosses, in each drifter's local space
  for (const d of drifters) {
    if (d.split) continue;
    const cos = Math.cos(-d.rot);
    const sin = Math.sin(-d.rot);
    const toLocal = (p) => {
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    };
    const la = toLocal(a);
    const lb = toLocal(b);
    const [p1, p2] = splitPolygon(d.poly, la, lb);
    if (p1.length < 3 || p2.length < 3) continue;
    const len = Math.hypot(lb.x - la.x, lb.y - la.y);
    d.split = {
      pieces: [p1, p2],
      normal: { x: -(lb.y - la.y) / len, y: (lb.x - la.x) / len },
      age: 0,
    };
  }
}

function drawSlash(now) {
  if (!slash) return;
  const t = (now - slash.born) / 1000;
  if (t > 0.9) {
    slash = null;
    return;
  }
  const reach = easeOut(Math.min(t / 0.3, 1));
  const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.45;
  bgc.save();
  bgc.globalAlpha = 0.55 * fade;
  bgc.strokeStyle = '#fff';
  bgc.lineWidth = 2;
  bgc.shadowColor = '#e94560';
  bgc.shadowBlur = 16;
  bgc.beginPath();
  bgc.moveTo(slash.a.x, slash.a.y);
  bgc.lineTo(
    slash.a.x + (slash.b.x - slash.a.x) * reach,
    slash.a.y + (slash.b.y - slash.a.y) * reach
  );
  bgc.stroke();
  bgc.restore();
}

function drawBackground(now, dt) {
  bgc.clearRect(0, 0, bg.width, bg.height);
  for (const d of drifters) drawDrifter(d, dt);
  if (now >= nextSlashAt) {
    spawnSlash(now);
    nextSlashAt = now + 2600 + Math.random() * 2400;
  }
  drawSlash(now);
}

// --- shapes preview: a polygon gets sliced on loop by the real engine ---

// This script powers both menu pages: the dimension select (index.html) and
// the 2D target select (2d.html). Each preview initializes only if its
// canvas exists on the current page.
const sp = document.getElementById('previewShapes');
const spc = sp ? sp.getContext('2d') : null;
const PIECE_PREVIEW_COLORS = ['#e94560', '#f5a623'];

function newSliceScene() {
  for (;;) {
    const poly = miniPolygon(sp.width / 2, sp.height / 2, 30, 52);
    const c = centroid(poly);
    const th = Math.random() * Math.PI;
    const dir = { x: Math.cos(th), y: Math.sin(th) };
    const a = { x: c.x - dir.x * 200, y: c.y - dir.y * 200 };
    const b = { x: c.x + dir.x * 200, y: c.y + dir.y * 200 };
    const [p1, p2] = splitPolygon(poly, a, b);
    if (p1.length < 3 || p2.length < 3) continue;
    return {
      poly,
      a,
      b,
      pieces: [p1, p2],
      normal: { x: -dir.y, y: dir.x },
      start: performance.now(),
    };
  }
}

let slice = sp ? newSliceScene() : null;

function drawShapesPreview(now) {
  spc.clearRect(0, 0, sp.width, sp.height);
  const t = (now - slice.start) / 1000;

  if (t < 1.0) {
    // aim: shape sits there while the cut line sweeps in
    tracePath(spc, slice.poly);
    spc.fillStyle = PIECE_PREVIEW_COLORS[0];
    spc.fill();
    spc.strokeStyle = '#fff';
    spc.stroke();
    const reach = easeOut(Math.min(t / 0.8, 1));
    spc.beginPath();
    spc.moveTo(slice.a.x, slice.a.y);
    spc.lineTo(
      slice.a.x + (slice.b.x - slice.a.x) * reach,
      slice.a.y + (slice.b.y - slice.a.y) * reach
    );
    spc.strokeStyle = 'rgba(255,255,255,0.9)';
    spc.stroke();
  } else if (t < 2.6) {
    // split: pieces drift apart, fading near the end
    const k = easeOut(Math.min((t - 1.0) / 1.1, 1)) * 9;
    spc.globalAlpha = t < 2.1 ? 1 : 1 - (t - 2.1) / 0.5;
    slice.pieces.forEach((piece, i) => {
      const s = i === 0 ? 1 : -1;
      spc.save();
      spc.translate(slice.normal.x * k * s, slice.normal.y * k * s);
      tracePath(spc, piece);
      spc.fillStyle = PIECE_PREVIEW_COLORS[i];
      spc.fill();
      spc.strokeStyle = '#fff';
      spc.stroke();
      spc.restore();
    });
    spc.globalAlpha = 1;
  } else {
    slice = newSliceScene();
  }
}

// --- food preview: pixel foods pop in and bob ---

const fp = document.getElementById('previewFood');
const fpc = fp ? fp.getContext('2d') : null;

function newFoodScene() {
  return {
    sprite: roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)])),
    start: performance.now(),
    geom: null, // where the sprite was drawn last frame: {x, y, s}
  };
}

let dish = fp ? newFoodScene() : null;

function drawFoodPreview(now) {
  fpc.clearRect(0, 0, fp.width, fp.height);

  const t = (now - dish.start) / 1000;
  if (t > 3.2) dish = newFoodScene();

  const pop = 0.75 + 0.25 * easeOut(Math.min(t / 0.35, 1));
  const bob = Math.sin(t * 2.2) * 3;
  const s = 5.4 * pop;
  const size = FOOD_N * s;
  dish.geom = { x: (fp.width - size) / 2, y: (fp.height - size) / 2 + bob, s };
  fpc.globalAlpha = Math.min(t / 0.25, 1);
  drawCellsAt(fpc, dish.sprite.cells, dish.geom.x, dish.geom.y, s);
  fpc.globalAlpha = 1;
}

// --- 3D select page previews: a rotating lumpy solid and a voxel food ---
// (only initialized on 3d.html, where solids.js is loaded)

const s3 = document.getElementById('previewShape3d');
const f3 = document.getElementById('previewFood3d');
const s3c = s3 ? s3.getContext('2d') : null;
const f3c = f3 ? f3.getContext('2d') : null;
const HAS_SOLIDS = typeof buildSolid !== 'undefined';

let s3solid = null;
let f3vox = null;
if (s3 && HAS_SOLIDS) s3solid = buildSolid();
if (f3 && HAS_SOLIDS) {
  const sprite = buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]);
  f3vox = voxelizeCells(sprite.cells, FOOD_N);
}

// tiny orthographic painter's-algorithm renderer for the preview cards
function drawMini3D(c, W, H, polys, scale, yaw3, pitch3) {
  const cy = Math.cos(yaw3);
  const sy = Math.sin(yaw3);
  const cp = Math.cos(pitch3);
  const sp = Math.sin(pitch3);
  const m = [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
  const items = [];
  for (const poly of polys) {
    const nz = m[6] * poly.n.x + m[7] * poly.n.y + m[8] * poly.n.z;
    if (nz <= 0) continue;
    const nx = m[0] * poly.n.x + m[1] * poly.n.y + m[2] * poly.n.z;
    const ny = m[3] * poly.n.x + m[4] * poly.n.y + m[5] * poly.n.z;
    const lit = 0.55 + 0.45 * Math.max(0, -0.4 * nx - 0.55 * ny + 0.65 * nz);
    const pts = poly.pts.map((p) => ({
      x: W / 2 + (m[0] * p.x + m[1] * p.y + m[2] * p.z) * scale,
      y: H / 2 + (m[3] * p.x + m[4] * p.y + m[5] * p.z) * scale,
      z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
    }));
    let z = 0;
    for (const p of pts) z += p.z;
    items.push({ z: z / pts.length, pts, fill: shade(poly.color, lit) });
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    c.beginPath();
    c.moveTo(it.pts[0].x, it.pts[0].y);
    for (let i = 1; i < it.pts.length; i++) c.lineTo(it.pts[i].x, it.pts[i].y);
    c.closePath();
    c.fillStyle = it.fill;
    c.fill();
    c.strokeStyle = it.fill;
    c.stroke();
  }
}

function solidPreviewPolys(solid, color) {
  const polys = [];
  for (const [a, b, c] of solid.tris) {
    const A = solid.verts[a];
    const B = solid.verts[b];
    const C = solid.verts[c];
    polys.push({ pts: [A, B, C], n: v3.norm(v3.cross(v3.sub(B, A), v3.sub(C, A))), color });
  }
  return polys;
}

const MINI_DIRS = [
  { d: { x: 1, y: 0, z: 0 }, o: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { d: { x: -1, y: 0, z: 0 }, o: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { d: { x: 0, y: 1, z: 0 }, o: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { d: { x: 0, y: -1, z: 0 }, o: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: { x: 0, y: 0, z: 1 }, o: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { d: { x: 0, y: 0, z: -1 }, o: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

function voxelPreviewPolys(vox) {
  const polys = [];
  for (const v of vox.voxels) {
    const c = voxelCorner(v, FOOD_N);
    for (const dir of MINI_DIRS) {
      if (vox.lookup.has(`${v.x + dir.d.x},${v.y + dir.d.y},${v.z + dir.d.z}`)) continue;
      polys.push({
        pts: dir.o.map((o) => ({ x: c.x + o[0], y: c.y + o[1], z: c.z + o[2] })),
        n: dir.d,
        color: v.c,
      });
    }
  }
  return polys;
}

let s3polys = s3solid ? solidPreviewPolys(s3solid, '#e94560') : null;
let f3polys = f3vox ? voxelPreviewPolys(f3vox) : null;

function drawShape3dPreview(now) {
  s3c.clearRect(0, 0, s3.width, s3.height);
  drawMini3D(s3c, s3.width, s3.height, s3polys, 48, now / 1900, -0.5 + Math.sin(now / 2600) * 0.15);
}

function drawFood3dPreview(now) {
  f3c.clearRect(0, 0, f3.width, f3.height);
  drawMini3D(f3c, f3.width, f3.height, f3polys, 4.6, now / 2200, -0.55 + Math.sin(now / 3000) * 0.12);
}

// --- dimension previews (landing page): a 1D segment, a 2D plane and a 3D
// cube, each on its own cut → separate → heal loop ---

const d1 = document.getElementById('previewD1');
const d2 = document.getElementById('previewD2');
const d3 = document.getElementById('previewD3');
const d1c = d1 ? d1.getContext('2d') : null;
const d2c = d2 ? d2.getContext('2d') : null;
const d3c = d3 ? d3.getContext('2d') : null;
const dimStart = performance.now();

const DIM_PERIOD = 3.8; // seconds per cut cycle

// phase within the cycle: [0,2) idle, [2,2.15) flash, then separate and heal.
// offset de-syncs the three cards so they don't all cut at once.
function dimCycle(now, offset) {
  const total = (now - dimStart) / 1000 + offset;
  const t = total % DIM_PERIOD;
  const cycle = Math.floor(total / DIM_PERIOD);
  let sep = 0; // 0..1 how far apart the halves are
  if (t >= 2.15 && t < 2.9) sep = easeOut(Math.min((t - 2.15) / 0.45, 1));
  else if (t >= 2.9) sep = 1 - easeOut(Math.min((t - 2.9) / 0.8, 1));
  const flash = t >= 2.0 && t < 2.15 ? 1 - (t - 2.0) / 0.15 : 0;
  return { t, cycle, sep, flash };
}

// cheap deterministic per-cycle random in [0,1)
function cycleRand(cycle, salt) {
  const v = Math.sin(cycle * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// 1D: a segment with a point wandering along it; the cut splits it along
// its own axis — the only direction 1D has
function drawD1(now) {
  const W = d1.width;
  const H = d1.height;
  d1c.clearRect(0, 0, W, H);
  const { cycle, sep, flash } = dimCycle(now, 0);
  const y = H / 2;
  const x0 = 34;
  const x1 = W - 34;
  const cutX = x0 + (0.3 + cycleRand(cycle, 1) * 0.4) * (x1 - x0);
  const gap = sep * 15;

  d1c.lineCap = 'round';
  d1c.lineWidth = 5;
  d1c.strokeStyle = '#5f85db';
  d1c.beginPath();
  d1c.moveTo(x0 - gap, y);
  d1c.lineTo(cutX - Math.max(gap, 2), y);
  d1c.moveTo(cutX + Math.max(gap, 2), y);
  d1c.lineTo(x1 + gap, y);
  d1c.stroke();

  d1c.fillStyle = '#fff';
  for (const ex of [x0 - gap, x1 + gap]) {
    d1c.beginPath();
    d1c.arc(ex, y, 4, 0, Math.PI * 2);
    d1c.fill();
  }
  if (sep === 0 && flash === 0) {
    // a point living its one-dimensional life
    const px = x0 + (0.5 + 0.5 * Math.sin(now / 700)) * (x1 - x0);
    d1c.beginPath();
    d1c.arc(px, y, 3.5, 0, Math.PI * 2);
    d1c.fill();
  }
  if (flash > 0) {
    d1c.save();
    d1c.globalAlpha = flash;
    d1c.strokeStyle = '#fff';
    d1c.lineWidth = 2;
    d1c.beginPath();
    d1c.moveTo(cutX, y - 20);
    d1c.lineTo(cutX, y + 20);
    d1c.stroke();
    d1c.restore();
  }
}

// 2D: a breathing grid plane, sliced at a different angle every cycle
function drawD2(now) {
  const W = d2.width;
  const H = d2.height;
  d2c.clearRect(0, 0, W, H);
  const { cycle, sep, flash } = dimCycle(now, 1.3);
  const c = { x: W / 2, y: H / 2 };
  const rect = [
    { x: 38, y: 30 },
    { x: W - 38, y: 30 },
    { x: W - 38, y: H - 30 },
    { x: 38, y: H - 30 },
  ];
  const th = cycleRand(cycle, 7) * Math.PI;
  const dir = { x: Math.cos(th), y: Math.sin(th) };
  const n = { x: -dir.y, y: dir.x };
  const a = { x: c.x - dir.x * 300, y: c.y - dir.y * 300 };
  const b = { x: c.x + dir.x * 300, y: c.y + dir.y * 300 };
  const k = sep * 10;

  const drawGrid = () => {
    d2c.lineWidth = 2;
    d2c.strokeStyle = 'rgba(233, 69, 96, 0.9)';
    tracePath(d2c, rect);
    d2c.stroke();
    d2c.lineWidth = 1;
    d2c.strokeStyle = 'rgba(233, 69, 96, 0.35)';
    d2c.beginPath();
    for (let gx = rect[0].x + 27.4; gx < rect[1].x; gx += 27.4) {
      d2c.moveTo(gx, rect[0].y);
      d2c.lineTo(gx, rect[2].y);
    }
    for (let gy = rect[0].y + 22.5; gy < rect[2].y; gy += 22.5) {
      d2c.moveTo(rect[0].x, gy);
      d2c.lineTo(rect[1].x, gy);
    }
    d2c.stroke();
  };

  d2c.save();
  // the plane breathes a little so it reads as alive
  d2c.translate(c.x, c.y);
  d2c.rotate(Math.sin(now / 2100) * 0.04);
  d2c.scale(1 + Math.sin(now / 1500) * 0.02, 1 + Math.sin(now / 1500) * 0.02);
  d2c.translate(-c.x, -c.y);

  if (k === 0) {
    drawGrid();
  } else {
    splitPolygon(rect, a, b).forEach((piece, i) => {
      if (piece.length < 3) return;
      const s = i === 0 ? 1 : -1;
      d2c.save();
      d2c.translate(n.x * k * s, n.y * k * s);
      tracePath(d2c, piece);
      d2c.clip();
      drawGrid();
      d2c.restore();
    });
  }
  if (flash > 0) {
    const span = lineSpanThroughRect(rect, a, b);
    if (span) {
      d2c.globalAlpha = flash;
      d2c.strokeStyle = '#fff';
      d2c.lineWidth = 2;
      d2c.beginPath();
      d2c.moveTo(span[0].x, span[0].y);
      d2c.lineTo(span[1].x, span[1].y);
      d2c.stroke();
      d2c.globalAlpha = 1;
    }
  }
  d2c.restore();
}

// 3D: a rotating wireframe cube, cleaved by a plane every cycle
const CUBE_EDGES = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function cubePoints(cx, cy, size, ry, rx) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? 1 : -1;
    const y = i & 2 ? 1 : -1;
    const z = i & 4 ? 1 : -1;
    const x1 = x * Math.cos(ry) + z * Math.sin(ry);
    const z1 = -x * Math.sin(ry) + z * Math.cos(ry);
    const y1 = y * Math.cos(rx) - z1 * Math.sin(rx);
    pts.push({ x: cx + x1 * size, y: cy + y1 * size });
  }
  return pts;
}

function drawD3(now) {
  const W = d3.width;
  const H = d3.height;
  d3c.clearRect(0, 0, W, H);
  const { cycle, sep, flash } = dimCycle(now, 2.6);
  const c = { x: W / 2, y: H / 2 };
  const pts = cubePoints(c.x, c.y, 34, now / 1600, 0.45 + Math.sin(now / 2300) * 0.12);
  const th = cycleRand(cycle, 13) * Math.PI;
  const dir = { x: Math.cos(th), y: Math.sin(th) };
  const n = { x: -dir.y, y: dir.x };
  const k = sep * 12;

  const drawCube = () => {
    d3c.strokeStyle = '#f5a623';
    d3c.lineWidth = 2;
    d3c.beginPath();
    for (const [i, j] of CUBE_EDGES) {
      d3c.moveTo(pts[i].x, pts[i].y);
      d3c.lineTo(pts[j].x, pts[j].y);
    }
    d3c.stroke();
    d3c.fillStyle = '#fff';
    for (const p of pts) {
      d3c.beginPath();
      d3c.arc(p.x, p.y, 2, 0, Math.PI * 2);
      d3c.fill();
    }
  };

  if (k === 0) {
    drawCube();
  } else {
    for (const s of [1, -1]) {
      // clip to one side of the cutting plane's screen-space line
      const hp = [
        { x: c.x - dir.x * 400, y: c.y - dir.y * 400 },
        { x: c.x + dir.x * 400, y: c.y + dir.y * 400 },
        { x: c.x + dir.x * 400 + n.x * s * 400, y: c.y + dir.y * 400 + n.y * s * 400 },
        { x: c.x - dir.x * 400 + n.x * s * 400, y: c.y - dir.y * 400 + n.y * s * 400 },
      ];
      d3c.save();
      tracePath(d3c, hp);
      d3c.clip();
      d3c.translate(n.x * k * s, n.y * k * s);
      drawCube();
      d3c.restore();
    }
  }
  if (flash > 0) {
    d3c.save();
    d3c.globalAlpha = flash;
    d3c.strokeStyle = '#fff';
    d3c.lineWidth = 2;
    d3c.beginPath();
    d3c.moveTo(c.x - dir.x * 60, c.y - dir.y * 60);
    d3c.lineTo(c.x + dir.x * 60, c.y + dir.y * 60);
    d3c.stroke();
    d3c.restore();
  }
}

// --- the title: awkward pixel letters that get sliced every so often ---
// Each letter is built on the same 24×24 grid as the food sprites and run
// through the same roughenSprite pass, so the glyphs come out hand-cut and
// a little different every time they rebuild.

const tc = document.getElementById('titleCanvas');
const tcc = tc ? tc.getContext('2d') : null;
const TITLE_CZ = 4; // screen px per grid cell

const LETTER_COLORS = ['#e94560', '#f5a623', '#8fbf58', '#5f85db', '#ee87b2', '#f4d03f'];

// Every stroke junction must overlap orthogonally (no diagonal-only corner
// touches) — the roughening pass guarantees 4-connectivity, so the base
// glyphs must be 4-connected to begin with.
const LETTER_FONT = {
  S: ['#####', '#....', '#....', '#####', '....#', '....#', '#####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  A: ['#####', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  P: ['#####', '#...#', '#...#', '#####', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  C: ['#####', '#....', '#....', '#....', '#....', '#....', '#####'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['#####', '#...#', '#...#', '#####', '#.#..', '#.##.', '#..##'],
};

// 5×7 glyph at 3× → 15×21 cells, centered on the shared 24×24 grid
function buildLetterBase(ch, color) {
  const rows = LETTER_FONT[ch];
  const cells = Array.from({ length: FOOD_N }, () => Array(FOOD_N).fill(null));
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 5; x++) {
      if (rows[y][x] !== '#') continue;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          cells[1 + y * 3 + dy][4 + x * 3 + dx] = color;
        }
      }
    }
  }
  return { name: ch, cells };
}

const titleLetters = [];
if (tc) {
  let pen = 8;
  let ci = 0;
  for (const ch of 'SHAPE CUTTER') {
    if (ch === ' ') {
      pen += 28;
      continue;
    }
    const base = buildLetterBase(ch, LETTER_COLORS[ci++ % LETTER_COLORS.length]);
    titleLetters.push({
      base,
      inst: roughenSprite(base),
      gx: pen - 4 * TITLE_CZ,
      gy: (tc.height - FOOD_N * TITLE_CZ) / 2,
      born: 0,
      cut: null,
    });
    pen += 15 * TITLE_CZ + 8;
  }
}

let nextTitleCut = performance.now() + 2200;

function drawTitle(now) {
  tcc.clearRect(0, 0, tc.width, tc.height);

  if (now >= nextTitleCut) {
    nextTitleCut = now + 1800 + Math.random() * 2600;
    const candidates = titleLetters.filter((l) => !l.cut);
    if (candidates.length) {
      const letter = candidates[Math.floor(Math.random() * candidates.length)];
      const poly = letter.inst.polygon.map((p) => ({
        x: letter.gx + p.x * TITLE_CZ,
        y: letter.gy + p.y * TITLE_CZ,
      }));
      const c = centroid(poly);
      const th = Math.random() * Math.PI;
      const dir = { x: Math.cos(th), y: Math.sin(th) };
      const off = (Math.random() - 0.5) * 14;
      const a = { x: c.x - dir.x * 200 - dir.y * off, y: c.y - dir.y * 200 + dir.x * off };
      const b = { x: c.x + dir.x * 200 - dir.y * off, y: c.y + dir.y * 200 + dir.x * off };
      const [p1, p2] = splitPolygon(poly, a, b);
      if (p1.length >= 3 && p2.length >= 3) {
        const xs = poly.map((p) => p.x);
        const ys = poly.map((p) => p.y);
        const bbox = [
          { x: Math.min(...xs), y: Math.min(...ys) },
          { x: Math.max(...xs), y: Math.min(...ys) },
          { x: Math.max(...xs), y: Math.max(...ys) },
          { x: Math.min(...xs), y: Math.max(...ys) },
        ];
        letter.cut = {
          pieces: [p1, p2],
          normal: { x: -dir.y, y: dir.x },
          span: lineSpanThroughRect(bbox, a, b),
          start: now,
        };
      }
    }
  }

  for (const letter of titleLetters) {
    if (letter.cut) {
      const t = (now - letter.cut.start) / 1000;
      if (t > 0.9) {
        letter.inst = roughenSprite(letter.base); // rebuilt, freshly awkward
        letter.cut = null;
        letter.born = now;
      } else {
        const k = easeOut(Math.min(t / 0.5, 1)) * 8;
        tcc.globalAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.4;
        letter.cut.pieces.forEach((piece, i) => {
          const s = i === 0 ? 1 : -1;
          tcc.save();
          tcc.translate(letter.cut.normal.x * k * s, letter.cut.normal.y * k * s);
          tracePath(tcc, piece);
          tcc.clip();
          drawCellsAt(tcc, letter.inst.cells, letter.gx, letter.gy, TITLE_CZ);
          tcc.restore();
        });
        tcc.globalAlpha = 1;
        if (t < 0.15 && letter.cut.span) {
          tcc.save();
          tcc.globalAlpha = 1 - t / 0.15;
          tcc.strokeStyle = '#fff';
          tcc.lineWidth = 2;
          tcc.beginPath();
          tcc.moveTo(letter.cut.span[0].x, letter.cut.span[0].y);
          tcc.lineTo(letter.cut.span[1].x, letter.cut.span[1].y);
          tcc.stroke();
          tcc.restore();
        }
        continue;
      }
    }
    tcc.globalAlpha = letter.born ? Math.min((now - letter.born) / 220, 1) : 1;
    drawCellsAt(tcc, letter.inst.cells, letter.gx, letter.gy, TITLE_CZ);
    tcc.globalAlpha = 1;
  }
}

// --- slice-to-enter: drag a cut across a whole card to pick that mode ---

// overlay canvas above the page for the aim line and the cut flash
const fxo = document.createElement('canvas');
fxo.id = 'fxOverlay';
document.body.appendChild(fxo);
const fxoc = fxo.getContext('2d');

function sizeFxo() {
  fxo.width = innerWidth;
  fxo.height = innerHeight;
}
sizeFxo();
addEventListener('resize', sizeFxo);

let cardAim = null; // { card, page, a, b } in viewport coords
let cutFlash = null; // { a, b, start }

const howEl = document.querySelector('.how');

// Shake via inline style — swapping the animation *class* would restart the
// card's entrance animation and make it blink out for its delay period.
function flashHint(card) {
  card.classList.add('hint-flash');
  card.style.animation = 'cardshake 0.4s ease';
  if (howEl) howEl.classList.add('hint-flash');
  setTimeout(() => {
    card.classList.remove('hint-flash');
    card.style.animation = 'none';
    if (howEl) howEl.classList.remove('hint-flash');
  }, 700);
}

// clip the infinite cut line to the card's rectangle (plus a little overshoot)
function lineSpanThroughRect(rectPoly, a, b) {
  const hits = [];
  for (let i = 0; i < rectPoly.length; i++) {
    const p = rectPoly[i];
    const q = rectPoly[(i + 1) % rectPoly.length];
    const sp = side(a, b, p);
    const sq = side(a, b, q);
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      hits.push(lineSegmentIntersection(a, b, p, q));
    }
  }
  if (hits.length < 2) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  hits.sort((u, v) => u.x * dx + u.y * dy - (v.x * dx + v.y * dy));
  const e0 = hits[0];
  const e1 = hits[hits.length - 1];
  const len = Math.hypot(e1.x - e0.x, e1.y - e0.y) || 1;
  const ux = (e1.x - e0.x) / len;
  const uy = (e1.y - e0.y) / len;
  return [
    { x: e0.x - ux * 26, y: e0.y - uy * 26 },
    { x: e1.x + ux * 26, y: e1.y + uy * 26 },
  ];
}

// Split the card's rectangle with the engine, clip two live clones of the
// card to the two pieces, send them flying apart, then navigate.
function sliceCard(card, page, a, b) {
  const r = card.getBoundingClientRect();
  const rectPoly = [
    { x: r.left, y: r.top },
    { x: r.right, y: r.top },
    { x: r.right, y: r.bottom },
    { x: r.left, y: r.bottom },
  ];
  const [p1, p2] = splitPolygon(rectPoly, a, b);
  if (p1.length < 3 || p2.length < 3) {
    flashHint(card); // the line missed the card
    return;
  }

  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };

  const clones = [];
  [p1, p2].forEach((piece, i) => {
    const clone = card.cloneNode(true);
    // cloned canvases are blank — copy the live preview bitmaps over
    const src = card.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((dc, j) => {
      dc.getContext('2d').drawImage(src[j], 0, 0);
    });
    const clip = piece
      .map((p) => `${(p.x - r.left).toFixed(1)}px ${(p.y - r.top).toFixed(1)}px`)
      .join(', ');
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      boxSizing: 'border-box',
      margin: '0',
      zIndex: '60',
      clipPath: `polygon(${clip})`,
      animation: 'none',
      pointerEvents: 'none',
      transition: 'transform 0.5s cubic-bezier(0.2, 0.7, 0.3, 1), opacity 0.5s ease',
    });
    document.body.appendChild(clone);
    clones.push(clone);
    const s = i === 0 ? 1 : -1;
    requestAnimationFrame(() => {
      clone.style.transform = `translate(${n.x * 190 * s}px, ${n.y * 190 * s}px) rotate(${s * 7}deg)`;
      clone.style.opacity = '0';
    });
  });

  card.style.visibility = 'hidden';

  // flash only along the card, not across the whole page
  const span = lineSpanThroughRect(rectPoly, a, b);
  if (span) cutFlash = { a: span[0], b: span[1], start: performance.now() };

  // a "coming soon" card can be sliced for fun, but it rebuilds instead of
  // opening anything
  if (card.dataset.soon) {
    flashHint(card);
    setTimeout(() => {
      clones.forEach((cl) => cl.remove());
      card.style.visibility = '';
    }, 750);
    return;
  }

  // then the whole screen closes like a shutter along the same cut line,
  // in this mode's accent color, and we enter through it
  const accent = getComputedStyle(card).getPropertyValue('--accent').trim() || '#e94560';
  const viewport = [
    { x: 0, y: 0 },
    { x: innerWidth, y: 0 },
    { x: innerWidth, y: innerHeight },
    { x: 0, y: innerHeight },
  ];
  const [w1, w2] = splitPolygon(viewport, a, b);
  const D = Math.hypot(innerWidth, innerHeight);
  [w1, w2].forEach((piece, i) => {
    if (piece.length < 3) return;
    const panel = document.createElement('div');
    panel.className = 'wipe-panel';
    const s = i === 0 ? 1 : -1;
    panel.style.background = `linear-gradient(160deg, ${accent}, #10182e 70%)`;
    panel.style.clipPath = `polygon(${piece
      .map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`)
      .join(', ')})`;
    panel.style.transform = `translate(${n.x * D * s}px, ${n.y * D * s}px)`;
    panel.style.transition = 'transform 0.45s cubic-bezier(0.7, 0, 0.3, 1) 0.18s';
    document.body.appendChild(panel);
    requestAnimationFrame(() => {
      panel.style.transform = 'translate(0, 0)';
    });
  });

  setTimeout(() => {
    location.href = page;
  }, 700);
}

for (const card of document.querySelectorAll('.mode')) {
  const page = card.getAttribute('href');
  // pointer clicks don't navigate — slicing does. Keyboard Enter
  // (e.detail === 0) and reduced-motion users still navigate normally.
  card.addEventListener('click', (e) => {
    if (!REDUCED && e.detail !== 0) e.preventDefault();
  });
  card.addEventListener('dragstart', (e) => e.preventDefault());
  card.addEventListener('pointerdown', (e) => {
    if (REDUCED) return;
    e.preventDefault();
    card.setPointerCapture(e.pointerId);
    cardAim = {
      card,
      page,
      a: { x: e.clientX, y: e.clientY },
      b: { x: e.clientX, y: e.clientY },
    };
  });
  card.addEventListener('pointermove', (e) => {
    if (cardAim && cardAim.card === card) cardAim.b = { x: e.clientX, y: e.clientY };
  });
  card.addEventListener('pointerup', () => {
    if (!cardAim || cardAim.card !== card) return;
    const { a, b } = cardAim;
    cardAim = null;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 10) {
      flashHint(card); // a plain click: nudge toward slicing
      return;
    }
    sliceCard(card, page, a, b);
  });
}

function drawOverlay(now) {
  fxoc.clearRect(0, 0, fxo.width, fxo.height);
  if (cardAim) {
    // a finite segment from the press point to the pointer, not a page-wide line
    const { a, b } = cardAim;
    fxoc.save();
    fxoc.setLineDash([10, 8]);
    fxoc.lineDashOffset = -now / 24;
    fxoc.strokeStyle = 'rgba(255,255,255,0.85)';
    fxoc.lineWidth = 2;
    fxoc.beginPath();
    fxoc.moveTo(a.x, a.y);
    fxoc.lineTo(b.x, b.y);
    fxoc.stroke();
    fxoc.setLineDash([]);
    fxoc.fillStyle = '#fff';
    fxoc.beginPath();
    fxoc.arc(a.x, a.y, 4, 0, Math.PI * 2);
    fxoc.fill();
    fxoc.beginPath();
    fxoc.arc(b.x, b.y, 3, 0, Math.PI * 2);
    fxoc.fill();
    fxoc.restore();
  }
  if (cutFlash) {
    const t = (now - cutFlash.start) / 1000;
    if (t > 0.5) {
      cutFlash = null;
    } else {
      fxoc.save();
      fxoc.globalAlpha = 1 - t / 0.5;
      fxoc.shadowColor = '#e94560';
      fxoc.shadowBlur = 14;
      fxoc.strokeStyle = '#fff';
      fxoc.lineWidth = 3;
      fxoc.beginPath();
      fxoc.moveTo(cutFlash.a.x, cutFlash.a.y);
      fxoc.lineTo(cutFlash.b.x, cutFlash.b.y);
      fxoc.stroke();
      fxoc.restore();
    }
  }
}

// --- drive it ---

if (REDUCED) {
  // static frame of each preview, no motion
  if (tc) drawTitle(performance.now());
  if (sp) drawShapesPreview(slice.start + 500);
  if (fp) drawFoodPreview(dish.start + 1000);
  if (d1) drawD1(dimStart + 500);
  if (d2) drawD2(dimStart + 500);
  if (d3) drawD3(dimStart + 500);
  if (s3polys) drawShape3dPreview(1000);
  if (f3polys) drawFood3dPreview(1000);
} else {
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    drawBackground(now, dt);
    if (tc) drawTitle(now);
    if (sp) drawShapesPreview(now);
    if (fp) drawFoodPreview(now);
    if (d1) drawD1(now);
    if (d2) drawD2(now);
    if (d3) drawD3(now);
    if (s3polys) drawShape3dPreview(now);
    if (f3polys) drawFood3dPreview(now);
    drawOverlay(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

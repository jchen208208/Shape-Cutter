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

const sp = document.getElementById('previewShapes');
const spc = sp.getContext('2d');
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

let slice = newSliceScene();

function drawShapesPreview(now) {
  const t = (now - slice.start) / 1000;
  spc.clearRect(0, 0, sp.width, sp.height);

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
const fpc = fp.getContext('2d');

function newFoodScene() {
  return {
    cells: roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)])).cells,
    start: performance.now(),
  };
}

let dish = newFoodScene();

function drawFoodPreview(now) {
  const t = (now - dish.start) / 1000;
  if (t > 3.2) dish = newFoodScene();

  fpc.clearRect(0, 0, fp.width, fp.height);
  const pop = 0.75 + 0.25 * easeOut(Math.min(t / 0.35, 1));
  const bob = Math.sin(t * 2.2) * 3;
  const s = 5.4 * pop;
  const size = FOOD_N * s;
  fpc.globalAlpha = Math.min(t / 0.25, 1);
  drawCellsAt(fpc, dish.cells, (fp.width - size) / 2, (fp.height - size) / 2 + bob, s);
  fpc.globalAlpha = 1;
}

// --- drive it ---

if (REDUCED) {
  // static frame of each preview, no motion
  drawShapesPreview(slice.start + 500);
  drawFoodPreview(dish.start + 1000);
} else {
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    drawBackground(now, dt);
    drawShapesPreview(now);
    drawFoodPreview(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

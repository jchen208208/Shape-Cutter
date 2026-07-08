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
const fpc = fp.getContext('2d');

function newFoodScene() {
  return {
    sprite: roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)])),
    start: performance.now(),
    geom: null, // where the sprite was drawn last frame: {x, y, s}
  };
}

let dish = newFoodScene();

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

// --- the title: awkward pixel letters that get sliced every so often ---
// Each letter is built on the same 24×24 grid as the food sprites and run
// through the same roughenSprite pass, so the glyphs come out hand-cut and
// a little different every time they rebuild.

const tc = document.getElementById('titleCanvas');
const tcc = tc.getContext('2d');
const TITLE_CZ = 4; // screen px per grid cell

const LETTER_COLORS = ['#e94560', '#f5a623', '#8fbf58', '#5f85db', '#ee87b2', '#f4d03f'];

const LETTER_FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
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
{
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
  drawTitle(performance.now());
  drawShapesPreview(slice.start + 500);
  drawFoodPreview(dish.start + 1000);
} else {
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    drawBackground(now, dt);
    drawTitle(now);
    drawShapesPreview(now);
    drawFoodPreview(now);
    drawOverlay(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Landing page animations: a background where slashes streak across the
// screen and genuinely cut the drifting shapes and foods (via the real
// engine), plus live previews of both modes on the menu cards.
// Uses splitPolygon from engine.js and the sprite builders from foods.js.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the dimension-select landing page (index.html) is the only page with the
// pixel title canvas; it gets the cutting-board backdrop + chase widget
const LANDING = !!document.getElementById('titleCanvas');

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
  if (window.DIMBG_OWNS_BG) return; // dimbg.js animates this page's backdrop
  bgc.clearRect(0, 0, bg.width, bg.height);
  if (LANDING) {
    drawKitchen(now);
    return;
  }
  for (const d of drifters) drawDrifter(d, dt);
  if (now >= nextSlashAt) {
    spawnSlash(now);
    nextSlashAt = now + 2600 + Math.random() * 2400;
  }
  drawSlash(now);
}

// ===================================================================
// Landing scene: the clean kitchen picture fills the screen, and the three
// foods are separate transparent sprites placed on the island table — a
// breadstick (1D), a pancake (2D), a tiered cake (3D). Drag a knife across
// one to slice it: only the food splits, its plate never moves.
// ===================================================================

// the food-free kitchen backdrop, drawn cover-fit; every scene position
// below lives in this image's own pixel space
const KITCHEN = new Image();
KITCHEN.src = 'main_ui_background.jpg';
const KITCHEN_W = 1376;
const KITCHEN_H = 768;
KITCHEN.onload = () => {
  if (REDUCED && LANDING) drawKitchen(performance.now()); // redraw the static frame
};

// cover-fit transform: scale + offset that map image px to screen px
function kitchenFit() {
  const s = Math.max(bg.width / KITCHEN_W, bg.height / KITCHEN_H);
  return { s, x: (bg.width - KITCHEN_W * s) / 2, y: (bg.height - KITCHEN_H * s) / 2 };
}

// the three food sprites: dest places the sprite on the table (image px);
// cutX is where the knife lands and the split opens; r is the slice hit
// radius, ly the label baseline. mask (in sprite px) separates the FOOD from
// the plate under it — only the food layer slides apart — and plateFill
// paints the plate's hidden middle so the open gap shows plate, not table.
// (FOODS is taken: that's the sprite recipe list in foods.js)
const TABLE_FOODS = [
  // the breadstick lies diagonally like in the original picture: rot tilts
  // it, len/th are its drawn size, dest is the rotated bounding box
  { mode: '1d.html', label: '1D', name: 'breadstick', accent: '#7e99b8', src: 'breadstick_sprite.png',
    dest: { x: 550, y: 445, w: 80, h: 70 }, rot: -0.7, len: 92, th: 14, cutX: 590, r: 50, ly: 438 },
  { mode: '2d.html', label: '2D', name: 'pancake', accent: '#c4826a', src: 'pancake_sprite.png',
    dest: { x: 662, y: 452, w: 76, h: 48 }, cutX: 700, r: 44, ly: 440,
    mask: { e: [75, 33, 61, 34] }, plateFill: { e: [75, 56, 62, 26], col: '#ede9ea' } },
  // the cake sprite has no plate baked in: a platter is drawn separately
  // underneath (plate), so the cut can never touch it
  { mode: '3d.html', label: '3D', name: 'tiered cake', accent: '#9ba873', src: 'cake_sprite.png',
    dest: { x: 776, y: 389, w: 78, h: 104 }, cutX: 815, r: 56, ly: 377,
    plate: { cx: 815, cy: 476, rx: 48, ry: 20 } },
];

// the food-vs-plate boundary as a path on a sprite-local context
function traceMask(g, m) {
  g.beginPath();
  if (m.rect) g.rect(...m.rect);
  g.ellipse(m.e[0], m.e[1], m.e[2], m.e[3], 0, 0, Math.PI * 2);
}

// split each sprite into a FOOD canvas (slides apart when cut) and a PLATE
// canvas (stays put), with the plate's hidden middle painted in
for (const f of TABLE_FOODS) {
  const img = new Image();
  img.src = f.src;
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const food = document.createElement('canvas');
    food.width = w;
    food.height = h;
    const fg = food.getContext('2d');
    fg.drawImage(img, 0, 0);
    if (f.mask) {
      fg.globalCompositeOperation = 'destination-in';
      traceMask(fg, f.mask);
      fg.fill();
      const plate = document.createElement('canvas');
      plate.width = w;
      plate.height = h;
      const pg = plate.getContext('2d');
      pg.drawImage(img, 0, 0);
      pg.globalCompositeOperation = 'destination-out';
      traceMask(pg, f.mask);
      pg.fill();
      pg.globalCompositeOperation = 'destination-over'; // paints only the hole
      pg.beginPath();
      pg.ellipse(f.plateFill.e[0], f.plateFill.e[1], f.plateFill.e[2], f.plateFill.e[3], 0, 0, Math.PI * 2);
      pg.fillStyle = f.plateFill.col;
      pg.fill();
      f.plateC = plate;
    }
    f.foodC = food;
    if (REDUCED && LANDING) drawKitchen(performance.now());
  };
}

// pixel-art map for the chopping knife: rows of palette keys ('.' = transparent)
const PIX = {
  knife: {
    pal: { s: '#cfd6e2', '#': '#8f97a8', h: '#5a3a22' },
    rows: [
      'ssssssssssss#hhhh',
      '.sssssssssss#hhhh',
      '..ssssssssss#hh..',
    ],
  },
};

// chunky pixel renderer: centered on cx, bottom edge at baseY
function drawPixMap(rows, pal, cx, baseY, P) {
  const x0 = Math.round((cx - (rows[0].length * P) / 2) / P) * P;
  const y0 = Math.round(baseY - rows.length * P);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const col = pal[rows[y][x]];
      if (!col) continue;
      bgc.fillStyle = col;
      bgc.fillRect(x0 + x * P, y0 + y * P, P, P);
    }
  }
  return { x0, y0, w: rows[0].length * P, h: rows.length * P };
}

// multiply an #rrggbb color's channels by f (clamped), for quick shading
function shade(c, f) {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
  return `rgb(${[1, 3, 5]
    .map((i) => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * f)))
    .join(',')})`;
}

// a food that has just been sliced: the knife chops, then its FOOD layer
// splits into two halves that slide apart (the plate stays put)
let dishSplit = null; // { dish, start }

// separation between the two food halves right now, 0 while the knife falls
function dishSep(d, now) {
  if (!dishSplit || dishSplit.dish !== d) return 0;
  const t = (now - dishSplit.start) / 1000;
  return t < 0.28 ? 0 : easeOut(Math.min((t - 0.28) / 0.5, 1)) * 20; // image px
}

// distance from segment a→b to point p
function segDist(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

let sceneAim = null;
let sceneFlash = null;

function dishUnderCut(a, b) {
  let best = null;
  for (const d of TABLE_FOODS) {
    if (!d._hit) continue;
    const dist = segDist(a, b, d._hit);
    if (dist < d._hit.r && (!best || dist < best.dist)) best = { d, dist };
  }
  return best && best.d;
}

// a platter drawn as its own scene element, underneath a plate-less food
// sprite — the cut slides the sprite's halves over it and never touches it
function drawTablePlate(p, fit) {
  const ell = (dy, rx, ry, col) => {
    bgc.beginPath();
    bgc.ellipse(fit.x + p.cx * fit.s, fit.y + (p.cy + dy) * fit.s, rx * fit.s, ry * fit.s, 0, 0, Math.PI * 2);
    bgc.fillStyle = col;
    bgc.fill();
  };
  ell(3, p.rx * 1.04, p.ry * 0.9, 'rgba(70, 45, 25, 0.22)'); // cast shadow
  ell(1, p.rx, p.ry, '#c3a67e'); // rim edge
  ell(0, p.rx * 0.97, p.ry * 0.92, '#ecd9b4'); // surface
  ell(-1, p.rx * 0.78, p.ry * 0.68, '#f6ead0'); // inner highlight
}

function drawFood(f, now, fit) {
  const d = f.dest;
  const dx = fit.x + d.x * fit.s;
  const dy = fit.y + d.y * fit.s;
  const dw = d.w * fit.s;
  const dh = d.h * fit.s;
  if (f.foodC) {
    bgc.imageSmoothingEnabled = true; // sprites downscale; the backdrop upscales
    if (f.plate) drawTablePlate(f.plate, fit);
    const sep = dishSep(f, now);
    const off = sep * fit.s;
    const sw = f.foodC.width;
    const sh = f.foodC.height;
    if (f.rot) {
      // the tilted breadstick: split in its own axis, halves part lengthwise
      const L = f.len * fit.s;
      const TH = f.th * fit.s;
      bgc.save();
      bgc.translate(dx + dw / 2, dy + dh / 2);
      bgc.rotate(f.rot);
      if (!sep) {
        bgc.drawImage(f.foodC, -L / 2, -TH / 2, L, TH);
      } else {
        const cutL = sw >> 1;
        const dwl = (cutL / sw) * L;
        bgc.drawImage(f.foodC, 0, 0, cutL, sh, -L / 2 - off, -TH / 2, dwl, TH);
        bgc.drawImage(f.foodC, cutL, 0, sw - cutL, sh, -L / 2 + dwl + off, -TH / 2, L - dwl, TH);
      }
      bgc.restore();
    } else {
      if (f.plateC) bgc.drawImage(f.plateC, dx, dy, dw, dh);
      if (!sep) {
        bgc.drawImage(f.foodC, dx, dy, dw, dh);
      } else {
        // only the FOOD canvas splits at the cut line; the plate stays put
        const cutL = Math.max(1, Math.min(sw - 1, Math.round(((f.cutX - d.x) / d.w) * sw)));
        const dwl = (cutL / sw) * dw;
        bgc.drawImage(f.foodC, 0, 0, cutL, sh, dx - off, dy, dwl, dh);
        bgc.drawImage(f.foodC, cutL, 0, sw - cutL, sh, dx + dwl + off, dy, dw - dwl, dh);
      }
    }
    bgc.imageSmoothingEnabled = false;
  }
  const cx = fit.x + (d.x + d.w / 2) * fit.s;

  // dimension label floating above the food, in the pixel font (bobs in pixel steps)
  const bob = Math.round(Math.sin(now / 700 + d.x) * 1.5) * 2;
  const size = Math.max(15, Math.round(16 * fit.s));
  bgc.textAlign = 'center';
  bgc.font = `600 ${size}px 'Pixelify Sans', monospace`;
  bgc.lineWidth = 2.5;
  bgc.lineJoin = 'round'; // sharp miters close up the glyph counters
  bgc.strokeStyle = '#4a3320';
  const ly = fit.y + f.ly * fit.s + bob;
  bgc.strokeText(f.label, cx, ly);
  bgc.fillStyle = f.accent;
  bgc.fillText(f.label, cx, ly);
  bgc.textAlign = 'left';

  // hit region for slicing (screen space)
  f._hit = { x: cx, y: fit.y + (d.y + d.h / 2) * fit.s, r: f.r * fit.s };
}

// the chop itself: a big knife falls blade-first onto the food's center,
// lingers through the split, then fades as the wipe takes over
function drawChopKnife(now, fit) {
  const f = dishSplit.dish;
  const t = (now - dishSplit.start) / 1000;
  const alpha = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.3);
  if (alpha <= 0) return;
  const kp = Math.max(3, Math.round(3 * fit.s));
  const x = fit.x + f.cutX * fit.s;
  const yFrom = fit.y + (f.dest.y - 90) * fit.s;
  const yRest = fit.y + (f.dest.y + f.dest.h * 0.55) * fit.s;
  const fall = Math.min(t / 0.28, 1) ** 2; // accelerating drop
  const yTip = yFrom + (yRest - yFrom) * fall;
  bgc.save();
  bgc.globalAlpha = alpha;
  bgc.translate(x + kp * 1.5, yTip - 8.5 * kp);
  bgc.rotate(-Math.PI / 2); // the sprite is horizontal; point the blade down
  drawPixMap(PIX.knife.rows, PIX.knife.pal, 0, 0, kp);
  bgc.restore();
}

function drawKitchen(now) {
  const fit = kitchenFit();
  bgc.imageSmoothingEnabled = false;
  if (!KITCHEN.complete) {
    bgc.fillStyle = '#a3c6d8'; // wall blue until the picture arrives
    bgc.fillRect(0, 0, bg.width, bg.height);
    return;
  }
  bgc.drawImage(KITCHEN, fit.x, fit.y, KITCHEN_W * fit.s, KITCHEN_H * fit.s);
  for (const f of TABLE_FOODS) drawFood(f, now, fit);
  if (dishSplit) drawChopKnife(now, fit);

  // aim line + highlight of the food being crossed
  if (sceneAim) {
    const hovered = dishUnderCut(sceneAim.a, sceneAim.b);
    if (hovered && hovered._hit) {
      bgc.strokeStyle = hovered.accent;
      bgc.lineWidth = 3;
      bgc.beginPath();
      bgc.arc(hovered._hit.x, hovered._hit.y, hovered._hit.r, 0, Math.PI * 2);
      bgc.stroke();
    }
    bgc.save();
    bgc.setLineDash([10, 8]);
    bgc.lineDashOffset = -now / 24;
    bgc.strokeStyle = 'rgba(255,255,255,0.9)';
    bgc.lineWidth = 2;
    bgc.beginPath();
    bgc.moveTo(sceneAim.a.x, sceneAim.a.y);
    bgc.lineTo(sceneAim.b.x, sceneAim.b.y);
    bgc.stroke();
    bgc.restore();
  }
  if (sceneFlash) {
    const t = (now - sceneFlash.start) / 1000;
    if (t > 0.5) sceneFlash = null;
    else {
      bgc.save();
      bgc.globalAlpha = 1 - t / 0.5;
      bgc.strokeStyle = '#fff';
      bgc.lineWidth = 3;
      bgc.shadowColor = sceneFlash.accent;
      bgc.shadowBlur = 16;
      bgc.beginPath();
      bgc.moveTo(sceneFlash.a.x, sceneFlash.a.y);
      bgc.lineTo(sceneFlash.b.x, sceneFlash.b.y);
      bgc.stroke();
      bgc.restore();
    }
  }
}

function wipeToPage(page, a, b, accent) {
  const viewport = [
    { x: 0, y: 0 },
    { x: innerWidth, y: 0 },
    { x: innerWidth, y: innerHeight },
    { x: 0, y: innerHeight },
  ];
  const [w1, w2] = splitPolygon(viewport, a, b);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const D = Math.hypot(innerWidth, innerHeight);
  [w1, w2].forEach((piece, i) => {
    if (piece.length < 3) return;
    const panel = document.createElement('div');
    panel.className = 'wipe-panel';
    const s = i === 0 ? 1 : -1;
    panel.style.background = `linear-gradient(160deg, ${accent}, #10182e 70%)`;
    panel.style.clipPath = `polygon(${piece.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`;
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

if (LANDING) {
  bg.addEventListener('contextmenu', (e) => e.preventDefault());
  bg.addEventListener('pointerdown', (e) => {
    if (REDUCED || dishSplit) return;
    e.preventDefault();
    bg.setPointerCapture(e.pointerId);
    sceneAim = { a: { x: e.clientX, y: e.clientY }, b: { x: e.clientX, y: e.clientY } };
  });
  bg.addEventListener('pointermove', (e) => {
    if (sceneAim) sceneAim.b = { x: e.clientX, y: e.clientY };
  });
  bg.addEventListener('pointerup', () => {
    if (!sceneAim) return;
    const { a, b } = sceneAim;
    sceneAim = null;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 14) return; // a tap, not a slice
    const dish = dishUnderCut(a, b);
    if (dish && !dishSplit) {
      sceneFlash = { a, b, accent: dish.accent, start: performance.now() };
      // chop + split first, then the wipe carries us into the mode
      dishSplit = { dish, start: performance.now() };
      setTimeout(() => wipeToPage(dish.mode, a, b, dish.accent), 700);
    }
  });
}

// ===================================================================
// Landing backdrop: a subtle cutting board, and a chase widget where an
// avocado (with legs) runs from a knife (with legs) around the window edge,
// playing hide-and-seek with little idle actions.
// ===================================================================

// --- the cutting board (fills the whole window) ---

function drawBoardBase() {
  const W = bg.width;
  const H = bg.height;
  const base = bgc.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#182140');
  base.addColorStop(1, '#0f1730');
  bgc.fillStyle = base;
  bgc.fillRect(0, 0, W, H);

  const glow = bgc.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, Math.max(W, H) * 0.72);
  glow.addColorStop(0, 'rgba(58, 76, 122, 0.35)');
  glow.addColorStop(1, 'rgba(10, 14, 28, 0)');
  bgc.fillStyle = glow;
  bgc.fillRect(0, 0, W, H);
}

function drawBoardGrid() {
  const W = bg.width;
  const H = bg.height;
  const px = parallax.x * 5;
  const py = parallax.y * 5;
  const step = 46;
  bgc.lineWidth = 1;
  bgc.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  bgc.beginPath();
  for (let x = ((px % step) + step) % step; x < W; x += step) {
    bgc.moveTo(x, 0);
    bgc.lineTo(x, H);
  }
  for (let y = ((py % step) + step) % step; y < H; y += step) {
    bgc.moveTo(0, y);
    bgc.lineTo(W, y);
  }
  bgc.stroke();

  // the board edge the characters walk on, with ruler ticks
  const info = perimeterInfo();
  bgc.strokeStyle = 'rgba(120, 150, 210, 0.12)';
  bgc.lineWidth = 2;
  bgc.beginPath();
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const p = pathPoint(info, (i / N) * info.P).pos;
    if (i === 0) bgc.moveTo(p.x, p.y);
    else bgc.lineTo(p.x, p.y);
  }
  bgc.stroke();

  bgc.lineWidth = 1;
  bgc.beginPath();
  for (let s = 0; s < info.P; s += 30) {
    const pt = pathPoint(info, s);
    bgc.moveTo(pt.pos.x, pt.pos.y);
    bgc.lineTo(pt.pos.x - pt.outward.x * 6, pt.pos.y - pt.outward.y * 6);
  }
  bgc.stroke();
}

// --- ambient deep background: big slow drifting silhouettes + specks ---

const ambient = [];
const specks = [];

function makeAmbient(anywhere) {
  const depth = 0.3 + Math.random() * 0.7;
  let poly;
  if (Math.random() < 0.55) {
    const sprite = buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]);
    const sc = (2.4 + Math.random() * 3.4) * depth;
    poly = sprite.polygon.map((p) => ({ x: (p.x - FOOD_N / 2) * sc, y: (p.y - FOOD_N / 2) * sc }));
  } else {
    poly = miniPolygon(0, 0, 28 * depth, 74 * depth);
  }
  return {
    depth,
    x: Math.random() * innerWidth,
    y: anywhere ? Math.random() * innerHeight : innerHeight + 160,
    vy: (5 + Math.random() * 9) * depth,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.25,
    alpha: 0.035 + 0.055 * depth,
    color: DRIFT_COLORS[Math.floor(Math.random() * DRIFT_COLORS.length)],
    poly,
  };
}

if (LANDING) {
  for (let i = 0; i < 11; i++) ambient.push(makeAmbient(true));
  for (let i = 0; i < 46; i++) {
    specks.push({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vy: 4 + Math.random() * 12,
      r: 0.6 + Math.random() * 1.6,
      alpha: 0.04 + Math.random() * 0.09,
    });
  }
}

function updateAmbient(dt) {
  for (const a of ambient) {
    a.y -= a.vy * dt;
    a.rot += a.vr * dt;
    if (a.y < -180) Object.assign(a, makeAmbient(false));
  }
  for (const s of specks) {
    s.y -= s.vy * dt;
    if (s.y < -6) {
      s.y = innerHeight + 6;
      s.x = Math.random() * innerWidth;
    }
  }
}

function drawAmbient() {
  for (const a of ambient) {
    bgc.save();
    bgc.globalAlpha = a.alpha;
    bgc.translate(a.x + parallax.x * -22 * a.depth, a.y + parallax.y * -14 * a.depth);
    bgc.rotate(a.rot);
    bgc.fillStyle = a.color;
    tracePath(bgc, a.poly);
    bgc.fill();
    bgc.restore();
  }
  bgc.fillStyle = '#cfe0ff';
  for (const s of specks) {
    bgc.globalAlpha = s.alpha;
    bgc.beginPath();
    bgc.arc(s.x + parallax.x * -8, s.y, s.r, 0, Math.PI * 2);
    bgc.fill();
  }
  bgc.globalAlpha = 1;
}

// --- the perimeter path (rounded rectangle, walked clockwise) ---

function perimeterInfo() {
  const M = 2; // feet hug the very window edge (top = "bookmark bar" line)
  const r = 38;
  const left = M;
  const top = M;
  const right = Math.max(M + 2 * r + 20, innerWidth - M);
  const bottom = Math.max(M + 2 * r + 20, innerHeight - M);
  const w = right - left - 2 * r;
  const h = bottom - top - 2 * r;
  const arc = (Math.PI / 2) * r;
  const HALF = Math.PI / 2;
  const pieces = [
    { line: 1, len: w, x0: left + r, y0: top, dx: 1, dy: 0, ox: 0, oy: -1 },
    { line: 0, len: arc, cx: right - r, cy: top + r, r, a0: -HALF },
    { line: 1, len: h, x0: right, y0: top + r, dx: 0, dy: 1, ox: 1, oy: 0 },
    { line: 0, len: arc, cx: right - r, cy: bottom - r, r, a0: 0 },
    { line: 1, len: w, x0: right - r, y0: bottom, dx: -1, dy: 0, ox: 0, oy: 1 },
    { line: 0, len: arc, cx: left + r, cy: bottom - r, r, a0: HALF },
    { line: 1, len: h, x0: left, y0: bottom - r, dx: 0, dy: -1, ox: -1, oy: 0 },
    { line: 0, len: arc, cx: left + r, cy: top + r, r, a0: Math.PI },
  ];
  let P = 0;
  for (const pc of pieces) {
    pc.s0 = P;
    P += pc.len;
  }
  return { P, pieces };
}

// position, travel tangent (CW, unit) and outward normal (unit) at arc-length s
function pathPoint(info, s) {
  s = ((s % info.P) + info.P) % info.P;
  for (const pc of info.pieces) {
    if (s <= pc.s0 + pc.len || pc === info.pieces[info.pieces.length - 1]) {
      const local = s - pc.s0;
      if (pc.line) {
        return {
          pos: { x: pc.x0 + pc.dx * local, y: pc.y0 + pc.dy * local },
          tangent: { x: pc.dx, y: pc.dy },
          outward: { x: pc.ox, y: pc.oy },
        };
      }
      const a = pc.a0 + (local / pc.len) * (Math.PI / 2);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return {
        pos: { x: pc.cx + pc.r * cos, y: pc.cy + pc.r * sin },
        tangent: { x: -sin, y: cos },
        outward: { x: cos, y: sin },
      };
    }
  }
  return { pos: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, outward: { x: 0, y: -1 } };
}

// --- characters ---

const WALK = 62;
const PROWL = 74; // the knife stalks a bit faster than the food strolls
const RUN = 170; // the fleeing food
const HUNT = 214; // the knife — a touch faster, so it eventually catches

const runner = {
  sc: 1.32,
  food: null, // a random food critter, replaced each time it gets sliced
  s: 0,
  dir: 1,
  speed: 0,
  state: 'stroll',
  timer: 0,
  phase: 0,
  emote: null,
};
const chaser = {
  sc: 0.95,
  s: 0,
  dir: 1,
  speed: 0,
  state: 'prowl',
  timer: 0,
  phase: 0,
  emote: null,
};

const cwPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function setEmote(ch, char, now, dur) {
  ch.emote = { char, until: now + dur * 1000 };
}

// shortest signed arc-length from a to b (+ = b is clockwise-ahead of a)
function shortSigned(a, b, P) {
  let d = ((b - a) % P + P) % P;
  if (d > P / 2) d -= P;
  return d;
}

// Wandering keeps a direction for long stretches and rarely reverses, so the
// two characters travel most of the perimeter and cross paths often.
function wander(ch, now, opts) {
  if (now < ch.timer) return;
  if (Math.random() < opts.pauseChance) {
    ch.speed = 0;
    ch.timer = now + opts.pauseMin + Math.random() * opts.pauseVar;
    const act = cwPick(opts.idles);
    if (act === 'sleep') setEmote(ch, 'z', now, (ch.timer - now) / 1000);
    else if (act === 'look') setEmote(ch, '?', now, 0.7);
  } else {
    ch.speed = opts.walk;
    if (opts.seekChance && opts.seekDir && Math.random() < opts.seekChance) {
      ch.dir = opts.seekDir; // stalk toward the target
    } else if (Math.random() < opts.flipChance) {
      ch.dir *= -1; // otherwise usually keep going
    }
    ch.timer = now + opts.moveMin + Math.random() * opts.moveVar;
  }
}

// which side of the window (0 top, 1 right, 2 bottom, 3 left) a point is on;
// corner arcs count as the side they lead into
function edgeIndex(info, s) {
  s = ((s % info.P) + info.P) % info.P;
  const sideByPiece = [0, 1, 1, 2, 2, 3, 3, 0];
  for (let i = 0; i < info.pieces.length; i++) {
    const pc = info.pieces[i];
    if (s <= pc.s0 + pc.len || i === info.pieces.length - 1) return sideByPiece[i];
  }
  return 0;
}

// A random food turned into a "critter": its silhouette polygon and cells in
// a shared local frame (feet at y=0, body above), so it can be drawn and, when
// caught, split by the real engine.
function newRunnerFood() {
  const sprite = roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]));
  const sp = 1.9;
  const legGap = 6;
  let minX = 1e9;
  let maxX = -1e9;
  let minY = 1e9;
  let maxY = -1e9;
  for (const p of sprite.polygon) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const ox = -((minX + maxX) / 2) * sp; // center horizontally
  const oy = -legGap - maxY * sp; // seat the body just above the feet
  return {
    cells: sprite.cells,
    sp,
    ox,
    oy,
    polyLocal: sprite.polygon.map((p) => ({ x: ox + p.x * sp, y: oy + p.y * sp })),
    topY: oy + minY * sp,
    legX: Math.max(4, (maxX - minX) * sp * 0.22),
  };
}

let sliceFx = null;

function sliceRunner(info, now) {
  const { pos, tangent, outward } = pathPoint(info, runner.s);
  const food = runner.food;
  const [p1, p2] = splitPolygon(food.polyLocal, { x: 0, y: -999 }, { x: 0, y: 999 });
  sliceFx = {
    pos,
    tangent,
    outward,
    dir: runner.dir,
    sc: runner.sc,
    food,
    pieces: p1.length >= 3 && p2.length >= 3 ? [p1, p2] : [food.polyLocal],
    start: now,
  };
  runner.state = 'sliced';
  runner.speed = 0;
  runner.emote = null;
  runner.respawnAt = now + 850;
  chaser.state = 'gloat';
  chaser.speed = 0;
  chaser.gloatUntil = now + 700;
  setEmote(chaser, ':)', now, 1.3);
}

function respawnRunner(info, now) {
  runner.food = newRunnerFood();
  // crawl out on the far side of the loop from the knife
  runner.s = (((chaser.s + info.P * 0.5 + (Math.random() - 0.5) * info.P * 0.2) % info.P) + info.P) % info.P;
  runner.dir = Math.random() < 0.5 ? 1 : -1;
  runner.speed = 0;
  runner.state = 'spawn';
  runner.spawnStart = now;
  runner.spawnUntil = now + 650;
  setEmote(runner, '?', now, 0.9);
}

function updateChase(info, now, dt) {
  const P = info.P;
  const gap = shortSigned(chaser.s, runner.s, P); // + means runner is CW-ahead
  const absGap = Math.abs(gap);
  const SIGHT = Math.min(320, P * 0.24);
  const LOSE = Math.min(620, P * 0.55);
  const CATCH = 20;
  const sameEdge = edgeIndex(info, runner.s) === edgeIndex(info, chaser.s);

  // knife gloating over a fresh slice
  if (chaser.state === 'gloat') {
    chaser.speed = 0;
    if (now >= chaser.gloatUntil) {
      chaser.state = 'prowl';
      chaser.timer = now;
    }
  }

  if (runner.state === 'sliced') {
    runner.speed = 0;
    if (now >= runner.respawnAt) respawnRunner(info, now);
  } else if (runner.state === 'spawn') {
    runner.speed = 0;
    if (now >= runner.spawnUntil) {
      runner.state = 'stroll';
      runner.timer = now;
    }
  } else if (
    // the knife is on the same edge (or already chasing and still near) → bolt
    (sameEdge || absGap < SIGHT || (runner.state === 'flee' && absGap < LOSE)) &&
    chaser.state !== 'gloat'
  ) {
    if (runner.state !== 'flee') {
      runner.state = 'flee';
      setEmote(runner, '!', now, 1.2);
    }
    runner.dir = gap >= 0 ? 1 : -1; // keep the knife behind
    runner.speed = RUN;
    if (absGap < CATCH) sliceRunner(info, now);
  } else {
    if (runner.state === 'flee') {
      runner.state = 'stroll';
      runner.timer = now;
      setEmote(runner, '~', now, 1.0);
    }
    if (runner.state === 'stroll') {
      wander(runner, now, {
        pauseChance: 0.35,
        pauseMin: 600,
        pauseVar: 1300,
        moveMin: 1100,
        moveVar: 1600,
        walk: WALK,
        flipChance: 0.3,
        idles: ['idle', 'look', 'sleep'],
      });
    }
  }

  // knife: hunt while the food shares its edge or it's mid-chase; the hunt
  // persists across corners (up to LOSE) so it doesn't give up at every turn
  const huntPersist = chaser.state === 'hunt' && absGap < LOSE;
  const canHunt =
    chaser.state !== 'gloat' &&
    runner.state !== 'sliced' &&
    runner.state !== 'spawn' &&
    (sameEdge || absGap < SIGHT || huntPersist);
  if (canHunt) {
    if (chaser.state !== 'hunt') {
      chaser.state = 'hunt';
      setEmote(chaser, '!', now, 1.2);
    }
    chaser.dir = gap >= 0 ? 1 : -1;
    chaser.speed = absGap < 180 ? HUNT * 1.35 : HUNT; // lunge when closing in
  } else if (chaser.state === 'hunt') {
    chaser.state = 'prowl';
    chaser.timer = now;
    setEmote(chaser, '?', now, 1.0);
  }
  if (chaser.state === 'prowl') {
    // stalk: usually drift toward the food, so encounters keep happening
    wander(chaser, now, {
      pauseChance: 0.1,
      pauseMin: 300,
      pauseVar: 600,
      moveMin: 1300,
      moveVar: 1800,
      walk: PROWL,
      flipChance: 0.15,
      seekChance: 0.85,
      seekDir: Math.sign(gap) || 1,
      idles: ['idle', 'look'],
    });
  }

  for (const ch of [runner, chaser]) {
    ch.s = (((ch.s + ch.dir * ch.speed * dt) % P) + P) % P;
    ch.phase += ch.speed * dt * 0.16;
  }
}

function drawChase(info, now) {
  drawSliceFx(now);
  for (const ch of [chaser, runner]) {
    if (ch === runner && runner.state === 'sliced') continue;
    const { pos, tangent, outward } = pathPoint(info, ch.s);
    bgc.save();
    bgc.globalAlpha = 1;
    bgc.translate(pos.x, pos.y);
    // local +x → facing (travel dir), local +y → outward (toward the wall)
    bgc.transform(tangent.x * ch.dir, tangent.y * ch.dir, outward.x, outward.y, 0, 0);
    let extra = 1;
    if (ch === runner && runner.state === 'spawn') {
      extra = easeOut(Math.min((now - runner.spawnStart) / 650, 1)); // crawl out
    }
    bgc.scale(ch.sc * extra, ch.sc * extra);
    if (ch === runner) drawFoodCritter(runner.food, ch, now);
    else drawKnife(ch, now);
    // emote lives in the sprite's own frame, so it tips/flips with the sprite
    if (ch.emote && now < ch.emote.until && ch.emote.char) {
      const ey = ch === runner ? runner.food.topY - 9 : -80;
      drawEmoteLocal(ch.emote.char, 0, ey);
    }
    bgc.restore();
  }
}

function drawEmoteLocal(char, x, y) {
  bgc.font = "700 20px 'Pixelify Sans', monospace";
  bgc.textAlign = 'center';
  bgc.textBaseline = 'middle';
  bgc.lineWidth = 4;
  bgc.strokeStyle = '#16213e';
  bgc.strokeText(char, x, y);
  bgc.fillStyle = char === 'z' ? '#9fb4e0' : '#ffd84a';
  bgc.fillText(char, x, y);
}

function drawFoodCritter(food, ch, now) {
  const moving = ch.speed > 1;
  const running = ch.speed > 120;
  const stride = running ? 8 : moving ? 4.5 : 0;
  const bob = moving ? -Math.abs(Math.sin(ch.phase)) * (running ? 2.6 : 1.2) : Math.sin(now / 650) * 0.7;
  drawLegs(-6, -food.legX, food.legX, ch.phase, stride, '#7a5a34', '#4a3520');
  bgc.save();
  bgc.translate(0, bob);
  drawCellsAt(bgc, food.cells, food.ox, food.oy, food.sp);
  bgc.restore();
}

// the two halves of a freshly-sliced food flying apart and fading
function drawSliceFx(now) {
  if (!sliceFx) return;
  const t = (now - sliceFx.start) / 1000;
  if (t > 0.9) {
    sliceFx = null;
    return;
  }
  const fade = Math.min(1, (0.9 - t) / 0.45);
  const k = easeOut(Math.min(t / 0.5, 1)) * 24;
  const food = sliceFx.food;
  bgc.save();
  bgc.globalAlpha = fade;
  bgc.translate(sliceFx.pos.x, sliceFx.pos.y);
  bgc.transform(sliceFx.tangent.x * sliceFx.dir, sliceFx.tangent.y * sliceFx.dir, sliceFx.outward.x, sliceFx.outward.y, 0, 0);
  bgc.scale(sliceFx.sc, sliceFx.sc);
  sliceFx.pieces.forEach((piece, i) => {
    const s = i === 0 ? 1 : -1;
    bgc.save();
    bgc.translate(s * k, -k * 0.45);
    bgc.rotate(s * 0.5 * easeOut(Math.min(t / 0.5, 1)));
    bgc.beginPath();
    bgc.moveTo(piece[0].x, piece[0].y);
    for (let j = 1; j < piece.length; j++) bgc.lineTo(piece[j].x, piece[j].y);
    bgc.closePath();
    bgc.clip();
    drawCellsAt(bgc, food.cells, food.ox, food.oy, food.sp);
    bgc.restore();
  });
  bgc.restore();
}

// two alternating legs, feet on the baseline (local y = 0)
function drawLegs(hipY, xL, xR, phase, stride, legColor, footColor) {
  bgc.lineCap = 'round';
  bgc.lineWidth = 3;
  bgc.strokeStyle = legColor;
  for (const [hx, sw] of [
    [xL, Math.sin(phase) * stride],
    [xR, Math.sin(phase + Math.PI) * stride],
  ]) {
    const fx = hx + sw;
    const fy = -Math.max(0, sw) * 0.14;
    bgc.beginPath();
    bgc.moveTo(hx, hipY);
    bgc.lineTo(fx, fy);
    bgc.stroke();
    bgc.fillStyle = footColor;
    bgc.fillRect(fx - 2, fy - 1.5, 6, 3);
  }
}

function drawKnife(ch, now) {
  const moving = ch.speed > 1;
  const running = ch.speed > 120;
  const stride = running ? 8 : moving ? 4.5 : 0;
  const bob = moving ? -Math.abs(Math.sin(ch.phase)) * (running ? 2.6 : 1.3) : Math.sin(now / 600) * 0.7;

  drawLegs(-4, -4, 4, ch.phase, stride, '#6b4a2e', '#4a3220');

  bgc.save();
  bgc.translate(0, bob);

  // blade with a metallic left-to-right gradient
  const grad = bgc.createLinearGradient(-6, 0, 7, 0);
  grad.addColorStop(0, '#aab3c2');
  grad.addColorStop(0.4, '#eef2f7');
  grad.addColorStop(0.75, '#d2d9e2');
  grad.addColorStop(1, '#f6f9fc');
  bgc.fillStyle = grad;
  bgc.beginPath();
  bgc.moveTo(0, -72);
  bgc.lineTo(6, -60);
  bgc.lineTo(6, -22);
  bgc.lineTo(-6, -22);
  bgc.lineTo(-6, -58);
  bgc.closePath();
  bgc.fill();
  // spine, fuller line, and a shine streak
  bgc.strokeStyle = '#8b94a4';
  bgc.lineWidth = 1.4;
  bgc.beginPath();
  bgc.moveTo(-6, -58);
  bgc.lineTo(-6, -22);
  bgc.stroke();
  bgc.strokeStyle = 'rgba(140, 150, 165, 0.6)';
  bgc.lineWidth = 1;
  bgc.beginPath();
  bgc.moveTo(-1, -62);
  bgc.lineTo(-1, -26);
  bgc.stroke();
  bgc.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  bgc.lineWidth = 2;
  bgc.beginPath();
  bgc.moveTo(2.5, -56);
  bgc.lineTo(3.2, -30);
  bgc.stroke();

  // bolster
  bgc.fillStyle = '#c7ccd6';
  bgc.fillRect(-6, -24, 12, 4);
  bgc.fillStyle = '#3a2718';
  bgc.fillRect(-6, -21, 12, 2);

  // wooden handle with grain and rivets, rounded butt
  bgc.fillStyle = '#8f5b3a';
  bgc.beginPath();
  bgc.roundRect(-6, -19, 12, 16, 4);
  bgc.fill();
  bgc.strokeStyle = 'rgba(70, 45, 28, 0.7)';
  bgc.lineWidth = 1;
  bgc.beginPath();
  bgc.moveTo(-3, -17);
  bgc.lineTo(-3, -5);
  bgc.moveTo(1.5, -18);
  bgc.lineTo(1.5, -4);
  bgc.stroke();
  bgc.fillStyle = '#d8c39a';
  for (const ry of [-14, -8]) {
    bgc.beginPath();
    bgc.arc(-1, ry, 1.4, 0, Math.PI * 2);
    bgc.fill();
  }
  bgc.restore();
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

// soft pastels pulled from the kitchen picture: terracotta, gold, sage,
// dusty blue, rose, butter
const LETTER_COLORS = ['#e0715a', '#eeb454', '#93bd78', '#6f9fe0', '#e79aae', '#f2cf7e'];

// dark offset copy of a letter's cells, so the title reads on the wall
function drawTitleShadow(cells, x0, y0) {
  tcc.fillStyle = 'rgba(74, 51, 32, 0.8)';
  for (let y = 0; y < FOOD_N; y++)
    for (let x = 0; x < FOOD_N; x++)
      if (cells[y][x] !== null)
        tcc.fillRect(x0 + x * TITLE_CZ + TITLE_CZ, y0 + y * TITLE_CZ + TITLE_CZ, TITLE_CZ, TITLE_CZ);
}

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
          drawTitleShadow(letter.inst.cells, letter.gx, letter.gy);
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
    drawTitleShadow(letter.inst.cells, letter.gx, letter.gy);
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

if (LANDING) {
  // start the food and knife well apart on the perimeter
  const info0 = perimeterInfo();
  runner.food = newRunnerFood();
  runner.s = info0.P * 0.2;
  chaser.s = info0.P * 0.52;
}

if (REDUCED) {
  // static frame of each preview, no motion
  if (LANDING) drawKitchen(performance.now());
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

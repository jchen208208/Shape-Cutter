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
// Landing scene: an isometric night kitchen. Three food-dimension dishes sit
// on a table — a breadstick (1D), pancakes (2D), a layer cake (3D). Drag a
// knife across one to slice it and enter that mode.
// ===================================================================

// One-point-perspective night kitchen: back wall rectangle centered on screen,
// two side walls converging to it, ceiling and checker floor. A kitchen island
// (front edge horizontal, top tilted toward birdseye) holds the three dishes.
const scene = {};

function sceneLayout() {
  const W = bg.width;
  const H = bg.height;
  scene.W = W;
  scene.H = H;
  scene.U = Math.min(W / 22, H / 15); // base unit for sizes
  scene.P = Math.max(2, Math.round(scene.U / 8)); // scene pixel size (finer grid)
  // back wall rectangle (one-point perspective, VP at its center)
  scene.bx0 = W * 0.24;
  scene.bx1 = W * 0.76;
  scene.by0 = H * 0.12;
  scene.by1 = H * 0.6;
  // island counter (raised higher off the floor: taller base cabinet)
  scene.left = W * 0.31;
  scene.right = W * 0.69;
  scene.frontY = H * 0.735; // island's front top edge
  scene.topDepth = H * 0.17; // visible top surface depth
  scene.inset = (scene.right - scene.left) * 0.09; // back edge perspective inset
  scene.thick = Math.min(H * 0.045, 36); // countertop edge thickness
  scene.faceH = H * 0.17; // island front face below the lip
  scene.d3 = { dx: Math.round(scene.P * 1.3), dy: Math.round(scene.P * 1.3) }; // oblique extrusion for props
  // dish pixel size, capped so three dishes never crowd each other
  const innerW = scene.right - scene.left - 2 * scene.inset * 0.45;
  scene.dp = Math.max(2, Math.floor(innerW / 92));
  scene.hitR = Math.min(scene.U * 1.2, innerW * 0.25 * 0.48);
}

function scenePath(pts) {
  bgc.beginPath();
  bgc.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) bgc.lineTo(pts[i].x, pts[i].y);
  bgc.closePath();
}

const DISHES = [
  { mode: '1d.html', label: '1D', name: 'breadstick', accent: '#5f85db', fx: 0.25, kind: 'stick' },
  { mode: '2d.html', label: '2D', name: 'pancakes', accent: '#e94560', fx: 0.5, kind: 'pancake' },
  { mode: '3d.html', label: '3D', name: 'layer cake', accent: '#f5a623', fx: 0.75, kind: 'cake' },
];

// pixel-art maps: rows of palette keys ('.' = transparent)
const PIX = {
  stick: {
    pal: { '#': '#6b4318', l: '#ecc488', b: '#cf9a55', d: '#a8763a', M: '#8a5a26' },
    rows: [
      '.####################.',
      '#llllMlllllMlllllMlll#',
      '#bbbbMbbbbbMbbbbbMbbb#',
      '#bbbbMbbbbbMbbbbbMbbb#',
      '#dddddddddddddddddddd#',
      '.####################.',
    ],
  },
  pancake: {
    pal: { '#': '#7c4f1e', t: '#eec27e', s: '#c08a44', y: '#f6d44e', g: '#cfa93a', r: '#a05018' },
    rows: [
      '........yyyy........',
      '.......yyggyy.......',
      '####################',
      '#tttttttttttttttttt#',
      '#ssssssssssssssssss#',
      '#ssrssssssssssrssss#',
      '####################',
      '#tttttttttttttttttt#',
      '#ssssssssssssssssss#',
      '#ssssssrsssssssssrs#',
      '####################',
      '#tttttttttttttttttt#',
      '#ssssssssssssssssss#',
      '####################',
    ],
  },
  cake: {
    pal: {
      '#': '#8a5a30', f: '#fbe6c8', k: '#d8a25c', p: '#eaa7c4',
      c: '#e0483a', g: '#4a8a3a', s: '#cfd6e2', S: '#8f97a8',
    },
    rows: [
      '.........gg.........',
      '........cccc........',
      '........cccc........',
      '......########......',
      '......#ffffff#......',
      '......#kkkkkk#......',
      '......#kkkkkk#......',
      '...##############...',
      '...#pppppppppppp#...',
      '...#pppppppppppp#...',
      '...#kkkkkkkkkkkk#...',
      '####################',
      '#ffffffffffffffffff#',
      '#ffffffffffffffffff#',
      '#kkkkkkkkkkkkkkkkkk#',
      '#kkkkkkkkkkkkkkkkkk#',
      '####################',
      '...ssssssssssssss...',
      '.........SS.........',
      '.........SS.........',
      '.......SSSSSS.......',
    ],
  },
  plant: {
    pal: { '#': '#7a4526', o: '#b56a3a', L: '#3f8746', M: '#5fae5f' },
    rows: [
      '...MMM...',
      '..MLLLM..',
      '.LL.L.LL.',
      '....L....',
      '.#######.',
      '.#ooooo#.',
      '..#ooo#..',
      '..#####..',
    ],
  },
  jar: {
    pal: { '#': '#c9a24a', g: '#9fb4d8', a: '#c98a3a' },
    rows: [
      '.####.',
      'gggggg',
      'gaaaag',
      'gaaaag',
      'gggggg',
    ],
  },
  knife: {
    pal: { s: '#cfd6e2', '#': '#8f97a8', h: '#5a3a22' },
    rows: [
      'ssssssssssss#hhhh',
      '.sssssssssss#hhhh',
      '..ssssssssss#hh..',
    ],
  },
  mug: {
    pal: { '#': '#c0563e', w: '#f0e7d7', s: 'rgba(220,230,240,0.5)' },
    rows: [
      '..s..s.',
      '.#####.',
      '#wwww##',
      '#wwww.#',
      '#wwww##',
      '.#####.',
    ],
  },
  book: {
    pal: { r: '#c0563e', g: '#4a8a5a', b: '#5f85db', p: '#e8dfc8' },
    rows: [
      '.rrrrrr.',
      '.pppppp.',
      '.gggggg.',
      '.pppppp.',
      '.bbbbbb.',
    ],
  },
  bottle: {
    pal: { k: '#3a2a1a', g: '#2e6a38', c: '#3f8746', l: '#e8dfc8' },
    rows: [
      '..k..',
      '..g..',
      '.ggg.',
      '.ccc.',
      '.lll.',
      '.ccc.',
      '.ccc.',
      '.ccc.',
    ],
  },
  bowl: {
    pal: { '#': '#5a6478', b: '#7d8698', a: '#e0483a', o: '#f5a623', g: '#5fae5f' },
    rows: [
      '..a.o.g..',
      '.aaooogg.',
      '#########',
      '#bbbbbbb#',
      '.#bbbbb#.',
      '..#####..',
    ],
  },
  photoLand: {
    pal: { '#': '#8f7a5a', s: '#bcd3e6', u: '#f5d84e', g: '#5fae5f' },
    rows: [
      '#######',
      '#ssssu#',
      '#sssuu#',
      '#sssss#',
      '#ggggg#',
      '#ggggg#',
      '#######',
    ],
  },
  photoHeart: {
    pal: { '#': '#8f7a5a', p: '#f2f0ea', h: '#e0483a' },
    rows: [
      '#######',
      '#ph.hp#',
      '#hhhhh#',
      '#hhhhh#',
      '#phhhp#',
      '#pphpp#',
      '#######',
    ],
  },
  kettle: {
    pal: { '#': '#6e2f28', r: '#d24a3e', h: '#f08a7e' },
    rows: [
      '....####....',
      '...#....#...',
      '..########..',
      '##rrhhrrrr#.',
      '#rrrrrrrrrr#',
      '.#rrrrrrrr#.',
      '..########..',
    ],
  },
  bread: {
    pal: { '#': '#8a5a26', l: '#e8c084', M: '#a8763a', b: '#cf9a55' },
    rows: [
      '..########..',
      '.#llMllMll#.',
      '#llllllllll#',
      '#bbbbbbbbbb#',
      '#bbbbbbbbbb#',
      '.##########.',
    ],
  },
  monstera: {
    pal: { M: '#6fbf73', L: '#3f8746', s: '#7a5a30', '#': '#7a4526', o: '#b56a3a' },
    rows: [
      '...MM...MM...',
      '..MLLM.MLLM..',
      '.MLLLM.MLLLM.',
      '.MLLM...MLLM.',
      '..ML..M..LM..',
      '...L.MLM.L...',
      '....LLLLL....',
      '.....LLL.....',
      '.....s.s.....',
      '.....s.s.....',
      '..#########..',
      '..#ooooooo#..',
      '...#ooooo#...',
      '...#ooooo#...',
      '....#####....',
    ],
  },
};

// x on the countertop at horizontal fraction fx and depth t (0 = front edge, 1 = back)
function surfX(fx, t) {
  const l = scene.left + scene.inset * t;
  const r = scene.right - scene.inset * t;
  return l + (r - l) * fx;
}

// where a dish sits on the countertop surface (screen space)
function dishBase(d) {
  return { x: surfX(d.fx, 0.45), y: scene.frontY - scene.topDepth * 0.45 };
}

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

function dishShadow(x, y, w) {
  const P = scene.P;
  bgc.fillStyle = 'rgba(8,12,24,0.28)';
  bgc.fillRect(x - w / 2, y - P, w, P * 2);
  bgc.fillRect(x - w / 2 + P * 2, y + P, w - P * 4, P);
}

// multiply an #rrggbb color's channels by f (clamped), for quick shading
function shade(c, f) {
  if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
  return `rgb(${[1, 3, 5]
    .map((i) => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * f)))
    .join(',')})`;
}

// tinted copies of a sprite palette, so extruded faces keep the object's own
// texture: a dark set for the side (in shadow) and a light set for the top
const tintPalCache = new Map();
function tintPalFor(pal, f) {
  let byFactor = tintPalCache.get(pal);
  if (!byFactor) tintPalCache.set(pal, (byFactor = new Map()));
  let d = byFactor.get(f);
  if (d) return d;
  d = {};
  for (const k in pal) d[k] = shade(pal[k], f);
  byFactor.set(f, d);
  return d;
}
const darkPalFor = (pal) => tintPalFor(pal, 0.62);
const lightPalFor = (pal) => tintPalFor(pal, 1.18);

// soft ellipse under a prop so it sits ON its surface instead of floating
function contactShadow(cx, y, w) {
  bgc.fillStyle = 'rgba(60,35,15,0.28)';
  bgc.beginPath();
  bgc.ellipse(cx, y, w / 2, Math.max(2, w * 0.1), 0, 0, Math.PI * 2);
  bgc.fill();
}

// oblique 3D box: front rect (x,y,w,h) extruded up-and-right by (dx,dy).
// shows the top face and the right side face — consistent light from upper-left.
function box3D(x, y, w, h, dx, dy, front, top, side) {
  bgc.fillStyle = side; // right side face
  scenePath([{ x: x + w, y }, { x: x + w + dx, y: y - dy }, { x: x + w + dx, y: y + h - dy }, { x: x + w, y: y + h }]);
  bgc.fill();
  bgc.fillStyle = top; // top face
  scenePath([{ x, y }, { x: x + w, y }, { x: x + w + dx, y: y - dy }, { x: x + dx, y: y - dy }]);
  bgc.fill();
  bgc.fillStyle = front; // front face
  bgc.fillRect(x, y, w, h);
  bgc.strokeStyle = 'rgba(40,30,20,0.35)';
  bgc.lineWidth = 1;
  bgc.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// pixel sprite with a solid extrusion behind it, so it reads as a 3D object
function drawPixMap3D(rows, pal, cx, baseY, P, sideCol, dirX = 1, dirY = -1) {
  const x0 = Math.round((cx - (rows[0].length * P) / 2) / P) * P;
  const y0 = Math.round(baseY - rows.length * P);
  const depth = Math.max(2, Math.round(P * 0.9)); // body depth toward the VP
  const filled = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && !!pal[rows[y][x]];
  // extruded body offset toward the vanishing point. Each source pixel keeps
  // the object's own color: darkened on the SIDE it presents, lightened on the
  // TOP it presents — so the volume has two textured faces, not one flat slab.
  const dark = darkPalFor(pal);
  const light = lightPalFor(pal);
  for (let d = 1; d <= depth; d++) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        if (!pal[row[x]]) continue;
        // a pixel with no neighbor above (toward the light) faces up -> top face
        const topEdge = !filled(x, y - 1);
        bgc.fillStyle = (topEdge ? light[row[x]] : dark[row[x]]) || sideCol;
        bgc.fillRect(x0 + x * P + d * dirX, y0 + y * P + d * dirY, P, P);
      }
    }
  }
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      bgc.fillStyle = col;
      bgc.fillRect(x0 + x * P, y0 + y * P, P, P);
    }
  }
  return { x0, y0, w: rows[0].length * P, h: rows.length * P };
}

// a chunky pixel-art wall clock showing the real time
function drawPixelClock(cx, cy, r, now) {
  const cells = Math.max(7, Math.round((2 * r) / scene.P)); // grid resolution
  const step = (2 * r) / cells;
  const cell = (gx, gy, col) => {
    bgc.fillStyle = col;
    bgc.fillRect(Math.round(cx - r + gx * step), Math.round(cy - r + gy * step), Math.ceil(step) + 1, Math.ceil(step) + 1);
  };
  const c = (cells - 1) / 2;
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const d = Math.hypot(gx - c, gy - c);
      if (d > cells / 2) continue;
      cell(gx, gy, d > cells / 2 - 1.2 ? '#3a2a1e' : '#efe7d4'); // rim / face
    }
  }
  // tick marks at 12 / 3 / 6 / 9
  for (const [ex, ey] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    cell(c + ex * (cells / 2 - 1.3), c + ey * (cells / 2 - 1.3), '#8a5a2c');
  }
  // hands, stepped in pixels
  const dt = new Date();
  const ha = ((dt.getHours() % 12) / 12 + dt.getMinutes() / 720) * Math.PI * 2 - Math.PI / 2;
  const ma = (dt.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;
  const hand = (ang, len, col) => {
    for (let s = 0; s <= len; s += step * 0.85) {
      bgc.fillStyle = col;
      bgc.fillRect(Math.round(cx + Math.cos(ang) * s - step / 2), Math.round(cy + Math.sin(ang) * s - step / 2), Math.ceil(step), Math.ceil(step));
    }
  };
  hand(ha, r * 0.48, '#7a2f2f');
  hand(ma, r * 0.72, '#3a2a1e');
}

// a lamp shade with real volume: banded frustum (lit from the left), pink
// trim ring, and a bottom opening you can see the glowing bulb inside
function drawShade(px, sy, topW, botW, shH) {
  const xAt = (f, w) => px + w * (2 * f - 1);
  for (const [f0, f1, col] of [[0, 0.34, '#f8ecd6'], [0.34, 0.7, '#f0e2c8'], [0.7, 1, '#d9c3a3']]) {
    fillQuad(
      { x: xAt(f0, topW), y: sy - shH },
      { x: xAt(f1, topW), y: sy - shH },
      { x: xAt(f1, botW), y: sy },
      { x: xAt(f0, botW), y: sy },
      col
    );
  }
  const trimW = topW + (botW - topW) * 0.8; // pink trim near the hem
  for (const [f0, f1, col] of [[0, 0.62, '#e08a8a'], [0.62, 1, '#c96f6f']]) {
    fillQuad(
      { x: xAt(f0, trimW), y: sy - shH * 0.2 },
      { x: xAt(f1, trimW), y: sy - shH * 0.2 },
      { x: xAt(f1, botW), y: sy },
      { x: xAt(f0, botW), y: sy },
      col
    );
  }
  bgc.fillStyle = '#6e4522'; // fitting cap at the top
  bgc.fillRect(px - topW * 0.5, sy - shH - 3, topW, 4);
  // bottom opening, seen from just below: underside rim, lit interior, bulb
  const ry = botW * 0.26;
  bgc.fillStyle = '#b98f68';
  bgc.beginPath();
  bgc.ellipse(px, sy, botW, ry, 0, 0, Math.PI * 2);
  bgc.fill();
  bgc.fillStyle = '#ffdf9e';
  bgc.beginPath();
  bgc.ellipse(px, sy, botW * 0.7, ry * 0.62, 0, 0, Math.PI * 2);
  bgc.fill();
  bgc.fillStyle = '#fff4d0'; // hot center of the bulb
  bgc.beginPath();
  bgc.ellipse(px, sy, botW * 0.28, ry * 0.3, 0, 0, Math.PI * 2);
  bgc.fill();
}

// ============================================================================
// Volumetric prop kit — PIXELATED. Each prop is still a shaded 3D body (curved,
// light on the left → dark on the right), but rendered on a chunky pixel grid
// so it matches the pixel-art look of the rest of the scene instead of smooth
// vector shapes. PQ = current pixel size; each builder sets it from the prop's
// size. All take (cx, baseY, S): centered on cx, resting ON baseY, sized by S.
// ============================================================================

let PQ = 3; // current chunky pixel size for volumetric props
const quant = (S) => Math.max(2, Math.round(S / 7));
const snap = (v) => Math.round(v / PQ) * PQ;

function pxRect(x, y, w, h, col) {
  bgc.fillStyle = col;
  bgc.fillRect(snap(x), snap(y), Math.max(PQ, Math.round(w / PQ) * PQ), Math.max(PQ, Math.round(h / PQ) * PQ));
}

// pixelated filled ellipse (chunky cells on the PQ grid)
function disc(cx, cy, rx, ry, col) {
  rx = Math.max(PQ * 0.5, rx);
  ry = Math.max(PQ * 0.5, ry);
  bgc.fillStyle = col;
  for (let y = snap(cy - ry); y <= cy + ry; y += PQ) {
    const dy = (y + PQ / 2 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    for (let x = snap(cx - half); x <= cx + half; x += PQ) bgc.fillRect(x, y, PQ, PQ);
  }
}

// pixelated curved body between topY and botY, tapering topR→botR, shaded
// light-on-the-left so the surface reads as round
function bodyBands(cx, topY, botY, topR, botR, base) {
  for (let y = snap(topY); y < botY; y += PQ) {
    const f = (y + PQ / 2 - topY) / (botY - topY);
    const r = Math.max(PQ, topR + (botR - topR) * f);
    for (let x = snap(cx - r); x <= cx + r; x += PQ) {
      const fc = Math.max(-1, Math.min(1, (x + PQ / 2 - cx) / r));
      bgc.fillStyle = shade(base, 1.14 - ((fc + 1) / 2) * 0.62);
      bgc.fillRect(x, y, PQ, PQ);
    }
  }
}

// pixelated arc (handles), one cell per step
function pxArc(cx, cy, r, a0, a1, col, thick) {
  const t = thick || PQ;
  const steps = Math.ceil((Math.abs(a1 - a0) * r) / PQ) + 1;
  bgc.fillStyle = col;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    bgc.fillRect(snap(cx + Math.cos(a) * r), snap(cy + Math.sin(a) * r), t, t);
  }
}

// clay pot with soil; returns the rim geometry for placing foliage
function drawPot(cx, baseY, w, h, base = '#b56a3a') {
  const topR = w / 2;
  const botR = w * 0.37;
  const topY = baseY - h;
  disc(cx, baseY, botR, botR * 0.4, shade(base, 0.5)); // shadowed base
  bodyBands(cx, topY, baseY, topR, botR, base);
  disc(cx, topY, topR, topR * 0.3, shade(base, 1.12)); // rim lip
  disc(cx, topY, topR * 0.78, topR * 0.24, '#3f2c1c'); // soil
  return { topY, topR };
}

// three plant kinds sharing the pot, so the shelves get some variety
function drawPlant(cx, baseY, S, kind = 'monstera') {
  PQ = quant(S);
  const { topY } = drawPot(cx, baseY, S * 1.4, S * 1.0);
  if (kind === 'bush') {
    // rounded mound of chunky leaf clumps, dark behind a lit front
    const puff = (x, y, r, c) => disc(cx + x * S, topY + y * S, r * S, r * S * 0.92, c);
    for (const [x, y, r] of [[-0.5, -0.2, 0.5], [0.5, -0.2, 0.5], [0, -0.1, 0.55]]) puff(x, y, r, '#356b34');
    for (const [x, y, r] of [[-0.32, -0.55, 0.42], [0.34, -0.5, 0.42], [0, -0.78, 0.48], [-0.05, -0.35, 0.5]]) puff(x, y, r, '#59a94e');
    for (const [x, y, r] of [[-0.18, -0.72, 0.22], [0.12, -0.6, 0.2]]) puff(x, y, r, '#7fce6a');
  } else if (kind === 'snake') {
    // upright tapering blades, dark edge + lit center stripe, drawn as columns
    for (const [bx, tx, hgt] of [[-0.4, -0.14, 1.55], [-0.14, -0.02, 2.0], [0.14, 0.05, 1.85], [0.4, 0.18, 1.4]]) {
      const n = Math.max(1, Math.round((hgt * S) / PQ));
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const x = cx + (bx + (tx - bx) * f) * S;
        const y = topY - i * PQ;
        const bw = Math.max(PQ, (1 - f) * S * 0.3);
        pxRect(x - bw / 2, y, bw, PQ, '#2f6a34');
        pxRect(x - PQ / 2, y, PQ, PQ, '#5fae5f');
      }
    }
  } else {
    // monstera: layered pixel leaves (dark behind, lit in front)
    const leaves = PIX.monstera.rows.slice(0, 8);
    const lp = Math.max(2, Math.round(S / 7));
    drawPixMap(leaves, darkPalFor(PIX.monstera.pal), cx - S * 0.5, topY - S * 0.2, lp);
    drawPixMap(leaves, darkPalFor(PIX.monstera.pal), cx + S * 0.55, topY - S * 0.3, lp);
    drawPixMap(leaves, PIX.monstera.pal, cx, topY + S * 0.15, Math.round(lp * 1.3));
  }
}

// storage jar: glass body with a lid and a highlight streak
function drawJar(cx, baseY, S, glass = '#9fb4d8', lid = '#c9a24a') {
  PQ = quant(S);
  const w = S * 0.92, h = S * 1.15, topY = baseY - h, r = w / 2;
  disc(cx, baseY, r * 0.92, r * 0.3, shade(glass, 0.5));
  bodyBands(cx, topY + h * 0.2, baseY, r, r * 0.92, glass);
  pxRect(cx - r * 0.6, topY + h * 0.34, PQ, h * 0.42, 'rgba(255,255,255,0.3)'); // highlight
  bodyBands(cx, topY, topY + h * 0.24, r * 0.96, r, lid); // lid band
  disc(cx, topY, r * 0.96, r * 0.3, shade(lid, 1.12)); // lid top
}

// tall bottle: body, shoulder, neck and cap
function drawBottle(cx, baseY, S, body = '#3f8746') {
  PQ = quant(S);
  const w = S * 0.66, r = w / 2, baseTop = baseY - S * 1.15;
  disc(cx, baseY, r * 0.9, r * 0.3, shade(body, 0.5));
  bodyBands(cx, baseTop, baseY, r, r * 0.94, body); // main body
  bodyBands(cx, baseTop - S * 0.32, baseTop, r * 0.42, r, body); // shoulder taper
  bodyBands(cx, baseY - S * 1.75, baseTop - S * 0.32, r * 0.4, r * 0.42, body); // neck
  bodyBands(cx, baseY - S * 1.94, baseY - S * 1.75, r * 0.46, r * 0.46, '#2a1c12'); // cap
  pxRect(cx - r * 0.5, baseTop + S * 0.14, PQ, S * 0.6, 'rgba(255,255,255,0.24)'); // highlight
}

// mug: cylinder with a handle and a dark coffee surface
function drawMug(cx, baseY, S, body = '#c0563e') {
  PQ = quant(S);
  const w = S * 0.95, h = S * 0.9, r = w / 2, topY = baseY - h;
  pxArc(cx + r * 0.95, (topY + baseY) / 2, r * 0.5, -1.1, 1.1, shade(body, 0.72), PQ * 1.4); // handle
  disc(cx, baseY, r * 0.9, r * 0.3, shade(body, 0.5));
  bodyBands(cx, topY, baseY, r, r * 0.9, body);
  disc(cx, topY, r, r * 0.34, shade(body, 1.1)); // rim
  disc(cx, topY, r * 0.72, r * 0.24, '#3a2417'); // coffee
}

// stack of books: each a thin box with a spine face and lit page-top
function drawBooks(cx, baseY, S, cols = ['#c0563e', '#4a8a5a', '#5f85db']) {
  PQ = quant(S);
  const bw = S * 1.25, bh = Math.max(PQ * 2, S * 0.3);
  let y = baseY;
  cols.forEach((c, i) => {
    const w = bw * (1 - i * 0.12);
    const x = cx + (i % 2 ? 1 : -1) * S * 0.06 - w / 2;
    pxRect(x + PQ, y - bh - PQ, w, PQ, '#efe6cf'); // page top (shifted = slight 3D)
    pxRect(x, y - bh, w, bh, c); // cover / spine
    pxRect(x, y - PQ, w, PQ, shade(c, 0.7)); // bottom shadow line
    y -= bh + PQ;
  });
}

// shallow bowl of fruit: rounded bowl with round fruits nested in it
function drawBowl(cx, baseY, S) {
  PQ = quant(S);
  const w = S * 1.5, r = w / 2, topY = baseY - S * 0.5;
  for (const [x, y, fr, c] of [[-0.34, -0.2, 0.3, '#e0483a'], [0.32, -0.18, 0.3, '#f5a623'], [0, -0.34, 0.32, '#5fae5f'], [-0.05, -0.15, 0.3, '#e0483a']]) {
    disc(cx + x * S, topY + y * S, fr * S, fr * S, c);
    disc(cx + x * S - fr * S * 0.3, topY + y * S - fr * S * 0.3, fr * S * 0.4, fr * S * 0.4, shade(c, 1.28));
  }
  // bowl body: pixel rows forming a lower half-ellipse, shaded darker downward
  for (let yy = snap(topY); yy <= baseY; yy += PQ) {
    const dy = (yy - topY) / (baseY - topY);
    const half = r * Math.sqrt(Math.max(0, 1 - dy * dy));
    pxRect(cx - half, yy, half * 2, PQ, shade('#7d8698', 1 - dy * 0.3));
  }
  disc(cx, topY, r, r * 0.28, '#9aa5b8'); // rim
  disc(cx, topY, r * 0.84, r * 0.22, '#5a6478'); // inner
}

// bread loaf: a domed body with a lit top and slash marks
function drawBread(cx, baseY, S) {
  PQ = quant(S);
  const w = S * 1.7, r = w / 2, h = S * 0.82;
  disc(cx, baseY, r * 0.95, r * 0.28, 'rgba(60,35,15,0.4)');
  for (let yy = snap(baseY - h); yy <= baseY; yy += PQ) { // domed loaf, pixel rows
    const dy = (baseY - yy) / h; // 1 top … 0 base
    const half = r * Math.sqrt(Math.max(0, 1 - Math.pow(1 - dy, 2)));
    pxRect(cx - half, yy, half * 2, PQ, dy > 0.5 ? '#e8c084' : '#cf9a55');
  }
  for (const dx of [-0.42, 0, 0.42]) { // diagonal slashes
    for (let k = 0; k < 3; k++) pxRect(cx + dx * r - PQ + k * PQ, baseY - h * 0.5 - k * PQ, PQ, PQ, '#a8763a');
  }
}

// kettle: rounded body, spout, handle arch and a lid knob
function drawKettle(cx, baseY, S, body = '#d24a3e') {
  PQ = quant(S);
  const w = S * 1.3, r = w / 2, topY = baseY - S * 1.0;
  pxArc(cx, topY, r * 0.72, Math.PI * 1.15, Math.PI * -0.15, shade(body, 0.7), PQ * 1.5); // handle
  pxRect(cx + r * 0.7, baseY - S * 0.68, r * 0.5, PQ * 1.4, shade(body, 0.9)); // spout base
  pxRect(cx + r * 1.05, baseY - S * 0.86, PQ * 1.2, S * 0.2, shade(body, 0.9)); // spout tip
  disc(cx, baseY - S * 0.18, r * 0.92, r * 0.34, shade(body, 0.55)); // base shadow
  bodyBands(cx, topY + S * 0.12, baseY - S * 0.12, r, r * 0.78, body); // body
  disc(cx, topY + S * 0.12, r, r * 0.3, shade(body, 1.12)); // shoulder
  disc(cx, topY + S * 0.06, r * 0.4, r * 0.14, shade(body, 0.82)); // lid
  pxRect(cx - PQ, topY - S * 0.1, PQ * 2, S * 0.13, '#3a2a1e'); // knob
}

// a pan hung on the wall: a pixelated disc lifted a few pixels off the wall by
// an offset drop shadow, so it reads as 3D without being a smooth vector shape
function drawPanPix(cx, cy, r, col, inner) {
  PQ = Math.max(2, Math.round(r / 5.5));
  disc(cx + PQ * 1.5, cy + PQ * 1.6, r, r, 'rgba(18,24,34,0.24)'); // drop shadow
  disc(cx, cy + PQ, r, r, shade(col, 0.55)); // depth ring under the rim
  disc(cx, cy, r, r, col); // rim face
  disc(cx, cy, r * 0.82, r * 0.82, shade(col, 1.14)); // rim bevel
  disc(cx, cy, r * 0.56, r * 0.56, inner); // bowl
  disc(cx, cy + r * 0.16, r * 0.52, r * 0.4, shade(inner, 0.72)); // bowl shadow
  pxRect(cx - r * 0.42, cy - r * 0.46, PQ, PQ, 'rgba(255,246,228,0.6)'); // glint
  pxRect(cx - r * 0.24, cy - r * 0.52, PQ, PQ, 'rgba(255,246,228,0.5)');
  pxRect(cx + r * 0.78, cy - PQ, r * 0.95, PQ * 2, '#5e3a1e'); // handle
  pxRect(cx + r * 0.78, cy - PQ, r * 0.95, PQ, '#6b4a28');
  disc(cx + r * 0.78 + r * 0.95, cy, PQ * 1.3, PQ * 1.3, '#4e2f16'); // end tab
}

// points on the side walls: t = depth (0 = screen edge, 1 = back wall), fy = 0 top .. 1 bottom
function wallPtL(t, fy) {
  const x = scene.bx0 * t;
  const yT = scene.by0 * t;
  const yB = scene.H + (scene.by1 - scene.H) * t;
  return { x, y: yT + fy * (yB - yT) };
}
function wallPtR(t, fy) {
  const x = scene.W + (scene.bx1 - scene.W) * t;
  const yT = scene.by0 * t;
  const yB = scene.H + (scene.by1 - scene.H) * t;
  return { x, y: yT + fy * (yB - yT) };
}
function fillQuad(a, b, c, d, col) {
  bgc.fillStyle = col;
  scenePath([a, b, c, d]);
  bgc.fill();
}

// --- one-point perspective toolkit: everything recedes toward the center of
// the back wall (the vanishing point) ---
function vpPt() {
  return { x: (scene.bx0 + scene.bx1) / 2, y: (scene.by0 + scene.by1) / 2 };
}
// move a screen point fraction s of the way toward the vanishing point
function recede(p, s) {
  const v = vpPt();
  return { x: p.x + (v.x - p.x) * s, y: p.y + (v.y - p.y) * s };
}
// which way a prop's hidden bulk goes: toward the VP on both axes
function extrudeDir(cx, cy) {
  const v = vpPt();
  return { x: Math.sign(v.x - cx) || 1, y: Math.sign(v.y - cy) || -1 };
}
// run draw() in a frame glued to a side wall at (t, fy): x runs along the
// wall (foreshortened + slanted), y stays vertical — so flat art drawn
// around the origin comes out lying in the wall's plane
function inWallPlane(side, t, fy, draw) {
  const pt = side === 'L' ? wallPtL : wallPtR;
  const p = pt(t, fy);
  const q = pt(t + 0.05, fy);
  const ux = (q.x - p.x) / 0.05;
  const uy = (q.y - p.y) / 0.05;
  const ul = Math.hypot(ux, uy) || 1;
  const squash = 0.62; // foreshortening along the wall
  bgc.save();
  bgc.transform((ux / ul) * squash, (uy / ul) * squash, 0, 1, p.x, p.y);
  draw();
  bgc.restore();
}

function drawKitchenRoom(now) {
  const { W, H, bx0, bx1, by0, by1, U, P } = scene;
  const cw = bx1 - bx0;
  const ch = by1 - by0;

  // --- room shell: soft pastel kitchen (kitchen4 palette) ---
  fillQuad({ x: 0, y: 0 }, { x: W, y: 0 }, { x: bx1, y: by0 }, { x: bx0, y: by0 }, '#ece0c4'); // ceiling
  fillQuad({ x: 0, y: 0 }, { x: bx0, y: by0 }, { x: bx0, y: by1 }, { x: 0, y: H }, '#9cc3d1'); // left wall (lit)
  fillQuad({ x: W, y: 0 }, { x: bx1, y: by0 }, { x: bx1, y: by1 }, { x: W, y: H }, '#7aa0b1'); // right wall (shaded)
  bgc.fillStyle = '#8cb3c2';
  bgc.fillRect(bx0, by0, cw, ch); // back wall
  bgc.fillStyle = '#dccca6'; // ceiling valance along the top of the back wall
  bgc.fillRect(bx0, by0, cw, Math.max(3, P * 1.4));
  // room edges
  bgc.strokeStyle = 'rgba(70,55,40,0.4)';
  bgc.lineWidth = 2;
  for (const [a, b] of [
    [{ x: 0, y: 0 }, { x: bx0, y: by0 }],
    [{ x: W, y: 0 }, { x: bx1, y: by0 }],
    [{ x: 0, y: H }, { x: bx0, y: by1 }],
    [{ x: W, y: H }, { x: bx1, y: by1 }],
  ]) {
    bgc.beginPath();
    bgc.moveTo(a.x, a.y);
    bgc.lineTo(b.x, b.y);
    bgc.stroke();
  }
  bgc.strokeRect(bx0, by0, cw, ch);

  // --- warm wood plank floor, receding toward the back ---
  const fpt = (fx, t) => ({ x: fx * W + (bx0 + fx * cw - fx * W) * t, y: H + (by1 - H) * t });
  fillQuad(fpt(0, 0), fpt(1, 0), fpt(1, 1), fpt(0, 1), '#b0804a'); // base
  const NR = 13; // narrow plank rows
  const NPC = 8; // plank columns per row
  const ease = (s) => s * (2 - s); // wider rows near the viewer
  const plankCols = ['#b98a50', '#ab7c46', '#c49258', '#b2824a'];
  for (let k = 0; k < NR; k++) {
    const t0 = ease(k / NR);
    const t1 = ease((k + 1) / NR);
    const off = ((k * 3) % NPC) / NPC; // staggered plank ends
    for (let s = -1; s < NPC; s++) {
      const f0 = Math.max(0, s / NPC + off / NPC);
      const f1 = Math.min(1, (s + 1) / NPC + off / NPC);
      if (f1 <= f0) continue;
      fillQuad(fpt(f0, t0), fpt(f1, t0), fpt(f1, t1), fpt(f0, t1), plankCols[(k * 5 + s * 3 + 400) % 4]);
      const e = fpt(f1, (t0 + t1) / 2); // plank end seam
      bgc.fillStyle = 'rgba(96,60,28,0.55)';
      bgc.fillRect(e.x - 1, fpt(f1, t0).y, 2, fpt(f1, t1).y - fpt(f1, t0).y);
    }
    bgc.strokeStyle = 'rgba(96,60,28,0.6)'; // long seam between rows
    const ra = fpt(0, t1);
    const rb = fpt(1, t1);
    bgc.beginPath();
    bgc.moveTo(ra.x, ra.y);
    bgc.lineTo(rb.x, rb.y);
    bgc.stroke();
    if (k % 4 === 1) { // occasional wood knot
      const kn = fpt(((k * 7) % 10) / 10 + 0.05, (t0 + t1) / 2);
      bgc.fillStyle = 'rgba(96,60,28,0.5)';
      bgc.fillRect(kn.x, kn.y - 1, 4, 3);
    }
  }

  // --- back wall: tile backsplash, night window, 3D counter with sink ---
  const cty = by0 + ch * 0.68; // back counter top: its BACK edge, on the wall
  const cDepth = Math.max(5, P * 3); // vertical drop from that edge to the front lip

  // mint/cream checker backsplash tiles behind the counter
  const bsTop = by0 + ch * 0.3;
  const ts = P * 2;
  for (let y = bsTop, r = 0; y < cty; y += ts, r++) {
    for (let x = bx0, c = 0; x < bx1; x += ts, c++) {
      bgc.fillStyle = (r + c) % 2 ? '#e6efe4' : '#cfe1d6';
      bgc.fillRect(x, y, Math.min(ts, bx1 - x), Math.min(ts, cty - y));
    }
  }

  // window with a warm valance, moon and stars
  const wx0 = bx0 + cw * 0.36;
  const wx1 = bx0 + cw * 0.64;
  const wy0 = by0 + ch * 0.32;
  const wy1 = by0 + ch * 0.55;
  bgc.fillStyle = '#efe6cf'; // frame
  bgc.fillRect(wx0 - P * 2, wy0 - P * 2, wx1 - wx0 + P * 4, wy1 - wy0 + P * 4);
  bgc.fillStyle = '#14233c'; // night sky
  bgc.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
  bgc.fillStyle = '#eef2f8'; // crescent moon
  bgc.beginPath();
  bgc.arc(wx0 + (wx1 - wx0) * 0.68, wy0 + (wy1 - wy0) * 0.34, (wx1 - wx0) * 0.08, 0, Math.PI * 2);
  bgc.fill();
  bgc.fillStyle = '#14233c';
  bgc.beginPath();
  bgc.arc(wx0 + (wx1 - wx0) * 0.72, wy0 + (wy1 - wy0) * 0.29, (wx1 - wx0) * 0.066, 0, Math.PI * 2);
  bgc.fill();
  for (let i = 0; i < 12; i++) {
    bgc.fillStyle = i === Math.floor(now / 500) % 12 ? '#ffffff' : 'rgba(255,255,255,0.5)';
    bgc.fillRect(wx0 + 4 + ((i * 631) % (wx1 - wx0 - 8)), wy0 + 4 + ((i * 397) % (wy1 - wy0 - 8)), 2, 2);
  }
  bgc.fillStyle = '#efe6cf'; // mullions
  bgc.fillRect((wx0 + wx1) / 2 - P / 2, wy0, P, wy1 - wy0);
  bgc.fillRect(wx0, (wy0 + wy1) / 2 - P / 2, wx1 - wx0, P);
  for (let x = wx0 - P * 3, i = 0; x < wx1 + P * 3; x += P * 2.2, i++) { // scalloped valance
    bgc.fillStyle = i % 2 ? '#e08a8a' : '#f0e6d6';
    bgc.beginPath();
    bgc.arc(x + P, wy0 - P * 2, P * 1.3, 0, Math.PI);
    bgc.fill();
  }

  // 3D countertop: the top surface runs from its back edge on the wall down
  // and OUT toward the viewer (converging on the VP), so the base cabinets
  // stand on the floor in front of the wall, wider than the back-wall span
  const vP = vpPt();
  const kC = cDepth / Math.max(1, cty - vP.y); // recession fraction of the counter run
  // point on the counter top at back-wall x: u = 0 back edge .. 1 front lip
  const ctp = (x, u) => ({ x: x + (x - vP.x) * kC * u, y: cty + (cty - vP.y) * kC * u });
  const fLip0 = ctp(bx0, 1); // front lip corners
  const fLip1 = ctp(bx1, 1);
  bgc.fillStyle = '#efe6cf';
  scenePath([{ x: bx0, y: cty }, { x: bx1, y: cty }, fLip1, fLip0]);
  bgc.fill();
  bgc.fillStyle = '#dccfb0'; // front thickness lip
  bgc.fillRect(fLip0.x, fLip0.y, fLip1.x - fLip0.x, P * 1.8);
  bgc.fillStyle = 'rgba(120,95,55,0.35)';
  bgc.fillRect(fLip0.x, fLip0.y + P * 1.8, fLip1.x - fLip0.x, 2);
  // teal lower cabinets, standing on the floor at the counter's depth
  const cabTop = fLip0.y + P * 1.8 + 2;
  const cabBot = by1 + (by1 - vP.y) * kC; // floor line at the cabinets' depth
  const cabX = fLip0.x;
  const cabW = fLip1.x - fLip0.x;
  bgc.fillStyle = '#4f8f88';
  bgc.fillRect(cabX, cabTop, cabW, cabBot - cabTop);
  const doors = 5;
  for (let i = 0; i < doors; i++) {
    const dx0 = cabX + (cabW * i) / doors;
    bgc.strokeStyle = '#3c706a';
    bgc.lineWidth = 2;
    bgc.strokeRect(dx0 + 2, cabTop + 2, cabW / doors - 4, cabBot - cabTop - 4);
    bgc.fillStyle = '#5aa39b'; // recessed panel
    bgc.fillRect(dx0 + P * 1.5, cabTop + P * 1.5, cabW / doors - P * 3, cabBot - cabTop - P * 3);
    bgc.fillStyle = '#c9a24a'; // brass knob
    bgc.fillRect(dx0 + cabW / doors / 2 - P / 2, cabTop + P * 2, P, P * 1.6);
  }
  bgc.fillStyle = 'rgba(40,30,20,0.35)'; // toe-kick shadow on the floor
  bgc.fillRect(cabX, cabBot, cabW, P);

  // sink: basin set INTO the receding countertop + arched faucet with a drip
  const scx = (wx0 + wx1) / 2;
  const sw = (wx1 - wx0) * 0.82;
  const rimL = scx - sw / 2 - P;
  const rimR = scx + sw / 2 + P;
  fillQuad(ctp(rimL, 0.08), ctp(rimR, 0.08), ctp(rimR, 0.92), ctp(rimL, 0.92), '#dfe4ec'); // rim
  fillQuad(ctp(rimL + P, 0.18), ctp(rimR - P, 0.18), ctp(rimR - P, 0.82), ctp(rimL + P, 0.82), '#9aa5b4'); // basin
  // far inner wall of the basin sits in shade
  fillQuad(ctp(rimL + P, 0.18), ctp(rimR - P, 0.18), ctp(rimR - P, 0.32), ctp(rimL + P, 0.32), '#6d7888');
  const fb = ctp(scx + sw * 0.3, 0.14); // faucet base, on the back rim
  bgc.strokeStyle = '#d8dee8';
  bgc.lineCap = 'round';
  bgc.lineWidth = Math.max(3, P * 1.2);
  bgc.beginPath();
  bgc.moveTo(fb.x, fb.y);
  bgc.lineTo(fb.x, fb.y - P * 4.5); // riser
  bgc.arc(fb.x - P * 2.2, fb.y - P * 4.5, P * 2.2, 0, Math.PI, true); // arch
  bgc.lineTo(fb.x - P * 4.4, fb.y - P * 3);
  bgc.stroke();
  bgc.lineCap = 'butt';
  const dripT = (now % 1300) / 1300; // falling water drop
  if (dripT < 0.75) {
    bgc.fillStyle = '#8fd0e8';
    bgc.fillRect(fb.x - P * 4.4 - 1, fb.y - P * 3 + dripT * P * 4, 3, 5);
  }

  // props along the back counter — small 3D objects resting on the surface
  const plt = ctp(bx0 + cw * 0.08, 0.5); // stack of plates, far left
  bgc.fillStyle = '#f2ede2';
  for (let i = 0; i < 3; i++) bgc.fillRect(plt.x - cw * 0.03, plt.y - i * (P + 1), cw * 0.06, P);
  // cooktop: a dark slab with thickness, burners staggered front/back
  const hobL = bx0 + cw * 0.14;
  const hobR = bx0 + cw * 0.3;
  fillQuad(ctp(hobL, 0.1), ctp(hobR, 0.1), ctp(hobR, 0.8), ctp(hobL, 0.8), '#3a3f47');
  const he0 = ctp(hobL, 0.8);
  const he1 = ctp(hobR, 0.8);
  bgc.fillStyle = '#22262c'; // front edge thickness
  bgc.fillRect(he0.x, he0.y, he1.x - he0.x, P);
  for (const [bfx, bu] of [[0.2, 0.28], [0.25, 0.6]]) {
    const bp = ctp(bx0 + cw * bfx, bu);
    bgc.fillStyle = '#22262c'; // burners
    bgc.beginPath();
    bgc.ellipse(bp.x, bp.y, P * 2.2, P * 1.1, 0, 0, Math.PI * 2);
    bgc.fill();
    bgc.strokeStyle = '#4a5058';
    bgc.lineWidth = 1.5;
    bgc.stroke();
  }
  const cs = U * 0.42; // counter-prop base size
  const kp = ctp(bx0 + cw * 0.2, 0.4); // kettle on the rear burner
  contactShadow(kp.x, kp.y, cs * 1.3);
  drawKettle(kp.x, kp.y, cs);
  const brp = ctp(bx0 + cw * 0.77, 0.5); // bread loaf
  drawBread(brp.x, brp.y, cs * 0.95);
  const jp1 = ctp(bx0 + cw * 0.88, 0.38);
  contactShadow(jp1.x, jp1.y, cs);
  drawJar(jp1.x, jp1.y, cs * 0.95, '#cdb98a', '#9a7a3a');
  const jp2 = ctp(bx0 + cw * 0.93, 0.62);
  contactShadow(jp2.x, jp2.y, cs);
  drawJar(jp2.x, jp2.y, cs * 0.88, '#b7c8e0', '#c0563e');

  // 3D floating shelves flanking the window: thick boards sticking OUT of the
  // wall — wood-grain top face, front edge, end cap, brackets — so the
  // crockery has a real surface to stand on
  const shelf3D = (x0, x1, y) => {
    const th = Math.max(3, P * 1.4); // front board thickness
    const dep = P * 2.2; // how far the board sticks out of the wall
    const bk = (x) => x + (vP.x - x) * 0.06; // back edge converges toward the VP
    bgc.fillStyle = '#5e3a1e'; // brackets against the wall
    bgc.fillRect(x0 + (x1 - x0) * 0.14, y + th, P, P * 2.4);
    bgc.fillRect(x1 - (x1 - x0) * 0.14 - P, y + th, P, P * 2.4);
    // top face, with a grain line running along the wood
    fillQuad({ x: x0, y }, { x: x1, y }, { x: bk(x1), y: y - dep }, { x: bk(x0), y: y - dep }, '#b98a50');
    bgc.strokeStyle = 'rgba(96,60,28,0.45)';
    bgc.lineWidth = 1;
    bgc.beginPath();
    bgc.moveTo((x0 + bk(x0)) / 2, y - dep / 2);
    bgc.lineTo((x1 + bk(x1)) / 2, y - dep / 2);
    bgc.stroke();
    // end cap on the side facing away from the VP
    const capX = (x0 + x1) / 2 < vP.x ? x0 : x1;
    fillQuad({ x: capX, y }, { x: bk(capX), y: y - dep }, { x: bk(capX), y: y - dep + th }, { x: capX, y: y + th }, '#7a4f28');
    bgc.fillStyle = '#946237'; // front edge
    bgc.fillRect(x0, y, x1 - x0, th);
    bgc.fillStyle = 'rgba(255,238,205,0.3)'; // top highlight
    bgc.fillRect(x0, y, x1 - x0, 2);
  };
  const shelfDep = P * 2.2;
  // place a prop centered on a shelf's TOP face (moved back off the front edge
  // so it doesn't look like it's tipping off), grounded with a contact shadow
  const onShelf = (fx, y, S, draw) => {
    const cx = bx0 + cw * fx;
    const by = y - shelfDep * 0.5; // middle of the top face
    contactShadow(cx, by, S);
    draw(cx, by);
  };
  const shA = by0 + ch * 0.34; // upper shelf line
  const shB = by0 + ch * 0.56; // lower shelf line
  shelf3D(bx0 + cw * 0.03, bx0 + cw * 0.29, shA);
  shelf3D(bx0 + cw * 0.03, bx0 + cw * 0.29, shB);
  shelf3D(bx0 + cw * 0.71, bx0 + cw * 0.97, shA);
  shelf3D(bx0 + cw * 0.71, bx0 + cw * 0.97, shB);
  const Sp = U * 0.5; // shelf prop base size
  // upper-left: snake plant + mug ; lower-left: books + bottle + jar
  onShelf(0.09, shA, Sp, (x, y) => drawPlant(x, y, Sp, 'snake'));
  onShelf(0.21, shA, Sp * 0.8, (x, y) => drawMug(x, y, Sp * 0.82));
  onShelf(0.08, shB, Sp, (x, y) => drawBooks(x, y, Sp * 0.82));
  onShelf(0.19, shB, Sp * 0.7, (x, y) => drawBottle(x, y, Sp * 0.9));
  onShelf(0.26, shB, Sp * 0.8, (x, y) => drawJar(x, y, Sp * 0.82, '#cdb98a', '#9a7a3a'));
  // upper-right: bowl of fruit + books ; lower-right: jar + monstera
  onShelf(0.8, shA, Sp, (x, y) => drawBowl(x, y, Sp * 0.95));
  onShelf(0.92, shA, Sp * 0.8, (x, y) => drawBooks(x, y, Sp * 0.75, ['#5f85db', '#c0563e']));
  onShelf(0.77, shB, Sp * 0.8, (x, y) => drawJar(x, y, Sp * 0.82, '#b7c8e0', '#c0563e'));
  onShelf(0.9, shB, Sp, (x, y) => drawPlant(x, y, Sp, 'monstera'));

  // pixelated wall clock (real time) on the right wall. A cast shadow plus a
  // dark rim offset downward give it real thickness — it pops off the wall.
  inWallPlane('R', 0.5, 0.14, () => {
    bgc.fillStyle = 'rgba(20,30,45,0.26)'; // cast shadow, down-right
    bgc.beginPath();
    bgc.ellipse(U * 0.12, U * 0.13, U * 0.6, U * 0.6, 0, 0, Math.PI * 2);
    bgc.fill();
    bgc.fillStyle = '#2c2016'; // side/thickness: dark disc offset down
    bgc.beginPath();
    bgc.ellipse(0, U * 0.08, U * 0.56, U * 0.56, 0, 0, Math.PI * 2);
    bgc.fill();
    drawPixelClock(0, 0, U * 0.55, now);
  });

  // --- left wall: wooden pot rail with copper pans, framed pictures, floor plant ---
  // the rail is a real beam sticking out of the wall: top face, front face,
  // end cap and brackets, not a flat strip painted on the wall
  const railFy = 0.22;
  const railT0 = 0.34;
  const railT1 = 0.8;
  const railOut = (t) => U * (0.3 - t * 0.18); // protrusion, shrinking with depth
  const rOff = (p, t) => ({ x: p.x + railOut(t), y: p.y + railOut(t) * 0.45 });
  const rT0 = wallPtL(railT0, railFy);
  const rT1 = wallPtL(railT1, railFy);
  const rB0 = wallPtL(railT0, railFy + 0.018);
  const rB1 = wallPtL(railT1, railFy + 0.018);
  const fT0 = rOff(rT0, railT0);
  const fT1 = rOff(rT1, railT1);
  const fB0 = rOff(rB0, railT0);
  const fB1 = rOff(rB1, railT1);
  bgc.fillStyle = '#4e2f16'; // brackets tying the beam back to the wall
  for (const bt of [0.4, 0.74]) {
    const bp = wallPtL(bt, railFy + 0.018);
    bgc.fillRect(bp.x, bp.y, Math.max(2, P * 0.7), U * 0.16);
  }
  fillQuad(rT0, rT1, fT1, fT0, '#9a6a38'); // top face
  bgc.strokeStyle = 'rgba(96,60,28,0.5)'; // grain along the top
  bgc.lineWidth = 1;
  bgc.beginPath();
  bgc.moveTo((rT0.x + fT0.x) / 2, (rT0.y + fT0.y) / 2);
  bgc.lineTo((rT1.x + fT1.x) / 2, (rT1.y + fT1.y) / 2);
  bgc.stroke();
  fillQuad(fT0, fT1, fB1, fB0, '#7a4a26'); // front face
  fillQuad(rT0, fT0, fB0, rB0, '#5e3a1e'); // near end cap
  for (const [t, col, inner] of [[0.42, '#c17a4a', '#8a4e28'], [0.56, '#3a4048', '#22262c'], [0.69, '#c17a4a', '#8a4e28']]) {
    const p = wallPtL(t, railFy + 0.026);
    const s = U * (0.56 - t * 0.32); // smaller with depth
    const hp = rOff(wallPtL(t, railFy + 0.018), t); // hook hangs off the beam's front
    const pcx = p.x;
    const pcy = p.y + s * 1.05; // pan center, below the hook
    const pr = s * 0.8;
    bgc.strokeStyle = '#4e2f16'; // hook down to the pan
    bgc.lineWidth = 2;
    bgc.beginPath();
    bgc.moveTo(hp.x, hp.y);
    bgc.lineTo(pcx, pcy - pr);
    bgc.stroke();
    drawPanPix(pcx, pcy, pr, col, inner); // pixelated pan, lifted off the wall
  }
  // two framed pictures hung high on the wall; a thin offset shadow lifts them
  // a few pixels off the wall, with a slim frame (not a chunky border)
  for (const [t, fy, sky, ground] of [[0.16, 0.3, '#a5d2e6', '#7fae6a'], [0.34, 0.33, '#f3c98a', '#5f8fb4']]) {
    fillQuad(wallPtL(t + 0.006, fy + 0.008), wallPtL(t + 0.126, fy + 0.008), wallPtL(t + 0.126, fy + 0.168), wallPtL(t + 0.006, fy + 0.168), 'rgba(40,30,20,0.18)'); // thin lift shadow
    fillQuad(wallPtL(t, fy), wallPtL(t + 0.12, fy), wallPtL(t + 0.12, fy + 0.16), wallPtL(t, fy + 0.16), '#efe6d2'); // slim cream frame
    fillQuad(wallPtL(t + 0.009, fy + 0.012), wallPtL(t + 0.111, fy + 0.012), wallPtL(t + 0.111, fy + 0.093), wallPtL(t + 0.009, fy + 0.093), sky);
    fillQuad(wallPtL(t + 0.009, fy + 0.093), wallPtL(t + 0.111, fy + 0.093), wallPtL(t + 0.111, fy + 0.148), wallPtL(t + 0.009, fy + 0.148), ground);
    const sun = wallPtL(t + 0.08, fy + 0.045);
    bgc.fillStyle = '#f5d84e';
    bgc.fillRect(sun.x - 3, sun.y - 3, 6, 6);
  }
  // big monstera standing on the FLOOR, clear of the left wall — pixelated
  const seam = wallPtL(0.55, 1); // wall-floor seam at the plant's depth
  const mp = { x: seam.x + U * 1.6, y: seam.y + U * 0.28 };
  bgc.fillStyle = 'rgba(60,35,15,0.3)';
  bgc.beginPath();
  bgc.ellipse(mp.x, mp.y, U * 1.15, U * 0.22, 0, 0, Math.PI * 2);
  bgc.fill();
  drawPlant(mp.x, mp.y, U * 0.95, 'monstera');

  // --- fridge: a 3/4 box turned so its DOOR faces the COUNTER in the middle.
  // The door is the big face that recedes toward the vanishing point (its top &
  // bottom edges converge to the VP); the fridge's narrow front-right side is
  // frontal, facing the viewer. So the doors clearly point at the island. ---
  const fRx = W * 0.945; // frontal right-side outer edge
  const fMx = W * 0.90; // near vertical edge (door ↔ right-side corner)
  const fyTop = H * 0.3, fyBot = H * 0.9;
  const dS = 0.3; // door depth: how far it recedes toward the VP
  const dTL = recede({ x: fMx, y: fyTop }, dS); // door far-top-left (toward counter)
  const dBL = recede({ x: fMx, y: fyBot }, dS); // door far-bottom-left
  const lerpPt = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  // point inside the door trapezoid: u=0 left(opening)…1 right, v=0 top…1 bottom
  const doorPt = (u, v) => lerpPt(lerpPt(dTL, { x: fMx, y: fyTop }, u), lerpPt(dBL, { x: fMx, y: fyBot }, u), v);
  bgc.fillStyle = 'rgba(4,7,12,0.3)'; // floor shadow
  scenePath([dBL, { x: fMx, y: fyBot }, { x: fRx, y: fyBot }, { x: fRx, y: fyBot + P * 2 }, { x: dBL.x - P, y: dBL.y + P * 2 }]);
  bgc.fill();
  // frontal right side (facing viewer, a bit shadowed)
  fillQuad({ x: fMx, y: fyTop }, { x: fRx, y: fyTop }, { x: fRx, y: fyBot }, { x: fMx, y: fyBot }, shade('#e4dbc6', 0.82));
  // door face — receding toward the counter/VP (lit, since it faces the light)
  fillQuad(dTL, { x: fMx, y: fyTop }, { x: fMx, y: fyBot }, dBL, '#ece3ce');
  bgc.strokeStyle = '#a89e86';
  bgc.lineWidth = 2;
  scenePath([dTL, { x: fMx, y: fyTop }, { x: fRx, y: fyTop }, { x: fRx, y: fyBot }, { x: fMx, y: fyBot }, dBL]);
  bgc.stroke();
  scenePath([dTL, { x: fMx, y: fyTop }, { x: fMx, y: fyBot }, dBL]);
  bgc.stroke();
  // freezer / fridge seam across the door, following its perspective tilt
  bgc.beginPath();
  const s0 = doorPt(0, 0.4), s1 = doorPt(1, 0.4);
  bgc.moveTo(s0.x, s0.y);
  bgc.lineTo(s1.x, s1.y);
  bgc.stroke();
  // vertical chrome-bar handles near the LEFT (opening) edge facing the counter
  for (const [v0, v1] of [[0.05, 0.34], [0.46, 0.93]]) {
    const a = doorPt(0.12, v0), b = doorPt(0.12, v1);
    const bw = Math.max(3, P * 0.9);
    bgc.fillStyle = '#b0a68f'; // cast shadow
    fillQuad({ x: a.x + bw, y: a.y + 2 }, { x: a.x + bw * 1.5, y: a.y + 2 }, { x: b.x + bw * 1.5, y: b.y + 2 }, { x: b.x + bw, y: b.y + 2 }, '#b0a68f');
    fillQuad({ x: a.x, y: a.y }, { x: a.x + bw, y: a.y }, { x: b.x + bw, y: b.y }, { x: b.x, y: b.y }, '#d9dee6');
  }
  bgc.fillStyle = '#3a3630'; // feet
  bgc.fillRect(dBL.x + P, fyBot, P * 1.5, P);
  bgc.fillRect(fRx - (fRx - fMx) - P * 1.5, fyBot, P * 1.5, P);
  bgc.fillRect(fRx - P * 2.5, fyBot, P * 1.5, P);
  // framed photos on the door (placed in door space so they sit on the face)
  const pp = Math.max(3, Math.round(P * 1.2));
  const ph1 = doorPt(0.42, 0.22), ph2 = doorPt(0.72, 0.42);
  drawPixMap(PIX.photoLand.rows, PIX.photoLand.pal, ph1.x, ph1.y, pp);
  drawPixMap(PIX.photoHeart.rows, PIX.photoHeart.pal, ph2.x, ph2.y, pp);
  bgc.fillStyle = '#e94560';
  bgc.fillRect(ph1.x - 2, ph1.y - 7 * pp - 3, 5, 5);
  bgc.fillStyle = '#5f85db';
  bgc.fillRect(ph2.x - 2, ph2.y - 7 * pp - 3, 5, 5);
  // a pixelated potted plant sitting fully ON TOP of the fridge — its base
  // rests on the top edge and it rises clear above, not over the doors
  const ftop = doorPt(0.5, 0);
  contactShadow(ftop.x, ftop.y, (fRx - dTL.x) * 0.42);
  drawPlant(ftop.x, ftop.y, U * 0.44, 'bush');

  // --- pendant lamps over the island + small ceiling lamps like kitchen4 ---
  // shades are drawn as real volumes: banded cone, trim ring, and a bottom
  // opening with the glowing bulb visible inside
  scene.lamps = [];
  for (const fx of [0.4, 0.6]) {
    const px = W * fx;
    const cordTop = by0 * 0.4; // ceiling at the island's depth
    const sy = H * 0.3; // bottom of the shade
    bgc.strokeStyle = '#6e4522';
    bgc.lineWidth = 2;
    bgc.beginPath();
    bgc.moveTo(px, cordTop);
    bgc.lineTo(px, sy - U * 0.55);
    bgc.stroke();
    drawShade(px, sy, U * 0.18, U * 0.5, U * 0.55);
    scene.lamps.push({ x: px, y: sy });
  }
  for (const fx of [0.13, 0.87]) {
    // little ceiling lamps in the front corners
    const px = W * fx;
    const sy = H * 0.065 + U * 0.32;
    bgc.strokeStyle = '#6e4522';
    bgc.lineWidth = 2;
    bgc.beginPath();
    bgc.moveTo(px, 0);
    bgc.lineTo(px, sy - U * 0.32);
    bgc.stroke();
    drawShade(px, sy, U * 0.11, U * 0.3, U * 0.32);
  }
}

// warm light pools from the pendants, drawn over the island so it looks lit
function drawLampGlow() {
  if (!scene.lamps) return;
  const U = scene.U;
  for (const l of scene.lamps) {
    const g = bgc.createRadialGradient(l.x, l.y, 5, l.x, l.y, U * 6.5);
    g.addColorStop(0, 'rgba(255,214,140,0.15)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    bgc.fillStyle = g;
    bgc.fillRect(l.x - U * 6.5, l.y - U * 6.5, U * 13, U * 13);
  }
}

// island cabinet front: drawer row on top, panelled doors below
function drawCabinetFront(x0, y0, x1, y1) {
  const { U, P } = scene;
  bgc.fillStyle = '#3c706a'; // frame (dark teal)
  bgc.fillRect(x0, y0, x1 - x0, y1 - y0);
  const dh = Math.min(U * 0.9, (y1 - y0) * 0.34);
  const n = 3;
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const dx = Math.round(x0 + i * w + P);
    const dw = Math.round(w - P * 2);
    // drawer face + brass bar handle
    bgc.fillStyle = '#579f96';
    bgc.fillRect(dx, y0 + P, dw, dh - P * 2);
    bgc.fillStyle = '#c9a24a';
    bgc.fillRect(dx + dw / 2 - U * 0.5, y0 + dh / 2 - P / 2, U, P);
    // door with recessed panel groove
    const doorY = y0 + dh + P;
    const doorH = y1 - doorY - P;
    bgc.fillStyle = '#4f8f88';
    bgc.fillRect(dx, doorY, dw, doorH);
    bgc.fillStyle = '#437a74';
    bgc.fillRect(dx + P * 2, doorY + P * 2, dw - P * 4, doorH - P * 4);
    bgc.fillStyle = '#5aa39b';
    bgc.fillRect(dx + P * 3, doorY + P * 3, dw - P * 6, doorH - P * 6);
    // knob near the inner seam
    bgc.fillStyle = '#c9a24a';
    const kx = i === 2 ? dx + P * 2 : dx + dw - P * 3;
    bgc.fillRect(kx, doorY + doorH * 0.45, P, P * 2);
  }
}

function drawCounter() {
  const { left, right, frontY, topDepth, inset, thick, faceH, U, P } = scene;
  const backY = frontY - topDepth;
  const bottomY = frontY + thick + faceH;

  // shadow on the floor
  bgc.fillStyle = 'rgba(4,7,16,0.5)';
  bgc.fillRect(left - U * 0.3, bottomY, right - left + U * 0.6, P * 3);

  // countertop: smooth butcher-block trapezoid with grain lines
  const tY = (t) => frontY - topDepth * t;
  bgc.fillStyle = '#c8935a';
  scenePath([
    { x: left, y: frontY },
    { x: right, y: frontY },
    { x: surfX(1, 1), y: tY(1) },
    { x: surfX(0, 1), y: tY(1) },
  ]);
  bgc.fill();
  bgc.strokeStyle = 'rgba(110,70,32,0.4)'; // grain running left-right
  bgc.lineWidth = 1;
  for (let g = 1; g < 6; g++) {
    const t = g / 6;
    bgc.beginPath();
    bgc.moveTo(surfX(0, t), tY(t));
    bgc.lineTo(surfX(1, t), tY(t));
    bgc.stroke();
  }
  bgc.fillStyle = '#8a5a2c'; // back rim
  bgc.fillRect(surfX(0, 1), backY - 2, surfX(1, 1) - surfX(0, 1), 3);

  // red gingham tablecloth over the middle of the island
  const cl0 = 0.09;
  const cl1 = 0.91;
  const NCC = 14; // checker columns
  const NRC = 7; // checker rows
  scenePath([
    { x: surfX(cl0, 0), y: frontY },
    { x: surfX(cl1, 0), y: frontY },
    { x: surfX(cl1, 1), y: tY(1) },
    { x: surfX(cl0, 1), y: tY(1) },
  ]);
  bgc.fillStyle = '#f4efe4';
  bgc.fill();
  for (let r = 0; r < NRC; r++) {
    for (let c = 0; c < NCC; c++) {
      if ((r + c) % 2 === 0) continue;
      const u0 = cl0 + ((cl1 - cl0) * c) / NCC;
      const u1 = cl0 + ((cl1 - cl0) * (c + 1)) / NCC;
      const t0 = r / NRC;
      const t1 = (r + 1) / NRC;
      fillQuad(
        { x: surfX(u0, t0), y: tY(t0) },
        { x: surfX(u1, t0), y: tY(t0) },
        { x: surfX(u1, t1), y: tY(t1) },
        { x: surfX(u0, t1), y: tY(t1) },
        r % 2 ? '#d96a6a' : '#e08a8a'
      );
    }
  }
  // cloth flap hanging over the front lip
  const flapL = surfX(cl0, 0);
  const flapR = surfX(cl1, 0);
  const flapH = thick + P * 3;
  const fcw = (flapR - flapL) / NCC;
  for (let c = 0; c < NCC; c++) {
    for (let r = 0; r < 3; r++) {
      bgc.fillStyle = (r + c) % 2 ? (r % 2 ? '#c95c5c' : '#d0716f') : '#e8e2d2';
      bgc.fillRect(flapL + c * fcw, frontY + (flapH / 3) * r, fcw + 1, flapH / 3 + 1);
    }
  }
  bgc.fillStyle = '#b04848'; // hem
  bgc.fillRect(flapL, frontY + flapH, flapR - flapL, 2);

  // exposed wooden lip left and right of the cloth
  bgc.fillStyle = '#9a6a38';
  bgc.fillRect(left, frontY, flapL - left, thick);
  bgc.fillRect(flapR, frontY, right - flapR, thick);
  bgc.fillStyle = '#e2b57e';
  bgc.fillRect(left, frontY, flapL - left, P);
  bgc.fillRect(flapR, frontY, right - flapR, P);

  // cabinet face (top overhangs) down to the floor
  const cabL = left + U * 0.3;
  const cabR = right - U * 0.3;
  drawCabinetFront(cabL, frontY + thick, cabR, bottomY);

  // a chef's knife resting near the back corner
  drawPixMap(PIX.knife.rows, PIX.knife.pal, surfX(0.88, 0.78), frontY - topDepth * 0.78, P);
}

function drawDish(d, now) {
  const { x, y } = dishBase(d);
  const U = scene.U;
  const dp = scene.dp; // dish pixel size, sized so dishes never crowd
  const pix = PIX[d.kind];
  const w = pix.rows[0].length * dp;

  dishShadow(x, y, w + dp * 4);

  // what it sits on (the cake map includes its own stand)
  let base = y;
  if (d.kind === 'stick') {
    // cutting board
    const bw = w + dp * 6;
    bgc.fillStyle = '#5e3a1e';
    bgc.fillRect(x - bw / 2 - dp, y - dp * 3, bw + dp * 2, dp * 3);
    bgc.fillStyle = '#a8763a';
    bgc.fillRect(x - bw / 2, y - dp * 3 + 1, bw, dp * 3 - 2);
    bgc.fillStyle = '#5e3a1e'; // handle hole
    bgc.fillRect(x + bw / 2 - dp * 2, y - dp * 2, dp, dp);
    base = y - dp * 2;
  } else if (d.kind === 'pancake') {
    // plate
    bgc.fillStyle = '#b9bfca';
    bgc.fillRect(x - w / 2 - dp * 2, y - dp * 2, w + dp * 4, dp * 2);
    bgc.fillStyle = '#dfe3ea';
    bgc.fillRect(x - w / 2 - dp, y - dp * 2, w + dp * 2, dp);
    base = y - dp;
  }
  const sideCol = d.kind === 'cake' ? '#b07a44' : d.kind === 'pancake' ? '#9a6a2e' : '#8a5a26';
  const ddir = extrudeDir(x, base - U);
  const m = drawPixMap3D(pix.rows, pix.pal, x, base, dp, sideCol, ddir.x, ddir.y);
  const topY = m.y0;

  // label + name floating above the dish (label bobs in pixel steps)
  const bob = Math.round(Math.sin(now / 700 + d.fx * 6) * 1.5) * (scene.P / 2);
  bgc.textAlign = 'center';
  bgc.font = `700 ${Math.round(U * 0.95)}px 'Orbitron', sans-serif`;
  bgc.lineWidth = 4;
  bgc.strokeStyle = '#0c1330';
  const ly = topY - U * 0.7 + bob;
  bgc.strokeText(d.label, x, ly);
  bgc.fillStyle = d.accent;
  bgc.fillText(d.label, x, ly);
  bgc.font = `${Math.round(U * 0.5)}px 'Pixelify Sans', monospace`;
  bgc.strokeText(d.name, x, ly + U * 0.65);
  bgc.fillStyle = '#cfd6ea';
  bgc.fillText(d.name, x, ly + U * 0.65);
  bgc.textAlign = 'left';

  // hit region for slicing (screen space)
  d._hit = { x, y: (y + topY) / 2, r: scene.hitR };
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
  for (const d of DISHES) {
    if (!d._hit) continue;
    const dist = segDist(a, b, d._hit);
    if (dist < d._hit.r && (!best || dist < best.dist)) best = { d, dist };
  }
  return best && best.d;
}

function drawKitchen(now) {
  sceneLayout();
  drawKitchenRoom(now);
  drawCounter();
  for (const d of [...DISHES].sort((a, b) => a.fx - b.fx)) drawDish(d, now);
  drawLampGlow();

  // aim line + highlight of the dish being crossed
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
    if (REDUCED) return;
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
    if (dish) {
      sceneFlash = { a, b, accent: dish.accent, start: performance.now() };
      wipeToPage(dish.mode, a, b, dish.accent);
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

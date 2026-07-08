// Shared 3D game shell: orthographic software renderer (painter's algorithm),
// orbit controls, rotate/slice mode toggle, rounds, reveal and scoring.
// The mode script loaded before this file (shapes3d.js or foods3d.js)
// supplies makeTarget3D() → { kind: 'mesh'|'voxel', ..., radius }.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function sizeCanvas() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
sizeCanvas();
addEventListener('resize', sizeCanvas);

const ROUNDS = 5;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const DIGITAL_CHARS = /[0-9%./]/;

function drawLabel(text, x, y, size = 16, color = '#fff') {
  const runs = [];
  for (const ch of text) {
    const digital = DIGITAL_CHARS.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.digital === digital) last.text += ch;
    else runs.push({ text: ch, digital });
  }
  const fontFor = (d) =>
    d
      ? `${Math.round(size * 0.85)}px 'Orbitron', monospace`
      : `${size}px 'Pixelify Sans', monospace`;
  let width = 0;
  for (const r of runs) {
    ctx.font = fontFor(r.digital);
    r.w = ctx.measureText(r.text).width;
    width += r.w;
  }
  let cx = x - width / 2;
  ctx.textAlign = 'left';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = '#16213e';
  for (const r of runs) {
    ctx.font = fontFor(r.digital);
    ctx.strokeText(r.text, cx, y);
    ctx.fillStyle = color;
    ctx.fillText(r.text, cx, y);
    cx += r.w;
  }
  ctx.lineWidth = 1;
}

function scoreColor(s) {
  if (s >= 95) return '#8fbf58';
  if (s >= 80) return '#f5a623';
  return '#e94560';
}

function shade3(hex, f) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((v >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((v >> 8) & 255) * f));
  const b = Math.min(255, Math.round((v & 255) * f));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// --- view: orbit camera, orthographic projection ---

let yaw = 0.6;
let pitch = -0.5;
const view = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], S: 1, cx: 0, cy: 0 };

function updateView() {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // v = Rx(pitch) · Ry(yaw) · w
  view.m = [cy, 0, sy, sp * sy, cp, -sp * cy, -cp * sy, sp, cp * cy];
  view.S = (Math.min(canvas.width, canvas.height) * 0.3) / target.radius;
  view.cx = canvas.width / 2;
  view.cy = canvas.height / 2;
}

// world point → screen x/y + view depth z (+z is toward the viewer)
function tf(p) {
  const m = view.m;
  return {
    x: view.cx + (m[0] * p.x + m[1] * p.y + m[2] * p.z) * view.S,
    y: view.cy + (m[3] * p.x + m[4] * p.y + m[5] * p.z) * view.S,
    z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
  };
}

// direction → view space (no projection)
function tfDir(p) {
  const m = view.m;
  return {
    x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
    y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
    z: m[6] * p.x + m[7] * p.y + m[8] * p.z,
  };
}

const LIGHT = (() => {
  const l = { x: -0.45, y: -0.6, z: 0.66 };
  const n = Math.hypot(l.x, l.y, l.z);
  return { x: l.x / n, y: l.y / n, z: l.z / n };
})();

const faceShade = (nv) => 0.55 + 0.45 * Math.max(0, nv.x * LIGHT.x + nv.y * LIGHT.y + nv.z * LIGHT.z);

// --- render items: { z, pts (screen), fill }, painter-sorted far → near ---

function paintItems(items) {
  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    ctx.beginPath();
    ctx.moveTo(it.pts[0].x, it.pts[0].y);
    for (let i = 1; i < it.pts.length; i++) ctx.lineTo(it.pts[i].x, it.pts[i].y);
    ctx.closePath();
    ctx.fillStyle = it.fill;
    ctx.fill();
    ctx.strokeStyle = it.fill; // hairline stroke closes antialiasing seams
    ctx.stroke();
  }
}

// polys: [{ pts: [world...], n: outward world normal, color }]
function collectPolys(polys, out, ox, oy) {
  for (const poly of polys) {
    const nv = tfDir(poly.n);
    if (nv.z <= 0) continue; // backface
    const pts = poly.pts.map((p) => {
      const s = tf(p);
      return { x: s.x + ox, y: s.y + oy, z: s.z };
    });
    let z = 0;
    for (const p of pts) z += p.z;
    out.push({ z: z / pts.length, pts, fill: shade3(poly.color, faceShade(nv)) });
  }
}

// --- building render polys from targets ---

const VOX_DIRS = [
  { d: { x: 1, y: 0, z: 0 }, o: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { d: { x: -1, y: 0, z: 0 }, o: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { d: { x: 0, y: 1, z: 0 }, o: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { d: { x: 0, y: -1, z: 0 }, o: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: { x: 0, y: 0, z: 1 }, o: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { d: { x: 0, y: 0, z: -1 }, o: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

function voxelPolys(voxels, lookup, N) {
  const polys = [];
  for (const v of voxels) {
    const c = voxelCorner(v, N);
    for (const dir of VOX_DIRS) {
      if (lookup.has(`${v.x + dir.d.x},${v.y + dir.d.y},${v.z + dir.d.z}`)) continue;
      polys.push({
        pts: dir.o.map((o) => ({ x: c.x + o[0], y: c.y + o[1], z: c.z + o[2] })),
        n: dir.d,
        color: v.c,
      });
    }
  }
  return polys;
}

function meshPolys(verts, tris, color) {
  const polys = [];
  for (const [a, b, c] of tris) {
    const A = verts[a];
    const B = verts[b];
    const C = verts[c];
    const n = v3.norm(v3.cross(v3.sub(B, A), v3.sub(C, A)));
    polys.push({ pts: [A, B, C], n, color });
  }
  return polys;
}

function centroidOf(pts) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  return { x: x / pts.length, y: y / pts.length, z: z / pts.length };
}

// --- game state ---

let state = 'aim'; // aim → reveal → … → over
let uiMode = 'rotate'; // 'rotate' | 'slice'
let round = 1;
let total = 0;
let target = makeTarget3D();
let wholePolys = null;
let pieces = null; // [{ polys, centroid }, { polys, centroid }]
let cutPlane = null;
let pcts = [0, 0];
let roundScore = 0;
let revealStart = 0;
let message = '';
let swipe = null;
let orbit = null;
let revealDrag = null;
let chipRect = { x: 0, y: 0, w: 0, h: 0 };

function buildWholePolys() {
  wholePolys =
    target.kind === 'voxel'
      ? voxelPolys(target.voxels, target.lookup, target.N)
      : meshPolys(target.verts, target.tris, target.color);
}

function startRound() {
  target = makeTarget3D();
  buildWholePolys();
  pieces = null;
  swipe = null;
  cutPlane = null;
  state = 'aim';
  uiMode = 'rotate';
  message = `Round ${round}/${ROUNDS} — slice it in half!`;
}

function buildMeshPiece(side) {
  const { polys, caps } = clipMeshBySide(target.verts, target.tris, cutPlane, side);
  const capN = side > 0 ? { x: -cutPlane.n.x, y: -cutPlane.n.y, z: -cutPlane.n.z } : cutPlane.n;
  const list = [];
  const all = [];
  for (const pts of polys) {
    const n = v3.norm(v3.cross(v3.sub(pts[1], pts[0]), v3.sub(pts[2], pts[0])));
    list.push({ pts, n, color: target.color });
    all.push(...pts);
  }
  for (const pts of caps) {
    list.push({ pts, n: capN, color: shade3(target.color, 0.7) });
    // caps as seen from the other side too (canvas has no double-sided fill)
    list.push({ pts: [...pts].reverse(), n: side > 0 ? cutPlane.n : capN, color: shade3(target.color, 0.7) });
  }
  return { polys: list, centroid: centroidOf(all.length ? all : [{ x: 0, y: 0, z: 0 }]) };
}

function buildVoxelPiece(side) {
  const subset = [];
  const lookup = new Set();
  for (const v of target.voxels) {
    const c = voxelCorner(v, target.N);
    const dist = v3.dot(cutPlane.n, { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }) - cutPlane.d;
    if ((side > 0 && dist >= 0) || (side < 0 && dist < 0)) {
      subset.push(v);
      lookup.add(`${v.x},${v.y},${v.z}`);
    }
  }
  const centers = subset.map((v) => {
    const c = voxelCorner(v, target.N);
    return { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 };
  });
  return {
    polys: voxelPolys(subset, lookup, target.N),
    centroid: centroidOf(centers.length ? centers : [{ x: 0, y: 0, z: 0 }]),
  };
}

function attemptCut() {
  updateView();
  cutPlane = planeFromScreenLine(swipe.a, swipe.b, yaw, pitch, view.cx, view.cy, view.S);
  const vols =
    target.kind === 'voxel'
      ? voxelSideVolumes(target.voxels, target.N, cutPlane)
      : meshSideVolumes(target.verts, target.tris, cutPlane);
  if (Math.min(vols.plus, vols.minus) < vols.total * 0.005) {
    message = 'Missed — slice through the object';
    return;
  }
  pcts = [(vols.plus / vols.total) * 100, (vols.minus / vols.total) * 100];
  roundScore = (Math.min(vols.plus, vols.minus) / vols.total) * 200;
  total += roundScore;
  pieces =
    target.kind === 'voxel'
      ? [buildVoxelPiece(1), buildVoxelPiece(-1)]
      : [buildMeshPiece(1), buildMeshPiece(-1)];
  state = 'reveal';
  revealStart = performance.now();
}

// --- drawing ---

function drawChip() {
  const label =
    state !== 'aim'
      ? 'drag to spin the pieces'
      : uiMode === 'rotate'
        ? 'ROTATE mode — tap here to SLICE'
        : 'SLICE mode — tap here to ROTATE';
  const w = 340;
  chipRect = { x: canvas.width / 2 - w / 2, y: canvas.height - 56, w, h: 38 };
  ctx.fillStyle = state === 'aim' && uiMode === 'slice' ? 'rgba(120, 32, 48, 0.85)' : 'rgba(15, 52, 96, 0.8)';
  ctx.strokeStyle = state === 'aim' && uiMode === 'slice' ? '#e94560' : '#3a3f5c';
  ctx.beginPath();
  ctx.roundRect(chipRect.x, chipRect.y, chipRect.w, chipRect.h, 8);
  ctx.fill();
  ctx.stroke();
  drawLabel(label, canvas.width / 2, chipRect.y + 25, 15);
}

function drawReveal(t) {
  let sx = 0;
  let sy = 0;
  if (t < 0.15) {
    const m = (1 - t / 0.15) * 5;
    sx = (Math.random() * 2 - 1) * m;
    sy = (Math.random() * 2 - 1) * m;
  }
  ctx.save();
  ctx.translate(sx, sy);

  // separation follows the cut plane's normal as currently seen, so the
  // pieces stay correct even while being spun
  const nv = tfDir(cutPlane.n);
  const nl = Math.hypot(nv.x, nv.y) || 1;
  const m2 = { x: nv.x / nl, y: nv.y / nl };
  const k = easeOutCubic(Math.min(t / 0.7, 1)) * Math.min(canvas.width, canvas.height) * 0.05;

  const items = [];
  const labels = [];
  pieces.forEach((piece, i) => {
    const s = i === 0 ? 1 : -1;
    collectPolys(piece.polys, items, m2.x * k * s, m2.y * k * s);
    if (t > 0.3) {
      const c = tf(piece.centroid);
      labels.push([`${pcts[i].toFixed(1)}%`, c.x + m2.x * k * s, c.y + m2.y * k * s]);
    }
  });
  paintItems(items);
  for (const [text, x, y] of labels) drawLabel(text, x, y);
  ctx.restore();

  if (t > 0.3) {
    drawLabel(
      `${pcts[0].toFixed(1)}% / ${pcts[1].toFixed(1)}% — score ${roundScore.toFixed(1)}`,
      canvas.width / 2,
      34,
      20,
      scoreColor(roundScore)
    );
    if (roundScore >= 99.5) drawLabel('PERFECT!', canvas.width / 2, 62, 22, '#8fbf58');
  }
  if (t > 1.0 && state === 'reveal') {
    drawLabel(
      round < ROUNDS ? 'tap for next round' : 'tap for results',
      canvas.width / 2,
      canvas.height - 76,
      14,
      '#aabbcc'
    );
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(26, 26, 46, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const avg = total / ROUNDS;
  drawLabel('Results', cx, 200, 34);
  drawLabel(`total ${total.toFixed(1)} / ${ROUNDS * 100}`, cx, 260, 24, scoreColor(avg));
  drawLabel(`average ${avg.toFixed(1)} per cut`, cx, 296, 18, '#aabbcc');
  drawLabel('tap to play again', cx, 370, 16);
}

function draw(now) {
  updateView();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // HUD chips, top-right
  ctx.fillStyle = 'rgba(15, 52, 96, 0.8)';
  ctx.strokeStyle = '#3a3f5c';
  ctx.beginPath();
  ctx.roundRect(canvas.width - 336, 12, 156, 34, 8);
  ctx.roundRect(canvas.width - 168, 12, 156, 34, 8);
  ctx.fill();
  ctx.stroke();
  drawLabel(`round ${Math.min(round, ROUNDS)}/${ROUNDS}`, canvas.width - 258, 35, 16);
  drawLabel(`total ${total.toFixed(1)}`, canvas.width - 90, 35, 16);

  if (state === 'aim') {
    const items = [];
    collectPolys(wholePolys, items, 0, 0);
    paintItems(items);

    if (swipe) {
      ctx.save();
      ctx.setLineDash([12, 9]);
      ctx.lineDashOffset = -now / 24;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(swipe.a.x, swipe.a.y);
      ctx.lineTo(swipe.b.x, swipe.b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(swipe.a.x, swipe.a.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (message) drawLabel(message, canvas.width / 2, 34, 18);
  } else {
    drawReveal(state === 'over' ? 2 : (now - revealStart) / 1000);
    if (state === 'over') {
      drawGameOver();
      return;
    }
  }
  drawChip();
}

// --- input ---

const inChip = (p) =>
  p.x >= chipRect.x && p.x <= chipRect.x + chipRect.w && p.y >= chipRect.y && p.y <= chipRect.y + chipRect.h;

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const p = { x: event.clientX, y: event.clientY };

  if (state === 'over') {
    round = 1;
    total = 0;
    startRound();
    return;
  }
  if (state === 'aim' && inChip(p)) {
    uiMode = uiMode === 'rotate' ? 'slice' : 'rotate';
    message =
      uiMode === 'slice' ? 'drag a line across the object' : `Round ${round}/${ROUNDS} — slice it in half!`;
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  if (state === 'reveal') {
    revealDrag = { x: p.x, y: p.y, moved: false };
    return;
  }
  if (uiMode === 'rotate') orbit = { x: p.x, y: p.y };
  else swipe = { a: p, b: p };
});

canvas.addEventListener('pointermove', (event) => {
  const p = { x: event.clientX, y: event.clientY };
  const spin = (from) => {
    yaw += (p.x - from.x) * 0.008;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + (p.y - from.y) * 0.008));
    from.x = p.x;
    from.y = p.y;
  };
  if (state === 'reveal' && revealDrag) {
    if (Math.hypot(p.x - revealDrag.x, p.y - revealDrag.y) > 6) revealDrag.moved = true;
    if (revealDrag.moved) spin(revealDrag);
    return;
  }
  if (state !== 'aim') return;
  if (orbit) spin(orbit);
  else if (swipe) swipe.b = p;
});

canvas.addEventListener('pointerup', () => {
  if (state === 'reveal' && revealDrag) {
    const wasTap = !revealDrag.moved;
    revealDrag = null;
    if (wasTap && (performance.now() - revealStart) / 1000 >= 1.0) {
      if (round >= ROUNDS) state = 'over';
      else {
        round++;
        startRound();
      }
    }
    return;
  }
  orbit = null;
  if (state === 'aim' && swipe) {
    const s = swipe;
    swipe = null;
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) >= 12) {
      swipe = s;
      attemptCut();
      swipe = null;
    }
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'c' && state === 'aim') {
    uiMode = uiMode === 'rotate' ? 'slice' : 'rotate';
  }
});

let lastFrame = performance.now();
function frame(now) {
  lastFrame = now;
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

startRound();

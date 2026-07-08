// 1D mode game shell: a random string appears, one tap or short swipe cuts
// it at a point, and the score is how close the two arc lengths are to 50/50.
// Rounds, HUD and reveal mirror the 2D shell in game.js.

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

// gradient color pairs — each string wears a random one
const STRING_COLORS = [
  ['#e94560', '#f5a623'],
  ['#5f85db', '#7df9ff'],
  ['#8fbf58', '#f4d03f'],
  ['#ee87b2', '#c96f9a'],
  ['#f5a623', '#e94560'],
  ['#7df9ff', '#ee87b2'],
];

// outlined mixed-font text (same convention as game.js: letters pixel,
// digits and %./ in the digital font)
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

function makeString() {
  const size = Math.min(canvas.width, canvas.height);
  const built = buildString(size * 0.62, size * 0.5);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    pts: built.pts.map((p) => ({ x: p.x + cx, y: p.y + cy })),
    cum: built.cum,
    total: built.total,
    colors: STRING_COLORS[Math.floor(Math.random() * STRING_COLORS.length)],
  };
}

function drawString(pts, colors) {
  const grad = ctx.createLinearGradient(
    pts[0].x,
    pts[0].y,
    pts[pts.length - 1].x,
    pts[pts.length - 1].y
  );
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const e of [pts[0], pts[pts.length - 1]]) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// point at a given arc length along a piece (for the % labels)
function pointAtArc(pts, arc) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (acc + seg >= arc && seg > 0) {
      const t = (arc - acc) / seg;
      return {
        x: pts[i].x + t * (pts[i + 1].x - pts[i].x),
        y: pts[i].y + t * (pts[i + 1].y - pts[i].y),
      };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

// --- game state ---
let state = 'aim'; // 'aim' → 'reveal' → … → 'over'
let round = 1;
let total = 0;
let target = makeString();
let swipeA = null;
let swipeB = null;
let cut = null; // result of cutPolyline + normal/pcts/score
let sparks = [];
let revealStart = 0;
let message = '';

function startRound() {
  target = makeString();
  swipeA = null;
  swipeB = null;
  cut = null;
  sparks = [];
  state = 'aim';
  message = `Round ${round}/${ROUNDS} — cut the string in half!`;
}

function applyCut(hit) {
  const c = cutPolyline(target.pts, target.cum, hit.index, hit.t);
  const pct1 = (c.len1 / target.total) * 100;
  cut = {
    ...c,
    normal: { x: -c.tangent.y, y: c.tangent.x },
    pcts: [pct1, 100 - pct1],
    score: (Math.min(c.len1, c.len2) / target.total) * 200,
  };
  total += cut.score;
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 160;
    sparks.push({
      x: c.point.x,
      y: c.point.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      age: 0,
      life: 0.35 + Math.random() * 0.35,
      color: target.colors[i % 2],
    });
  }
  state = 'reveal';
  revealStart = performance.now();
}

function drawReveal(t, dt) {
  // screen shake as the cut lands
  let sx = 0;
  let sy = 0;
  if (t < 0.12) {
    const m = (1 - t / 0.12) * 4;
    sx = (Math.random() * 2 - 1) * m;
    sy = (Math.random() * 2 - 1) * m;
  }
  ctx.save();
  ctx.translate(sx, sy);

  // the two halves recoil along the string's own direction — 1D separation
  const k = easeOutCubic(Math.min(t / 0.6, 1)) * 16;
  [cut.p1, cut.p2].forEach((piece, i) => {
    const s = i === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(
      cut.tangent.x * k * s + cut.normal.x * 4 * s,
      cut.tangent.y * k * s + cut.normal.y * 4 * s
    );
    drawString(piece, target.colors);
    if (t > 0.3) {
      const half = pointAtArc(piece, (i === 0 ? cut.len1 : cut.len2) / 2);
      drawLabel(`${cut.pcts[i].toFixed(1)}%`, half.x + cut.normal.x * 20 * s, half.y + cut.normal.y * 20 * s);
    }
    ctx.restore();
  });

  // flash tick across the cut point
  if (t < 0.25) {
    ctx.save();
    ctx.globalAlpha = 1 - t / 0.25;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cut.point.x - cut.normal.x * 16, cut.point.y - cut.normal.y * 16);
    ctx.lineTo(cut.point.x + cut.normal.x * 16, cut.point.y + cut.normal.y * 16);
    ctx.stroke();
    ctx.restore();
  }

  for (const p of sparks) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  sparks = sparks.filter((p) => p.age < p.life);
  for (const p of sparks) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (t > 0.3) {
    drawLabel(
      `${cut.pcts[0].toFixed(1)}% / ${cut.pcts[1].toFixed(1)}% — score ${cut.score.toFixed(1)}`,
      canvas.width / 2,
      34,
      20,
      scoreColor(cut.score)
    );
    if (cut.score >= 99.5) drawLabel('PERFECT!', canvas.width / 2, 62, 22, '#8fbf58');
  }
  if (t > 1.0 && state === 'reveal') {
    drawLabel(
      round < ROUNDS ? 'tap for next round' : 'tap for results',
      canvas.width / 2,
      canvas.height - 20,
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

function draw(now, dt) {
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
    drawString(target.pts, target.colors);
    if (swipeA && swipeB) {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -now / 24;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(swipeA.x, swipeA.y);
      ctx.lineTo(swipeB.x, swipeB.y);
      ctx.stroke();
      ctx.restore();
    }
    if (message) drawLabel(message, canvas.width / 2, 34, 18);
  } else {
    drawReveal(state === 'over' ? 2 : (now - revealStart) / 1000, dt);
    if (state === 'over') drawGameOver();
  }
}

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const p = { x: event.clientX, y: event.clientY };

  if (state === 'over') {
    round = 1;
    total = 0;
    startRound();
    return;
  }
  if (state === 'reveal') {
    if ((performance.now() - revealStart) / 1000 < 0.9) return;
    if (round >= ROUNDS) state = 'over';
    else {
      round++;
      startRound();
    }
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  swipeA = p;
  swipeB = p;
});

canvas.addEventListener('pointermove', (event) => {
  if (state !== 'aim' || !swipeA) return;
  swipeB = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('pointerup', () => {
  if (state !== 'aim' || !swipeA) return;
  const a = swipeA;
  const b = swipeB || a;
  swipeA = null;
  swipeB = null;

  if (Math.hypot(b.x - a.x, b.y - a.y) < 6) {
    // a tap: snap to the nearest point on the string, if close enough
    const near = nearestOnPolyline(target.pts, a);
    if (near && near.dist <= 26) {
      applyCut(near);
    } else {
      message = 'Missed the string — tap it, or swipe across it';
    }
    return;
  }
  // a swipe: cut where it first crosses the string
  const hit = polylineSwipeCut(target.pts, a, b);
  if (hit) applyCut(hit);
  else message = 'Missed the string — swipe across it';
});

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  draw(now, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

startRound();

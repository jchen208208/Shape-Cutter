// Shared game shell for both modes: rounds, aiming, the cut, the reveal
// animation, scoring, and the results screen. The mode script loaded before
// this file (shapes.js or foods.js) supplies
// makeTarget() → { polygon, drawWhole(), drawPiece(points, i) }.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ROUNDS = 5;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

function pathPolygon(points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// average of the vertices — good enough to place a label inside a piece
function labelPoint(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// the cut is an infinite line, so draw it well past both points
function drawLine(a, b, style) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const E = 2000;
  ctx.beginPath();
  ctx.moveTo(a.x - ux * E, a.y - uy * E);
  ctx.lineTo(a.x + ux * E, a.y + uy * E);
  ctx.strokeStyle = style;
  ctx.stroke();
}

// outlined text so labels stay readable over any colors
function drawLabel(text, x, y, size = 16, color = '#fff') {
  ctx.font = `${size}px 'Pixelify Sans', monospace`;
  ctx.textAlign = 'center';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = '#16213e';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.lineWidth = 1;
  ctx.textAlign = 'left';
}

function scoreColor(s) {
  if (s >= 95) return '#8fbf58';
  if (s >= 80) return '#f5a623';
  return '#e94560';
}

// --- game state ---
// state: 'aim' → 'reveal' (pieces sliding apart) → next round … → 'over'
let state = 'aim';
let round = 1;
let total = 0;
let target = makeTarget();
let cutA = null;
let mouse = null;
let pieces = null;
let lastCut = null;
let cutNormal = null;
let pcts = [0, 0];
let roundScore = 0;
let revealStart = 0;
let message = '';

function startRound() {
  target = makeTarget();
  cutA = null;
  mouse = null;
  pieces = null;
  state = 'aim';
  message = `Round ${round}/${ROUNDS} — cut it in half!`;
}

function attemptCut(p) {
  const [p1, p2] = splitPolygon(target.polygon, cutA, p);
  lastCut = { a: cutA, b: p };
  cutA = null;
  mouse = null;

  const a1 = Math.abs(polygonArea(p1));
  const a2 = Math.abs(polygonArea(p2));
  const whole = Math.abs(polygonArea(target.polygon));
  // a graze that shaves off a sliver below 0.1% of the area counts as a miss
  if (p1.length < 3 || p2.length < 3 || Math.min(a1, a2) < whole * 0.001) {
    message = 'Missed — try again';
    return;
  }

  pieces = [p1, p2];
  pcts = [(a1 / (a1 + a2)) * 100, (a2 / (a1 + a2)) * 100];
  roundScore = (Math.min(a1, a2) / (a1 + a2)) * 200;
  total += roundScore;

  const dx = lastCut.b.x - lastCut.a.x;
  const dy = lastCut.b.y - lastCut.a.y;
  const len = Math.hypot(dx, dy);
  cutNormal = { x: -dy / len, y: dx / len };

  state = 'reveal';
  revealStart = performance.now();
}

function drawReveal(t) {
  // screen shake right after the cut lands
  let sx = 0;
  let sy = 0;
  if (t < 0.15) {
    const m = (1 - t / 0.15) * 5;
    sx = (Math.random() * 2 - 1) * m;
    sy = (Math.random() * 2 - 1) * m;
  }
  ctx.save();
  ctx.translate(sx, sy);

  const k = easeOutCubic(Math.min(t / 0.7, 1)) * 22;
  pieces.forEach((piece, i) => {
    const s = i === 0 ? 1 : -1;
    ctx.save();
    ctx.translate(cutNormal.x * k * s, cutNormal.y * k * s);
    target.drawPiece(piece, i);
    if (t > 0.3) {
      const l = labelPoint(piece);
      drawLabel(`${pcts[i].toFixed(1)}%`, l.x, l.y);
    }
    ctx.restore();
  });

  if (t < 0.5) {
    drawLine(lastCut.a, lastCut.b, `rgba(255,255,255,${1 - t / 0.5})`);
  }
  ctx.restore();

  if (t > 0.35) {
    drawLabel(
      `${pcts[0].toFixed(1)}% / ${pcts[1].toFixed(1)}% — score ${roundScore.toFixed(1)}`,
      canvas.width / 2,
      34,
      20,
      scoreColor(roundScore)
    );
    if (roundScore >= 99.5) {
      drawLabel('PERFECT!', canvas.width / 2, 62, 22, '#8fbf58');
    }
  }
  if (t > 1.0 && state === 'reveal') {
    drawLabel(
      round < ROUNDS ? 'tap for next round' : 'tap for results',
      canvas.width / 2,
      canvas.height - 20,
      14,
      '#99aa'
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
  drawLabel(`average ${avg.toFixed(1)} per cut`, cx, 296, 18, '#99aa');
  drawLabel('tap to play again', cx, 370, 16);
}

function draw(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // HUD
  drawLabel(`round ${Math.min(round, ROUNDS)}/${ROUNDS}`, 64, 26, 14, '#99aa');
  drawLabel(`total ${total.toFixed(1)}`, canvas.width - 70, 26, 14, '#99aa');

  if (state === 'aim') {
    target.drawWhole();
    if (cutA) {
      if (mouse) drawLine(cutA, mouse, '#0f0');
      ctx.beginPath();
      ctx.arc(cutA.x, cutA.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0f0';
      ctx.fill();
    }
    if (message) drawLabel(message, canvas.width / 2, 34, 18);
  } else {
    drawReveal(state === 'over' ? 2 : (now - revealStart) / 1000);
    if (state === 'over') drawGameOver();
  }
}

// pointer events unify mouse and touch (with touch-action: none in CSS)
canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const p = getCanvasPoint(event);

  if (state === 'over') {
    round = 1;
    total = 0;
    startRound();
    return;
  }

  if (state === 'reveal') {
    // brief lockout so the reveal isn't skipped by accident
    if ((performance.now() - revealStart) / 1000 < 0.6) return;
    if (round >= ROUNDS) {
      state = 'over';
    } else {
      round++;
      startRound();
    }
    return;
  }

  if (!cutA) {
    cutA = p;
    message = '';
    return;
  }
  // ignore a second tap in basically the same spot (no line defined)
  if (Math.hypot(p.x - cutA.x, p.y - cutA.y) < 2) return;
  attemptCut(p);
});

canvas.addEventListener('pointermove', (event) => {
  if (state !== 'aim' || !cutA) return;
  mouse = getCanvasPoint(event);
});

// press R while aiming to reset the anchor and start the cut over
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'r' || state !== 'aim' || !cutA) return;
  cutA = null;
  mouse = null;
  message = `Round ${round}/${ROUNDS} — cut it in half!`;
});

document.getElementById('newTarget').addEventListener('click', () => {
  if (state === 'over') {
    round = 1;
    total = 0;
  }
  startRound();
});

function frame(now) {
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

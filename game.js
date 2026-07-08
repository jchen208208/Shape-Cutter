// Shared game shell for both modes: rounds, aiming, the cut, the reveal
// animation, scoring, and the results screen. The mode script loaded before
// this file (shapes.js or foods.js) supplies
// makeTarget() → { polygon, drawWhole(), drawPiece(points, i) }.

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

// Outlined text so labels stay readable over any colors. Letters use the
// pixel font; digits, %, . and / render in the digital-clock font
// (Orbitron). Text is split into runs and each run measured so the mix
// still comes out centered on x.
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

// --- cut effects: knife + crumbs (food), laser + sparks (shapes) ---

let fx = null;

// where the infinite cut line enters and exits the polygon — the sweep path
function cutSpan(polygon, a, b) {
  const hits = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const sp = side(a, b, p);
    const sq = side(a, b, q);
    if (Math.abs(sp) <= EPS) hits.push(p);
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      hits.push(lineSegmentIntersection(a, b, p, q));
    }
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  hits.sort((u, v) => u.x * dx + u.y * dy - (v.x * dx + v.y * dy));
  return [hits[0], hits[hits.length - 1]];
}

function startCutFx() {
  const [e0, e1] = cutSpan(target.polygon, lastCut.a, lastCut.b);
  fx = {
    e0,
    e1,
    kind: target.fx || 'laser',
    colors: target.fxColors || [],
    sweep: target.fx === 'knife' ? 0.35 : 0.25, // seconds to cross the shape
    particles: [],
    carry: 0,
  };
}

// chunky pixel knife, drawn in a frame rotated to the cut direction
function drawKnife(pos, ang, alpha, prog) {
  const s = Math.min(canvas.width, canvas.height) / 600;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pos.x, pos.y);
  ctx.rotate(ang);
  ctx.translate(0, -Math.abs(Math.sin(prog * Math.PI * 5)) * 3 * s); // chop bob
  ctx.scale(s, s);
  ctx.fillStyle = '#d8dee9'; // blade
  ctx.fillRect(-34, -13, 36, 10);
  ctx.beginPath();
  ctx.moveTo(2, -13);
  ctx.lineTo(14, -3);
  ctx.lineTo(2, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4f7fb'; // cutting edge highlight
  ctx.fillRect(-34, -5, 38, 2);
  ctx.fillStyle = '#8f5b3a'; // handle
  ctx.fillRect(-52, -12, 18, 8);
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(-46, -12, 3, 8);
  ctx.fillRect(-40, -12, 3, 8);
  ctx.restore();
}

function updateAndDrawFx(t, dt) {
  if (!fx) return;
  const prog = Math.min(t / fx.sweep, 1);
  const tip = {
    x: fx.e0.x + (fx.e1.x - fx.e0.x) * prog,
    y: fx.e0.y + (fx.e1.y - fx.e0.y) * prog,
  };
  const ang = Math.atan2(fx.e1.y - fx.e0.y, fx.e1.x - fx.e0.x);
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);

  // emit particles from the tip while it sweeps
  if (prog < 1 && fx.particles.length < 260) {
    fx.carry += dt * (fx.kind === 'knife' ? 150 : 240);
    while (fx.carry >= 1) {
      fx.carry -= 1;
      const sgn = Math.random() < 0.5 ? 1 : -1;
      const speed = 40 + Math.random() * (fx.kind === 'knife' ? 130 : 240);
      fx.particles.push({
        x: tip.x + nx * (Math.random() - 0.5) * 10,
        y: tip.y + ny * (Math.random() - 0.5) * 10,
        vx: nx * speed * sgn + (Math.random() - 0.5) * 60,
        vy: ny * speed * sgn + (Math.random() - 0.5) * 60,
        age: 0,
        life: fx.kind === 'knife' ? 0.5 + Math.random() * 0.5 : 0.2 + Math.random() * 0.35,
        size: fx.kind === 'knife' ? 3 + Math.random() * 4 : 2 + Math.random() * 2,
        color:
          fx.kind === 'knife'
            ? fx.colors[Math.floor(Math.random() * fx.colors.length)] || '#d9a066'
            : ['#ffffff', '#e94560', '#f5a623'][Math.floor(Math.random() * 3)],
      });
    }
  }

  for (const p of fx.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (fx.kind === 'knife') p.vy += 500 * dt; // crumbs fall
  }
  fx.particles = fx.particles.filter((p) => p.age < p.life);
  for (const p of fx.particles) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    if (fx.kind === 'knife') {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  if (fx.kind === 'laser') {
    const fade = t < fx.sweep ? 1 : Math.max(0, 1 - (t - fx.sweep) / 0.45);
    if (fade > 0) {
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = '#e94560';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx.e0.x, fx.e0.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      if (prog < 1) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  } else {
    const fade = t < fx.sweep ? 0.8 : Math.max(0, 0.8 - (t - fx.sweep) / 0.4);
    if (fade > 0) {
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(fx.e0.x, fx.e0.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.restore();
    }
    if (t < fx.sweep + 0.12) {
      drawKnife(tip, ang, t < fx.sweep ? 1 : 1 - (t - fx.sweep) / 0.12, prog);
    }
  }
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
  fx = null;
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

  startCutFx();
  state = 'reveal';
  revealStart = performance.now();
}

function drawReveal(t, dt) {
  const sweep = fx ? fx.sweep : 0;
  const st = t - sweep; // time since the sweep finished the cut

  // screen shake at the moment the cut lands
  let sx = 0;
  let sy = 0;
  if (st >= 0 && st < 0.15) {
    const m = (1 - st / 0.15) * 5;
    sx = (Math.random() * 2 - 1) * m;
    sy = (Math.random() * 2 - 1) * m;
  }
  ctx.save();
  ctx.translate(sx, sy);

  // pieces hold together until the sweep passes, then slide apart
  const k = easeOutCubic(Math.min(Math.max(st, 0) / 0.7, 1)) * 22;
  pieces.forEach((piece, i) => {
    const s = i === 0 ? 1 : -1;
    ctx.save();
    ctx.translate(cutNormal.x * k * s, cutNormal.y * k * s);
    target.drawPiece(piece, i);
    if (st > 0.3) {
      const l = labelPoint(piece);
      drawLabel(`${pcts[i].toFixed(1)}%`, l.x, l.y);
    }
    ctx.restore();
  });

  updateAndDrawFx(t, dt);
  ctx.restore();

  if (st > 0.3) {
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
  if (t > 1.3 && state === 'reveal') {
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

  // HUD chips, top-right (top-left belongs to the back-to-menu link)
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
    target.drawWhole();
    if (cutA) {
      if (mouse) {
        // marching-ants aim line
        ctx.save();
        ctx.setLineDash([12, 9]);
        ctx.lineDashOffset = -now / 24;
        ctx.shadowColor = 'rgba(255,255,255,0.7)';
        ctx.shadowBlur = 6;
        drawLine(cutA, mouse, 'rgba(255,255,255,0.9)');
        ctx.restore();
      }
      const pulse = 4 + Math.sin(now / 160) * 1.5;
      ctx.beginPath();
      ctx.arc(cutA.x, cutA.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cutA.x, cutA.y, pulse + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.stroke();
    }
    if (message) drawLabel(message, canvas.width / 2, 34, 18);
  } else {
    drawReveal(state === 'over' ? 2 : (now - revealStart) / 1000, dt);
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
    if ((performance.now() - revealStart) / 1000 < 1.0) return;
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

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  draw(now, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function drawPolygon(points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

// Day 2: random convex polygon.
// Walk angles 0→2π in random-ish steps, place each vertex at a random radius.
// Ordering vertices by increasing angle fixes our winding convention: the
// shoelace formula will come out positive for every shape we generate.
function randomPolygon() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const n = 6 + Math.floor(Math.random() * 4); // 6–9 vertices

  // n random step sizes, normalized so they sum to 2π
  const steps = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.5 + Math.random(); // each step between 0.5x and 1.5x average
    steps.push(s);
    total += s;
  }

  const points = [];
  let angle = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    angle += (steps[i] / total) * Math.PI * 2;
    const r = 150 + Math.random() * 100; // radius 150–250 keeps us on canvas
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

// Dents (reflex vertices) are allowed, but only mild ones. The raw cross
// product scales with edge lengths, so it can't measure "dent depth" on its
// own — atan2(cross, dot) of the two edge vectors gives the actual turn angle
// at the vertex, which is scale-free. Positive turn = convex corner (with our
// winding), negative = dent.
const MAX_DENT = 0.6; // radians (~35°) — deepest dent we accept

function dentsAreMild(points) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const c = points[(i + 2) % n];
    const e1x = b.x - a.x;
    const e1y = b.y - a.y;
    const e2x = c.x - b.x;
    const e2y = c.y - b.y;
    const cross = e1x * e2y - e1y * e2x;
    const dot = e1x * e2x + e1y * e2y;
    if (Math.atan2(cross, dot) < -MAX_DENT) return false;
  }
  return true;
}

// Shift the polygon so its bounding box is centered in the canvas
function centerInCanvas(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const dx = canvas.width / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = canvas.height / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function newShape() {
  let points;
  do {
    points = randomPolygon();
  } while (!dentsAreMild(points));
  return centerInCanvas(points);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// average of the vertices — good enough to place a label inside a convex piece
function labelPoint(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// the cut is an infinite line, so draw the preview well past both points
function drawCutLine(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const E = 2000;
  ctx.beginPath();
  ctx.moveTo(a.x - ux * E, a.y - uy * E);
  ctx.lineTo(a.x + ux * E, a.y + uy * E);
  ctx.strokeStyle = '#0f0';
  ctx.stroke();
}

// Day 3 state machine: aiming (cutA null → set → cut) or showing pieces
let shape = newShape();
let cutA = null; // first clicked point of the cut
let mouse = null;
let pieces = null; // [poly, poly] once a cut lands
let message = 'Click two points to cut the shape';

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (pieces) {
    const [p1, p2] = pieces;
    drawPolygon(p1, '#e94560');
    drawPolygon(p2, '#f5a623');

    const a1 = Math.abs(polygonArea(p1));
    const a2 = Math.abs(polygonArea(p2));
    const total = a1 + a2;
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${((a1 / total) * 100).toFixed(1)}%`, labelPoint(p1).x, labelPoint(p1).y);
    ctx.fillText(`${((a2 / total) * 100).toFixed(1)}%`, labelPoint(p2).x, labelPoint(p2).y);

    const smaller = Math.min(a1, a2);
    const score = ((smaller / total) * 200).toFixed(1);
    ctx.fillText(`score ${score} — click to cut again, or New Shape`, canvas.width / 2, 30);
    ctx.textAlign = 'left';
    return;
  }

  drawPolygon(shape, '#e94560');

  if (cutA) {
    if (mouse) drawCutLine(cutA, mouse);
    ctx.beginPath();
    ctx.arc(cutA.x, cutA.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0';
    ctx.fill();
  }

  if (message) {
    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, 30);
    ctx.textAlign = 'left';
  }
}

canvas.addEventListener('click', (event) => {
  const p = getCanvasPoint(event);

  if (pieces) {
    // start a fresh cut on the same shape
    pieces = null;
    cutA = p;
    message = '';
    draw();
    return;
  }

  if (!cutA) {
    cutA = p;
    message = '';
    draw();
    return;
  }

  // second click: ignore if it's basically the same point (no line defined)
  if (Math.hypot(p.x - cutA.x, p.y - cutA.y) < 2) return;

  const [p1, p2] = splitPolygon(shape, cutA, p);
  cutA = null;
  mouse = null;
  if (p1.length < 3 || p2.length < 3) {
    message = 'Missed the shape — try again';
  } else {
    pieces = [p1, p2];
    message = '';
  }
  draw();
});

canvas.addEventListener('mousemove', (event) => {
  if (!cutA) return;
  mouse = getCanvasPoint(event);
  draw();
});

// press R while aiming to reset the anchor and start the cut over
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'r' || !cutA) return;
  cutA = null;
  mouse = null;
  message = 'Click two points to cut the shape';
  draw();
});

document.getElementById('newShape').addEventListener('click', () => {
  shape = newShape();
  cutA = null;
  mouse = null;
  pieces = null;
  message = 'Click two points to cut the shape';
  draw();
});

draw();

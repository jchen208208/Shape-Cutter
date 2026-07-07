// Shared game shell for both modes: aiming, the cut, scoring, redraw.
// The mode script loaded before this file (shapes.js or foods.js) supplies
// makeTarget() → { polygon, drawWhole(), drawPiece(points, i) }.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

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
function drawLine(a, b, color) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const E = 2000;
  ctx.beginPath();
  ctx.moveTo(a.x - ux * E, a.y - uy * E);
  ctx.lineTo(a.x + ux * E, a.y + uy * E);
  ctx.strokeStyle = color;
  ctx.stroke();
}

// outlined text so labels stay readable over any sprite colors
function drawLabel(text, x, y) {
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#16213e';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  ctx.lineWidth = 1;
  ctx.textAlign = 'left';
}

// state machine: aiming (cutA null → set → cut) or showing pieces
let target = makeTarget();
let cutA = null; // first clicked point of the cut
let mouse = null;
let pieces = null; // [poly, poly] once a cut lands
let lastCut = null; // {a, b} of the cut that made the pieces
let message = 'Click two points to cut';

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (pieces) {
    target.drawPiece(pieces[0], 0);
    target.drawPiece(pieces[1], 1);
    drawLine(lastCut.a, lastCut.b, '#fff');

    const a1 = Math.abs(polygonArea(pieces[0]));
    const a2 = Math.abs(polygonArea(pieces[1]));
    const total = a1 + a2;
    const l1 = labelPoint(pieces[0]);
    const l2 = labelPoint(pieces[1]);
    drawLabel(`${((a1 / total) * 100).toFixed(1)}%`, l1.x, l1.y);
    drawLabel(`${((a2 / total) * 100).toFixed(1)}%`, l2.x, l2.y);

    const score = ((Math.min(a1, a2) / total) * 200).toFixed(1);
    drawLabel(`score ${score} — click to cut again`, canvas.width / 2, 30);
    return;
  }

  target.drawWhole();

  if (cutA) {
    if (mouse) drawLine(cutA, mouse, '#0f0');
    ctx.beginPath();
    ctx.arc(cutA.x, cutA.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0';
    ctx.fill();
  }

  if (message) {
    drawLabel(message, canvas.width / 2, 30);
  }
}

canvas.addEventListener('click', (event) => {
  const p = getCanvasPoint(event);

  if (pieces) {
    // start a fresh cut on the same target
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

  const [p1, p2] = splitPolygon(target.polygon, cutA, p);
  lastCut = { a: cutA, b: p };
  cutA = null;
  mouse = null;
  // a graze that shaves off a sliver below 0.1% of the area counts as a miss
  const smaller = Math.min(Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2)));
  if (p1.length < 3 || p2.length < 3 || smaller < Math.abs(polygonArea(target.polygon)) * 0.001) {
    message = 'Missed — try again';
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
  message = 'Click two points to cut';
  draw();
});

document.getElementById('newTarget').addEventListener('click', () => {
  target = makeTarget();
  cutA = null;
  mouse = null;
  pieces = null;
  message = 'Click two points to cut';
  draw();
});

draw();

// Shape mode: random polygons for the shared game shell in game.js.
// Loaded before game.js, which calls makeTarget() and uses the canvas/ctx
// globals it defines.

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
  // radius scales with the window so shapes fill a similar share of any screen
  const scale = Math.min(canvas.width, canvas.height) / 600;
  let angle = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    angle += (steps[i] / total) * Math.PI * 2;
    const r = (150 + Math.random() * 100) * scale;
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

const PIECE_COLORS = ['#e94560', '#f5a623'];

function fillPolygon(points, fill) {
  pathPolygon(points);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

function makeTarget() {
  let points;
  do {
    points = randomPolygon();
  } while (!dentsAreMild(points));
  const polygon = centerInCanvas(points);

  return {
    polygon,
    fx: 'laser',
    drawWhole() {
      fillPolygon(polygon, PIECE_COLORS[0]);
    },
    drawPiece(points, i) {
      fillPolygon(points, PIECE_COLORS[i]);
    },
  };
}

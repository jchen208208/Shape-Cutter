// Shape mode: random polygons for the shell in game.js.
// This has to load first, since game.js calls makeTarget() and leans on the canvas and ctx globals.

// Step around the circle in uneven jumps, dropping a vertex at a random radius each time.
// Going in order of increasing angle is what pins down the winding, so the shoelace area always comes out positive.
function randomPolygon() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const n = 6 + Math.floor(Math.random() * 4); // somewhere between 6 and 9 vertices

  // random step sizes, scaled at the end so they add up to a full turn
  const steps = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.5 + Math.random(); // half to one and a half times the average gap
    steps.push(s);
    total += s;
  }

  const points = [];
  // scale off the window so a shape takes up about the same amount of any screen
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

// Dents are fine, but only shallow ones.
// The cross product on its own is useless for this because it scales with the edge lengths.
// atan2(cross, dot) of the two edges gives the actual turn angle at the corner, which doesn't care how long they are.
// Positive is a convex corner and negative is a dent.
const MAX_DENT = 0.6; // radians, so about 35°

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

// nudge the whole thing so its bounding box sits in the middle of the canvas
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

// Run with: node tests.js
const { side, splitPolygon, polygonArea } = require('./engine.js');

let failures = 0;
function assertClose(actual, expected, label, tol = 1e-6) {
  if (Math.abs(actual - expected) > tol) {
    failures++;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// --- shoelace on shapes we can verify by hand ---
const square = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
assertClose(polygonArea(square), 1, 'unit square area = 1');

const triangle = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 0, y: 3 },
];
assertClose(polygonArea(triangle), 6, '4x3 right triangle area = 6');

// --- half-plane test ---
const a = { x: 0, y: 0 };
const b = { x: 1, y: 0 }; // the x-axis
assertClose(Math.sign(side(a, b, { x: 0.5, y: 1 })), 1, 'point above x-axis → +');
assertClose(Math.sign(side(a, b, { x: 0.5, y: -1 })), -1, 'point below x-axis → −');
assertClose(side(a, b, { x: 7, y: 0 }), 0, 'point on the line → 0');

// --- splitting, hand-verifiable cases ---
// vertical line x = 0.25 through the unit square → areas 0.25 and 0.75
{
  const [p1, p2] = splitPolygon(square, { x: 0.25, y: -5 }, { x: 0.25, y: 5 });
  const areas = [Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2))].sort();
  assertClose(areas[0], 0.25, 'square cut at x=0.25: small piece');
  assertClose(areas[1], 0.75, 'square cut at x=0.25: large piece');
}

// line exactly through two opposite vertices → two triangles of 0.5
{
  const [p1, p2] = splitPolygon(square, { x: 0, y: 0 }, { x: 1, y: 1 });
  assertClose(Math.abs(polygonArea(p1)), 0.5, 'diagonal through vertices: piece 1');
  assertClose(Math.abs(polygonArea(p2)), 0.5, 'diagonal through vertices: piece 2');
}

// line that misses the polygon entirely → one full piece, one empty
{
  const [p1, p2] = splitPolygon(square, { x: 5, y: 0 }, { x: 5, y: 1 });
  const areas = [Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2))].sort();
  assertClose(areas[0], 0, 'miss: empty piece has zero area');
  assertClose(areas[1], 1, 'miss: other piece is the whole square');
}

// --- the big one: random polygons + random cuts, pieces must sum ---
// (same generation method as the game, minus the canvas)
function randomPolygon() {
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
    const r = 150 + Math.random() * 100;
    points.push({ x: 400 + r * Math.cos(angle), y: 300 + r * Math.sin(angle) });
  }
  return points;
}

let worst = 0;
for (let i = 0; i < 1000; i++) {
  const poly = randomPolygon();
  const cutA = { x: Math.random() * 800, y: Math.random() * 600 };
  const cutB = { x: Math.random() * 800, y: Math.random() * 600 };
  const total = Math.abs(polygonArea(poly));
  const [p1, p2] = splitPolygon(poly, cutA, cutB);
  const sum = Math.abs(polygonArea(p1)) + Math.abs(polygonArea(p2));
  worst = Math.max(worst, Math.abs(sum - total));
}
assertClose(worst, 0, '1000 random cuts: piece areas sum to original (worst error)', 1e-6);

if (failures) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nall tests passed');
}

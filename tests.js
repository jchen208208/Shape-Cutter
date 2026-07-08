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

// line collinear with an edge: grazes the square, cuts nothing off
{
  const [p1, p2] = splitPolygon(square, { x: -3, y: 0 }, { x: 5, y: 0 });
  const areas = [Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2))].sort();
  assertClose(areas[0], 0, 'edge graze: nothing cut off');
  assertClose(areas[1], 1, 'edge graze: whole square intact');
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

// cuts passing exactly through two of the polygon's own vertices — the
// classic precision war story, at scale
let worstVertex = 0;
for (let i = 0; i < 500; i++) {
  const poly = randomPolygon();
  const vi = Math.floor(Math.random() * poly.length);
  let vj = Math.floor(Math.random() * poly.length);
  if (vj === vi) vj = (vj + 1) % poly.length;
  const total = Math.abs(polygonArea(poly));
  const [p1, p2] = splitPolygon(poly, poly[vi], poly[vj]);
  const sum = Math.abs(polygonArea(p1)) + Math.abs(polygonArea(p2));
  worstVertex = Math.max(worstVertex, Math.abs(sum - total));
}
assertClose(worstVertex, 0, '500 vertex-through cuts conserve area (worst error)', 1e-6);

// --- food sprites: each must be one connected blob, its traced outline must
// cover at least its pixel count (equal, except the donut whose hole is
// included in the outline), and cuts through it must conserve area.
// Roughening is random per serving, so the same invariants are re-checked
// on 25 fresh roughened instances of every food. ---
const { FOODS, buildSprite, roughenSprite, FOOD_N } = require('./foods.js');

// returns a problem description, or null if the sprite passes all invariants
function foodProblem(cells, polygon, cutTrials) {
  const filled = [];
  for (let y = 0; y < FOOD_N; y++) {
    for (let x = 0; x < FOOD_N; x++) {
      if (cells[y][x] === null) continue;
      if (typeof cells[y][x] !== 'string') {
        return `cell (${x},${y}) has invalid color ${cells[y][x]} (palette typo?)`;
      }
      filled.push([x, y]);
    }
  }
  const seen = new Set([filled[0].join(',')]);
  const queue = [filled[0]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = `${nx},${ny}`;
      if (nx >= 0 && nx < FOOD_N && ny >= 0 && ny < FOOD_N && cells[ny][nx] !== null && !seen.has(k)) {
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
  }
  if (seen.size !== filled.length) {
    return `disconnected blob (${seen.size} of ${filled.length} px reachable)`;
  }

  const area = Math.abs(polygonArea(polygon));
  if (area < filled.length - 1e-6) {
    return `outline area ${area} < pixel count ${filled.length}`;
  }

  for (let i = 0; i < cutTrials; i++) {
    const a = { x: Math.random() * FOOD_N, y: Math.random() * FOOD_N };
    const b = { x: Math.random() * FOOD_N, y: Math.random() * FOOD_N };
    const [p1, p2] = splitPolygon(polygon, a, b);
    const sum = Math.abs(polygonArea(p1)) + Math.abs(polygonArea(p2));
    if (Math.abs(sum - area) > 1e-6) {
      return `cut lost area (pieces ${sum} vs whole ${area})`;
    }
  }
  return null;
}

for (const food of FOODS) {
  const base = buildSprite(food);
  let problem = foodProblem(base.cells, base.polygon, 200);
  for (let i = 0; i < 25 && !problem; i++) {
    const inst = roughenSprite(base);
    problem = foodProblem(inst.cells, inst.polygon, 40);
  }
  if (problem) {
    failures++;
    console.error(`FAIL ${food.name}: ${problem}`);
  } else {
    console.log(`ok   ${food.name}: base + 25 roughened servings all valid`);
  }
}

// --- 1D strings: cuts must conserve arc length, and queries must behave ---
const {
  buildString,
  nearestOnPolyline,
  swipeCrossings,
  polylineSwipeCut,
  clampSwipe,
  cutPolyline,
} = require('./strings.js');

{
  let worst1d = 0;
  let pieces1dOk = true;
  for (let i = 0; i < 300; i++) {
    const s = buildString(400, 300);
    const index = Math.floor(Math.random() * (s.pts.length - 1));
    const t = Math.random();
    const c = cutPolyline(s.pts, s.cum, index, t);
    worst1d = Math.max(worst1d, Math.abs(c.len1 + c.len2 - s.total));
    if (c.p1.length < 2 || c.p2.length < 2) pieces1dOk = false;
  }
  assertClose(worst1d, 0, '300 random string cuts conserve length (worst error)', 1e-6);
  assertClose(pieces1dOk ? 1 : 0, 1, 'every string cut yields two drawable pieces');

  // a swipe far away from the string never cuts
  const s = buildString(400, 300);
  const miss = polylineSwipeCut(s.pts, { x: 5000, y: 5000 }, { x: 5010, y: 5010 });
  assertClose(miss === null ? 1 : 0, 1, 'far-away swipe misses the string');

  // the string's endpoints sit on opposite sides of the origin, so at least
  // one of a vertical or horizontal swipe through center must cross it
  const hit =
    polylineSwipeCut(s.pts, { x: 0, y: -1000 }, { x: 0, y: 1000 }) ||
    polylineSwipeCut(s.pts, { x: -1000, y: 0 }, { x: 1000, y: 0 });
  assertClose(hit ? 1 : 0, 1, 'center cross-swipe hits the string');
  const near = nearestOnPolyline(s.pts, s.pts[Math.floor(s.pts.length / 2)]);
  assertClose(near.dist, 0, 'nearest point to an on-string point is itself', 1e-9);

  // the clamped swipe must never cross the string twice, and must respect
  // both the raw drag length and the max reach
  let worstCrossings = 0;
  let lenOk = true;
  for (let i = 0; i < 500; i++) {
    const str = buildString(400, 300);
    const a = { x: (Math.random() - 0.5) * 600, y: (Math.random() - 0.5) * 600 };
    const b = { x: (Math.random() - 0.5) * 600, y: (Math.random() - 0.5) * 600 };
    const clamped = clampSwipe(str.pts, a, b, 200);
    worstCrossings = Math.max(worstCrossings, swipeCrossings(str.pts, a, clamped.end).length);
    if (clamped.len > Math.min(Math.hypot(b.x - a.x, b.y - a.y), 200) + 1e-9) lenOk = false;
  }
  assertClose(worstCrossings <= 1 ? 1 : 0, 1, '500 clamped swipes: never cross twice');
  assertClose(lenOk ? 1 : 0, 1, 'clamped swipe respects drag length and max reach');
}

if (failures) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nall tests passed');
}

// Run with: node tests/tests.js
const { side, splitPolygon, polygonArea } = require('../js/shared/engine.js');

let failures = 0;
function assertClose(actual, expected, label, tol = 1e-6) {
  if (Math.abs(actual - expected) > tol) {
    failures++;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// shoelace, on shapes simple enough to check by hand
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

// which side of a line a point falls on
const a = { x: 0, y: 0 };
const b = { x: 1, y: 0 }; // so a to b is the x-axis
assertClose(Math.sign(side(a, b, { x: 0.5, y: 1 })), 1, 'point above x-axis → +');
assertClose(Math.sign(side(a, b, { x: 0.5, y: -1 })), -1, 'point below x-axis → −');
assertClose(side(a, b, { x: 7, y: 0 }), 0, 'point on the line → 0');

// splitting, again on cases with known answers

// x = 0.25 through the unit square should give 0.25 and 0.75
{
  const [p1, p2] = splitPolygon(square, { x: 0.25, y: -5 }, { x: 0.25, y: 5 });
  const areas = [Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2))].sort();
  assertClose(areas[0], 0.25, 'square cut at x=0.25: small piece');
  assertClose(areas[1], 0.75, 'square cut at x=0.25: large piece');
}

// straight through two opposite corners gives two triangles of 0.5
{
  const [p1, p2] = splitPolygon(square, { x: 0, y: 0 }, { x: 1, y: 1 });
  assertClose(Math.abs(polygonArea(p1)), 0.5, 'diagonal through vertices: piece 1');
  assertClose(Math.abs(polygonArea(p2)), 0.5, 'diagonal through vertices: piece 2');
}

// a line that misses completely leaves one whole piece and one empty one
{
  const [p1, p2] = splitPolygon(square, { x: 5, y: 0 }, { x: 5, y: 1 });
  const areas = [Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2))].sort();
  assertClose(areas[0], 0, 'miss: empty piece has zero area');
  assertClose(areas[1], 1, 'miss: other piece is the whole square');
}

// a line lying along an edge grazes it and takes nothing off
{
  const [p1, p2] = splitPolygon(square, { x: -3, y: 0 }, { x: 5, y: 0 });
  const areas = [Math.abs(polygonArea(p1)), Math.abs(polygonArea(p2))].sort();
  assertClose(areas[0], 0, 'edge graze: nothing cut off');
  assertClose(areas[1], 1, 'edge graze: whole square intact');
}

// The real test: throw random cuts at random polygons and check the pieces still add up.
// Same generation the game uses, just without the canvas.
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

// Cuts that go exactly through two of the polygon's own vertices.
// This is where floating point normally falls over, so it's worth hammering.
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

// Food sprites have to hold three things at once.
// Each one is a single connected blob, its traced outline covers at least as much area as it has pixels, and cutting it conserves area.
// The outline is normally exactly equal, the donut being the exception since its hole ends up inside the outline.
// Roughening is random every serving, so all of it gets rechecked on 25 fresh versions of every food.
const { FOODS, buildSprite, roughenSprite, FOOD_N } = require('../js/shared/foods.js');

// gives back what went wrong, or null if the sprite is fine
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

// 1D strings: cuts conserve arc length, and the queries do what they claim
const {
  buildString,
  nearestOnPolyline,
  swipeCrossings,
  polylineSwipeCut,
  clampSwipe,
  cutPolyline,
} = require('../js/1d/strings.js');

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

  // a swipe nowhere near the string shouldn't cut anything
  const s = buildString(400, 300);
  const miss = polylineSwipeCut(s.pts, { x: 5000, y: 5000 }, { x: 5010, y: 5010 });
  assertClose(miss === null ? 1 : 0, 1, 'far-away swipe misses the string');

  // The endpoints sit on opposite sides of the origin.
  // So a swipe through the centre has to cross it, going either vertically or horizontally.
  const hit =
    polylineSwipeCut(s.pts, { x: 0, y: -1000 }, { x: 0, y: 1000 }) ||
    polylineSwipeCut(s.pts, { x: -1000, y: 0 }, { x: 1000, y: 0 });
  assertClose(hit ? 1 : 0, 1, 'center cross-swipe hits the string');
  const near = nearestOnPolyline(s.pts, s.pts[Math.floor(s.pts.length / 2)]);
  assertClose(near.dist, 0, 'nearest point to an on-string point is itself', 1e-9);

  // The clamped swipe can never cross twice, and it has to stay inside both the actual drag length and the max reach.
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

// 3D solids: the clipping and volume maths has to be exact, not close
const S3 = require('../js/3d/solids.js');

{
  assertClose(S3.polyVolume(S3.boxPoly(0, 0, 0, 1, 1, 1)), 1, 'unit box volume = 1');
  const clipped = S3.clipConvex(S3.boxPoly(0, 0, 0, 1, 1, 1), { x: 1, y: 0, z: 0 }, 0.25);
  assertClose(S3.polyVolume(clipped), 0.75, 'box clipped at x>=0.25 → 0.75');
  const diag = S3.clipConvex(
    S3.boxPoly(0, 0, 0, 1, 1, 1),
    S3.v3.norm({ x: 1, y: 1, z: 0 }),
    0.9 * Math.SQRT1_2
  );
  assertClose(S3.polyVolume(diag), 0.595, 'diagonal box clip → 0.595');

  // random clips conserve volume, and agree with integrating it numerically
  let worstSum = 0;
  let worstNumeric = 0;
  for (let i = 0; i < 300; i++) {
    const n = S3.v3.norm({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
    const d = (Math.random() - 0.5) * 1.2;
    const box = S3.boxPoly(0, 0, 0, 1, 1, 1);
    const p = S3.clipConvex(box, n, d);
    const q = S3.clipConvex(box, { x: -n.x, y: -n.y, z: -n.z }, -d);
    const vp = p ? S3.polyVolume(p) : 0;
    worstSum = Math.max(worstSum, Math.abs(vp + (q ? S3.polyVolume(q) : 0) - 1));
    if (i < 15) {
      let inside = 0;
      const K = 24;
      for (let a = 0; a < K; a++) {
        for (let b = 0; b < K; b++) {
          for (let c = 0; c < K; c++) {
            const pt = { x: (a + 0.5) / K, y: (b + 0.5) / K, z: (c + 0.5) / K };
            if (S3.v3.dot(n, pt) - d >= 0) inside++;
          }
        }
      }
      worstNumeric = Math.max(worstNumeric, Math.abs(vp - inside / (K * K * K)));
    }
  }
  assertClose(worstSum, 0, '300 random box clips conserve volume (worst)', 1e-9);
  assertClose(worstNumeric < 0.012 ? 1 : 0, 1, 'clip volumes match numeric integration');

  // same for the lumpy random solids
  let worstMesh = 0;
  for (let i = 0; i < 100; i++) {
    const solid = S3.buildSolid();
    const totalV = S3.meshVolume(solid.verts, solid.tris);
    const plane = {
      n: S3.v3.norm({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }),
      d: (Math.random() - 0.5) * 0.8,
    };
    const sv = S3.meshSideVolumes(solid.verts, solid.tris, plane);
    worstMesh = Math.max(worstMesh, Math.abs(sv.plus + sv.minus - totalV), Math.abs(sv.total - totalV));
  }
  assertClose(worstMesh, 0, '100 random solid splits conserve volume (worst)', 1e-9);

  // and for voxel foods, where the total should just be the number of voxels
  let worstVox = 0;
  for (const food of FOODS.slice(0, 5)) {
    const vox = S3.voxelizeCells(buildSprite(food).cells, FOOD_N);
    for (let i = 0; i < 20; i++) {
      const plane = {
        n: S3.v3.norm({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }),
        d: (Math.random() - 0.5) * 8 + 0.0001,
      };
      const sv = S3.voxelSideVolumes(vox.voxels, FOOD_N, plane);
      worstVox = Math.max(worstVox, Math.abs(sv.plus + sv.minus - vox.voxels.length));
    }
  }
  assertClose(worstVox, 0, 'voxel food splits conserve volume (worst)', 1e-6);

  // Turning a swipe into a plane should round-trip.
  // Take a world point on that plane, project it back to the screen, and it should land on the line you drew.
  for (let i = 0; i < 50; i++) {
    const yaw3 = Math.random() * 6;
    const pitch3 = (Math.random() - 0.5) * 2;
    const a = { x: Math.random() * 800, y: Math.random() * 600 };
    const b = { x: Math.random() * 800, y: Math.random() * 600 };
    const plane = S3.planeFromScreenLine(a, b, yaw3, pitch3, 400, 300, 120);
    // unproject the middle of the screen line at depth 0 and it should satisfy the plane
    const mid = { x: ((a.x + b.x) / 2 - 400) / 120, y: ((a.y + b.y) / 2 - 300) / 120, z: 0 };
    const w = S3.viewToWorld(mid, yaw3, pitch3);
    const err = Math.abs(S3.v3.dot(plane.n, w) - plane.d);
    if (err > 1e-9) {
      failures++;
      console.error(`FAIL screen-line plane round-trip: err ${err}`);
      break;
    }
    if (i === 49) console.log('ok   screen-line → world plane round-trips (50 views)');
  }
}

if (failures) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('\nall tests passed');
}

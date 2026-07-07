// The cutting engine: pure geometry, no canvas or DOM,
// so `node tests.js` can run it directly.

const EPS = 1e-9;

// Half-plane test: sign of the cross product (B−A) × (P−A).
// > 0 → P is on one side of the infinite line through A,B; < 0 → the other;
// 0 → P is exactly on the line.
function side(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

// Where the infinite line through A,B crosses the segment P→Q.
// Only valid when P and Q are on opposite sides (s1 and s2 have opposite
// signs), which makes the denominator safely nonzero.
function lineSegmentIntersection(a, b, p, q) {
  const s1 = side(a, b, p);
  const s2 = side(a, b, q);
  const t = s1 / (s1 - s2);
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

// One pass of Sutherland–Hodgman against a single half-plane.
// keepSign +1 keeps points where side() >= 0, −1 keeps the other side.
// Points within EPS of the line count as inside for BOTH passes, so a cut
// through a vertex puts that vertex in both pieces (and areas still sum).
function clipHalfPlane(points, a, b, keepSign) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const sp = side(a, b, p) * keepSign;
    const sq = side(a, b, q) * keepSign;
    if (sp >= -EPS) out.push(p);
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      out.push(lineSegmentIntersection(a, b, p, q));
    }
  }
  return out;
}

// Split a polygon by the infinite line through A,B → [piece, piece].
// If the line misses the polygon, one piece is the whole polygon and the
// other is empty (fewer than 3 vertices).
function splitPolygon(points, a, b) {
  return [clipHalfPlane(points, a, b, 1), clipHalfPlane(points, a, b, -1)];
}

// Shoelace formula. Positive for our winding convention; callers that only
// care about size should Math.abs() it.
function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

if (typeof module !== 'undefined') {
  module.exports = { side, lineSegmentIntersection, splitPolygon, polygonArea };
}

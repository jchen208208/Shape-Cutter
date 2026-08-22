// The cutting engine. Pure geometry, no canvas and no DOM, so the tests can require it directly.

const EPS = 1e-9;

// Which side of the line AB the point P is on, via the sign of the cross product (B−A) × (P−A).
// Zero means P is sitting exactly on the line.
function side(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

// Where the line AB crosses the segment PQ.
// Only call this when P and Q are on opposite sides, which is what keeps the denominator away from zero.
function lineSegmentIntersection(a, b, p, q) {
  const s1 = side(a, b, p);
  const s2 = side(a, b, q);
  const t = s1 / (s1 - s2);
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

// One Sutherland-Hodgman pass against a single half-plane.
// keepSign of +1 keeps everything where side() >= 0, and −1 keeps the other half.
// Anything within EPS of the line counts as inside on both passes, so cutting straight through a vertex puts it in both pieces and the areas still add up.
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

// Split a polygon along the line AB.
// If the line misses entirely you get the whole polygon back as one piece and fewer than 3 vertices as the other.
function splitPolygon(points, a, b) {
  return [clipHalfPlane(points, a, b, 1), clipHalfPlane(points, a, b, -1)];
}

// Shoelace. Comes out positive for the winding we use, so Math.abs it if you only want the size.
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

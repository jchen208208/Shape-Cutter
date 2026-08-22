// 1D geometry: random strings, arc length, nearest-point and crossing queries, and the cut itself.
// A string is just an open curve stored as a dense polyline.
// Pure, no canvas and no DOM, so the tests can require it directly.

// Catmull-Rom between p1 and p2, with p0 and p3 as the neighbours on either side
function catmullSample(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// smooth curve through all the control points, sampled densely enough to treat as straight segments
function smoothChain(ctrl, perSegment) {
  const ext = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const pts = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    for (let s = 0; s < perSegment; s++) {
      pts.push(catmullSample(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], s / perSegment));
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  return pts;
}

// running arc length at each point, so cum[0] is 0 and the last one is the total
function polylineCum(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { cum, total: cum[cum.length - 1] };
}

// A random string centred on the origin and fitting inside a w by h box.
// Usually a wavy spline, occasionally just a straight segment, and rotated at random either way.
function buildString(w, h) {
  let ctrl = [];
  if (Math.random() < 0.2) {
    for (let i = 0; i < 4; i++) {
      ctrl.push({ x: -w / 2 + (i / 3) * w, y: 0 });
    }
  } else {
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      ctrl.push({
        x: -w / 2 + (i / (n - 1)) * w + (Math.random() - 0.5) * (w / n) * 0.8,
        y: (Math.random() - 0.5) * h,
      });
    }
  }
  const th = Math.random() * Math.PI;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  ctrl = ctrl.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));

  const pts = smoothChain(ctrl, 40);
  const { cum, total } = polylineCum(pts);
  return { pts, cum, total };
}

// nearest point on the polyline to p, plus which segment it landed on
function nearestOnPolyline(pts, p) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x;
    const ay = pts[i].y;
    const dx = pts[i + 1].x - ax;
    const dy = pts[i + 1].y - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - ax) * dx + (p.y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const dist = Math.hypot(p.x - qx, p.y - qy);
    if (!best || dist < best.dist) {
      best = { dist, index: i, t, point: { x: qx, y: qy } };
    }
  }
  return best;
}

// every place the swipe AB crosses the string, in the order the swipe hits them
function swipeCrossings(pts, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const hits = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const pqx = q.x - p.x;
    const pqy = q.y - p.y;
    const denom = abx * pqy - aby * pqx;
    if (Math.abs(denom) < 1e-12) continue; // parallel, so no crossing
    const u = ((p.x - a.x) * pqy - (p.y - a.y) * pqx) / denom; // along swipe
    const v = ((p.x - a.x) * aby - (p.y - a.y) * abx) / -denom; // along segment
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    hits.push({ u, index: i, t: v, point: { x: p.x + v * pqx, y: p.y + v * pqy } });
  }
  hits.sort((m, n) => m.u - n.u);
  return hits;
}

// the first place the swipe crosses the string, or null if it misses
function polylineSwipeCut(pts, a, b) {
  return swipeCrossings(pts, a, b)[0] || null;
}

// How much of the swipe actually counts.
// It's capped at maxLen and stopped halfway between the first and second crossing.
// That's what stops a single swipe cutting two strands of a tangled string at once.
function clampSwipe(pts, a, b, maxLen) {
  const raw = Math.hypot(b.x - a.x, b.y - a.y);
  if (raw < 1e-9) return { end: { x: b.x, y: b.y }, len: 0 };
  const ux = (b.x - a.x) / raw;
  const uy = (b.y - a.y) / raw;
  let len = Math.min(raw, maxLen);
  let end = { x: a.x + ux * len, y: a.y + uy * len };
  const hits = swipeCrossings(pts, a, end);
  if (hits.length >= 2) {
    len = ((hits[0].u + hits[1].u) / 2) * len;
    end = { x: a.x + ux * len, y: a.y + uy * len };
  }
  return { end, len };
}

// cut at the given segment and position along it, giving back two polylines and their lengths
function cutPolyline(pts, cum, index, t) {
  const p = pts[index];
  const q = pts[index + 1];
  const cutPt = { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
  const segLen = Math.hypot(q.x - p.x, q.y - p.y);
  const len1 = cum[index] + t * segLen;
  const total = cum[cum.length - 1];
  const tanLen = segLen || 1;
  return {
    p1: [...pts.slice(0, index + 1), cutPt],
    p2: [cutPt, ...pts.slice(index + 1)],
    len1,
    len2: total - len1,
    point: cutPt,
    tangent: { x: (q.x - p.x) / tanLen, y: (q.y - p.y) / tanLen },
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildString,
    polylineCum,
    nearestOnPolyline,
    swipeCrossings,
    polylineSwipeCut,
    clampSwipe,
    cutPolyline,
  };
}

// 1D geometry: random strings (open curves as dense polylines), arc length,
// nearest-point and swipe-crossing queries, and cutting. Pure — no canvas or
// DOM — so `node tests.js` can run it directly.

// Catmull-Rom interpolation between p1 and p2 (p0, p3 are neighbors)
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

// smooth open curve through the control points, sampled densely
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

// cumulative arc length at each point; cum[0] = 0, cum[n-1] = total
function polylineCum(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { cum, total: cum[cum.length - 1] };
}

// A random string centered on the origin, fitting in a w×h box:
// mostly wavy splines, sometimes a straight segment, randomly rotated.
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

// closest point on the polyline to p → { dist, index, t, point }
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

// where segment A→B first crosses the polyline (nearest crossing to A),
// or null if it never does. First contact cuts — so a swipe across a
// tangled string still yields exactly one cut point.
function polylineSwipeCut(pts, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const pqx = q.x - p.x;
    const pqy = q.y - p.y;
    const denom = abx * pqy - aby * pqx;
    if (Math.abs(denom) < 1e-12) continue; // parallel
    const u = ((p.x - a.x) * pqy - (p.y - a.y) * pqx) / denom; // along swipe
    const v = ((p.x - a.x) * aby - (p.y - a.y) * abx) / -denom; // along segment
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    if (!best || u < best.u) {
      best = { u, index: i, t: v, point: { x: p.x + v * pqx, y: p.y + v * pqy } };
    }
  }
  return best;
}

// cut at segment `index`, parameter `t` → two polylines and their lengths
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
  module.exports = { buildString, polylineCum, nearestOnPolyline, polylineSwipeCut, cutPolyline };
}

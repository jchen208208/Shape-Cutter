// 3D geometry: vectors, convex polyhedron clipping and volume, random
// star-shaped solids, voxelized food sprites, and plane-splitting with exact
// volumes. Pure — no canvas or DOM — so `node tests.js` can run it directly.
//
// Planes are { n, d } with the surface at dot(n, x) = d; the "+" side keeps
// dot(n, x) >= d. Convex polyhedra are { verts: [{x,y,z}], faces: [[i,...]] }
// with faces wound outward (positive signed volume).

const EPS3 = 1e-9;

const v3 = {
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  len: (a) => Math.hypot(a.x, a.y, a.z),
  norm: (a) => {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  },
  lerp: (a, b, t) => ({
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
    z: a.z + t * (b.z - a.z),
  }),
};

// signed volume of a closed, outward-wound polyhedron (divergence theorem:
// fan each face into triangles, sum dot(a, cross(b, c)) / 6)
function polyVolume(poly) {
  let v6 = 0;
  for (const f of poly.faces) {
    const a = poly.verts[f[0]];
    for (let k = 1; k < f.length - 1; k++) {
      v6 += v3.dot(a, v3.cross(poly.verts[f[k]], poly.verts[f[k + 1]]));
    }
  }
  return v6 / 6;
}

// axis-aligned box as a convex polyhedron
function boxPoly(x0, y0, z0, x1, y1, z1) {
  return {
    verts: [
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    ],
    faces: [
      [0, 3, 2, 1], // z0
      [4, 5, 6, 7], // z1
      [0, 1, 5, 4], // y0
      [3, 7, 6, 2], // y1
      [0, 4, 7, 3], // x0
      [1, 2, 6, 5], // x1
    ],
  };
}

// Clip a convex polyhedron, keeping dot(n, x) >= d. Each face is clipped
// Sutherland–Hodgman style; the directed exit→entry chords land on the
// plane and chain into the cap face. Returns null if nothing remains.
// Precondition: the plane must not pass exactly through a vertex (the cap
// chain skips on-plane vertices). Fine here — game planes come from
// freehand swipes, never snapped to geometry.
function clipConvex(poly, n, d) {
  const dist = poly.verts.map((v) => v3.dot(n, v) - d);
  if (dist.every((x) => x >= -EPS3)) return poly;
  if (dist.every((x) => x <= EPS3)) return null;

  const verts = [];
  const keptIdx = new Map();
  const edgeCut = new Map();
  const keep = (i) => {
    if (!keptIdx.has(i)) {
      verts.push(poly.verts[i]);
      keptIdx.set(i, verts.length - 1);
    }
    return keptIdx.get(i);
  };
  const cutAt = (i, j) => {
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    if (!edgeCut.has(key)) {
      const t = dist[i] / (dist[i] - dist[j]);
      verts.push(v3.lerp(poly.verts[i], poly.verts[j], t));
      edgeCut.set(key, verts.length - 1);
    }
    return edgeCut.get(key);
  };

  const faces = [];
  // Cap loop: each clipped face's boundary traverses its chord exit→entry,
  // so the cap face (sharing those chords, wound outward) must traverse
  // them entry→exit.
  const capNext = new Map();
  for (const face of poly.faces) {
    const out = [];
    let entry = -1;
    let exit = -1;
    for (let k = 0; k < face.length; k++) {
      const i = face[k];
      const j = face[(k + 1) % face.length];
      if (dist[i] >= -EPS3) out.push(keep(i));
      if ((dist[i] > EPS3 && dist[j] < -EPS3) || (dist[i] < -EPS3 && dist[j] > EPS3)) {
        const c = cutAt(i, j);
        out.push(c);
        if (dist[i] > EPS3) exit = c;
        else entry = c;
      }
    }
    if (out.length >= 3) faces.push(out);
    if (entry >= 0 && exit >= 0) capNext.set(entry, exit);
  }

  if (capNext.size >= 3) {
    const start = capNext.keys().next().value;
    const loop = [start];
    let cur = capNext.get(start);
    let guard = 0;
    while (cur !== undefined && cur !== start && guard++ <= capNext.size) {
      loop.push(cur);
      cur = capNext.get(cur);
    }
    if (loop.length >= 3) faces.push(loop);
  }
  if (faces.length < 3) return null;
  return { verts, faces };
}

// --- random star-shaped solids ---

// octahedron subdivided `level` times, projected to the unit sphere
function baseSphere(level) {
  let verts = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ];
  let tris = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ];
  for (let l = 0; l < level; l++) {
    const mid = new Map();
    const midpoint = (i, j) => {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      if (!mid.has(key)) {
        verts.push(
          v3.norm({
            x: (verts[i].x + verts[j].x) / 2,
            y: (verts[i].y + verts[j].y) / 2,
            z: (verts[i].z + verts[j].z) / 2,
          })
        );
        mid.set(key, verts.length - 1);
      }
      return mid.get(key);
    };
    const next = [];
    for (const [a, b, c] of tris) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    tris = next;
  }
  return { verts, tris };
}

// A random lumpy solid: per-vertex radii, smoothed so it stays star-shaped
// around the origin (which makes the volume math below exact).
function buildSolid() {
  const { verts, tris } = baseSphere(2);
  let r = verts.map(() => 0.65 + Math.random() * 0.7);

  const nbrs = verts.map(() => new Set());
  for (const [a, b, c] of tris) {
    nbrs[a].add(b).add(c);
    nbrs[b].add(a).add(c);
    nbrs[c].add(a).add(b);
  }
  for (let pass = 0; pass < 2; pass++) {
    r = r.map((ri, i) => {
      let sum = 0;
      for (const j of nbrs[i]) sum += r[j];
      return 0.4 * ri + (0.6 * sum) / nbrs[i].size;
    });
  }

  const sx = 0.8 + Math.random() * 0.4;
  const sy = 0.8 + Math.random() * 0.4;
  const sz = 0.8 + Math.random() * 0.4;
  return {
    verts: verts.map((v, i) => ({ x: v.x * r[i] * sx, y: v.y * r[i] * sy, z: v.z * r[i] * sz })),
    tris,
  };
}

// volume of a closed outward-wound triangle mesh
function meshVolume(verts, tris) {
  let v6 = 0;
  for (const [a, b, c] of tris) {
    v6 += v3.dot(verts[a], v3.cross(verts[b], verts[c]));
  }
  return v6 / 6;
}

// exact volumes on both sides of a plane, by clipping the center-fan
// tetrahedra of a star-shaped mesh
function meshSideVolumes(verts, tris, plane) {
  const o = { x: 0, y: 0, z: 0 };
  let plus = 0;
  let total = 0;
  for (const [a, b, c] of tris) {
    const tet = {
      verts: [o, verts[a], verts[b], verts[c]],
      faces: [[1, 2, 3], [0, 2, 1], [0, 3, 2], [0, 1, 3]],
    };
    total += polyVolume(tet);
    const clipped = clipConvex(tet, plane.n, plane.d);
    if (clipped) plus += polyVolume(clipped);
  }
  return { plus, minus: total - plus, total };
}

// clip a triangle mesh to one side of a plane for display: returns the
// surviving surface polygons plus the cap loop(s) across the cut
function clipMeshBySide(verts, tris, plane, side) {
  const n = side > 0 ? plane.n : { x: -plane.n.x, y: -plane.n.y, z: -plane.n.z };
  const d = side > 0 ? plane.d : -plane.d;
  const polys = [];
  const chords = new Map(); // exit key → { from, to } points on the plane
  const keyOf = (p) => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;

  for (const [a, b, c] of tris) {
    const pts = [verts[a], verts[b], verts[c]];
    const dist = pts.map((p) => v3.dot(n, p) - d);
    if (dist.every((x) => x <= EPS3)) continue;
    if (dist.every((x) => x >= -EPS3)) {
      polys.push(pts);
      continue;
    }
    const out = [];
    let entry = null;
    let exit = null;
    for (let k = 0; k < 3; k++) {
      const i = k;
      const j = (k + 1) % 3;
      if (dist[i] >= -EPS3) out.push(pts[i]);
      if ((dist[i] > EPS3 && dist[j] < -EPS3) || (dist[i] < -EPS3 && dist[j] > EPS3)) {
        const t = dist[i] / (dist[i] - dist[j]);
        const p = v3.lerp(pts[i], pts[j], t);
        out.push(p);
        if (dist[i] > EPS3) exit = p;
        else entry = p;
      }
    }
    if (out.length >= 3) polys.push(out);
    if (entry && exit) chords.set(keyOf(exit), { from: exit, to: entry });
  }

  const caps = [];
  while (chords.size) {
    const first = chords.values().next().value;
    chords.delete(keyOf(first.from));
    const loop = [first.from];
    let cur = first.to;
    let guard = 0;
    while (guard++ < 10000) {
      const nextChord = chords.get(keyOf(cur));
      if (!nextChord) break;
      loop.push(cur);
      chords.delete(keyOf(cur));
      cur = nextChord.to;
    }
    if (loop.length >= 3) caps.push(loop);
  }
  return { polys, caps };
}

// --- voxel foods: extrude a 24×24 pixel sprite into blocky 3D ---

// depth per column from its distance to the silhouette edge → chunky dome
function voxelizeCells(cells, N) {
  const dist = Array.from({ length: N }, () => Array(N).fill(-1));
  const queue = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const emptyNbr =
        cells[y][x] !== null &&
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx < 0 || nx >= N || ny < 0 || ny >= N || cells[ny][nx] === null;
        });
      if (emptyNbr) {
        dist[y][x] = 1;
        queue.push([x, y]);
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = queue[q];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < N && ny >= 0 && ny < N && cells[ny][nx] !== null && dist[ny][nx] < 0) {
        dist[ny][nx] = dist[y][x] + 1;
        queue.push([nx, ny]);
      }
    }
  }

  const voxels = [];
  const lookup = new Set();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (cells[y][x] === null) continue;
      const h = Math.min(dist[y][x], 4); // half-thickness, capped
      for (let z = -h; z < h; z++) {
        voxels.push({ x, y, z, c: cells[y][x] });
        lookup.add(`${x},${y},${z}`);
      }
    }
  }
  return { voxels, lookup };
}

// centered world position of a voxel's low corner (grid → world units)
function voxelCorner(vox, N) {
  return { x: vox.x - N / 2, y: vox.y - N / 2, z: vox.z };
}

// exact volumes on both sides of a plane: whole cubes counted directly,
// straddling cubes clipped exactly
function voxelSideVolumes(voxels, N, plane) {
  let plus = 0;
  for (const vox of voxels) {
    const c = voxelCorner(vox, N);
    let above = 0;
    let below = 0;
    for (let i = 0; i < 8; i++) {
      const p = {
        x: c.x + (i & 1 ? 1 : 0),
        y: c.y + (i & 2 ? 1 : 0),
        z: c.z + (i & 4 ? 1 : 0),
      };
      const s = v3.dot(plane.n, p) - plane.d;
      if (s >= 0) above++;
      else below++;
    }
    if (below === 0) plus += 1;
    else if (above > 0) {
      const clipped = clipConvex(
        boxPoly(c.x, c.y, c.z, c.x + 1, c.y + 1, c.z + 1),
        plane.n,
        plane.d
      );
      if (clipped) plus += polyVolume(clipped);
    }
  }
  return { plus, minus: voxels.length - plus, total: voxels.length };
}

// --- view rotations (orbit camera: yaw around Y, then pitch around X) ---

function rotY(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotX(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function worldToView(p, yaw, pitch) {
  return rotX(rotY(p, yaw), pitch);
}

function viewToWorld(p, yaw, pitch) {
  return rotY(rotX(p, -pitch), -yaw);
}

// The cutting plane from a screen-space swipe: the line the player drew,
// extruded straight along the view direction — you slice what you see.
// a, b are canvas points; cx, cy, S are the projection center and scale.
function planeFromScreenLine(a, b, yaw, pitch, cx, cy, S) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const m = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }; // screen normal
  const nView = { x: m.x, y: m.y, z: 0 };
  return {
    n: viewToWorld(nView, yaw, pitch),
    d: (m.x * (a.x - cx) + m.y * (a.y - cy)) / S,
    screenNormal: m,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    v3,
    polyVolume,
    boxPoly,
    clipConvex,
    baseSphere,
    buildSolid,
    meshVolume,
    meshSideVolumes,
    clipMeshBySide,
    voxelizeCells,
    voxelCorner,
    voxelSideVolumes,
    rotY,
    rotX,
    worldToView,
    viewToWorld,
    planeFromScreenLine,
  };
}

// 3D shape mode: random lumpy star-shaped solids for the shell in threed.js.

const SOLID_COLORS = ['#e94560', '#f5a623', '#8fbf58', '#5f85db', '#ee87b2'];

function makeTarget3D() {
  const solid = buildSolid();
  let radius = 0;
  for (const v of solid.verts) radius = Math.max(radius, Math.hypot(v.x, v.y, v.z));
  return {
    kind: 'mesh',
    verts: solid.verts,
    tris: solid.tris,
    color: SOLID_COLORS[Math.floor(Math.random() * SOLID_COLORS.length)],
    radius,
  };
}

// 3D food mode: the 2D pixel sprites extruded into voxel models — same
// foods, same palette, now with volume.

function makeTarget3D() {
  const sprite = roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]));
  const { voxels, lookup } = voxelizeCells(sprite.cells, FOOD_N);
  return { kind: 'voxel', voxels, lookup, N: FOOD_N, radius: FOOD_N * 0.62 };
}

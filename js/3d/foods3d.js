// 3D food mode: the same pixel sprites as the 2D game, extruded into voxels.
// Same foods and same palette, just with a thickness now.

function makeTarget3D() {
  const sprite = roughenSprite(buildSprite(FOODS[Math.floor(Math.random() * FOODS.length)]));
  const { voxels, lookup } = voxelizeCells(sprite.cells, FOOD_N);
  return { kind: 'voxel', voxels, lookup, N: FOOD_N, radius: FOOD_N * 0.62 };
}

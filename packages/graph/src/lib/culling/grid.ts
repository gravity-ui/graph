/**
 * Grid math shared by world-space spatial structures: the tree's tile index and the batch scenes.
 * Tile coordinates are clamped to [-TILE_OFFSET, TILE_OFFSET) so cell keys stay small non-negative integers (fast Map
 * keys). Items beyond that range share the border tiles, which stays correct.
 */
export const TILE_OFFSET = 2 ** 14;

const TILE_STRIDE = 2 ** 15;

/** Index of the tile of `size` world units that contains the coordinate, clamped to the supported range. */
export function toTile(value: number, size: number): number {
  const tile = Math.floor(value / size);
  return Math.max(-TILE_OFFSET, Math.min(TILE_OFFSET - 1, tile));
}

/** Integer key of a tile; keys are ordered by x first, then by y. */
export function cellKey(tx: number, ty: number): number {
  return (tx + TILE_OFFSET) * TILE_STRIDE + (ty + TILE_OFFSET);
}

export function cellX(key: number): number {
  return Math.floor(key / TILE_STRIDE) - TILE_OFFSET;
}

export function cellY(key: number): number {
  return (key % TILE_STRIDE) - TILE_OFFSET;
}

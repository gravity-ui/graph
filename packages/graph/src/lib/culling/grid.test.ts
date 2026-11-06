import { TILE_OFFSET, cellKey, cellX, cellY, toTile } from "./grid";

test("toTile floors world coordinates and clamps them to the supported range", () => {
  expect(toTile(0, 100)).toBe(0);
  expect(toTile(99.9, 100)).toBe(0);
  expect(toTile(100, 100)).toBe(1);
  expect(toTile(-0.1, 100)).toBe(-1);
  expect(toTile(-1e12, 100)).toBe(-TILE_OFFSET);
  expect(toTile(1e12, 100)).toBe(TILE_OFFSET - 1);
});

test("cell keys round-trip and grow with x first, then y", () => {
  for (const [tx, ty] of [
    [0, 0],
    [-3, 7],
    [TILE_OFFSET - 1, -TILE_OFFSET],
  ]) {
    const key = cellKey(tx, ty);
    expect([cellX(key), cellY(key)]).toEqual([tx, ty]);
  }
  expect(cellKey(-TILE_OFFSET, -TILE_OFFSET)).toBe(0);
  expect(cellKey(0, 5)).toBeLessThan(cellKey(1, -5));
  expect(cellKey(0, 1)).toBeGreaterThan(cellKey(0, 0));
});

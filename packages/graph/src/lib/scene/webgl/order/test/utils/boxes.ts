import type { TTileRect } from "../../../../../culling/TileIndex";

export const box = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });

/** The levels by definition: 1 + the highest level of the earlier boxes that intersect, O(n^2). */
export function bruteForce(boxes: readonly TTileRect[]): number[] {
  const levels: number[] = [];
  boxes.forEach((current, index) => {
    let best = -1;
    for (let other = 0; other < index; other++) {
      const b = boxes[other];
      const hit = !(b.maxX < current.minX || current.maxX < b.minX || b.maxY < current.minY || current.maxY < b.minY);
      if (hit) best = Math.max(best, levels[other]);
    }
    levels.push(best + 1);
  });
  return levels;
}

/** A seeded generator in [0, 1) (Park-Miller): the random tests are repeatable. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

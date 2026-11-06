import type { TTileRect } from "../culling/TileIndex";
import { cellKey, toTile } from "../culling/grid";

import { BatchScene } from "./BatchScene";
import { boundsIntersect, isValidBounds } from "./bounds";
import type { IBatchBackend, IBatchItem, TBatchParams, TPathBounds } from "./types";

const CELL = 256;
const CHUNK = 4;

type TItem = IBatchItem & { id: number; bounds: TPathBounds | undefined; visible: boolean };

/* eslint-disable no-bitwise -- integer hash of a seeded PRNG */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* eslint-enable no-bitwise */

function cellOf(item: TItem): number {
  return isValidBounds(item.bounds) ? cellKey(toTile(item.bounds[0], CELL), toTile(item.bounds[1], CELL)) : -1;
}

test.each([1, 2, 3, 4, 5])("keeps chunks consistent with item cells under random changes (seed %i)", (seed) => {
  const random = mulberry32(seed);
  const draws: TItem[][] = [];
  const backend: IBatchBackend<TItem, TItem[], null> = {
    build: (items) => items.slice(),
    draw: (_target, resource) => {
      draws.push(resource);
    },
  };
  const scene = new BatchScene(backend, { cellSize: CELL, chunkSize: CHUNK });
  const registered = new Map<TItem, TBatchParams>();
  const pool: TItem[] = Array.from({ length: 120 }, (_, id) => ({
    id,
    bounds: undefined,
    visible: true,
    getPathBounds(): TPathBounds | undefined {
      return this.bounds;
    },
    isPathVisible(): boolean {
      return this.visible;
    },
  }));
  const randomBounds = (): TPathBounds | undefined => {
    if (random() < 0.1) return undefined;
    const x = random() * 2000 - 1000;
    const y = random() * 2000 - 1000;
    // Mostly short items, some spanning many cells.
    const long = random() < 0.2;
    return [x, y, x + random() * (long ? 1500 : 60), y + random() * (long ? 1500 : 60)];
  };
  const randomParams = (): TBatchParams => ({ zIndex: random() < 0.5 ? 0 : 1, group: random() < 0.5 ? "a" : "b" });

  for (let step = 0; step < 400; step++) {
    const item = pool[Math.floor(random() * pool.length)];
    const action = random();
    if (!registered.has(item) || action < 0.15) {
      item.bounds = randomBounds();
      const params = randomParams();
      scene.add(item, params);
      registered.set(item, params);
    } else if (action < 0.3) {
      scene.delete(item);
      registered.delete(item);
    } else if (action < 0.6) {
      item.bounds = randomBounds();
      if (random() < 0.5) scene.markDirty(item);
      else scene.markBoundsDirty(item);
    } else if (action < 0.75) {
      item.visible = !item.visible;
      scene.markDirty(item);
    } else {
      const params = randomParams();
      scene.update(item, params);
      registered.set(item, params);
    }

    if (step % 20 !== 19) continue;

    // Without a viewport every chunk with visible items is drawn: each visible item exactly once.
    draws.length = 0;
    scene.render(null);
    const seen = new Map<TItem, number>();
    for (const chunk of draws) {
      expect(chunk.length).toBeGreaterThan(0);
      expect(chunk.length).toBeLessThanOrEqual(CHUNK);
      const params = registered.get(chunk[0]);
      for (const entry of chunk) {
        seen.set(entry, (seen.get(entry) ?? 0) + 1);
        expect(registered.get(entry)).toEqual(params);
        expect(cellOf(entry)).toBe(cellOf(chunk[0]));
        expect(entry.visible).toBe(true);
      }
    }
    for (const [entry] of registered) {
      expect(seen.get(entry) ?? 0).toBe(entry.visible ? 1 : 0);
    }

    // With a viewport, every visible item that intersects it is drawn.
    const x = random() * 2000 - 1000;
    const y = random() * 2000 - 1000;
    const viewport: TTileRect = { minX: x, minY: y, maxX: x + 300, maxY: y + 200 };
    draws.length = 0;
    scene.render(null, viewport);
    const drawn = new Set(draws.flat());
    for (const [entry] of registered) {
      if (entry.visible && boundsIntersect(entry.bounds, viewport)) expect(drawn.has(entry)).toBe(true);
    }
  }
});

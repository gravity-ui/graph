import { BatchScene } from "../../../../lib/batch/BatchScene";
import type { IBatchBackend, IBatchItem, TBatchParams, TPathBounds } from "../../../../lib/batch/types";

import { ZLevelBatch } from "./ZLevelBatch";

type TItem = IBatchItem & { id: string };

const item = (id: string): TItem => ({
  id,
  getPathBounds: (): TPathBounds => [0, 0, 10, 10],
});

function setup(): { batch: ZLevelBatch<TItem, number, void>; builds: string[][] } {
  const builds: string[][] = [];
  const backend: IBatchBackend<TItem, number, void> = {
    build: (items) => builds.push(items.map(({ id }) => id)),
    draw: () => undefined,
  };
  const batch = new ZLevelBatch(new BatchScene(backend, { cellSize: 1000, chunkSize: 10 }));
  return { batch, builds };
}

describe("ZLevelBatch", () => {
  it("chunks items by z-level only and keeps their own params", () => {
    const { batch, builds } = setup();
    const [a, b, c] = [item("a"), item("b"), item("c")];
    batch.add(a, { zIndex: 1, group: "red/2" });
    batch.add(b, { zIndex: 1, group: "blue/4/dash" });
    batch.add(c, { zIndex: 2, group: "red/2" });
    batch.render(undefined);
    // Two styles share a chunk; two z-levels do not.
    expect(builds).toEqual([["a", "b"], ["c"]]);

    const seen = new Map<string, TBatchParams>();
    batch.forEachItem(({ id }, params) => seen.set(id, params));
    expect(seen).toEqual(
      new Map([
        ["a", { zIndex: 1, group: "red/2" }],
        ["b", { zIndex: 1, group: "blue/4/dash" }],
        ["c", { zIndex: 2, group: "red/2" }],
      ])
    );
  });

  it("rebuilds the chunk in place on a style change and moves the item on a z-level change", () => {
    const { batch, builds } = setup();
    const [a, b, c] = [item("a"), item("b"), item("c")];
    batch.add(a, { zIndex: 1, group: "red" });
    batch.add(b, { zIndex: 1, group: "red" });
    batch.add(c, { zIndex: 2, group: "red" });
    batch.render(undefined);

    builds.length = 0;
    batch.update(a, { zIndex: 1, group: "green" });
    batch.render(undefined);
    expect(builds).toEqual([["a", "b"]]);
    batch.forEachItem((visited, params) => visited === a && expect(params.group).toBe("green"));

    builds.length = 0;
    batch.update(a, { zIndex: 2, group: "green" });
    batch.render(undefined);
    expect(builds).toEqual([["b"], ["c", "a"]]);

    batch.delete(b);
    expect(batch.has(b)).toBe(false);
    expect(batch.has(a)).toBe(true);
  });
});

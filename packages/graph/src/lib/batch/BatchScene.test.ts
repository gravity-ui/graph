import type { TTileRect } from "../culling/TileIndex";

import { BatchScene } from "./BatchScene";
import type { IBatchBackend, IBatchItem, TBatchSceneOptions, TPathBounds } from "./types";

type TItem = IBatchItem & { name: string; bounds: TPathBounds | undefined; visible: boolean };

function item(name: string, bounds?: TPathBounds): TItem {
  return {
    name,
    bounds,
    visible: true,
    getPathBounds(): TPathBounds | undefined {
      return this.bounds;
    },
    isPathVisible(): boolean {
      return this.visible;
    },
  };
}

const rect = (minX: number, minY: number, maxX: number, maxY: number): TTileRect => ({ minX, minY, maxX, maxY });
const params = { zIndex: 0, group: "g" };

function createScene(options: Partial<TBatchSceneOptions> = {}) {
  const builds: string[][] = [];
  const draws: string[][] = [];
  const released: string[][] = [];
  const onChange = jest.fn();
  const backend: IBatchBackend<TItem, string[], null> = {
    build: (items) => {
      const names = items.map((entry) => entry.name);
      builds.push(names);
      return names;
    },
    draw: (_target, resource) => {
      draws.push(resource);
    },
    release: (resource) => {
      released.push(resource);
    },
  };
  const scene = new BatchScene(backend, { cellSize: 100, chunkSize: 10, onChange, ...options });
  return {
    scene,
    builds,
    released,
    onChange,
    /** Names drawn by each chunk in this frame. */
    render(viewport?: TTileRect): string[][] {
      draws.length = 0;
      scene.render(null, viewport);
      return draws.slice();
    },
  };
}

test("groups items by the cell of their top-left corner and culls by chunk bounds", () => {
  const { scene, render } = createScene();
  scene.add(item("a", [10, 10, 20, 20]), params);
  scene.add(item("b", [150, 10, 160, 20]), params);
  scene.add(item("c", [20, 30, 40, 40]), params);

  expect(render()).toEqual([["a", "c"], ["b"]]);
  expect(render(rect(140, 0, 200, 50))).toEqual([["b"]]);
  expect(render(rect(500, 500, 600, 600))).toEqual([]);
});

test("draws a long item whenever any part of its bounds is in the viewport", () => {
  const { scene, render } = createScene();
  scene.add(item("long", [0, 0, 50, 5000]), params);

  expect(render(rect(0, 2500, 100, 2600))).toEqual([["long"]]);
  expect(render(rect(0, 4990, 100, 5100))).toEqual([["long"]]);
  expect(render(rect(0, 6000, 100, 6100))).toEqual([]);
});

test("never culls items without valid bounds and draws them before cell chunks", () => {
  const { scene, render } = createScene();
  scene.add(item("a", [500, 500, 510, 510]), params);
  for (const [name, bounds] of [
    ["missing", undefined],
    ["nan", [Number.NaN, 0, 1, 1] as const],
    ["inverted", [10, 0, 0, 0] as const],
  ] as const) {
    scene.add(item(name, bounds), params);
  }

  expect(render(rect(0, 0, 100, 100))).toEqual([["missing", "nan", "inverted"]]);
  expect(render()).toEqual([["missing", "nan", "inverted"], ["a"]]);
});

test("fills the last chunk, then the first chunk with room, and removes emptied chunks", () => {
  const { scene, render, released } = createScene({ chunkSize: 2 });
  const items = Object.fromEntries(["a", "b", "c", "d", "e"].map((name) => [name, item(name, [1, 1, 2, 2])]));
  for (const name of ["a", "b", "c"]) scene.add(items[name], params);
  expect(render()).toEqual([["a", "b"], ["c"]]);

  scene.delete(items.a);
  scene.add(items.d, params);
  scene.add(items.e, params);
  expect(render()).toEqual([
    ["b", "e"],
    ["c", "d"],
  ]);

  scene.delete(items.b);
  scene.delete(items.e);
  expect(released).toEqual([["b", "e"]]);
  expect(render()).toEqual([["c", "d"]]);
});

test("orders cells by position, independently of registration order", () => {
  const cells: TPathBounds[] = [
    [0, 150, 10, 160],
    [150, 0, 160, 10],
    [-150, 500, -140, 510],
  ];
  const orders = [
    [0, 1, 2],
    [2, 0, 1],
    [1, 2, 0],
  ];
  const results = orders.map((order) => {
    const { scene, render } = createScene();
    for (const index of order) scene.add(item(String(index), cells[index]), params);
    return render();
  });
  // x-major: (-2, 5), then (0, 1), then (1, 0).
  for (const result of results) expect(result).toEqual([["2"], ["0"], ["1"]]);
});

test("moves an item to its new cell and rebuilds only the two chunks involved", () => {
  const { scene, render, builds } = createScene();
  const a = item("a", [10, 10, 20, 20]);
  const b = item("b", [10, 10, 20, 20]);
  const c = item("c", [210, 10, 220, 20]);
  for (const entry of [a, b, c]) scene.add(entry, params);
  render();
  builds.length = 0;

  a.bounds = [220, 10, 230, 20];
  scene.markBoundsDirty(a);
  expect(render()).toEqual([["b"], ["c", "a"]]);
  expect(builds).toEqual([["b"], ["c", "a"]]);

  builds.length = 0;
  c.bounds = [205, 15, 215, 25];
  scene.markBoundsDirty(c);
  expect(render(rect(200, 0, 300, 100))).toEqual([["c", "a"]]);
  expect(builds).toEqual([]);

  scene.markDirty(c);
  render();
  expect(builds).toEqual([["c", "a"]]);
});

test("applies semantic visibility after markDirty and skips chunks without visible items", () => {
  const { scene, render, builds } = createScene();
  const a = item("a", [10, 10, 20, 20]);
  const b = item("b", [150, 10, 160, 20]);
  scene.add(a, params);
  scene.add(b, params);
  render();
  builds.length = 0;

  a.visible = false;
  scene.markDirty(a);
  expect(render()).toEqual([["b"]]);
  expect(builds).toEqual([]);

  a.visible = true;
  scene.markDirty(a);
  expect(render()).toEqual([["a"], ["b"]]);
});

test("draws z-levels in ascending order and groups in first-registration order", () => {
  const { scene, render } = createScene();
  const a = item("a", [1, 1, 2, 2]);
  scene.add(a, { zIndex: 1, group: "x" });
  scene.add(item("b", [1, 1, 2, 2]), { zIndex: 0, group: "y" });
  scene.add(item("c", [1, 1, 2, 2]), { zIndex: 0, group: "x" });
  scene.add(item("d", [1, 1, 2, 2]), { zIndex: 0, group: "y" });
  expect(render()).toEqual([["b", "d"], ["c"], ["a"]]);

  scene.update(a, { zIndex: 0, group: "y" });
  expect(render()).toEqual([["b", "d", "a"], ["c"]]);
  expect(scene.has(a)).toBe(true);
  scene.delete(a);
  expect(scene.has(a)).toBe(false);
});

test("requests a render for changes that alter the picture", () => {
  const { scene, onChange } = createScene();
  const a = item("a", [1, 1, 2, 2]);
  scene.add(a, params);
  scene.markDirty(a);
  scene.update(a, params);
  expect(onChange).toHaveBeenCalledTimes(3);

  scene.markBoundsDirty(a);
  expect(onChange).toHaveBeenCalledTimes(3);

  scene.delete(a);
  scene.delete(a);
  scene.markDirty(a);
  expect(onChange).toHaveBeenCalledTimes(4);
});

test("rejects cell and chunk sizes it cannot work with", () => {
  for (const cellSize of [0, -1, Number.NaN, Infinity]) {
    expect(() => createScene({ cellSize })).toThrow("cell size");
  }
  for (const chunkSize of [0, Number.NaN]) {
    expect(() => createScene({ chunkSize })).toThrow("chunk size");
  }
  expect(() => createScene({ chunkSize: Infinity })).not.toThrow();
});

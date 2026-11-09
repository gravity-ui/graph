import { SceneStore } from "./SceneStore";
import type { TSceneElementInput } from "./SceneStore";

function input(id: string, patch: Partial<TSceneElementInput> = {}): TSceneElementInput {
  return { id, zIndex: 1, x: 0, y: 0, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, primitives: [], ...patch };
}

const ALL = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };

describe("SceneStore", () => {
  it("returns visible elements that meet the rect, ordered by z-level and then by sequence", () => {
    const store = new SceneStore(100);
    store.add(input("block", { zIndex: 2 }));
    store.add(input("group", { zIndex: 0 }));
    store.add(input("far", { x: 5000, y: 5000 }));
    store.add(input("line"));
    store.add(input("hidden", { hidden: true }));
    expect(store.query({ minX: 0, minY: 0, maxX: 50, maxY: 50 }).map((element) => element.id)).toEqual([
      "group",
      "line",
      "block",
    ]);
  });

  it("puts a raised element last within its z-level", () => {
    const store = new SceneStore();
    store.add(input("a"));
    store.add(input("b"));
    store.raise("a");
    expect(store.query(ALL).map((element) => element.id)).toEqual(["b", "a"]);
  });

  it("finds a moved element at its new place only", () => {
    const store = new SceneStore(100);
    store.add(input("a"));
    store.update("a", { x: 1000, y: 1000 });
    expect(store.query({ minX: 0, minY: 0, maxX: 50, maxY: 50 })).toEqual([]);
    expect(store.query({ minX: 990, minY: 990, maxX: 1020, maxY: 1020 }).map((element) => element.id)).toEqual(["a"]);
  });

  it("forgets deleted elements and rejects duplicate ids", () => {
    const store = new SceneStore();
    store.add(input("a"));
    expect(() => store.add(input("a"))).toThrow("Scene element a already exists");
    store.delete("a");
    expect(store.size).toBe(0);
    expect(store.query(ALL)).toEqual([]);
  });
});

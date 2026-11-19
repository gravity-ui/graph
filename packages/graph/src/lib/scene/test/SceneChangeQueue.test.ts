import { SceneChangeQueue } from "../SceneChangeQueue";
import { SceneStore } from "../SceneStore";
import type { TSceneChange, TSceneElement } from "../types";
import { SceneDepth, movesInDepth } from "../webgl/depth";

describe("SceneChangeQueue", () => {
  const make = (store: SceneStore, id: string): TSceneElement =>
    store.add({ id, zIndex: 200, x: 0, y: 0, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, primitives: [] });
  const shape = (queue: SceneChangeQueue): Array<[string, string, string[] | undefined]> =>
    queue
      .take()
      .map((change) => [change.type, change.element.id, change.fields ? [...change.fields].sort() : undefined]);

  it("keeps an add followed by updates as one add", () => {
    const store = new SceneStore();
    const queue = new SceneChangeQueue();
    const a = make(store, "a");
    queue.push({ type: "add", element: a });
    queue.push({ type: "update", element: a, fields: new Set(["x"]) });
    expect(shape(queue)).toEqual([["add", "a", undefined]]);
    expect(queue.size).toBe(0);
  });

  it("merges the fields of updates; an update without fields means every field", () => {
    const store = new SceneStore();
    const queue = new SceneChangeQueue();
    const a = make(store, "a");
    const b = make(store, "b");
    queue.push({ type: "update", element: a, fields: new Set(["x"]) });
    queue.push({ type: "update", element: b, fields: new Set(["order"]) });
    queue.push({ type: "update", element: a, fields: new Set(["styleId", "x"]) });
    queue.push({ type: "update", element: b });
    expect(shape(queue)).toEqual([
      ["update", "a", ["styleId", "x"]],
      ["update", "b", undefined],
    ]);
  });

  it("drops an add followed by a delete, and turns a delete and a re-add into both", () => {
    const store = new SceneStore();
    const queue = new SceneChangeQueue();
    const a = make(store, "a");
    queue.push({ type: "add", element: a });
    queue.push({ type: "delete", element: a });
    expect(shape(queue)).toEqual([]);
    const b = make(store, "b");
    queue.push({ type: "update", element: b, fields: new Set(["x"]) });
    queue.push({ type: "delete", element: b });
    store.delete("b");
    const again = make(store, "b");
    queue.push({ type: "add", element: again });
    const changes = queue.take();
    expect(changes.map((change) => change.type)).toEqual(["delete", "add"]);
    expect(changes[0].element).toBe(b);
    expect(changes[1].element).toBe(again);
  });

  it("keeps one delete of the original element for a delete, a re-add and a delete", () => {
    const store = new SceneStore();
    const queue = new SceneChangeQueue();
    const a = make(store, "a");
    queue.push({ type: "delete", element: a });
    store.delete("a");
    const again = make(store, "a");
    queue.push({ type: "add", element: again });
    queue.push({ type: "delete", element: again });
    const changes = queue.take();
    expect(changes.map((change) => change.type)).toEqual(["delete"]);
    expect(changes[0].element).toBe(a);
  });

  it("merges a style change into the fields of earlier updates", () => {
    const store = new SceneStore();
    const queue = new SceneChangeQueue();
    make(store, "a");
    store.subscribe((change) => queue.push(change));
    store.update("a", { x: 1 });
    store.setStyle("a", store.defineStyle({ raise: 1 })); // zIndex and styleId
    store.setStyle("a", store.defineStyle({ raise: 1, opacity: 0.5 })); // primitives and styleId
    expect(shape(queue)).toEqual([["update", "a", ["primitives", "styleId", "x", "zIndex"]]]);
  });

  describe("a frame at the depth limits", () => {
    /** 16 bands, the most the depth holds: X shares band 0 with e0, e15 is alone in band 15. */
    function setup(): { store: SceneStore; queue: SceneChangeQueue; depth: SceneDepth } {
      const store = new SceneStore();
      const queue = new SceneChangeQueue();
      const depth = new SceneDepth();
      const add = (id: string, zIndex: number): TSceneElement =>
        store.add({ id, zIndex, x: 0, y: 0, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, primitives: [] });
      for (let z = 0; z < 16; z++) add(`e${z}`, z);
      add("X", 0);
      store.forEach((element) => depth.set(element.id, element.zIndex, element.order));
      depth.takeChanged();
      store.subscribe((change) => queue.push(change));
      return { store, queue, depth };
    }

    /** As the WebGL backend's applyChange records a change in the depth. */
    const record = (depth: SceneDepth, change: TSceneChange): void => {
      if (change.type === "delete") depth.delete(change.element.id);
      else if (change.type === "add" || movesInDepth(change)) {
        depth.set(change.element.id, change.element.zIndex, change.element.order);
      }
    };

    it("emits every delete first, so it fits whenever its changes one by one did", () => {
      const { store, queue, depth } = setup();
      store.update("X", { x: 5 });
      store.delete("e15"); // frees band 15
      store.update("X", { zIndex: 99 }); // takes a new band
      const changes = queue.take();
      expect(() => changes.forEach((change) => record(depth, change))).not.toThrow();
      expect(changes.map((change) => [change.type, change.element.id])).toEqual([
        ["delete", "e15"],
        ["update", "X"],
      ]);
      depth.takeChanged();
      expect(depth.keyOf("X")).toBeGreaterThan(depth.keyOf("e14"));
    });

    it("fits a frame of moves once the moved elements give up their places first", () => {
      const { store, queue, depth } = setup();
      store.update("X", { x: 5 });
      store.update("e15", { zIndex: 0 }); // frees band 15
      store.update("X", { zIndex: 99 }); // takes a new band
      const changes = queue.take();
      // In the order of first change, X takes band 99 while e15 still holds band 15; the failed set changes nothing.
      expect(() => changes.forEach((change) => record(depth, change))).toThrow(RangeError);
      expect(depth.keyOf("X")).toBeLessThan(depth.keyOf("e1"));
      // What WebGLSceneBackend.applyMany does first.
      changes.forEach((change) => {
        if (movesInDepth(change)) depth.release(change.element.id);
      });
      expect(() => changes.forEach((change) => record(depth, change))).not.toThrow();
      depth.takeChanged();
      expect(depth.keyOf("e15")).toBeLessThan(depth.keyOf("e1"));
      expect(depth.keyOf("X")).toBeGreaterThan(depth.keyOf("e14"));
    });
  });
});

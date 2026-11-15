import type { TSceneLevel } from "../../services/scene/types";

import { SceneStore } from "./SceneStore";
import type { TSceneElementInput } from "./SceneStore";
import { LEVEL_BIT } from "./levels";
import type { TSceneChange, TSceneElement, TScenePrimitive, TSceneStyle } from "./types";

function input(id: string, patch: Partial<TSceneElementInput> = {}): TSceneElementInput {
  return { id, zIndex: 1, x: 0, y: 0, bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, primitives: [], ...patch };
}

function element(id: string, zIndex: number): TSceneElementInput {
  return {
    id,
    zIndex,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10 }],
  };
}

const ALL = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };

describe("SceneStore", () => {
  it("returns visible elements that meet the rect, ordered by z-level and then by order", () => {
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

  it("names the second key order and raises it", () => {
    const store = new SceneStore();
    const a = store.add(element("a", 200));
    const b = store.add(element("b", 200));
    expect(a.order).toBeLessThan(b.order);
    store.raise("a");
    expect(store.get("a")?.order).toBeGreaterThan(b.order);
  });

  it("reports changes with the fields that changed", () => {
    const store = new SceneStore();
    const changes: TSceneChange[] = [];
    store.subscribe((change) => changes.push(change));
    store.add(element("a", 200));
    store.update("a", { x: 5 });
    store.setStyle("a", store.defineStyle({ parts: { border: { color: "#ffcc00" } } }));
    store.raise("a");
    store.delete("a");
    expect(changes.map((c) => [c.type, [...(c.fields ?? [])].sort().join(",")])).toEqual([
      ["add", ""],
      ["update", "x"],
      ["update", "styleId"],
      ["update", "order"],
      ["delete", ""],
    ]);
  });

  it("keeps style ids stable and lists styles", () => {
    const store = new SceneStore();
    const before = store.getStyles();
    const selected = store.defineStyle({ parts: { border: { color: "#ffcc00" } } });
    expect(selected).toBe(1); // 0 is the empty default style
    expect(store.getStyles()[selected]).toEqual({ parts: { border: { color: "#ffcc00" } } });
    expect(store.getStyles()).not.toBe(before);
  });

  it("compares elements by zIndex with the style's raise, then by order", () => {
    const store = new SceneStore();
    const a = store.add(input("a", { zIndex: 200 }));
    const b = store.add(input("b", { zIndex: 200 }));
    expect(store.compareOrder(a, b)).toBeLessThan(0);
    store.setStyle("a", store.defineStyle({ raise: 1 }));
    expect(store.compareOrder(a, b)).toBeGreaterThan(0);
  });

  it("raises a group above the others in its current order, one update each", () => {
    const store = new SceneStore();
    const [a, b, c] = ["a", "b", "c"].map((id) => store.add(input(id, { zIndex: 200 })));
    const changed: string[] = [];
    store.subscribe((change) => changed.push(change.element.id));
    store.raiseMany(["b", "a", "missing", "a"]);
    expect([a, b, c].sort((x, y) => store.compareOrder(x, y)).map((element) => element.id)).toEqual(["c", "a", "b"]);
    expect(changed).toEqual(["a", "b"]);
  });

  it("visits every element, hidden ones too", () => {
    const store = new SceneStore();
    store.add(element("a", 1));
    store.add({ ...element("b", 1), hidden: true });
    const ids: string[] = [];
    store.forEach((e) => ids.push(e.id));
    expect(ids.sort()).toEqual(["a", "b"]);
  });
});

describe("style rows", () => {
  const base = {
    id: "a",
    zIndex: 200,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [],
  };

  it("setStyle reports re-encode and raise only when they change", () => {
    const store = new SceneStore();
    const added = store.add(base);
    const red = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    const green = store.defineStyle({ parts: { border: { color: "#00ff00" } } });
    const wide = store.defineStyle({ parts: { border: { width: 5 } }, raise: 1 });
    const fields: string[][] = [];
    store.subscribe((change) => fields.push([...(change.fields ?? [])].sort()));
    store.setStyle("a", red);
    store.setStyle("a", green);
    store.setStyle("a", wide);
    expect(fields).toEqual([["styleId"], ["styleId"], ["primitives", "styleId", "zIndex"]]);
    expect(store.zIndexOf(added)).toBe(201);
  });

  it("query orders by the raised bucket", () => {
    const store = new SceneStore();
    store.add(base);
    store.add({ ...base, id: "b" });
    store.setStyle("a", store.defineStyle({ raise: 1 }));
    expect(store.query({ minX: 0, minY: 0, maxX: 10, maxY: 10 }).map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("replaceStyles re-encodes only elements whose encode key changed", () => {
    const store = new SceneStore();
    store.add(base);
    const row = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    store.setStyle("a", row);
    const fields: string[][] = [];
    store.subscribe((change) => fields.push([...(change.fields ?? [])].sort()));
    const before = store.getStyles();
    store.replaceStyles(new Map([[row, { parts: { border: { color: "#0000ff" } } }]]));
    expect(store.getStyles()).not.toBe(before);
    expect(fields).toEqual([]);
    store.replaceStyles(new Map([[row, { parts: { border: { color: "rgba(0, 0, 255, 0.5)" } } }]]));
    expect(fields).toEqual([["primitives"]]);
  });

  it("notifies style listeners on every row change, table-only ones included", () => {
    const store = new SceneStore();
    store.add(base);
    let notified = 0;
    const unsubscribe = store.subscribeStyles(() => notified++);
    const row = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    expect(notified).toBe(1);
    store.setStyle("a", row);
    store.replaceStyles(new Map([[row, { parts: { border: { color: "#0000ff" } } }]]));
    expect(notified).toBe(2);
    store.replaceStyles(new Map([[row, store.getStyles()[row]]]));
    expect(notified).toBe(2);
    store.freeStyle(row);
    expect(notified).toBe(3);
    expect(store.defineStyle({ raise: 1 })).toBe(row);
    expect(notified).toBe(4);
    unsubscribe();
    store.defineStyle({});
    expect(notified).toBe(4);
  });

  it("setDimColor notifies style listeners; setting the same colour again does not", () => {
    const store = new SceneStore();
    let notified = 0;
    store.subscribeStyles(() => notified++);
    const initial = store.getDimColor();
    store.setDimColor(initial);
    expect(notified).toBe(0);
    store.setDimColor("#101010");
    expect(store.getDimColor()).toBe("#101010");
    expect(notified).toBe(1);
    store.setDimColor("#101010");
    expect(notified).toBe(1);
  });

  it("a dim change re-encodes nothing and still notifies style listeners", () => {
    const store = new SceneStore();
    store.add(base);
    const row = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    store.setStyle("a", row);
    const fields: string[][] = [];
    store.subscribe((change) => fields.push([...(change.fields ?? [])].sort()));
    let notified = 0;
    store.subscribeStyles(() => notified++);
    store.replaceStyles(new Map([[row, { dim: 0.5, parts: { border: { color: "#ff0000", dim: 0.2 } } }]]));
    expect(fields).toEqual([]);
    expect(notified).toBe(1);
  });

  it("an opacity below 1 re-encodes, and so does an opaque colour change under it; opacity 1 does not", () => {
    const store = new SceneStore();
    store.add(base);
    const row = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    store.setStyle("a", row);
    const fields: string[][] = [];
    store.subscribe((change) => fields.push([...(change.fields ?? [])].sort()));
    store.replaceStyles(new Map([[row, { opacity: 1, parts: { border: { color: "#ff0000", opacity: 1 } } }]]));
    expect(fields).toEqual([]);
    store.replaceStyles(new Map([[row, { opacity: 0.5, parts: { border: { color: "#ff0000" } } }]]));
    expect(fields).toEqual([["primitives"]]);
    store.replaceStyles(new Map([[row, { opacity: 0.5, parts: { border: { color: "#0000ff" } } }]]));
    expect(fields).toEqual([["primitives"], ["primitives"]]);
  });

  it("freed rows are reused and row 0 is never handed out", () => {
    const store = new SceneStore();
    const a = store.defineStyle({ raise: 1 });
    store.freeStyle(a);
    expect(store.getStyles()[a]).toEqual({});
    expect(store.defineStyle({ raise: 2 })).toBe(a);
    expect(a).not.toBe(0);
  });

  it("warns in development when a freed row still has users", () => {
    const store = new SceneStore();
    store.add(input("a", { zIndex: 1 }));
    const row = store.defineStyle({ dim: 0.5 });
    store.setStyle("a", row);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    store.freeStyle(row);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("still use it"));
    warn.mockRestore();
  });
});

describe("child elements", () => {
  const byOrder =
    (store: SceneStore) =>
    (a: TSceneElement, b: TSceneElement): number =>
      store.compareOrder(a, b);
  const ids = (elements: TSceneElement[]): string[] => elements.map((element) => element.id);

  it("orders children right after their parent, by child order, under the next owner", () => {
    const store = new SceneStore();
    const p = store.add(input("p", { zIndex: 200 }));
    const q = store.add(input("q", { zIndex: 200 }));
    const c2 = store.add(input("c2", { zIndex: 0, parent: "p", childOrder: 2 }));
    const c1 = store.add(input("c1", { zIndex: 0, parent: "p", childOrder: 1 }));
    expect(ids([q, c2, p, c1].sort(byOrder(store)))).toEqual(["p", "c1", "c2", "q"]);
    expect(ids([...store.childrenOf("p")])).toEqual(["c1", "c2"]);
    expect(store.zIndexOf(c1)).toBe(200);
    store.raise("c1");
    expect(ids([q, p, c1].sort(byOrder(store)))).toEqual(["q", "p", "c1"]);
    store.update("c1", { childOrder: 3 });
    expect(ids([...store.childrenOf("p")])).toEqual(["c2", "c1"]);
  });

  it("keeps siblings of an equal child order in the order they were added, in compareOrder and childrenOf", () => {
    const store = new SceneStore();
    store.add(input("p", { zIndex: 200 }));
    // Bounds far apart, so the tile index returns them in no particular order.
    const a = store.add(input("a", { parent: "p", childOrder: 1, x: 5000 }));
    const b = store.add(input("b", { parent: "p", childOrder: 1 }));
    const c = store.add(input("c", { parent: "p", childOrder: 0, x: 3000 }));
    expect(ids([...store.childrenOf("p")])).toEqual(["c", "a", "b"]);
    expect(ids([b, a, c].sort(byOrder(store)))).toEqual(["c", "a", "b"]);
    expect(ids(store.query({ minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 }))).toEqual(["p", "c", "a", "b"]);
    // Moving to an equal child order does not put a later-added sibling first.
    store.update("b", { childOrder: 0 });
    store.update("a", { childOrder: 0 });
    expect(ids([...store.childrenOf("p")])).toEqual(["a", "b", "c"]);
    expect(ids([c, b, a].sort(byOrder(store)))).toEqual(["a", "b", "c"]);
  });

  it("reports a child order that is not an integer of at least 0", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const store = new SceneStore();
      store.add(input("p", { zIndex: 200 }));
      store.add(input("ok", { parent: "p", childOrder: 2 }));
      store.update("ok", { childOrder: 0 });
      expect(error).not.toHaveBeenCalled();
      store.add(input("negative", { parent: "p", childOrder: -1 }));
      expect(error).toHaveBeenLastCalledWith(expect.stringContaining("negative: childOrder -1"));
      store.update("ok", { childOrder: 1.5 });
      expect(error).toHaveBeenLastCalledWith(expect.stringContaining("ok: childOrder 1.5"));
      store.update("ok", { childOrder: NaN });
      expect(error).toHaveBeenCalledTimes(3);
    } finally {
      error.mockRestore();
    }
  });

  it("draws a child hidden while its parent is hidden", () => {
    const store = new SceneStore();
    store.add(input("p", { zIndex: 200 }));
    const c = store.add(input("c", { zIndex: 0, parent: "p" }));
    const all = { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 };
    expect(ids(store.query(all))).toEqual(["p", "c"]);
    store.update("p", { hidden: true });
    expect(store.isDrawnHidden(c)).toBe(true);
    expect(store.query(all)).toEqual([]);
  });

  it("composes the parent's element dim and opacity into the child's drawn row and ignores the child's raise", () => {
    const store = new SceneStore();
    store.add(input("p", { zIndex: 200 }));
    const c = store.add(input("c", { zIndex: 0, parent: "p" }));
    const own = store.defineStyle({ parts: { anchor: { color: "#ff0000" } }, raise: 3, opacity: 0.5 });
    store.setStyle("c", own);
    expect([store.ownStyleOf("c"), c.styleId]).toEqual([own, own]);
    expect(store.zIndexOf(c)).toBe(200);
    const parentRow = store.defineStyle({ dim: 0.4, opacity: 0.5, raise: 1 });
    store.setStyle("p", parentRow);
    const drawn = store.getStyles()[c.styleId];
    expect(c.styleId).not.toBe(own);
    expect([drawn.dim, drawn.opacity, drawn.raise, drawn.parts?.anchor?.color]).toEqual([
      0.4,
      0.25,
      undefined,
      "#ff0000",
    ]);
    expect(store.zIndexOf(c)).toBe(201);
    store.replaceStyles(new Map([[parentRow, { dim: 0.7 }]]));
    expect(store.getStyles()[c.styleId].dim).toBe(0.7);
    store.replaceStyles(new Map([[parentRow, { raise: 1 }]]));
    expect(c.styleId).toBe(own);
    store.setStyle("p", 0);
    expect(c.styleId).toBe(own);
  });

  it("deletes the children with their parent and rejects a missing or nested parent", () => {
    const store = new SceneStore();
    store.add(input("p", { zIndex: 200 }));
    store.add(input("c", { zIndex: 0, parent: "p" }));
    const deleted: string[] = [];
    store.subscribe((change) => {
      if (change.type === "delete") deleted.push(change.element.id);
    });
    store.delete("p");
    expect(deleted).toEqual(["c", "p"]);
    expect(store.get("c")).toBeUndefined();
    expect(() => store.add(input("x", { parent: "nope" }))).toThrow(/parent nope does not exist/);
    store.add(input("p2", { zIndex: 200 }));
    store.add(input("c2", { zIndex: 0, parent: "p2" }));
    expect(() => store.add(input("x", { parent: "c2" }))).toThrow(/cannot have children/);
  });

  it("moves a child off its composed row before freeing it, and its own raise moves nothing", () => {
    const store = new SceneStore();
    store.add(input("p", { zIndex: 200 }));
    store.add(input("c", { zIndex: 0, parent: "p" }));
    store.setStyle("p", store.defineStyle({ dim: 0.5 }));
    const fields: string[][] = [];
    store.subscribe((change) => {
      if (change.element.id === "c") fields.push([...(change.fields ?? [])].sort());
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    store.setStyle("p", 0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    store.setStyle("c", store.defineStyle({ raise: 2 }));
    expect(fields).toEqual([["styleId"], ["styleId"]]);
  });
});

/** A seeded generator in [0, 1) (Park-Miller): the random tests are repeatable. */
function seeded(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** The query as it was before the owner-first order: every drawn element that meets the rect, by `compareOrder`. */
function queryByComparator(store: SceneStore, rect: typeof ALL): string[] {
  const found: TSceneElement[] = [];
  store.forEach((element) => {
    const { x, y, bounds } = element;
    const meets =
      x + bounds.minX <= rect.maxX &&
      x + bounds.maxX >= rect.minX &&
      y + bounds.minY <= rect.maxY &&
      y + bounds.maxY >= rect.minY;
    if (meets && !store.isDrawnHidden(element)) found.push(element);
  });
  return found.sort((a, b) => store.compareOrder(a, b)).map((element) => element.id);
}

describe("owner-first query", () => {
  it("orders like compareOrder on random scenes with raises, children, hidden elements and several buckets", () => {
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const random = seeded(seed);
      const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
      const store = new SceneStore(64);
      const raises = [0, store.defineStyle({ raise: 1 }), store.defineStyle({ raise: 2 }), store.defineStyle({})];
      const owners: string[] = [];
      const children: string[] = [];
      let nextChild = 0;
      const place = (): Partial<TSceneElementInput> => ({
        x: Math.floor(random() * 400),
        y: Math.floor(random() * 400),
        bounds: { minX: 0, minY: 0, maxX: 5 + Math.floor(random() * 80), maxY: 5 + Math.floor(random() * 80) },
      });
      const addChild = (owner: string): void => {
        const childId = `${owner}.c${nextChild++}`;
        // Children lie near their owner or apart from it, so a rect can take a child without its owner.
        store.add(
          input(childId, {
            zIndex: 0,
            parent: owner,
            childOrder: pick([0, 0, 1, 2]),
            hidden: random() < 0.05,
            ...place(),
          })
        );
        children.push(childId);
      };
      const addOwner = (id: string): void => {
        store.add(input(id, { zIndex: pick([0, 1, 200, 200, 200]), hidden: random() < 0.05, ...place() }));
        owners.push(id);
        if (random() < 0.3) store.setStyle(id, pick(raises));
        const count = Math.floor(random() * 5);
        for (let c = 0; c < count; c++) addChild(id);
      };
      const remove = (list: string[], id: string): void => {
        list.splice(list.indexOf(id), 1);
      };
      for (let i = 0; i < 120; i++) addOwner(`o${i}`);
      for (let step = 0; step < 60; step++) {
        const roll = random();
        if (roll < 0.15) store.raise(pick(random() < 0.5 ? owners : children));
        else if (roll < 0.3) store.raiseMany([pick(owners), pick(children), pick(owners)]);
        else if (roll < 0.4) store.setStyle(pick(owners), pick(raises));
        else if (roll < 0.47) store.update(pick(children), { childOrder: pick([0, 1, 2, 3]) });
        else if (roll < 0.54) store.update(pick(owners), { hidden: random() < 0.3 });
        else if (roll < 0.61) store.update(pick(owners), { zIndex: pick([0, 1, 200]) });
        else if (roll < 0.68) store.update(pick(children), place());
        else if (roll < 0.78) {
          // An owner goes with its children and comes back under the same id, with new children.
          const owner = pick(owners);
          store.delete(owner);
          remove(owners, owner);
          for (const child of children.filter((id) => id.startsWith(`${owner}.`))) remove(children, child);
          addOwner(owner);
        } else if (roll < 0.88) {
          const child = pick(children);
          store.delete(child);
          remove(children, child);
        } else {
          addChild(pick(owners));
        }
        const left = Math.floor(random() * 300);
        const top = Math.floor(random() * 300);
        for (const rect of [ALL, { minX: left, minY: top, maxX: left + 150, maxY: top + 150 }]) {
          expect(store.query(rect).map((element) => element.id)).toEqual(queryByComparator(store, rect));
        }
      }
    }
  });

  it("places children whose owner misses the rect, and keeps only the children that meet it", () => {
    const store = new SceneStore(100);
    store.add(input("a", { zIndex: 200 }));
    store.add(input("a.1", { parent: "a", x: 500, y: 0 }));
    store.add(input("a.2", { parent: "a", x: 0, y: 0 }));
    store.add(input("a.3", { parent: "a", x: 500, y: 0 }));
    store.add(input("b", { zIndex: 200, x: 500, y: 0 }));
    store.add(input("b.1", { parent: "b", x: 500, y: 0, hidden: true }));
    store.add(input("b.2", { parent: "b", x: 500, y: 0 }));
    const right = { minX: 400, minY: -10, maxX: 600, maxY: 50 };
    expect(store.query(right).map((element) => element.id)).toEqual(["a.1", "a.3", "b", "b.2"]);
    store.raise("a");
    expect(store.query(right).map((element) => element.id)).toEqual(["b", "b.2", "a.1", "a.3"]);
    expect(store.query(ALL).map((element) => element.id)).toEqual(["b", "b.2", "a", "a.1", "a.2", "a.3"]);
  });

  it("leaves out elements without a primitive on the queried level, and follows primitive updates", () => {
    const store = new SceneStore(100);
    const rect = (levelMask?: number): TSceneElementInput["primitives"] => [
      { kind: "rect", x: 0, y: 0, width: 10, height: 10, levelMask },
    ];
    // An owner on every level, its two children on schematic only (anchors) and on every level; an empty owner (a
    // walked legacy block) whose child is on the minimalistic level.
    store.add(input("block", { primitives: rect() }));
    store.add(input("block.anchor", { parent: "block", primitives: rect(LEVEL_BIT.schematic) }));
    store.add(input("block.badge", { parent: "block", primitives: rect() }));
    store.add(input("empty", { primitives: [] }));
    store.add(input("empty.dot", { parent: "empty", primitives: rect(LEVEL_BIT.minimalistic + LEVEL_BIT.schematic) }));
    const ids = (level?: TSceneLevel): string[] => store.query(ALL, level).map((element) => element.id);
    expect(ids()).toEqual(["block", "block.anchor", "block.badge", "empty", "empty.dot"]);
    expect(ids("minimalistic")).toEqual(["block", "block.badge", "empty.dot"]);
    expect(ids("schematic")).toEqual(["block", "block.anchor", "block.badge", "empty.dot"]);
    expect(ids("detailed")).toEqual(["block", "block.badge"]);
    store.update("block.anchor", { primitives: rect(LEVEL_BIT.minimalistic) });
    store.update("block", { primitives: [] });
    expect(ids("minimalistic")).toEqual(["block.anchor", "block.badge", "empty.dot"]);
  });
});

describe("styles of an export (Task 17g)", () => {
  it("replaces rows in a copy, composes the children's rows again, and orders a query by the copy's raises", () => {
    const store = new SceneStore();
    store.add(element("low", 1));
    store.add(element("high", 1));
    store.add(input("c", { zIndex: 0, parent: "low" }));
    const parentRow = store.defineStyle({ opacity: 0.5 });
    const own = store.defineStyle({ parts: { anchor: { color: "#ff0000" } } });
    store.setStyle("low", parentRow);
    store.setStyle("c", own);
    const live = store.getStyles();
    const child = store.get("c");
    expect(live[child?.styleId ?? 0].opacity).toBe(0.5);

    const { styles, childRows } = store.stylesWith(
      new Map([
        [parentRow, { opacity: 0.25, raise: 1 }],
        [own, { parts: { anchor: { color: "#00ff00" } } }],
      ])
    );
    expect(store.getStyles()).toBe(live);
    expect(styles[child?.styleId ?? 0]).toEqual(
      expect.objectContaining({ opacity: 0.25, parts: { anchor: { color: "#00ff00" } } })
    );
    expect(childRows.size).toBe(0);
    expect(store.stylesWith(new Map()).styles).toBe(live);
    const ids = (list?: readonly TSceneStyle[]): string[] => store.query(ALL, undefined, list).map((found) => found.id);
    expect(ids()).toEqual(["low", "c", "high"]);
    expect(ids(styles)).toEqual(["high", "low", "c"]);
  });

  it("gives children composed rows where their parent's row needs composition only in the export", () => {
    const store = new SceneStore();
    store.add(element("a", 1));
    store.add(element("b", 1));
    store.add(element("plain", 1));
    store.add(input("a.1", { zIndex: 0, parent: "a" }));
    store.add(input("a.2", { zIndex: 0, parent: "a" }));
    store.add(input("b.1", { zIndex: 0, parent: "b" }));
    store.add(input("plain.1", { zIndex: 0, parent: "plain" }));
    // "a" and "b" share a row without element dim or opacity in the live table; their children draw with their own.
    const parentRow = store.defineStyle({ parts: { body: { color: "#111111" } } });
    const other = store.defineStyle({ parts: { body: { color: "#222222" } } });
    const own = store.defineStyle({ parts: { anchor: { color: "#ff0000" } } });
    store.setStyle("a", parentRow);
    store.setStyle("b", parentRow);
    store.setStyle("plain", other);
    for (const id of ["a.1", "a.2", "b.1", "plain.1"]) store.setStyle(id, own);
    const live = store.getStyles();
    expect(store.get("a.1")?.styleId).toBe(own);

    const { styles, childRows } = store.stylesWith(new Map([[parentRow, { opacity: 0.5, dim: 0.25 }]]));
    expect(store.getStyles()).toBe(live);
    // One composed row for the pair (own, parentRow), added to the copy; the shared own row is unchanged.
    expect([...childRows.keys()].sort()).toEqual(["a.1", "a.2", "b.1"]);
    const rows = new Set(childRows.values());
    expect(rows.size).toBe(1);
    const [row] = [...rows];
    expect(row).toBeGreaterThanOrEqual(live.length);
    expect(styles[row]).toEqual(
      expect.objectContaining({ opacity: 0.5, dim: 0.25, parts: { anchor: { color: "#ff0000" } } })
    );
    expect(styles[own]).toBe(live[own]);
    expect(store.get("a.1")?.styleId).toBe(own);
  });
});

describe("primitives are values (Task 17g)", () => {
  it("freezes the text primitives it receives in development builds, so a change in place throws", () => {
    const store = new SceneStore();
    const text = (value: string, cameraAware: { maxWorld: number }) => ({
      kind: "text" as const,
      text: value,
      family: "sans-serif",
      size: 12,
      cameraAware,
      lineHeight: 12,
      x: 0,
      y: 0,
      width: 10,
    });
    const clamps = { maxWorld: 24 };
    const title = text("a", clamps);
    const box = { kind: "rect" as const, x: 0, y: 0, width: 10, height: 10 };
    store.add(input("e", { primitives: [title, box] }));
    expect([Object.isFrozen(title), Object.isFrozen(clamps)]).toEqual([true, true]);
    // Other kinds are left to the read-only types (freezing every primitive costs element writes in development).
    expect(Object.isFrozen(box)).toBe(false);
    expect(() => {
      (title as { text: string }).text = "b";
    }).toThrow(TypeError);
    expect(() => {
      (clamps as { maxWorld: number }).maxWorld = 13;
    }).toThrow(TypeError);
    const next = text("c", { maxWorld: 20 });
    store.update("e", { primitives: [next] });
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("types primitives as read-only", () => {
    const primitive: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 10, height: 10 };
    if (primitive.kind === "rect") {
      // @ts-expect-error a primitive is a value: give the element new primitives instead
      primitive.width = 20;
    }
    expect(primitive).toEqual({ kind: "rect", x: 0, y: 0, width: 20, height: 10 });
  });
});

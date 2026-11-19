import { defineConnectionEffect } from "../../../components/canvas/connections/effects";
import type { TSceneLevel } from "../../../services/scene/types";
import { SceneStore } from "../SceneStore";
import type { TSceneElementInput } from "../SceneStore";
import { LEVEL_BIT } from "../levels";
import type { TSceneChange, TSceneElement, TScenePrimitive, TSceneStyle } from "../types";

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
  it("animates only the block's drawn origin, rebases edits, and stops at rest", () => {
    const store = new SceneStore();
    const block = store.add(input("b", { entityType: "block", x: 0.25, y: 20 }));
    const child = store.add(input("a", { entityType: "anchor", parent: "b", y: 20 }));
    const row = store.defineStyle({ motion: "bounce" });
    const other = store.defineStyle({ motion: "bounce", raise: 1 });
    store.setStyle("b", row);
    store.setStyle("a", row);
    store.advanceBlockMotions(0, false);
    store.advanceBlockMotions(0.15, false);
    expect(block.y).toBe(12);
    expect(child.y).toBe(20);
    expect(store.query({ minX: 0, minY: 10, maxX: 1, maxY: 13 })).toEqual([block]);
    store.update("b", { x: 9.25, y: 30 });
    expect(block).toMatchObject({ x: 9.25, y: 22 });
    store.setStyle("b", other);
    store.advanceBlockMotions(0.31, false);
    expect(block).toMatchObject({ x: 9.25, y: 30 });
    expect(store.hasBlockMotions).toBe(false);
    store.setStyle("b", row);
    expect(store.hasBlockMotions).toBe(false);
  });

  it("handles a live rule replacement, reduced motion, hiding and deletion", () => {
    const store = new SceneStore();
    const block = store.add(input("b", { entityType: "block", x: 10 }));
    const row = store.defineStyle({});
    store.setStyle("b", row);
    store.replaceStyles(new Map([[row, { motion: "shake" }]]));
    store.advanceBlockMotions(1, false);
    store.advanceBlockMotions(1.025, false);
    expect(block.x).toBeGreaterThan(14);
    store.replaceStyles(new Map([[row, { motion: "bounce" }]]));
    expect(block.x).toBe(10);
    store.advanceBlockMotions(1.03, false);
    store.advanceBlockMotions(1.18, false);
    expect(block.y).toBeCloseTo(-8);
    store.advanceBlockMotions(1.2, true);
    expect(block.y).toBe(0);
    expect(store.hasBlockMotions).toBe(false);
    store.setStyle("b", 0);
    store.setStyle("b", row);
    store.advanceBlockMotions(2, false);
    store.advanceBlockMotions(2.15, false);
    store.update("b", { hidden: true, y: 100 });
    expect(block.y).toBe(100);
    expect(store.hasBlockMotions).toBe(false);
    store.update("b", { hidden: false });
    store.setStyle("b", 0);
    store.setStyle("b", row);
    store.delete("b");
    expect(store.hasBlockMotions).toBe(false);
  });

  it("rejects invalid literal effect scale bounds before replacing scene primitives or styles", () => {
    const effect = defineConnectionEffect({
      fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color; }",
    });
    const store = new SceneStore();
    const path = {
      kind: "path" as const,
      segments: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]),
      stroke: { color: "#123", width: 2 },
      effect: { effect, minScale: 1, maxScale: 0.5 },
    };
    expect(() => store.add(input("line", { primitives: [path] }))).toThrow("maxScale");
    store.add(input("line"));
    expect(() => store.update("line", { primitives: [path] })).toThrow("maxScale");
    expect(store.get("line")?.primitives).toEqual([]);
    expect(() => store.defineStyle({ base: { line: { effect: path.effect } } })).toThrow("maxScale");
    const row = store.defineStyle({});
    expect(() => store.replaceStyles(new Map([[row, { parts: { line: { effect: path.effect } } }]]))).toThrow(
      "maxScale"
    );
    expect(store.getStyles()[row]).toEqual({});
  });

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

  it("reuses the ordered Canvas query on a pan and checks exact bounds after scene changes", () => {
    const store = new SceneStore(100);
    store.add(input("owner", { x: -50 }));
    store.add(input("child", { x: 5, parent: "owner" }));
    store.add(input("earlier", { x: 20, zIndex: 0 }));
    store.add(input("later", { x: 15 }));
    store.add(input("edge", { x: 101 }));
    store.add(input("unbounded", { x: Infinity }));
    const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const panned = { ...viewport, minX: 1, maxX: 101 };
    const query = jest.spyOn(store, "query");
    const ids = (rect = viewport) => store.queryForCanvas(rect, 1).map(({ id }) => id);
    const inside = ["earlier", "child", "later", "unbounded"];
    expect(ids()).toEqual(inside);
    expect(ids()).toEqual(inside);
    expect(ids(panned)).toEqual(["earlier", "child", "later", "edge", "unbounded"]);
    expect(query).toHaveBeenCalledTimes(2);

    store.update("owner", { hidden: true });
    expect(ids(panned)).toEqual(["earlier", "later", "edge", "unbounded"]);
    store.update("edge", { x: 50 });
    store.raise("later");
    expect(ids()).toEqual(["earlier", "edge", "unbounded", "later"]);
  });

  it("preserves candidate order during geometry edits and picks up elements moving into the region", () => {
    const store = new SceneStore(100);
    const dot = element("a", 1);
    store.add(dot);
    store.add({ ...dot, id: "b", x: 30 });
    store.add({ ...dot, id: "offscreen", x: 500 });
    const rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const query = jest.spyOn(store, "query");
    const ids = () => store.queryForCanvas(rect, 1, "schematic").map(({ id }) => id);
    expect(ids()).toEqual(["a", "b"]);
    expect(ids()).toEqual(["a", "b"]);
    store.update("a", { x: 130, primitives: [...dot.primitives] });
    expect(ids()).toEqual(["b"]);
    store.update("a", { x: 0 });
    expect(ids()).toEqual(["a", "b"]);
    expect(query).toHaveBeenCalledTimes(2);
    store.update("offscreen", { x: 50 });
    expect(ids()).toEqual(["a", "b", "offscreen"]);
    store.update("b", { primitives: [] });
    expect(ids()).toEqual(["a", "offscreen"]);
    store.update("b", { primitives: dot.primitives });
    expect(ids()).toEqual(["a", "b", "offscreen"]);
  });

  it("updates the cached Canvas query for a grown styled bound and a changed level", () => {
    const store = new SceneStore();
    const dot: TScenePrimitive = { kind: "circle", part: "body", cx: 0, cy: 0, r: 1, levelMask: LEVEL_BIT.schematic };
    store.add(
      input("halo", {
        x: 102,
        y: 50,
        bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
        primitives: [dot],
      })
    );
    const row = store.defineStyle({});
    store.setStyle("halo", row);
    const viewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const ids = (level: TSceneLevel) => store.queryForCanvas(viewport, 1, level).map(({ id }) => id);
    expect(ids("schematic")).toEqual([]);
    expect(ids("schematic")).toEqual([]);
    store.replaceStyles(new Map([[row, { parts: { body: { scale: 4 } } }]]));
    expect(ids("schematic")).toEqual(["halo"]);
    expect(ids("schematic")).toEqual(["halo"]);
    expect(ids("detailed")).toEqual([]);
  });

  it("forgets deleted elements and rejects duplicate ids", () => {
    const store = new SceneStore();
    store.add(input("a"));
    expect(() => store.add(input("a"))).toThrow("Scene element a already exists");
    store.delete("a");
    expect(store.size).toBe(0);
    expect(store.query(ALL)).toEqual([]);
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
    // Element a still uses the row: freeing it warns, as development builds do.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    store.freeStyle(row);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/Scene style row 1 is freed while elements still use it/);
    warn.mockRestore();
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

  it("deletes the children with their parent, rejects a missing parent and nests in a child", () => {
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
    // A child element may have children (nesting at any depth): `parent` names the owner, `nestedIn` the child.
    const nested = store.add(input("x", { parent: "c2" }));
    expect([nested.parent, nested.nestedIn]).toEqual(["p2", "c2"]);
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

describe("styles of an export", () => {
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

describe("primitives are values", () => {
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
});

describe("bounds grown by a style", () => {
  const dot = (): TSceneElementInput => ({
    id: "dot",
    zIndex: 1,
    x: 0,
    y: 0,
    bounds: { minX: -9, minY: -9, maxX: 9, maxY: 9 },
    primitives: [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: 9 }],
  });
  /** 13 to 15 units right of the dot's centre: outside its radius 9, inside 9 x 1.8 = 16.2. */
  const edge = (x = 0): { minX: number; minY: number; maxX: number; maxY: number } => ({
    minX: x + 13,
    minY: -1,
    maxX: x + 15,
    maxY: 1,
  });
  const ids = (store: SceneStore, rect = edge()): string[] => store.query(rect).map((element) => element.id);

  afterEach(() => jest.restoreAllMocks());

  it("finds an element whose row scales its circles past the bounds its component wrote", () => {
    const store = new SceneStore(100);
    store.add(dot());
    expect(ids(store)).toEqual([]);
    const hovered = store.defineStyle({ parts: { anchor: { scale: 1.8 } } });
    store.setStyle("dot", hovered);
    expect(ids(store)).toEqual(["dot"]);
    expect(store.get("dot")?.bounds).toEqual({ minX: -9, minY: -9, maxX: 9, maxY: 9 });
    store.setStyle("dot", 0);
    expect(ids(store)).toEqual([]);
  });

  it("follows a change of the row the element draws with, and skips the bake for a colour-only change", () => {
    const store = new SceneStore(100);
    store.add(dot());
    const row = store.defineStyle({ parts: { anchor: { color: "#ff0000" } } });
    store.setStyle("dot", row);
    expect(ids(store)).toEqual([]);
    store.replaceStyles(new Map([[row, { parts: { anchor: { scale: 1.8 } } }]]));
    expect(ids(store)).toEqual(["dot"]);
    const bake = jest.spyOn(SceneStore.prototype as unknown as { styledBounds(): unknown }, "styledBounds");
    store.replaceStyles(new Map([[row, { parts: { anchor: { scale: 1.8, color: "#00ff00" } } }]]));
    expect(bake).not.toHaveBeenCalled();
    expect(ids(store)).toEqual(["dot"]);
  });

  it("keeps the grown bounds through a move and drops them with primitives that fit", () => {
    const store = new SceneStore(100);
    store.add(dot());
    store.setStyle("dot", store.defineStyle({ parts: { anchor: { scale: 1.8 } } }));
    store.update("dot", { x: 100 });
    expect(ids(store, edge(100))).toEqual(["dot"]);
    store.update("dot", {
      primitives: [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: 2 }],
      bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
    });
    // 2 x 1.8 = 3.6: the edge is out of reach again.
    expect(ids(store, edge(100))).toEqual([]);
  });

  /** A closed shape with an inside border of width 2, in part "ring", whose component wrote `bounds`. */
  const bordered = (primitive: TScenePrimitive, bounds: TSceneElementInput["bounds"]): TSceneElementInput => ({
    id: "ring",
    zIndex: 1,
    x: 0,
    y: 0,
    bounds,
    primitives: [primitive],
  });
  const widened = (store: SceneStore, width: number): void =>
    store.setStyle("ring", store.defineStyle({ parts: { ring: { width } } }));

  it("covers a widened inside circle border as Canvas 2D strokes it: centred on the radius", () => {
    const store = new SceneStore(100);
    store.add(
      bordered(
        { kind: "circle", part: "ring", cx: 0, cy: 0, r: 9, border: { width: 2, align: "inside" } },
        { minX: -10, minY: -10, maxX: 10, maxY: 10 }
      )
    );
    const strip = { minX: 11.5, minY: -0.5, maxX: 12.5, maxY: 0.5 };
    expect(ids(store, strip)).toEqual([]);
    // Canvas 2D strokes arc(r 9) with lineWidth 8 whatever the alignment: the stroke reaches 9 + 4 = 13.
    widened(store, 8);
    expect(ids(store, strip)).toEqual(["ring"]);
    expect(store.get("ring")?.bounds).toEqual({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
  });

  it("keeps a widened inside rect border inside the rect while it fits, and covers one wider than the rect", () => {
    const store = new SceneStore(100);
    const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    store.add(
      bordered(
        { kind: "rect", part: "ring", x: 0, y: 0, width: 10, height: 10, border: { width: 2, align: "inside" } },
        rect
      )
    );
    const bake = jest.spyOn(SceneStore.prototype as unknown as { styledBounds(): unknown }, "styledBounds");
    // Canvas 2D insets an inside border by half its width: a width of 10 still paints within the rect.
    widened(store, 10);
    expect(bake).toHaveBeenCalledTimes(1);
    expect(ids(store, { minX: 10.5, minY: 4, maxX: 11, maxY: 5 })).toEqual([]);
    // A width of 30 insets the path by 15, past the rect's middle: it runs from 15 back to -5 and its stroke paints
    // from -20 to 30.
    widened(store, 30);
    expect(ids(store, { minX: 25, minY: 4, maxX: 26, maxY: 5 })).toEqual(["ring"]);
    expect(ids(store, { minX: -16, minY: 4, maxX: -15, maxY: 5 })).toEqual(["ring"]);
    expect(store.get("ring")?.bounds).toEqual(rect);
  });

  it("covers the miter join of a widened polygon stroke: Canvas 2D joins at its default miter limit", () => {
    const store = new SceneStore(100);
    // A triangle whose sharp vertex lies at the origin; its bounds pad its points by the width 2, as geometryBounds
    // does. The element stands at x 100.
    const triangle: TScenePrimitive = {
      kind: "polygon",
      part: "ring",
      points: new Float32Array([0, 0, 100, 20, 100, -20]),
      stroke: { color: "#000000", width: 2 },
    };
    const bounds = { minX: -2, minY: -22, maxX: 102, maxY: 22 };
    store.add({ ...bordered(triangle, bounds), x: 100 });
    // The vertex's angle is 22.6 degrees: its miter reaches (w / 2) / sin(11.3 degrees) = 5.1 w left of it, under the
    // limit of 10 x (w / 2). Width 2: to x 94.9, out of this rect; width 8: to x 79.6, past the width's own pad (92).
    const tip = { minX: 75, minY: -1, maxX: 81, maxY: 1 };
    expect(ids(store, tip)).toEqual([]);
    widened(store, 8);
    expect(ids(store, tip)).toEqual(["ring"]);
    expect(store.get("ring")?.bounds).toEqual(bounds);
  });

  it("warns once in development builds about a { px } width without maxWorld", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new SceneStore(100);
    store.defineStyle({ parts: { border: { width: { px: 2 } } } });
    store.defineStyle({ parts: { border: { width: { px: 3 } } } });
    store.defineStyle({ parts: { border: { width: { px: 2, maxWorld: 4 } } } });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("maxWorld"))).toHaveLength(1);
  });

  it("warns about a { px } width without maxWorld that a row gets by a rewrite", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new SceneStore(100);
    const row = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    const unbounded = (): number => warn.mock.calls.filter(([message]) => String(message).includes("maxWorld")).length;
    expect(unbounded()).toBe(0);
    store.replaceStyles(new Map([[row, { base: { border: { width: { px: 2 } } } }]]));
    expect(unbounded()).toBe(1);
  });

  it("warns once in development builds about a { world } width with a positive minPx, in that form's words", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new SceneStore(100);
    const minPx = (): string[] =>
      warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes("minPx"));
    store.defineStyle({ parts: { border: { width: { world: 1, minPx: 0 } } } });
    store.defineStyle({ parts: { border: { width: { world: 1, maxPx: 3 } } } });
    expect(minPx()).toEqual([]);
    const row = store.defineStyle({ parts: { border: { width: { world: 1, minPx: 2 } } } });
    store.replaceStyles(new Map([[row, { base: { border: { width: { world: 2, minPx: 1, maxPx: 4 } } } }]]));
    expect(minPx()).toHaveLength(1);
    expect(minPx()[0]).toContain("minPx / 0.01");
    expect(minPx()[0]).not.toContain("maxWorld");
    // The { px } form keeps its own warning.
    store.defineStyle({ parts: { border: { width: { px: 2 } } } });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("maxWorld"))).toHaveLength(1);
  });

  it("grows the bounds by a { world, minPx } width at the minimum camera scale", () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new SceneStore(100);
    store.add(
      bordered(
        { kind: "circle", part: "ring", cx: 0, cy: 0, r: 9, border: { width: 2 } },
        { minX: -10, minY: -10, maxX: 10, maxY: 10 }
      )
    );
    // At scale 0.01 the width is 2 / 0.01 = 200 world units: the stroke reaches 9 + 100 = 109.
    store.setStyle("ring", store.defineStyle({ parts: { ring: { width: { world: 1, minPx: 2 } } } }));
    expect(ids(store, { minX: 108, minY: -0.5, maxX: 108.5, maxY: 0.5 })).toEqual(["ring"]);
    expect(ids(store, { minX: 109.5, minY: -0.5, maxX: 110, maxY: 0.5 })).toEqual([]);
  });

  it("costs no bake for rows without a scale or a width, nor for a move", () => {
    const store = new SceneStore(100);
    store.add(dot());
    const bake = jest.spyOn(SceneStore.prototype as unknown as { styledBounds(): unknown }, "styledBounds");
    const plain = store.defineStyle({ parts: { anchor: { color: "#ff0000" } }, raise: 1, dim: 0.5, opacity: 0.5 });
    store.setStyle("dot", plain);
    store.update("dot", { x: 5, primitives: dot().primitives, bounds: dot().bounds });
    store.replaceStyles(new Map([[plain, { parts: { anchor: { color: "#00ff00" } } }]]));
    store.setStyle("dot", 0);
    expect(bake).not.toHaveBeenCalled();
    store.setStyle("dot", store.defineStyle({ parts: { anchor: { scale: 1.8 } } }));
    expect(bake).toHaveBeenCalledTimes(1);
    store.update("dot", { x: 6 });
    expect(bake).toHaveBeenCalledTimes(1);
  });

  describe("in nesting", () => {
    /** An owner far from the edge rect, so only its children can meet it. */
    const owner = (id = "block"): TSceneElementInput => ({
      id,
      zIndex: 1,
      x: -500,
      y: -500,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [{ kind: "rect", part: "body", x: 0, y: 0, width: 10, height: 10 }],
    });
    const nested = (id: string, parent: string): TSceneElementInput => ({ ...dot(), id, parent });

    it("finds a child by its own row's scale while its parent's dim and opacity compose the row it draws with", () => {
      const store = new SceneStore(100);
      store.add(owner());
      store.add(nested("dot", "block"));
      const hovered = store.defineStyle({ parts: { anchor: { scale: 1.8 } } });
      store.setStyle("dot", hovered);
      expect(ids(store)).toEqual(["dot"]);
      const faded = store.defineStyle({ dim: 0.5, opacity: 0.5 });
      store.setStyle("block", faded);
      expect(store.get("dot")?.styleId === hovered).toBe(false);
      expect(ids(store)).toEqual(["dot"]);
      store.setStyle("block", 0);
      expect(store.get("dot")?.styleId).toBe(hovered);
      expect(ids(store)).toEqual(["dot"]);
      store.setStyle("block", faded);
      store.setStyle("dot", 0);
      expect(ids(store)).toEqual([]);
    });

    it("follows a rewrite of a child's own row through the composed row it draws with", () => {
      const store = new SceneStore(100);
      store.add(owner());
      store.add(nested("dot", "block"));
      const own = store.defineStyle({ parts: { anchor: { color: "#ff0000" } } });
      store.setStyle("block", store.defineStyle({ opacity: 0.5 }));
      store.setStyle("dot", own);
      expect(store.get("dot")?.styleId === own).toBe(false);
      expect(ids(store)).toEqual([]);
      store.replaceStyles(new Map([[own, { parts: { anchor: { scale: 1.8 } } }]]));
      expect(ids(store)).toEqual(["dot"]);
      store.replaceStyles(new Map([[own, { parts: { anchor: { color: "#00ff00" } } }]]));
      expect(ids(store)).toEqual([]);
    });

    it("keeps an element nested two deep found through rewrites of the rows composed down to it", () => {
      const store = new SceneStore(100);
      store.add(owner());
      store.add({ ...owner("port"), parent: "block" });
      store.add(nested("dot", "port"));
      const parentRow = store.defineStyle({ opacity: 0.5 });
      store.setStyle("block", parentRow);
      store.setStyle("port", store.defineStyle({ dim: 0.2 }));
      const own = store.defineStyle({ parts: { anchor: { scale: 1.8 } } });
      store.setStyle("dot", own);
      expect(ids(store)).toEqual(["dot"]);
      store.replaceStyles(new Map([[parentRow, { opacity: 0.25 }]]));
      expect(ids(store)).toEqual(["dot"]);
      store.replaceStyles(new Map([[own, { parts: { anchor: { color: "#ff0000" } } }]]));
      expect(ids(store)).toEqual([]);
    });
  });
});

describe("entity types, hidden queries and change reasons", () => {
  it("keeps the entity type an element was added with", () => {
    const store = new SceneStore();
    store.add(input("custom-id", { entityType: "block" }));
    store.add(input("plain"));
    expect(store.get("custom-id")?.entityType).toBe("block");
    expect(store.get("plain")?.entityType).toBeUndefined();
  });

  it("returns hidden elements and what is nested in them only when asked", () => {
    const store = new SceneStore(100);
    store.add(element("shown", 1));
    store.add({ ...element("held", 1), hidden: true });
    store.add({ ...element("child", 1), parent: "held" });
    store.add({ ...element("deep", 1), parent: "child" });
    const found = (level?: TSceneLevel, includeHidden?: boolean): string[] =>
      store.query(ALL, level, undefined, includeHidden).map((entry) => entry.id);
    expect(found()).toEqual(["shown"]);
    expect(found(undefined, true)).toEqual(["shown", "held", "child", "deep"]);
    store.update("held", { hidden: false });
    store.update("child", { hidden: true });
    expect(found()).toEqual(["shown", "held"]);
    expect(found("minimalistic", true)).toEqual(["shown", "held", "child", "deep"]);
  });

  it("tells style listeners why the rows changed", () => {
    const store = new SceneStore();
    store.add(input("a"));
    const reasons: string[] = [];
    store.subscribeStyles((change) => reasons.push(change));
    const row = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    store.replaceStyles(new Map([[row, { parts: { border: { color: "#0000ff" } } }]]));
    store.setDimColor("#101010");
    store.freeStyle(row);
    expect(reasons).toEqual(["define", "replace", "dim", "free"]);
  });

  it("names the rewrite of the composed rows a replaced row starts a replace too", () => {
    const store = new SceneStore();
    store.add(input("block"));
    store.add({ ...input("dot"), parent: "block" });
    const row = store.defineStyle({ opacity: 0.5 });
    store.setStyle("block", row);
    const reasons: string[] = [];
    store.subscribeStyles((change) => reasons.push(change));
    store.replaceStyles(new Map([[row, { opacity: 0.25 }]]));
    expect(reasons).toEqual(["replace", "replace"]);
  });

  it("names the row an element drew with before a row change", () => {
    const store = new SceneStore();
    store.add(input("a"));
    store.add({ ...input("dot"), parent: "a" });
    const changes: TSceneChange[] = [];
    store.subscribe((change) => changes.push(change));
    const one = store.defineStyle({ parts: { border: { color: "#ff0000" } } });
    const two = store.defineStyle({ parts: { border: { color: "#00ff00" } } });
    store.setStyle("a", one);
    store.setStyle("a", two);
    store.setStyle("dot", one);
    store.update("a", { x: 4 });
    expect(changes.map((change) => [change.element.id, change.previousStyleId])).toEqual([
      ["a", 0],
      ["a", one],
      ["dot", 0],
      ["a", undefined],
    ]);
  });
});

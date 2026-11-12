import { SceneStore } from "./SceneStore";
import type { TSceneElementInput } from "./SceneStore";
import type { TSceneChange } from "./types";

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
});

import { SceneStore } from "../SceneStore";
import type { TSceneElementInput } from "../SceneStore";
import type { TScenePrimitive } from "../types";

const dot: TScenePrimitive = { kind: "circle", cx: 0, cy: 0, r: 2 };
const ALL = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

const element = (id: string, parent?: string, childOrder?: number): TSceneElementInput => ({
  id,
  zIndex: 1,
  x: 0,
  y: 0,
  bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
  primitives: [dot],
  parent,
  childOrder,
});

/** owner → [a → [a1 → [a11], a2], b], added in the order a, b, a1, a11, a2. */
function tree(): SceneStore {
  const store = new SceneStore(100);
  store.add(element("owner"));
  store.add(element("a", "owner", 0));
  store.add(element("b", "owner", 1));
  store.add(element("a1", "a", 0));
  store.add(element("a11", "a1", 0));
  store.add(element("a2", "a", 1));
  return store;
}

const ids = (elements: readonly { id: string }[]): string[] => elements.map((entry) => entry.id);

describe("nested child elements", () => {
  it("draws an owner's children in the pre-order of their nesting, at any depth", () => {
    const store = tree();
    expect(ids(store.childrenOf("owner"))).toEqual(["a", "a1", "a11", "a2", "b"]);
    expect(ids(store.childrenOf("a"))).toEqual(["a1", "a11", "a2"]);
    expect([store.get("a11")?.parent, store.get("a11")?.nestedIn]).toEqual(["owner", "a1"]);
    expect(store.get("a")?.nestedIn).toBeUndefined();
    expect(ids(store.query(ALL))).toEqual(["owner", "a", "a1", "a11", "a2", "b"]);
  });

  it("moves a child's whole subtree with its order, and places a late child after its parent's descendants", () => {
    const store = tree();
    store.update("a", { childOrder: 2 });
    expect(ids(store.childrenOf("owner"))).toEqual(["b", "a", "a1", "a11", "a2"]);
    store.add(element("a3", "a", 2));
    store.add(element("b1", "b", 0));
    expect(ids(store.childrenOf("owner"))).toEqual(["b", "b1", "a", "a1", "a11", "a2", "a3"]);
    const [b1, a11] = [store.get("b1"), store.get("a11")];
    expect(b1 !== undefined && a11 !== undefined && store.compareOrder(b1, a11) < 0).toBe(true);
  });

  it("deletes what is nested in a deleted child first, deepest first", () => {
    const store = tree();
    const deleted: string[] = [];
    store.subscribe((change) => {
      if (change.type === "delete") deleted.push(change.element.id);
    });
    store.delete("a");
    expect(deleted).toEqual(["a11", "a1", "a2", "a"]);
    expect(ids(store.childrenOf("owner"))).toEqual(["b"]);
  });

  it("hides what is nested in a hidden child, in queries and isDrawnHidden", () => {
    const store = tree();
    store.update("a1", { hidden: true });
    expect(ids(store.query(ALL))).toEqual(["owner", "a", "a2", "b"]);
    const a11 = store.get("a11");
    expect(a11 !== undefined && store.isDrawnHidden(a11)).toBe(true);
    store.update("a1", { hidden: false });
    expect(a11 !== undefined && store.isDrawnHidden(a11)).toBe(false);
  });

  it("composes opacity and dim down the nesting: opacity multiplies, the nearest dim wins", () => {
    const store = tree();
    const drawn = (id: string): { opacity?: number; dim?: number } => {
      const row = store.getStyles()[store.get(id)?.styleId ?? 0];
      return { opacity: row?.opacity, dim: row?.dim };
    };
    store.setStyle("owner", store.defineStyle({ opacity: 0.5 }));
    store.setStyle("a", store.defineStyle({ opacity: 0.5, dim: 0.2 }));
    expect(drawn("a").opacity).toBeCloseTo(0.25);
    expect(drawn("a11").opacity).toBeCloseTo(0.25);
    expect(drawn("a11").dim).toBe(0.2);
    expect(drawn("b").opacity).toBeCloseTo(0.5);
    store.setStyle("owner", 0);
    expect(drawn("a11").opacity).toBeCloseTo(0.5);
    expect(drawn("a11").dim).toBe(0.2);
    expect(drawn("b").opacity).toBeUndefined();
  });

  it("frees a composed row only when no element or composed row uses it; exports compose through it", () => {
    const store = tree();
    const rowOf = (id: string): number => store.get(id)?.styleId ?? 0;
    const opacity = (id: string): number | undefined => store.getStyles()[rowOf(id)]?.opacity;
    store.setStyle("owner", store.defineStyle({ opacity: 0.5 }));
    store.setStyle("a", store.defineStyle({ opacity: 0.5 }));
    // A second change of the owner's row re-links the subtree: a's, a1's and a11's composed rows are replaced.
    store.setStyle("owner", store.defineStyle({ opacity: 0.8 }));
    expect([opacity("a"), opacity("a1"), opacity("a11")].map((value) => value?.toFixed(2))).toEqual([
      "0.40",
      "0.40",
      "0.40",
    ]);
    // Every row in use still holds its content (nothing was freed under a user or a dependent row).
    for (const id of ["a", "a1", "a11", "a2", "b"]) expect(store.getStyles()[rowOf(id)]).toBeDefined();
    const exported = store.stylesWith(new Map([[rowOf("owner"), { opacity: 0.25 }]]));
    expect(exported.styles[rowOf("a11")]?.opacity).toBeCloseTo(0.125);
  });
});

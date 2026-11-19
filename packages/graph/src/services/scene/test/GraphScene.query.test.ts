import { Graph } from "../../../graph";
import type { TSceneElementInput } from "../../../lib/scene/SceneStore";
import { styleEncodeKey } from "../../../lib/scene/style";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { defineTag } from "../../tags/defineTag";
import type { TSceneQueryOptions } from "../types";

const square: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 10, height: 10 };
const input = (id: string, entityType: string, patch: Partial<TSceneElementInput> = {}): TSceneElementInput => ({
  id,
  entityType,
  zIndex: 200,
  x: 0,
  y: 0,
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  primitives: [square],
  ...patch,
});
const ALL = { x: -1000, y: -1000, width: 2000, height: 2000 };

describe("graph.scene.query options and revisionOf", () => {
  let graph: Graph;
  const ids = (options?: TSceneQueryOptions): string[] => graph.scene.query(ALL, options).map((view) => view.id);
  const frame = (): void => graph.scheduler.performUpdate();

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
  });

  afterEach(() => graph.unmount());

  it("leaves hidden elements out unless asked, and marks the hidden ones it returns", () => {
    const { store } = graph.scene;
    store.add(input("shown", "block"));
    store.add(input("held", "block", { hidden: true }));
    store.add(input("child", "anchor", { parent: "held" }));
    expect(ids()).toEqual(["shown"]);
    expect(graph.scene.query(ALL, { includeHidden: true }).map((view) => [view.id, view.hidden])).toEqual([
      ["shown", false],
      ["held", true],
      ["child", true],
    ]);
  });

  it("filters by the entity type the element was written with, whatever its id, and by level", () => {
    const { store } = graph.scene;
    // An id without the "block" prefix: a block that overrides createSceneElementId().
    store.add(input("custom-id", "block"));
    const schematicOnly: TScenePrimitive = { ...square, levelMask: 2 };
    store.add(input("a", "anchor", { parent: "custom-id", primitives: [schematicOnly] }));
    store.add(input("c", "comment", { zIndex: 300 }));
    expect(ids({ entityTypes: ["block"] })).toEqual(["custom-id"]);
    expect(ids({ entityTypes: ["block", "comment"] })).toEqual(["custom-id", "c"]);
    expect(ids({ level: "minimalistic" })).toEqual(["custom-id", "c"]);
    expect(ids({ level: "schematic" })).toEqual(["custom-id", "a", "c"]);
    expect(graph.scene.query(ALL, { entityTypes: ["block"] })[0]?.entityType).toBe("block");
  });

  it("returns the store's elements with the internal live option, frozen copies otherwise", () => {
    graph.scene.store.add(input("b", "block"));
    const [live] = graph.scene.query(ALL, { live: true });
    expect(live).toBe(graph.scene.store.get("b"));
    const [copy] = graph.scene.query(ALL);
    expect(copy === live).toBe(false);
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("names a child's scene parent in its view", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    store.add(input("child", "anchor", { parent: "owner" }));
    store.add(input("deep", "inner", { parent: "child" }));
    expect(graph.scene.query(ALL).map((view) => [view.id, view.parent, view.nestedIn])).toEqual([
      ["owner", undefined, undefined],
      ["child", "owner", undefined],
      ["deep", "owner", "child"],
    ]);
  });

  it("gives one counter per entity type", () => {
    expect(graph.scene.revisionOf("block")).toBe(graph.scene.revisionOf("block"));
    expect(graph.scene.revisionOf("block")).not.toBe(graph.scene.revisionOf("anchor"));
  });

  it("steps a type's revision once at the end of a frame with changes of that type", () => {
    const { store } = graph.scene;
    const block = graph.scene.revisionOf("block");
    const anchor = graph.scene.revisionOf("anchor");
    frame();
    const start = [block.value, anchor.value];
    store.add(input("b", "block"));
    store.update("b", { x: 5 });
    expect([block.value, anchor.value]).toEqual(start);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1]]);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1]]);
    // A child's row (an anchor's hover): only its type.
    store.add(input("a", "anchor", { parent: "b" }));
    frame();
    const row = store.defineStyle({ parts: { anchor: { scale: 1.8 } } });
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1] + 1]);
    store.setStyle("a", row);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1] + 2]);
    // A rewritten row or the dim colour: every type.
    store.setDimColor("#000000");
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 2, start[1] + 3]);
    store.replaceStyles(new Map([[row, { parts: { anchor: { scale: 2 } } }]]));
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 3, start[1] + 4]);
    // Freeing a row steps none.
    store.setStyle("a", 0);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 3, start[1] + 5]);
    store.freeStyle(row);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 3, start[1] + 5]);
    // A delete steps its type.
    store.delete("b");
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 4, start[1] + 6]);
  });

  it("steps the types of what is nested in an element whose hidden flag or order changes, not the other way", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    store.add(input("child", "anchor", { parent: "owner" }));
    store.add(input("deep", "inner", { parent: "child" }));
    const [block, anchor, inner] = ["block", "anchor", "inner"].map((type) => graph.scene.revisionOf(type));
    frame();
    const at = (): number[] => [block.value, anchor.value, inner.value];
    const start = at();
    store.update("owner", { hidden: true });
    frame();
    expect(at()).toEqual([start[0] + 1, start[1] + 1, start[2] + 1]);
    store.raise("owner");
    frame();
    expect(at()).toEqual([start[0] + 2, start[1] + 2, start[2] + 2]);
    // A child hidden: it and what is nested in it, not its owner.
    store.update("child", { hidden: true });
    frame();
    expect(at()).toEqual([start[0] + 2, start[1] + 3, start[2] + 3]);
  });

  it("steps the nested types of an owner moved to another bucket, by its zIndex or a style raise", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    store.add(input("child", "anchor", { parent: "owner" }));
    const [block, anchor] = ["block", "anchor"].map((type) => graph.scene.revisionOf(type));
    frame();
    const at = (): number[] => [block.value, anchor.value];
    const start = at();
    store.update("owner", { zIndex: 300 });
    frame();
    expect(at()).toEqual([start[0] + 1, start[1] + 1]);
    store.setStyle("owner", store.defineStyle({ raise: 1 }));
    frame();
    expect(at()).toEqual([start[0] + 2, start[1] + 2]);
    // An owner change that moves nothing nested in it: its type alone.
    store.update("owner", { x: 20 });
    frame();
    expect(at()).toEqual([start[0] + 3, start[1] + 2]);
    store.raiseMany(["child"]);
    frame();
    expect(at()).toEqual([start[0] + 4, start[1] + 3]);
  });

  it("steps the nested types of a reordered subtree, in two subtrees of the same types", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    store.add(input("a", "mid", { parent: "owner", childOrder: 0 }));
    store.add(input("b", "mid", { parent: "owner", childOrder: 1 }));
    store.add(input("leaf-a", "leaf", { parent: "a" }));
    store.add(input("leaf-b", "leaf", { parent: "b" }));
    const leaf = graph.scene.revisionOf("leaf");
    frame();
    const leaves = (): string[] => ids({ entityTypes: ["leaf"] });
    expect(leaves()).toEqual(["leaf-a", "leaf-b"]);
    const start = leaf.value;
    store.update("a", { childOrder: 2 });
    frame();
    expect(leaves()).toEqual(["leaf-b", "leaf-a"]);
    expect(leaf.value).toBe(start + 1);
  });

  it("steps no revision for a row change between rows that look the same", () => {
    const { store } = graph.scene;
    store.add(input("b", "block"));
    const block = graph.scene.revisionOf("block");
    const one = store.defineStyle({ parts: { body: { color: "#ff0000" } } });
    const twin = store.defineStyle({ parts: { body: { color: "#ff0000" } } });
    store.setStyle("b", one);
    frame();
    const start = block.value;
    store.setStyle("b", twin);
    frame();
    expect(block.value).toBe(start);
    store.setStyle("b", store.defineStyle({ parts: { body: { color: "#00ff00" } } }));
    frame();
    expect(block.value).toBe(start + 1);
  });

  it("steps no revision for rows that differ only in the order of their properties or parts", () => {
    const { store } = graph.scene;
    store.add(input("b", "block"));
    const block = graph.scene.revisionOf("block");
    store.setStyle("b", store.defineStyle({ parts: { body: { color: "#ff0000", visible: true } } }));
    frame();
    const start = block.value;
    store.setStyle("b", store.defineStyle({ parts: { body: { visible: true, color: "#ff0000" } } }));
    frame();
    expect(block.value).toBe(start);
    const widths = { parts: { body: { width: 2 }, title: { width: 1 } } };
    const reordered = { parts: { title: { width: 1 }, body: { width: 2 } } };
    // The part order changes the encode key, so the update names `primitives` as well as `styleId`.
    expect(styleEncodeKey(widths)).not.toBe(styleEncodeKey(reordered));
    store.setStyle("b", store.defineStyle(widths));
    frame();
    expect(block.value).toBe(start + 1);
    const fields: string[][] = [];
    const stop = store.subscribe((change) => fields.push([...(change.fields ?? [])].sort()));
    store.setStyle("b", store.defineStyle(reordered));
    stop();
    expect(fields).toEqual([["primitives", "styleId"]]);
    frame();
    expect(block.value).toBe(start + 1);
  });

  it("resolves what is nested in a moved element once at the frame's end, with counters for unused types", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    for (let i = 0; i < 4; i++) store.add(input(`anchor-${i}`, "anchor", { parent: "owner" }));
    const [block, anchor, unused] = ["block", "anchor", "unused"].map((type) => graph.scene.revisionOf(type));
    frame();
    const start = [block.value, anchor.value, unused.value];
    const walks = jest.spyOn(store, "childrenOf");
    store.update("owner", { hidden: true });
    store.update("owner", { hidden: false });
    store.raise("owner");
    store.update("anchor-0", { hidden: true });
    // Constant work per store change: no walk of what is nested in the element yet.
    expect(walks).not.toHaveBeenCalled();
    frame();
    // Three updates of the owner, one walk of its anchors.
    expect(walks.mock.calls.filter(([id]) => id === "owner")).toHaveLength(1);
    expect([block.value, anchor.value, unused.value]).toEqual([start[0] + 1, start[1] + 1, start[2]]);
    walks.mockRestore();
  });

  it("steps a counter first asked for during a frame for that frame's earlier changes", () => {
    const { store } = graph.scene;
    frame();
    store.add(input("b", "block"));
    store.add(input("a", "anchor", { parent: "b" }));
    store.update("b", { hidden: true });
    const block = graph.scene.revisionOf("block");
    const anchor = graph.scene.revisionOf("anchor");
    frame();
    expect([block.value, anchor.value]).toEqual([1, 1]);
    store.setDimColor("#123456");
    const comment = graph.scene.revisionOf("comment");
    frame();
    expect([block.value, anchor.value, comment.value]).toEqual([2, 2, 1]);
  });

  it("steps no revision when a tag without a rule gives an entity a new row that looks the same", () => {
    const { store } = graph.scene;
    const pointed = defineTag("pointed");
    class Styled {}
    store.add(input("b", "block"));
    const unbind = graph.scene.bindStyle("b", { type: "block", id: "b" }, Styled);
    const block = graph.scene.revisionOf("block");
    frame();
    const start = block.value;
    const before = store.get("b")?.styleId;
    graph.scene.tags.add(pointed, { block: ["b"] });
    expect(store.get("b")?.styleId).not.toBe(before);
    frame();
    expect(block.value).toBe(start);
    graph.scene.tags.delete(pointed, { block: ["b"] });
    frame();
    expect(block.value).toBe(start);
    unbind();
  });
});

import { Graph } from "../../../graph";
import { defineSceneEffect } from "../../../lib/scene/effects/defineSceneEffect";
import type { TSceneElementInput } from "../../../lib/scene/store/SceneStore";
import { styleEncodeKey } from "../../../lib/scene/styles/style";
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

  it("lets the internal drawing path borrow rows without copying them", () => {
    graph.scene.store.add(input("b", "block"));
    const [live] = graph.scene.queryLive(ALL);
    expect(live).toBe(graph.scene.store.get("b"));
    const [copy] = graph.scene.query(ALL);
    expect(copy === live).toBe(false);
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("does not expose live rows through public query options", () => {
    const element = graph.scene.store.add(input("b", "block"));
    const options = { level: "minimalistic", live: true } as const;
    const [view] = graph.scene.query(ALL, options);
    Reflect.set(view, "x", 250);
    expect(element.x).toBe(0);
  });

  it("keeps bounds, paths and nested paint data independent of query results", () => {
    const primitives: readonly TScenePrimitive[] = [
      {
        kind: "path",
        segments: new Float32Array([0, 0, 0, 0, 10, 10, 10, 10]),
        stroke: { color: "#000", width: { px: 2 }, dash: [2, 1] },
        gaps: [[3, 4]],
        interaction: { hovered: false, selected: false, selectionColor: "#fff" },
      },
      { kind: "polygon", points: new Float32Array([0, 0, 10, 0, 10, 10]), fill: "#000" },
      { ...square, radius: [1, 2, 3, 4], border: { width: { world: 1 } } },
    ];
    graph.scene.store.add(input("b", "block", { primitives }));
    const [view] = graph.scene.query(ALL);
    const [path, polygon, rect] = view.primitives;
    if (
      path.kind !== "path" ||
      !path.stroke.dash ||
      !path.gaps ||
      !path.interaction ||
      polygon.kind !== "polygon" ||
      rect.kind !== "rect" ||
      !rect.border
    ) {
      throw new Error("Expected a path, polygon and rectangle with their paint attributes");
    }
    Reflect.set(view.bounds, "maxX", 500);
    path.segments[0] = 250;
    polygon.points[0] = 250;
    Reflect.set(path.stroke.width as object, "px", 100);
    Reflect.set(path.stroke.dash, 0, 100);
    Reflect.set(path.gaps[0], 0, 100);
    Reflect.set(path.interaction, "hovered", true);
    Reflect.set(rect.radius as readonly number[], 0, 100);
    Reflect.set(rect.border.width as object, "world", 100);

    const [again] = graph.scene.query(ALL);
    expect(again.bounds.maxX).toBe(10);
    expect(again.primitives).toEqual([
      {
        kind: "path",
        segments: new Float32Array([0, 0, 0, 0, 10, 10, 10, 10]),
        stroke: { color: "#000", width: { px: 2 }, dash: [2, 1] },
        gaps: [[3, 4]],
        interaction: { hovered: false, selected: false, selectionColor: "#fff" },
      },
      { kind: "polygon", points: new Float32Array([0, 0, 10, 0, 10, 10]), fill: "#000" },
      { ...square, radius: [1, 2, 3, 4], border: { width: { world: 1 } } },
    ]);
  });

  it("detaches icons, sprites and path effect uniforms from the scene", () => {
    const icon = new Path2D("M0 0H10V10H0Z");
    const image = document.createElement("img");
    image.width = 40;
    const effect = defineSceneEffect({
      kind: "path",
      fragment: "vec4 effect(PathFragment f, vec4 color) { return color; }",
      uniforms: { offset: { type: "vec2", value: [1, 2] } },
    });
    effect.uniforms.offset.value = [3, 4];
    const primitives: readonly TScenePrimitive[] = [
      { kind: "icon", path: icon, x: 0, y: 0, size: 10, viewBox: 10 },
      { kind: "sprite", image, x: 0, y: 0, width: 10, height: 10, params: [1, 2, 3, 4] },
      { kind: "path", segments: new Float32Array(8), stroke: { color: "#000", width: 1 }, effect: effect.use([7]) },
    ];
    graph.scene.store.add(input("b", "block", { primitives }));
    const [view] = graph.scene.query(ALL);
    const [iconView, spriteView, pathView] = view.primitives;
    if (
      iconView.kind !== "icon" ||
      spriteView.kind !== "sprite" ||
      !spriteView.params ||
      pathView.kind !== "path" ||
      !pathView.effect?.params
    ) {
      throw new Error("Expected an icon, sprite and path effect");
    }
    expect(iconView.path).not.toBe(icon);
    spriteView.image.width = 50;
    Reflect.set(spriteView.params, 0, 50);
    Reflect.set(pathView.effect.params, 0, 50);
    const offset = pathView.effect.effect.uniforms.offset;
    expect(offset.peek()).toEqual([3, 4]);
    Reflect.set(offset.peek() as readonly number[], 0, 50);
    offset.value = [5, 6];

    expect(image.width).toBe(40);
    expect(primitives[1]).toMatchObject({ params: [1, 2, 3, 4] });
    expect(primitives[2]).toMatchObject({ effect: { params: [7] } });
    expect(effect.uniforms.offset.peek()).toEqual([3, 4]);
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

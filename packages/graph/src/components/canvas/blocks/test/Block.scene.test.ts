import { batch, effect } from "@preact/signals-core";

import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { isOnLevel } from "../../../../lib/scene/levels";
import type { TSceneChange, TScenePrimitive } from "../../../../lib/scene/types";
import type { TSceneLevel } from "../../../../services/scene/types";
import { ESelectionStrategy } from "../../../../services/selection/types";
import { entityKey } from "../../../../services/tags/TagStore";
import { draggingTag, selectedTag } from "../../../../services/tags/builtinTags";
import { Block } from "../Block";
import type { TBlock, TBlockProps, TBlockView } from "../Block";

const block = (id: string, x: number, patch: Partial<TBlock> = {}): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y: 100,
  width: 100,
  height: 50,
  anchors: [],
  ...patch,
});

function frames(count = 5): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

type TTitledView = TBlockView & { subtitle: string };

/** A subclass adds view data by widening getViewData() and its level methods' view. */
class TitledBlock extends Block {
  protected override getViewData(): TTitledView {
    return { ...super.getViewData(), subtitle: `of ${this.props.id}` };
  }

  protected override schematic(view: TTitledView): readonly TScenePrimitive[] {
    return [{ kind: "text", text: view.subtitle, family: "f", size: 10, lineHeight: 12, x: 0, y: 0, width: 80 }];
  }
}

describe("Block in the scene", () => {
  let graph: Graph;
  const element = (id: string): ReturnType<Graph["scene"]["store"]["get"]> =>
    graph.scene.store.get(entityKey("block", id));
  const view = (id: string): Block => {
    const component = graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    if (!component) throw new Error(`no view for ${id}`);
    return component;
  };
  const order = (id: string): number => element(id)?.order ?? -1;

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.setEntities({ blocks: [block("a", 100), block("b", 150), block("c", 300)], connections: [] });
    graph.start();
    frames();
  });

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("writes the default look into the scene and nothing onto the GraphLayer canvas", () => {
    const fillRect = jest.spyOn(graph.getGraphLayer().context.ctx, "fillRect");
    graph.api.updateBlock({ id: "a", name: "renamed" });
    frames();
    expect(fillRect).not.toHaveBeenCalled();
    expect(element("a")?.zIndex).toBe(200);
    expect([element("a")?.x, element("a")?.y]).toEqual([100, 100]);
    expect(element("a")?.primitives.map((p) => [p.part, p.levelMask])).toEqual([
      ["halo", undefined],
      ["body", undefined],
      ["border", undefined],
      ["title", 3],
      ["badge", undefined],
    ]);
    expect(element("a")?.primitives.some((p) => p.kind === "text" && p.text === "renamed")).toBe(true);
  });

  it("moves by writing the origin only", () => {
    const primitives = element("a")?.primitives;
    graph.api.updateBlock({ id: "a", x: 400 });
    frames();
    expect(element("a")?.x).toBe(400);
    expect(element("a")?.primitives).toBe(primitives);
  });

  it("keeps the scene origin at the accepted position when a block-change listener prevents a move", () => {
    graph.on("block-change", (event) => event.preventDefault());
    view("a").updatePosition(400, 250);
    frames();
    expect([element("a")?.x, element("a")?.y]).toEqual([100, 100]);
  });

  it("takes its bucket from the graph constants signal", () => {
    graph.setConstants({ block: { DEFAULT_Z_INDEX: 300 } });
    frames();
    expect(element("a")?.zIndex).toBe(300);
  });

  it("follows a block whose state was replaced in one batch (undo of a delete)", () => {
    const first = view("a");
    batch(() => {
      graph.rootStore.blocksList.deleteBlocks(["a"]);
      graph.rootStore.blocksList.addBlock(block("a", 100, { name: "back" }));
    });
    frames();
    expect(view("a")).toBe(first);
    graph.api.updateBlock({ id: "a", x: 700, name: "moved" });
    frames();
    expect(element("a")?.x).toBe(700);
    expect(element("a")?.primitives.some((p) => p.kind === "text" && p.text === "moved")).toBe(true);
  });

  it("runs no block's view data for a settings change that does not touch the look", () => {
    const getViewData = jest.spyOn(view("a") as unknown as { getViewData(): unknown }, "getViewData");
    graph.updateSettings({ canDragCamera: false });
    frames();
    expect(getViewData).not.toHaveBeenCalled();
    graph.updateSettings({ scaleFontSize: 2 });
    frames();
    expect(getViewData).toHaveBeenCalled();
  });

  it("hides the halo and badge through the theme and styles a selected block", () => {
    // Untagged theme rules are base values of the row (`isStateRule`).
    const row = graph.scene.styleFor(Block, new Map());
    expect([row.base?.halo?.visible, row.base?.badge?.visible]).toEqual([false, false]);
    graph.api.selectBlocks(["a"], true);
    frames();
    const selected = element("a");
    expect(selected && graph.scene.store.zIndexOf(selected)).toBe(201);
    expect(graph.scene.explain("block", "a").tags.map((tag) => tag.name)).toContain(selectedTag.name);
    expect(graph.scene.compareOrder(view("a"), view("b"))).toBeGreaterThan(0);
  });

  it("puts a dragged block in the theme's raised bucket", () => {
    // The dragging tag follows DragService's state.
    const idle = graph.dragService.$state.value;
    graph.dragService.$state.value = { ...idle, isDragging: true, components: [view("a")] };
    frames();
    expect(graph.scene.explain("block", "a").tags.map((tag) => tag.name)).toContain(draggingTag.name);
    const dragged = element("a");
    expect(dragged && graph.scene.store.zIndexOf(dragged)).toBe(201);
    graph.dragService.$state.value = idle;
    frames();
    const dropped = element("a");
    expect(dropped && graph.scene.store.zIndexOf(dropped)).toBe(200);
  });

  it("raises newly selected blocks in their current order and keeps the order on deselection", () => {
    const raiseMany = jest.spyOn(graph.scene.store, "raiseMany");
    graph.api.selectBlocks(["b", "a"], true);
    frames();
    // One raise for the selection change; the group keeps its relative order.
    expect(raiseMany).toHaveBeenCalledTimes(1);
    expect(order("a")).toBeLessThan(order("b"));
    expect(order("b")).toBeGreaterThan(order("c"));
    const raised = order("a");
    graph.api.selectBlocks(["a", "b"], false);
    frames();
    expect(raiseMany).toHaveBeenCalledTimes(1);
    expect(order("a")).toBe(raised);
  });

  it("raises a block on an accepted drag start, not on a prevented one", () => {
    const context = {
      sourceEvent: new MouseEvent("mousedown"),
      startCoords: [0, 0],
      prevCoords: [0, 0],
      currentCoords: [0, 0],
      components: [],
    } as unknown as Parameters<Block["handleDragStart"]>[0];
    const before = order("a");
    graph.scene.batchRaises(() => view("a").handleDragStart(context));
    expect(order("a")).toBeGreaterThan(before);
    const prevent = (event: Event): void => event.preventDefault();
    graph.on("block-drag-start", prevent);
    const raised = order("b");
    view("b").handleDragStart(context);
    expect(order("b")).toBe(raised);
    graph.off("block-drag-start", prevent);
  });

  it("gives blocks shown in HTML a React z-index by their scene order, ranked per frame", () => {
    // Containers watching their blocks' $viewState, as GraphBlock's useSignalEffect does: each sees a new value only
    // when its rank changes.
    const seen: Record<string, number[]> = { a: [], b: [], d: [] };
    const watch = (id: string): (() => void) => {
      const viewState = view(id).$viewState;
      return effect(() => {
        seen[id].push(viewState.value.order);
      });
    };
    const stopA = watch("a");
    const stopB = watch("b");
    frames();
    expect([view("a").$viewState.value.order, view("b").$viewState.value.order]).toEqual([1, 2]);
    graph.api.selectBlocks(["a"], true);
    frames();
    expect([view("a").$viewState.value.order, view("b").$viewState.value.order]).toEqual([2, 1]);
    const objects = view("a").$viewState.value;
    graph.api.updateBlock({ id: "a", name: "same rank" });
    frames();
    expect(view("a").$viewState.value).toBe(objects);
    expect([seen.a.slice(-2), seen.b.slice(-2)]).toEqual([
      [1, 2],
      [2, 1],
    ]);
    const seenOfA = seen.a.length;
    // A new watched block above a (selected too, so in a's raised bucket and later) makes the next flush build a new
    // rank map; a's rank value stays 2, so its $viewState keeps the same object and its container sees nothing new.
    graph.rootStore.blocksList.addBlock(block("d", 450));
    graph.api.selectBlocks(["d"], true, ESelectionStrategy.APPEND);
    frames();
    const stopD = watch("d");
    frames();
    expect(["b", "a", "d"].map((id) => view(id).$viewState.value.order)).toEqual([1, 2, 3]);
    expect(view("a").$viewState.value).toBe(objects);
    expect(seen.a).toHaveLength(seenOfA);
    expect(seen.d.at(-1)).toBe(3);
    stopA();
    stopB();
    stopD();
    frames();
    expect(view("a").$viewState.value.order).toBe(0);
  });

  it("ranks a block deleted and re-added with the same id while its container still watches", () => {
    const first = view("a");
    const ranks: number[] = [];
    const stopFirst = effect(() => {
      ranks.push(first.$viewState.value.order);
    });
    frames();
    expect(first.$viewState.value.order).toBe(1);
    graph.rootStore.blocksList.deleteBlocks(["a"]);
    frames();
    expect(first.$viewState.value.order).toBe(0);
    graph.rootStore.blocksList.addBlock(block("a", 500));
    frames();
    const second = view("a");
    expect(second).not.toBe(first);
    // The old container still watches the id, so the new element is ranked again.
    expect(first.$viewState.value.order).toBe(1);
    // The container moves to the new view: the new one is watched before the old one is released.
    const stopSecond = effect(() => {
      ranks.push(second.$viewState.value.order);
    });
    stopFirst();
    frames();
    expect(second.$viewState.value.order).toBe(1);
    stopSecond();
    frames();
    expect(second.$viewState.value.order).toBe(0);
  });

  it("hides the element of a delegated block and its anchors, and keeps its hit box", () => {
    graph.updateSettings({ useBlocksAnchors: true });
    graph.api.updateBlock({ id: "a", anchors: [{ id: "out", blockId: "a", type: "OUT" }] });
    frames();
    view("a").setRenderDelegated(true);
    frames();
    expect(element("a")?.hidden).toBe(true);
    const [anchorElement] = graph.scene.store.childrenOf(entityKey("block", "a"));
    expect(anchorElement && graph.scene.store.isDrawnHidden(anchorElement)).toBe(true);
    expect(view("a").isRendered()).toBe(false);
    expect(graph.getElementOverPoint({ x: 110, y: 120 })).toBe(view("a"));
  });

  it("hides the element of a hidden block and removes its hit box", () => {
    view("a").setHiddenBlock(true);
    frames();
    expect(element("a")?.hidden).toBe(true);
    expect(graph.getElementOverPoint({ x: 110, y: 120 })).toBeUndefined();
  });

  it("takes the usable rect from hit boxes, not from the halo in the scene bounds", () => {
    graph.setEntities({ blocks: [block("a", 100)], connections: [] });
    frames(8);
    expect(element("a")?.bounds.minX).toBe(-12);
    expect(graph.hitTest.$usableRect.value).toEqual({ x: 100, y: 100, width: 100, height: 50 });
  });

  it("is never walked", () => {
    const iterate = jest.spyOn(view("a"), "iterate");
    graph.getGraphLayer().performRender();
    frames();
    expect(iterate).not.toHaveBeenCalled();
  });

  it("draws a subclass's own view data", () => {
    graph.updateSettings({ blockComponents: { Titled: TitledBlock } });
    graph.setEntities({ blocks: [block("t", 0, { is: "Titled" })], connections: [] });
    frames();
    // schematic (and minimalistic, which takes its list) is the subclass's; detailed keeps the default body without
    // text.
    const texts = (element("t")?.primitives ?? []).flatMap((p) => (p.kind === "text" ? [p.text] : []));
    expect(texts).toEqual(["of t"]);
  });

  it("honors object identity for a custom prop read directly in a level method", () => {
    const widths = new WeakMap<object, number>();
    class Swatch extends Block<TBlock, TBlockProps & { palette?: object }> {
      protected override schematic(): readonly TScenePrimitive[] {
        const width = this.props.palette && widths.get(this.props.palette);
        return [...super.schematic(), { kind: "rect", x: 0, y: 0, width: width ?? 0, height: 10 }];
      }
    }
    graph.updateSettings({ blockComponents: { Swatch } });
    graph.setEntities({ blocks: [block("s", 0, { is: "Swatch" })], connections: [] });
    frames();
    const swatch = view("s");
    if (!(swatch instanceof Swatch)) throw new Error("Missing Swatch block");
    for (const width of [10, 20]) {
      const palette = {};
      widths.set(palette, width);
      swatch.setProps({ palette });
      frames();
      expect(element("s")?.primitives).toContainEqual(expect.objectContaining({ kind: "rect", width }));
    }
  });

  it("draws a subclass's schematic list on the minimalistic level too, from one schematic call per view", () => {
    let calls = 0;
    class Fresh extends Block {
      public resizeLocally(width: number): void {
        this.setState({ width });
      }

      // A fresh list on every call, as a subclass without a cache returns it.
      protected override schematic(view: TBlockView): readonly TScenePrimitive[] {
        calls++;
        return [
          { kind: "rect", part: "body", x: 0, y: 0, width: view.width, height: view.height },
          { kind: "circle", part: "badge", cx: 4, cy: 4, r: 2 },
        ];
      }
    }
    graph.updateSettings({ blockComponents: { Fresh } });
    graph.setEntities({ blocks: [block("f", 0, { is: "Fresh" })], connections: [] });
    frames();
    expect(calls).toBe(1);
    const onLevel = (level: TSceneLevel): [string, string | undefined][] =>
      (element("f")?.primitives ?? [])
        .filter((p) => isOnLevel(p.levelMask, level))
        .map((p): [string, string | undefined] => [p.kind, p.part]);
    // Minimalistic and schematic share the subclass's list; detailed keeps the default look.
    expect(onLevel("schematic")).toEqual([
      ["rect", "body"],
      ["circle", "badge"],
    ]);
    expect(onLevel("minimalistic")).toEqual(onLevel("schematic"));
    expect(onLevel("detailed")).toEqual([
      ["rect", "halo"],
      ["rect", "body"],
      ["rect", "border"],
      ["circle", "badge"],
    ]);
    graph.api.updateBlock({ id: "f", width: 120 });
    frames();
    expect(calls).toBe(2);

    const local = view("f");
    if (!(local instanceof Fresh)) throw new Error("Missing Fresh block");
    local.resizeLocally(135);
    frames();
    expect(element("f")?.primitives).toContainEqual(expect.objectContaining({ part: "body", width: 135 }));
    expect(calls).toBe(3);
    expect(graph.rootStore.blocksList.getBlockState("f")?.width).toBe(120);
  });

  it("warns once about imperative members on a Block subclass", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    class OldStyle extends Block {
      protected renderBody(): void {
        // an imperative override that no longer draws
      }
    }
    graph.updateSettings({ blockComponents: { Old: OldStyle } });
    graph.setEntities({ blocks: [block("o1", 0, { is: "Old" }), block("o2", 200, { is: "Old" })], connections: [] });
    frames();
    const messages = warn.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes("OldStyle"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("LegacyCanvasBlock");
  });
});

describe("Block in the scene on the first frame", () => {
  it("writes blocks and the anchors of blocks in view in the first frame on the culled GraphLayer, then nothing", () => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    const graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
    graph.setEntities({
      blocks: [
        block("near", 100, { anchors: [{ id: "out", blockId: "near", type: "OUT" }] }),
        block("far", 50_000, { anchors: [{ id: "out", blockId: "far", type: "OUT" }] }),
      ],
      connections: [],
    });
    const store = graph.scene.store;
    const add = jest.spyOn(store, "add");
    const update = jest.spyOn(store, "update");
    const changes: TSceneChange[] = [];
    let unsubscribe = (): void => undefined;
    try {
      graph.start();
      globalScheduler.performUpdate();
      const ids = [entityKey("block", "near"), entityKey("block", "far")];
      for (const id of ids) expect(store.get(id)).toBeDefined();
      // Anchors are created lazily: the block in view at the schematic level has its anchor; the far one
      // has none until the camera shows it.
      expect(store.childrenOf(ids[0])).toHaveLength(1);
      expect(store.childrenOf(ids[1])).toHaveLength(0);
      // Each element was added once, and nothing was rewritten in that frame.
      expect(add).toHaveBeenCalledTimes(3);
      expect(update).not.toHaveBeenCalled();
      unsubscribe = store.subscribe((change) => changes.push(change));
      frames(4);
      expect(changes.filter((change) => change.type !== "update" || !change.fields?.has("styleId"))).toEqual([]);
    } finally {
      unsubscribe();
      graph.unmount();
      jest.restoreAllMocks();
    }
  });
});

import { Graph } from "../../../graph";
import type { ComponentDescriptor } from "../../../lib/CoreComponent";
import { globalScheduler } from "../../../lib/Scheduler";
import { LEVEL_BIT } from "../../../lib/scene/levels";
import { entityKey } from "../../../services/tags/TagStore";
import { hoveredTag, selectedTag } from "../../../services/tags/builtinTags";
import { defineTag } from "../../../services/tags/defineTag";
import { getEntityAddress } from "../../../services/tags/entity";
import { anchorEntityId } from "../../../store/anchor/anchorEntityId";
import { Block } from "../blocks/Block";
import type { TBlock } from "../blocks/Block";

import { Anchor } from "./index";
import type { TAnchor } from "./index";

function frames(count = 6): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

const block = (id: string, x: number, anchors: TBlock["anchors"] = []): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors,
});

describe("anchors as child elements of their block", () => {
  let graph: Graph;
  const anchor = (blockId: string, anchorId: string): Anchor => {
    const view = graph.rootStore.blocksList.getBlockState(blockId)?.getAnchorById(anchorId)?.getViewComponent();
    if (!(view instanceof Anchor)) throw new Error("no anchor");
    return view;
  };
  const anchorElement = (blockId: string, anchorId: string): ReturnType<Graph["scene"]["store"]["get"]> =>
    graph.scene.store.get(anchor(blockId, anchorId).getSceneElementId());

  beforeEach(() => {
    graph = new Graph({ settings: { useBlocksAnchors: true } }, document.createElement("div"));
    graph.setEntities({
      blocks: [block("lower", 100, [{ id: "out", blockId: "lower", type: "OUT" }]), block("upper", 220)],
      connections: [],
    });
    graph.start();
    graph.cameraService.set({ scale: 0.5 });
    frames();
  });

  afterEach(() => graph.unmount());

  it("owns a child element of its block at the port point, drawn by the theme's anchor part", () => {
    const element = anchorElement("lower", "out");
    expect(element?.parent).toBe(entityKey("block", "lower"));
    expect([element?.x, element?.y]).toEqual([300, 188]);
    // Today's ring: lineWidth 2 + 3, centred on the dot's edge. Schematic only: no look at the minimalistic level
    // (Task 17c), and React draws anchors at the detailed one.
    expect(element?.primitives).toEqual([
      { kind: "circle", part: "anchor", cx: 0, cy: 0, r: 9, levelMask: LEVEL_BIT.schematic },
      { kind: "circle", part: "border", cx: 0, cy: 0, r: 9, border: { width: 5 }, levelMask: LEVEL_BIT.schematic },
    ]);
    const style = element ? graph.scene.store.getStyles()[element.styleId] : undefined;
    expect(style?.base?.anchor?.color).toBe(graph.graphColors.anchor.background);
    // The ring is hidden until the anchor is selected.
    expect(style?.base?.border).toEqual({ color: graph.graphColors.anchor.selectedBorder, visible: false });
  });

  describe("two blocks with an anchor of the same id", () => {
    const rowOf = (blockId: string): ReturnType<Graph["scene"]["store"]["getStyles"]>[number] | undefined => {
      const element = anchorElement(blockId, "out");
      return element ? graph.scene.store.getStyles()[element.styleId] : undefined;
    };

    beforeEach(() => {
      graph.setEntities({
        blocks: [
          block("lower", 100, [{ id: "out", blockId: "lower", type: "OUT" }]),
          block("upper", 220, [{ id: "out", blockId: "upper", type: "OUT" }]),
        ],
        connections: [],
      });
      frames();
    });

    it("addresses each anchor by its block-qualified id in tags and in its element id", () => {
      const lower = anchor("lower", "out");
      const upper = anchor("upper", "out");
      expect(lower.getEntityId()).toBe(anchorEntityId("lower", "out"));
      expect(getEntityAddress(lower)).toEqual({ type: "anchor", id: anchorEntityId("lower", "out") });
      expect(getEntityAddress(upper)).toEqual({ type: "anchor", id: anchorEntityId("upper", "out") });
      expect([lower.getSceneElementId(), upper.getSceneElementId()]).toEqual([
        entityKey("anchor", anchorEntityId("lower", "out")),
        entityKey("anchor", anchorEntityId("upper", "out")),
      ]);
      expect([
        graph.scene.store.get(lower.getSceneElementId())?.parent,
        graph.scene.store.get(upper.getSceneElementId())?.parent,
      ]).toEqual([entityKey("block", "lower"), entityKey("block", "upper")]);
    });

    it("scales only the hovered one; the other keeps the plain row", () => {
      const plain = anchorElement("upper", "out")?.styleId;
      expect(anchorElement("lower", "out")?.styleId).toBe(plain);
      graph.getGraphLayer().setHoveredComponent(anchor("lower", "out"));
      frames();
      expect(graph.scene.tags.$of("anchor", anchorEntityId("lower", "out")).value.has(hoveredTag)).toBe(true);
      expect(graph.scene.tags.$of("anchor", anchorEntityId("upper", "out")).value.has(hoveredTag)).toBe(false);
      expect(rowOf("lower")?.parts?.anchor?.scale).toBe(Anchor.CANVAS_HOVER_FACTOR);
      expect(anchorElement("upper", "out")?.styleId).toBe(plain);
      expect(rowOf("upper")?.parts?.anchor?.scale).toBeUndefined();
      expect(graph.scene.explain("anchor", anchorEntityId("lower", "out")).tags).toEqual([
        { name: hoveredTag.name, value: true },
      ]);
      expect(graph.scene.explain("anchor", anchorEntityId("upper", "out")).tags).toEqual([]);
    });

    it("shows the ring only on the selected one", () => {
      anchor("upper", "out").toggleSelected();
      frames();
      expect(rowOf("upper")?.parts?.border?.visible).toBe(true);
      expect(rowOf("lower")?.parts?.border?.visible).not.toBe(true);
      expect(rowOf("lower")?.base?.border?.visible).toBe(false);
      expect(graph.scene.explain("anchor", anchorEntityId("upper", "out")).tags).toEqual([
        { name: selectedTag.name, value: true },
      ]);
    });
  });

  it("styles a tagged or hovered anchor through its own row, re-encoding no block", () => {
    const lower = graph.scene.store.get(entityKey("block", "lower"))?.primitives;
    const hovered = graph.scene.styleFor(Anchor, new Map([[hoveredTag, true]]));
    expect([hovered.parts?.anchor?.scale, hovered.parts?.border?.scale]).toEqual([
      Anchor.CANVAS_HOVER_FACTOR,
      Anchor.CANVAS_HOVER_FACTOR,
    ]);
    const flagged = defineTag("flagged");
    graph.scene.styles.add([{ target: Anchor, tags: [flagged], style: { parts: { anchor: { scale: 2 } } } }]);
    graph.scene.tags.add(flagged, { anchor: [anchorEntityId("lower", "out")] });
    frames();
    const tagged = anchorElement("lower", "out");
    expect(tagged && graph.scene.store.getStyles()[tagged.styleId].parts?.anchor?.scale).toBe(2);
    expect(graph.scene.store.get(entityKey("block", "lower"))?.primitives).toBe(lower);
  });

  it("shows today's ring on a selected anchor, and a user rule restyles it, re-encoding no block", () => {
    const lower = graph.scene.store.get(entityKey("block", "lower"))?.primitives;
    anchor("lower", "out").toggleSelected();
    frames();
    const selected = anchorElement("lower", "out");
    // Today's look: the ring appears in the selected colour, the dot keeps the background colour.
    const row = selected ? graph.scene.store.getStyles()[selected.styleId] : undefined;
    expect(row?.parts?.border?.visible).toBe(true);
    expect(row?.parts?.anchor?.color).toBeUndefined();
    expect(row?.base?.border?.color).toBe(graph.graphColors.anchor.selectedBorder);
    // A user rule turns the ring into a solid dot without a subclass.
    graph.scene.styles.add([
      {
        target: Anchor,
        tags: [selectedTag],
        priority: 1,
        style: { parts: { anchor: { color: "#ffbe5c" }, border: { visible: false } } },
      },
    ]);
    frames();
    const solid = anchorElement("lower", "out");
    const solidRow = solid ? graph.scene.store.getStyles()[solid.styleId] : undefined;
    expect(solidRow?.parts?.anchor?.color).toBe("#ffbe5c");
    expect(solidRow?.parts?.border?.visible).toBe(false);
    expect(graph.scene.store.get(entityKey("block", "lower"))?.primitives).toBe(lower);
  });

  it("moves with its block without re-encoding, and follows a theme change without re-encoding", () => {
    const primitives = anchorElement("lower", "out")?.primitives;
    graph.api.updateBlock({ id: "lower", x: 0 });
    frames();
    expect(anchorElement("lower", "out")?.x).toBe(200);
    expect(anchorElement("lower", "out")?.primitives).toBe(primitives);
    graph.setColors({ anchor: { background: "#123456" } });
    frames();
    const element = anchorElement("lower", "out");
    expect(element?.primitives).toBe(primitives);
    expect(element && graph.scene.store.getStyles()[element.styleId].base?.anchor?.color).toBe("#123456");
  });

  it("is not hit under an upper block", () => {
    // The OUT anchor of "lower" sits at (300, 188), under "upper" (x 220..420).
    const hit = graph.getElementOverPoint({ x: 300, y: 188 });
    expect(hit).toBe(graph.rootStore.blocksList.getBlockState("upper")?.getViewComponent());
  });

  it("is never walked", () => {
    const iterate = jest.spyOn(anchor("lower", "out"), "iterate");
    graph.getGraphLayer().performRender();
    frames();
    expect(iterate).not.toHaveBeenCalled();
    expect(Anchor.mode).toBe("retained");
  });

  it("leaves the scene and the hit test when block anchors are turned off", () => {
    const id = anchor("lower", "out").getSceneElementId();
    graph.updateSettings({ useBlocksAnchors: false });
    frames();
    expect(graph.scene.store.get(id)).toBeUndefined();
    expect(graph.rootStore.blocksList.getBlockState("lower")?.getAnchorById("out")?.getViewComponent()).toBeUndefined();
  });
});

describe("an anchor whose constructor finds no anchor state", () => {
  /** Renders its anchors with an id its block does not have: the Anchor constructor throws before it binds. */
  class MissingAnchorBlock extends Block {
    protected override renderAnchor(item: TAnchor): ComponentDescriptor<typeof Anchor> {
      return Anchor.create(
        { ...item, id: "missing", zIndex: this.zIndex, size: 18, lineWidth: 2, port: this.getAnchorPort(item.id) },
        { key: item.id }
      );
    }
  }

  it("throws the constructor's error only: its unmount logs no second error", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const graph = new Graph(
      { settings: { useBlocksAnchors: true, blockComponents: { Missing: MissingAnchorBlock } } },
      document.createElement("div")
    );
    graph.setEntities({
      blocks: [{ ...block("a", 100, [{ id: "out", blockId: "a", type: "OUT" }]), is: "Missing" }],
      connections: [],
    });
    graph.start();
    graph.cameraService.set({ scale: 0.5 });
    let thrown: unknown;
    try {
      frames();
    } catch (failure) {
      thrown = failure;
    }
    expect(String(thrown)).toContain("Cannot bind Anchor to missing anchor missing in block a");
    const messages = error.mock.calls.map((call) => call.map(String).join(" "));
    expect(messages.filter((message) => message.includes("unmount() after its constructor threw failed"))).toEqual([]);
    error.mockRestore();
    graph.unmount();
  });
});

import { Graph } from "../../../../graph";
import { entityKey } from "../../../../services/tags/TagStore";
import { createAnchorPortId } from "../../../../store/connection/port/utils";
import { pointer } from "../../../../test/pointer";
import type { TPoint } from "../../../../utils/types/shapes";
import { Anchor } from "../../anchors";
import type { TAnchorClass, TAnchorProps } from "../../anchors";
import { anchorLimitsOf } from "../../anchors/utils/anchorLayout";
import { Block } from "../Block";
import { anchorViewStats } from "../Blocks";
import { LegacyCanvasBlock } from "../LegacyCanvasBlock";

import { FAR, NEAR, anchored, frames, startAnchoredGraph } from "./utils/anchoredGraph";

describe("lazily created anchors", () => {
  let graph: Graph;

  const view = (id: string): Block => {
    const component = graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    if (!component) throw new Error(`no view for ${id}`);
    return component;
  };
  const anchorOf = (id: string, anchorId: string): Anchor | undefined =>
    graph.rootStore.blocksList.getBlockState(id)?.getAnchorById(anchorId)?.getViewComponent();
  const anchorChildren = (id: string): number => graph.scene.store.childrenOf(entityKey("block", id)).length;
  /** Shows the world point (x, y) at the view's top left corner. */
  const lookAt = (x: number, y: number, scale: number): void =>
    graph.cameraService.set({ scale, x: -x * scale, y: -y * scale });

  afterEach(() => {
    graph.unmount();
    anchorViewStats.enabled = false;
    anchorViewStats.reset();
    jest.restoreAllMocks();
  });

  it("creates none at the minimalistic level, then those of the blocks the camera shows at schematic", () => {
    // At 0.1 the view is 10000 x 8000 world units: both blocks are in it. At 0.5 it is 2000 x 1600: only "near".
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000), anchored("away", 50_000)], FAR);
    for (const id of ["near", "far", "away"]) {
      expect(anchorOf(id, "out")).toBeUndefined();
      expect(anchorChildren(id)).toBe(0);
    }

    graph.cameraService.set({ scale: NEAR });
    // On the frame that first draws "near" at schematic.
    frames(1);
    expect(anchorOf("near", "out")).toBeInstanceOf(Anchor);
    expect(anchorChildren("near")).toBe(2);
    expect(anchorOf("far", "out")).toBeUndefined();
    expect(anchorOf("away", "out")).toBeUndefined();

    lookAt(4900, 0, NEAR);
    frames(1);
    expect(anchorChildren("far")).toBe(2);
    expect(anchorOf("away", "out")).toBeUndefined();
    // "near" keeps its components after the camera left it.
    expect(anchorChildren("near")).toBe(2);
  });

  it("keeps them at the minimalistic level, where the scene skips their elements and draws no ring", () => {
    graph = startAnchoredGraph([anchored("near", 100)], NEAR);
    const anchor = anchorOf("near", "out");
    anchor?.toggleSelected();
    frames();
    const id = anchor?.getSceneElementId() ?? "";
    const world = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    expect(graph.scene.store.query(world, "schematic").map((element) => element.id)).toContain(id);

    graph.cameraService.set({ scale: FAR });
    frames();
    expect(anchorOf("near", "out")).toBe(anchor);
    // No primitive on the minimalistic level: the query leaves the element out before any per-element work.
    expect(graph.scene.store.get(id)?.primitives.every((primitive) => primitive.levelMask === 2)).toBe(true);
    expect(graph.scene.store.query(world, "minimalistic").map((element) => element.id)).toEqual([
      entityKey("block", "near"),
    ]);
  });

  it("creates the anchors of a block that moves into view at schematic on the first frame that draws it", () => {
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000)], NEAR);
    expect(anchorOf("far", "out")).toBeUndefined();
    graph.api.updateBlock({ id: "far", x: 600 });
    frames(1);
    expect(anchorChildren("far")).toBe(2);
  });

  it("creates the anchors a pan brings under a still pointer without a point query or a target change", () => {
    // With retargetHoverOnCameraChange off, mounting an anchor under the pointer keeps its target until the next move.
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000)], NEAR);
    // The body of "near" at world (200, 150), client (100, 75).
    pointer(graph, "pointermove", { clientX: 100, clientY: 75 });
    graph.scheduler.performUpdate();
    expect(graph.input.$hoveredComponent.value).toBe(view("near"));
    const queries = jest.spyOn(graph, "getElementOverPoint");
    // Bring the OUT anchor of "far", world (5200, 188), under the pointer: client = world * 0.5 + camera.
    graph.cameraService.set({ scale: NEAR, x: 100 - 5200 * NEAR, y: 75 - 188 * NEAR });
    frames();
    expect(queries).not.toHaveBeenCalled();
    expect(graph.input.$hoveredComponent.value).toBe(view("near"));
    // The anchor exists under the pointer: the next move finds it.
    const created = anchorOf("far", "out");
    expect(created).toBeInstanceOf(Anchor);
    expect(graph.getElementOverPoint({ x: 5200, y: 188 })).toBe(created);
  });

  it("keeps the components it has when its anchor list changes in view, and drops them out of view", () => {
    graph = startAnchoredGraph([anchored("near", 100)], NEAR);
    const out = anchorOf("near", "out");
    graph.api.updateBlock({
      id: "near",
      anchors: [...(anchored("near", 100).anchors ?? []), { id: "extra", blockId: "near", type: "OUT" }],
    });
    frames();
    expect(anchorOf("near", "out")).toBe(out);
    expect(anchorOf("near", "extra")).toBeInstanceOf(Anchor);

    graph.api.updateBlock({ id: "near", x: 50_000, anchors: anchored("near", 50_000).anchors });
    frames();
    expect(out?.isMounted()).toBe(false);
    expect(anchorChildren("near")).toBe(0);
    // The kept anchor's port is the block's again, positioned at the block's new place; the removed one has no owner.
    const port = graph.rootStore.connectionsList.getPort(createAnchorPortId("near", "out"));
    expect(port?.component).toBe(view("near"));
    expect(port?.lookup).toBe(false);
    expect(port?.getPoint()).toEqual({ x: 50_200, y: 188 });
    expect(graph.rootStore.connectionsList.getPort(createAnchorPortId("near", "extra"))?.component).toBeUndefined();
  });

  it.each([
    ["without", FAR],
    ["with", NEAR],
  ])("hides a connection to a removed anchor %s its component", (_, scale) => {
    graph = startAnchoredGraph([anchored("a", 100), anchored("b", 600)], scale);
    graph.setEntities({
      blocks: [anchored("a", 100), anchored("b", 600)],
      connections: [{ id: "ab", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" }],
    });
    frames();
    const connection = graph.rootStore.connectionsList.getConnectionState("ab");
    expect(Boolean(anchorOf("b", "in"))).toBe(scale === NEAR);
    expect(connection?.$geometry.value).toBeDefined();
    graph.api.updateBlock({ id: "b", anchors: [{ id: "out", blockId: "b", type: "OUT" }] });
    frames();
    expect(connection?.$geometry.value).toBeUndefined();
    expect(graph.rootStore.connectionsList.getPort(createAnchorPortId("b", "in"))?.lookup).toBe(true);
    // Adding it back gives the connection its endpoint again.
    graph.api.updateBlock({ id: "b", anchors: anchored("b", 600).anchors });
    frames();
    expect(connection?.$geometry.value).toEqual([
      { x: 300, y: 188 },
      { x: 600, y: 188 },
    ]);
  });

  it("creates them again when useBlocksAnchors turns back on, for the blocks in view only", () => {
    graph = startAnchoredGraph([anchored("near", 100), anchored("far", 5000)], NEAR);
    expect([anchorChildren("near"), anchorChildren("far")]).toEqual([2, 0]);
    graph.updateSettings({ useBlocksAnchors: false });
    frames();
    expect([anchorChildren("near"), anchorChildren("far")]).toEqual([0, 0]);
    graph.updateSettings({ useBlocksAnchors: true });
    frames(1);
    expect([anchorChildren("near"), anchorChildren("far")]).toEqual([2, 0]);
    expect(anchorOf("near", "out")).toBeInstanceOf(Anchor);
  });

  it("leaves anchors out of rect queries at the minimalistic level, before and after a visit", () => {
    graph = startAnchoredGraph([anchored("a", 100)], FAR);
    // Around the OUT anchor's point (300, 188), on the block's right edge.
    const rect = { x: 290, y: 178, width: 20, height: 20 };
    expect(graph.getElementsOverRect(rect, [Anchor])).toEqual([]);
    expect(graph.getElementsOverRect(rect)).toEqual([view("a")]);

    graph.cameraService.set({ scale: NEAR });
    frames();
    const anchor = anchorOf("a", "out");
    expect(graph.getElementsOverRect(rect, [Anchor])).toEqual([anchor]);

    graph.cameraService.set({ scale: FAR });
    frames();
    expect(anchorOf("a", "out")).toBe(anchor);
    expect(graph.getElementsOverRect(rect, [Anchor])).toEqual([]);
    expect(graph.getElementsOverRect(rect)).toEqual([view("a")]);
  });

  it("asks only the blocks in view, with one search of the hit-test index per camera change", () => {
    graph = startAnchoredGraph([anchored("near", 100), anchored("next", 600), anchored("far", 5000)], FAR);
    anchorViewStats.reset();
    anchorViewStats.enabled = true;
    const requests = jest.spyOn(Block.prototype, "requestAnchors");
    graph.cameraService.set({ scale: NEAR });
    expect(anchorViewStats.runs).toBe(1);
    expect(anchorViewStats.requested).toBe(2);
    expect(requests.mock.contexts).toEqual(expect.arrayContaining([view("near"), view("next")]));
    expect(requests.mock.contexts).not.toContain(view("far"));
    frames();
    // Once they exist, a camera change asks nothing.
    anchorViewStats.reset();
    graph.cameraService.set({ x: -10 });
    expect(anchorViewStats.runs).toBe(1);
    expect(anchorViewStats.requested).toBe(0);
    // At the minimalistic level the view test does not search at all.
    graph.cameraService.set({ scale: FAR });
    anchorViewStats.reset();
    graph.cameraService.set({ x: -20 });
    expect(anchorViewStats.runs).toBe(0);
  });

  it("sets the view test up when the block container mounts and disposes it when it unmounts", () => {
    anchorViewStats.reset();
    anchorViewStats.enabled = true;
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
    graph.cameraService.set({ scale: NEAR, x: 0, y: 0 });
    // Before the first frame no block container has mounted: a camera change runs nothing.
    expect(anchorViewStats.runs).toBe(0);
    graph.start();
    graph.setEntities({ blocks: [anchored("near", 100)], connections: [] });
    frames();
    anchorViewStats.reset();
    graph.cameraService.set({ x: -10 });
    expect(anchorViewStats.runs).toBe(1);
    const off = jest.spyOn(graph.hitTest, "off");
    graph.unmount();
    expect(off).toHaveBeenCalledWith("update", expect.any(Function));
    graph.cameraService.set({ x: -20 });
    expect(anchorViewStats.runs).toBe(1);
    // A fresh graph for afterEach.
    graph = new Graph({}, document.createElement("div"));
  });

  it("keeps ports and connection endpoints without anchor components, and gives a dropped anchor's port back", () => {
    graph = startAnchoredGraph([anchored("a", 100), anchored("b", 600)], FAR);
    graph.setEntities({
      blocks: [anchored("a", 100), anchored("b", 600)],
      connections: [{ id: "ab", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" }],
    });
    frames();
    const connection = graph.rootStore.connectionsList.getConnectionState("ab");
    const source = view("a").getAnchorPort("out");
    const target = view("b").getAnchorPort("in");
    // No anchor components: each block owns and positions its anchor ports.
    expect(anchorOf("a", "out")).toBeUndefined();
    expect([source.component, target.component]).toEqual([view("a"), view("b")]);
    expect(connection?.$geometry.value).toEqual([
      { x: 300, y: 188 },
      { x: 600, y: 188 },
    ]);

    graph.cameraService.set({ scale: NEAR });
    frames();
    expect(source.component).toBe(anchorOf("a", "out"));
    graph.api.updateBlock({ id: "a", x: 0 });
    frames();
    expect(connection?.$geometry.value?.[0]).toEqual({ x: 200, y: 188 });

    // The setting turned off hides anchor connections again; the block owns the port and keeps its position.
    graph.updateSettings({ useBlocksAnchors: false });
    frames();
    expect(anchorOf("a", "out")).toBeUndefined();
    expect(source.component).toBe(view("a"));
    expect(source.lookup).toBe(true);
    expect(connection?.$geometry.value).toBeUndefined();
  });

  const abConnection = [
    { id: "ab", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" },
  ];
  const endpoints = [
    { x: 300, y: 188 },
    { x: 600, y: 188 },
  ];

  it.each([
    ["without", FAR],
    ["with", NEAR],
  ])(
    "hides anchor connections when useBlocksAnchors turns off and shows them when it turns on, %s components",
    (_, scale) => {
      graph = startAnchoredGraph([anchored("a", 100), anchored("b", 600)], scale);
      graph.setEntities({ blocks: [anchored("a", 100), anchored("b", 600)], connections: abConnection });
      frames();
      const connection = graph.rootStore.connectionsList.getConnectionState("ab");
      expect(Boolean(anchorOf("a", "out"))).toBe(scale === NEAR);
      expect(connection?.$geometry.value).toEqual(endpoints);

      graph.updateSettings({ useBlocksAnchors: false });
      frames();
      expect(anchorOf("a", "out")).toBeUndefined();
      expect(connection?.$geometry.value).toBeUndefined();
      expect(view("a").getAnchorPort("out").lookup).toBe(true);
      expect(view("a").getAnchorPort("out").owner).toBe(view("a"));

      // A moved block keeps the port's position, which shows when the setting is back on.
      graph.api.updateBlock({ id: "a", x: 0 });
      frames();
      expect(connection?.$geometry.value).toBeUndefined();

      graph.updateSettings({ useBlocksAnchors: true });
      frames();
      expect(connection?.$geometry.value).toEqual([{ x: 200, y: 188 }, endpoints[1]]);
      expect(view("a").getAnchorPort("out").lookup).toBe(false);
      expect(Boolean(anchorOf("a", "out"))).toBe(scale === NEAR);
    }
  );

  it("draws anchor connections of a graph that starts with useBlocksAnchors off", () => {
    graph = startAnchoredGraph([anchored("a", 100), anchored("b", 600)], NEAR, { useBlocksAnchors: false });
    graph.setEntities({ blocks: [anchored("a", 100), anchored("b", 600)], connections: abConnection });
    frames();
    const geometry = (): unknown => graph.rootStore.connectionsList.getConnectionState("ab")?.$geometry.value;
    expect(anchorOf("a", "out")).toBeUndefined();
    expect(geometry()).toEqual(endpoints);
    // Turning it on and off again hides them, as at runtime.
    graph.updateSettings({ useBlocksAnchors: true });
    frames();
    expect(geometry()).toEqual(endpoints);
    graph.updateSettings({ useBlocksAnchors: false });
    frames();
    expect(geometry()).toBeUndefined();
  });

  it("does not hit anchors at the minimalistic level, with or without their components", () => {
    graph = startAnchoredGraph([anchored("a", 100)], FAR);
    // The OUT anchor's point is on the block's right edge, (300, 188).
    expect(anchorOf("a", "out")).toBeUndefined();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(view("a"));

    graph.cameraService.set({ scale: NEAR });
    frames();
    const anchor = anchorOf("a", "out");
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(anchor);

    graph.cameraService.set({ scale: FAR });
    frames();
    expect(anchorOf("a", "out")).toBe(anchor);
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(view("a"));
    expect(graph.getElementsOverPoint({ x: 300, y: 188 }, [Anchor])).toEqual([]);
  });

  it("applies to walked legacy blocks too", () => {
    graph = startAnchoredGraph(
      [
        { ...anchored("near", 100), is: "Legacy" },
        { ...anchored("far", 5000), is: "Legacy" },
      ],
      FAR,
      {
        blockComponents: { Legacy: LegacyCanvasBlock },
      }
    );
    expect(view("near")).toBeInstanceOf(LegacyCanvasBlock);
    expect(anchorOf("near", "out")).toBeUndefined();
    graph.cameraService.set({ scale: NEAR });
    frames(1);
    expect(anchorChildren("near")).toBe(2);
    expect(anchorOf("far", "out")).toBeUndefined();
  });

  it("recomputes the largest anchor overflow when the block list changes, so a removed outlier stops widening", () => {
    /** Every anchor 500 world units left of the block. */
    class Outlier extends Block {
      public override getAnchorPosition(): TPoint {
        return { x: -500, y: 0 };
      }
    }
    graph = startAnchoredGraph([anchored("plain", 100), { ...anchored("outlier", 2000), is: "Outlier" }], FAR, {
      blockComponents: { Outlier },
    });
    expect(anchorLimitsOf(graph).overflow).toBe(500);
    // The data is replaced without the outlier.
    graph.setEntities({ blocks: [anchored("plain", 100), anchored("other", 600)], connections: [] });
    frames();
    expect(anchorLimitsOf(graph).overflow).toBe(0);
    // Added again, it counts again.
    graph.setEntities({ blocks: [anchored("plain", 100), { ...anchored("outlier", 2000), is: "Outlier" }] });
    frames();
    expect(anchorLimitsOf(graph).overflow).toBe(500);
  });

  describe("a look that alone crosses the view's edge (Anchor.LOOK_EXTENT, as an export reads it)", () => {
    // At 0.5 the view starts at world x = 0. The OUT anchor of a block at x = -205 (width 200) sits at x = -5: its dot
    // (radius 9) and ring reach 11.5 world units, so they show at the view's left edge while the block and the anchor
    // point lie outside it. A block 25 units further left keeps its look outside.

    it("creates such anchors when the block mounts in view", () => {
      graph = startAnchoredGraph([anchored("edge", -205), anchored("past", -230)], NEAR);
      expect(anchorOf("edge", "out")).toBeInstanceOf(Anchor);
      expect(anchorChildren("edge")).toBe(2);
      expect(anchorChildren("past")).toBe(0);
      // The live scene now has the dot an export of the view draws.
      const id = anchorOf("edge", "out")?.getSceneElementId() ?? "";
      expect(graph.scene.store.query({ minX: 0, minY: 0, maxX: 2000, maxY: 1600 }, "schematic")).toContainEqual(
        expect.objectContaining({ id })
      );
    });

    it("creates such anchors when the camera brings their look into view, in one search", () => {
      graph = startAnchoredGraph([anchored("edge", 100), anchored("past", 75)], FAR);
      anchorViewStats.reset();
      anchorViewStats.enabled = true;
      // The view starts at world x = 305: the OUT dot at x = 300 reaches 311.5, the other one (at 275) 286.5.
      lookAt(305, 0, NEAR);
      expect(anchorViewStats.runs).toBe(1);
      expect(anchorViewStats.requested).toBe(1);
      frames(1);
      expect(anchorChildren("edge")).toBe(2);
      expect(anchorChildren("past")).toBe(0);
    });

    it("reads the reach of a getAnchorClass class that declares a larger LOOK_EXTENT", () => {
      class WideAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
        public static override LOOK_EXTENT = 40;
      }
      class WideAnchorBlock extends Block {
        protected override getAnchorClass(): TAnchorClass {
          return WideAnchor;
        }
      }
      // The OUT point at x = -30: out of a stock anchor's reach, in this one's.
      graph = startAnchoredGraph([{ ...anchored("wide", -230), is: "Wide" }, anchored("plain", -230, 400)], NEAR, {
        blockComponents: { Wide: WideAnchorBlock },
      });
      expect(anchorOf("wide", "out")).toBeInstanceOf(WideAnchor);
      expect(anchorChildren("plain")).toBe(0);
    });
  });

  it("creates every block's anchors while the camera has no size (a graph not laid out yet)", () => {
    graph = new Graph({ settings: { useBlocksAnchors: true } }, document.createElement("div"));
    graph.start();
    graph.setEntities({ blocks: [anchored("near", 100), anchored("away", 50_000)], connections: [] });
    frames();
    expect(anchorChildren("near")).toBe(2);
    expect(anchorChildren("away")).toBe(2);
  });
});

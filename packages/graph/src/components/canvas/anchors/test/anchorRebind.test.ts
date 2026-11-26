import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import { hoveredTag } from "../../../../services/tags/builtinTags";
import type { AnchorState } from "../../../../store/anchor/Anchor";
import { anchorEntityId } from "../../../../store/anchor/anchorEntityId";
import { createAnchorPortId } from "../../../../store/connection/port/utils";
import { ECanDrag } from "../../../../store/settings";
import { pointer, pointerRoot } from "../../../../test/pointer";
import type { TBlock } from "../../blocks/Block";
import { Anchor } from "../index";
import type { TAnchor, TAnchorProps } from "../index";

/**
 * A block removed from the store and added back with the same id before a frame keeps its component and its
 * anchor components (keyed by id), but the store made new anchor states. A retained anchor rebinds to the new state.
 */

/** Schematic (0.225 to 0.7): stock anchors are created and hit. */
const NEAR = 0.5;
/** Minimalistic (below 0.225): stock anchors are not created. */
const FAR = 0.1;

const IN: TAnchor = { id: "in", blockId: "a", type: "IN" };
const OUT: TAnchor = { id: "out", blockId: "a", type: "OUT" };
const EXTRA: TAnchor = { id: "extra", blockId: "a", type: "IN", index: 1 };

const block = (id: string, x: number, anchors: TAnchor[]): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors,
});

function frames(count = 6): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("a retained anchor rebinds to the new anchor state of a block added back in the same frame", () => {
  let graph: Graph;

  /** Blocks a (x 100..300, anchors in at (100, 188) and out at (300, 188)) and b (x 600..800, out at (800, 188)). */
  function start(scale = NEAR): void {
    const root = pointerRoot();
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBlocksAnchors: true, dragThreshold: 0, canDrag: ECanDrag.ALL } }, root);
    graph.setEntities({
      blocks: [block("a", 100, [IN, OUT]), block("b", 600, [{ id: "out", blockId: "b", type: "OUT" }])],
      connections: [],
    });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale });
    graph.start();
    frames();
  }

  const stateOf = (blockId: string, anchorId: string): AnchorState => {
    const state = graph.rootStore.blocksList.getBlockState(blockId)?.getAnchorById(anchorId);
    if (!state) throw new Error(`no anchor state ${blockId}/${anchorId}`);
    return state;
  };
  const viewOf = (blockId: string, anchorId: string): Anchor => {
    const view = stateOf(blockId, anchorId).getViewComponent();
    if (!(view instanceof Anchor)) throw new Error(`no anchor component ${blockId}/${anchorId}`);
    return view;
  };
  /** Removes block a and adds it back with the same id and these anchors, with no frame in between. */
  const readd = (anchors: TAnchor[]): void => {
    graph.rootStore.blocksList.deleteBlocks(["a"]);
    graph.rootStore.blocksList.addBlock(block("a", 100, anchors));
  };
  /** The client point of a world point (camera at the origin, scale 0.5). */
  const client = (x: number, y: number): PointerEventInit => ({ clientX: x * NEAR, clientY: y * NEAR });

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("binds the kept component to the new state and unbinds the old one", () => {
    start();
    const oldState = stateOf("a", "out");
    const component = viewOf("a", "out");
    readd([IN, OUT]);
    frames();
    const newState = stateOf("a", "out");
    expect(newState).not.toBe(oldState);
    expect(component.isMounted()).toBe(true);
    expect(component.connectedState === newState).toBe(true);
    expect(newState.getViewComponent() === component).toBe(true);
    expect(oldState.getViewComponent()).toBeUndefined();
    // The old state keeps no reference to the live component.
    expect((oldState as unknown as { anchorView?: Anchor }).anchorView).toBeUndefined();
    expect(component.isEntityAvailable()).toBe(true);
    expect(component.getEntityId()).toBe(anchorEntityId("a", "out"));
  });

  it("rebinds after a setEntities that replaces the block, and after its anchor left the list and came back", () => {
    start();
    const component = viewOf("a", "out");
    graph.setEntities({ blocks: [], connections: [] });
    graph.setEntities({ blocks: [block("a", 100, [IN, OUT])], connections: [] });
    frames();
    expect(component.connectedState === stateOf("a", "out")).toBe(true);
    expect(stateOf("a", "out").getViewComponent() === component).toBe(true);
    // The same block state, a new state of the anchor's id: the anchor left the list and came back before a frame.
    const before = stateOf("a", "out");
    graph.api.updateBlock({ id: "a", anchors: [IN] });
    graph.api.updateBlock({ id: "a", anchors: [IN, OUT] });
    frames();
    expect(stateOf("a", "out") === before).toBe(false);
    expect(component.isMounted()).toBe(true);
    expect(component.connectedState === stateOf("a", "out")).toBe(true);
    expect(before.getViewComponent()).toBeUndefined();
    expect(component.isEntityAvailable()).toBe(true);
    // It still owns its port: the block reclaimed it while the anchor was out of the list.
    expect(component.getPorts()[0]?.owner === component).toBe(true);
  });

  // `$sourceBlock`, `$targetBlock` and `$hidden` follow the endpoint component's state binding.
  it("leaves the block's old state naming nothing, and the connections' deprecated block getters name the new one", () => {
    start();
    graph.rootStore.connectionsList.setConnections([{ id: "c", sourceBlockId: "b", targetBlockId: "a" }]);
    frames();
    const connection = graph.rootStore.connectionsList.getConnectionState("c");
    const stop = connection?.$targetBlock.subscribe(() => undefined);
    const oldBlockState = graph.rootStore.blocksList.getBlockState("a");
    const blockView = oldBlockState?.getViewComponent();
    expect(connection?.$targetBlock.value === oldBlockState).toBe(true);
    readd([IN, OUT]);
    frames();
    const newBlockState = graph.rootStore.blocksList.getBlockState("a");
    expect(blockView !== undefined && newBlockState?.getViewComponent() === blockView).toBe(true);
    expect(blockView?.connectedState === newBlockState).toBe(true);
    expect(oldBlockState?.getViewComponent()).toBeUndefined();
    expect(connection?.$targetBlock.value === newBlockState).toBe(true);
    // A move keeps it: the port's own state changes, the binding does not.
    graph.api.updateBlock({ id: "a", x: 150 });
    frames();
    expect(connection?.$targetBlock.value === newBlockState).toBe(true);
    expect(connection?.$targetBlock.value?.getViewComponent() === blockView).toBe(true);
    stop?.();
  });

  it("releases the port of an anchor a re-add left out while the block owned it, as for a list change", () => {
    // No anchor components at the minimalistic level: the block owns and positions the anchor ports.
    start(FAR);
    graph.rootStore.connectionsList.setConnections([
      { id: "c", sourceBlockId: "b", sourceAnchorId: "out", targetBlockId: "a", targetAnchorId: "in" },
    ]);
    frames();
    const blockView = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    const port = graph.rootStore.connectionsList.getPort(createAnchorPortId("a", "in"));
    expect(blockView !== undefined && port?.owner === blockView).toBe(true);
    readd([OUT]);
    frames();
    // The connection observes the port, so it stays, without an owner: hidden, as after a frame between the removal
    // and the re-add, or after `updateBlock` without the anchor.
    expect(graph.rootStore.connectionsList.getPort(createAnchorPortId("a", "in")) === port).toBe(true);
    expect(port?.owner).toBeUndefined();
    expect(port?.lookup).toBe(true);
    expect(blockView?.getPorts().some((each) => each.id === createAnchorPortId("a", "in"))).toBe(false);
  });

  it("follows the selection through the new state only (the old state's subscription is gone)", () => {
    start();
    const component = viewOf("a", "out");
    readd([IN, OUT]);
    frames();
    const setState = jest.spyOn(component as unknown as { setState(state: object): void }, "setState");
    graph.rootStore.blocksList.setAnchorSelection("a", "out", true);
    frames();
    expect(component.state.selected).toBe(true);
    expect(setState.mock.calls.filter(([state]) => "selected" in state)).toHaveLength(1);
  });

  it("toggles the new state's selection on a click through GraphLayer", () => {
    start();
    const component = viewOf("a", "out");
    readd([IN, OUT]);
    frames();
    const at = client(300, 188);
    pointer(graph, "pointermove", at);
    graph.scheduler.performUpdate();
    expect(graph.input.$hoveredComponent.value === component).toBe(true);
    const click = (): void => {
      pointer(graph, "pointerdown", at);
      pointer(graph, "pointerup", at);

      frames();
    };
    click();
    expect(stateOf("a", "out").$selected.value).toBe(true);
    expect(component.state.selected).toBe(true);
    click();
    expect(stateOf("a", "out").$selected.value).toBe(false);
  });

  it("accepts a drag that starts on it, and the drag moves the new block state", () => {
    start();
    const component = viewOf("a", "out");
    readd([IN, OUT]);
    frames();
    pointer(graph, "pointermove", client(300, 188));
    graph.scheduler.performUpdate();
    expect(graph.input.$hoveredComponent.value === component).toBe(true);
    pointer(graph, "pointerdown", client(300, 188));
    // A stationary sample does nothing; displacement starts the drag and moves the block.
    pointer(document, "pointermove", { ...client(300, 188), buttons: 1 });
    pointer(document, "pointermove", { ...client(320, 188), buttons: 1 });
    const drag = graph.dragService.$state.value;
    expect(drag.isDragging).toBe(true);
    expect(drag.components.includes(component)).toBe(true);
    pointer(document, "pointerup", client(320, 188));
    frames();
    expect(graph.rootStore.blocksList.getBlockState("a")?.x).toBe(120);
  });

  it("keeps an unchanged anchor's state: a reconcile that finds the same state rebinds nothing", () => {
    start();
    const otherState = stateOf("b", "out");
    const other = viewOf("b", "out");
    const setView = jest.spyOn(otherState, "setViewComponent");
    const unsetView = jest.spyOn(otherState, "unsetViewComponent");
    const propsChanged = jest.spyOn(other as unknown as { propsChanged(props: TAnchorProps): void }, "propsChanged");
    readd([IN, OUT]);
    // The same anchor list again: block b reconciles its anchors, and the store keeps their states.
    graph.api.updateBlock({ id: "b", anchors: [{ id: "out", blockId: "b", type: "OUT" }] });
    frames();
    expect(propsChanged).toHaveBeenCalled();
    expect(stateOf("b", "out") === otherState).toBe(true);
    expect(other.connectedState === otherState).toBe(true);
    expect(otherState.getViewComponent() === other).toBe(true);
    expect(setView).not.toHaveBeenCalled();
    expect(unsetView).not.toHaveBeenCalled();
  });

  it("rebinds the kept anchors by id when the anchor list changed: one removed, one added", () => {
    start();
    const removedState = stateOf("a", "in");
    const removed = viewOf("a", "in");
    const kept = viewOf("a", "out");
    readd([OUT, EXTRA]);
    frames();
    expect(removed.isMounted()).toBe(false);
    expect(removedState.getViewComponent()).toBeUndefined();
    expect(stateOf("a", "out").getViewComponent() === kept).toBe(true);
    expect(kept.connectedState === stateOf("a", "out")).toBe(true);
    const added = viewOf("a", "extra");
    expect(added === removed).toBe(false);
    expect(added.connectedState === stateOf("a", "extra")).toBe(true);
    expect(kept.isEntityAvailable() && added.isEntityAvailable()).toBe(true);
    // Both are hit where they are: out at (300, 188), and extra, now the block's only IN anchor, where in was.
    expect(graph.getElementOverPoint({ x: 300, y: 188 }) === kept).toBe(true);
    expect(graph.getElementOverPoint({ x: 100, y: 188 }) === added).toBe(true);
  });

  it("gives the ports of the anchors it drops back to the block, as for an anchor list change", () => {
    start();
    // Anchors are kept at the minimalistic level until their list changes; the re-add changes it, and at this level
    // stock anchors are not created again.
    graph.cameraService.set({ scale: FAR });
    frames();
    const component = viewOf("a", "out");
    readd([IN, OUT]);
    frames();
    expect(component.isMounted()).toBe(false);
    const blockView = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    const port = graph.rootStore.connectionsList.getPort(createAnchorPortId("a", "out"));
    expect(blockView !== undefined && port?.owner === blockView).toBe(true);
    expect(port?.lookup).toBe(false);
  });

  it("keeps the hover tag on the anchor's entity and asks for no retarget of its own", () => {
    start();
    const component = viewOf("a", "out");
    pointer(graph, "pointermove", client(300, 188));
    graph.scheduler.performUpdate();
    expect(graph.input.$hoveredComponent.value === component).toBe(true);
    const tagged = (): boolean => graph.scene.tags.peekOf("anchor", anchorEntityId("a", "out")).has(hoveredTag);
    expect(tagged()).toBe(true);
    const queries = jest.spyOn(graph, "getElementOverPoint");
    readd([IN, OUT]);
    frames();
    // Same place, same component: the target and its tag stay, and nothing finds the target again.
    expect(queries).not.toHaveBeenCalled();
    expect(graph.input.$hoveredComponent.value === component).toBe(true);
    expect(tagged()).toBe(true);
    // The pointer leaves: the tag goes from the same entity.
    pointer(graph, "pointermove", client(500, 500));
    graph.scheduler.performUpdate();
    expect(tagged()).toBe(false);
  });
});

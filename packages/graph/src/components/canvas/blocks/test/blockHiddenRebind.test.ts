import { Graph } from "../../../../graph";
import { globalScheduler } from "../../../../lib/Scheduler";
import type { BlockState } from "../../../../store/block/Block";
import type { TConnection } from "../../../../store/connection/ConnectionState";
import { createBlockPointPortId } from "../../../../store/connection/port/utils";
import { BlockGroups } from "../../groups/BlockGroups";
import { CollapsibleGroup } from "../../groups/CollapsibleGroup";
import type { TCollapsibleGroup } from "../../groups/CollapsibleGroup";
import type { Block, TBlock } from "../Block";

/**
 * A block removed and added back with its id before a frame keeps its component, which binds to the new
 * block state. The component takes the new state's hidden value, the default `false` included: a hide that came
 * from the old state does not stay.
 */

const block = (id: string, x: number, group?: string): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 300,
  width: 100,
  height: 100,
  anchors: [],
  ...(group === undefined ? {} : { group }),
});

function frames(count = 4): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("a kept block takes the hidden value of its replacement state", () => {
  let graph: Graph;

  /** Blocks a (100..200) and b (300..400) in collapsible group g, y 300..400, and block o outside it (700..800). */
  function start(connections: TConnection[] = []): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBezierConnections: false } }, root);
    graph.setEntities({ blocks: [block("a", 100, "g"), block("b", 300, "g"), block("o", 700)], connections });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale: 1 });
    graph.start();
    graph.addLayer(BlockGroups, {});
    graph.rootStore.groupsList.setGroups<TCollapsibleGroup>([
      { id: "g", rect: { x: 80, y: 280, width: 340, height: 140 }, component: CollapsibleGroup, collapsed: false },
    ]);
    frames();
  }

  const stateOf = (id: string): BlockState => {
    const state = graph.rootStore.blocksList.getBlockState(id);
    if (!state) throw new Error(`no block state ${id}`);
    return state;
  };
  const viewOf = (id: string): Block => {
    const view = stateOf(id).getViewComponent();
    if (!view) throw new Error(`no block component ${id}`);
    return view;
  };
  /** Collapses g to its default header, 200 x 48 at (80, 280): padded 60..300 x 260..348. */
  const collapse = (): void => {
    const group = graph.rootStore.groupsList.getGroupState("g")?.getViewComponent();
    if (!(group instanceof CollapsibleGroup)) throw new Error("no collapsible group");
    group.collapse();
    frames();
  };
  /** Removes block a and adds it back with the same id and this data, with no frame in between. */
  const readd = (data: TBlock): void => {
    graph.rootStore.blocksList.deleteBlocks(["a"]);
    graph.rootStore.blocksList.addBlock(data);
  };

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("shows and hits a block that left its collapsed group by a re-add", () => {
    start();
    collapse();
    const component = viewOf("a");
    expect(component.isHiddenForOtherReason()).toBe(true);
    // Below the collapsed header, inside a's rect.
    expect(graph.getElementOverPoint({ x: 150, y: 380 }) === component).toBe(false);
    readd(block("a", 100));
    frames();
    expect(viewOf("a") === component).toBe(true);
    expect(stateOf("a").$hidden.value).toBe(false);
    expect(component.isHiddenForOtherReason()).toBe(false);
    expect(graph.getElementOverPoint({ x: 150, y: 380 }) === component).toBe(true);
    // Its group member b stays hidden by the collapse.
    expect(viewOf("b").isHiddenForOtherReason()).toBe(true);
  });

  it("shows a block that was hidden directly, as a fresh component would be", () => {
    start();
    const component = viewOf("a");
    component.setHiddenBlock(true);
    frames();
    expect(component.isHiddenForOtherReason()).toBe(true);
    readd(block("a", 100));
    frames();
    expect(component.isHiddenForOtherReason()).toBe(false);
    expect(graph.getElementOverPoint({ x: 150, y: 380 }) === component).toBe(true);
  });

  it("applies a hide requested on the replacement state before the rebind", () => {
    start();
    const component = viewOf("a");
    readd(block("a", 100));
    stateOf("a").requestHidden(true);
    frames();
    expect(component.isHiddenForOtherReason()).toBe(true);
    expect(graph.getElementOverPoint({ x: 150, y: 380 }) === component).toBe(false);
  });

  it("keeps a hidden block hidden when its replacement state is hidden too", () => {
    start();
    collapse();
    const component = viewOf("a");
    const setHidden = jest.spyOn(component, "setHiddenBlock");
    readd(block("a", 100, "g"));
    // A hide requested on the replacement state before the frame, as a grouping layer that sets its groups again on
    // every block change does (`withBlockGrouping`). The group here is set once, so the test requests it itself.
    stateOf("a").requestHidden(true);
    frames();
    expect(component.isHiddenForOtherReason()).toBe(true);
    // Only the replacement's hide reaches the component: it is never shown in between.
    expect(setHidden.mock.calls).toEqual([[true]]);
  });

  it("does not touch the hidden value or the binding of a block whose state is unchanged", () => {
    start();
    collapse();
    const component = viewOf("b");
    const setHidden = jest.spyOn(component, "setHiddenBlock");
    const unsetView = jest.spyOn(stateOf("b"), "unsetViewComponent");
    readd(block("a", 100));
    frames();
    expect(setHidden).not.toHaveBeenCalled();
    expect(unsetView).not.toHaveBeenCalled();
    expect(component.isHiddenForOtherReason()).toBe(true);
  });

  // A block outside a collapsed group is shown and owns its ports, whether a frame passes between the removal and the
  // re-add or not: the collapse gives back the ports it delegated once the block leaves the group.
  it("gives a block that left its collapsed group by a re-add its ports back, with or without a frame between", () => {
    const outcome = (frameBetween: boolean): { delegated: boolean; hidden: boolean } => {
      start([{ id: "c", sourceBlockId: "a", targetBlockId: "o" }]);
      collapse();
      graph.rootStore.blocksList.deleteBlocks(["a"]);
      if (frameBetween) frames();
      graph.rootStore.blocksList.addBlock(block("a", 100));
      frames();
      const port = graph.rootStore.connectionsList.getPort(createBlockPointPortId("a", false));
      const result = { delegated: port?.isDelegated ?? false, hidden: viewOf("a").isHiddenForOtherReason() };
      graph.unmount();
      return result;
    };
    const between = outcome(true);
    const sameFrame = outcome(false);
    expect(sameFrame).toEqual({ delegated: false, hidden: false });
    expect(between).toEqual({ delegated: false, hidden: false });
    // afterEach unmounts the last graph again.
    start();
  });
});

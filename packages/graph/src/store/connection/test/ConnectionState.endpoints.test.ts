import type { TAnchor } from "../../../components/canvas/anchors";
import { Anchor } from "../../../components/canvas/anchors";
import type { TBlock } from "../../../components/canvas/blocks/Block";
import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { BlockState } from "../../block/Block";
import type { ConnectionState, TConnection } from "../ConnectionState";

/**
 * Task 3y: `$sourceBlock`, `$targetBlock` and `$hidden` follow the block state the endpoint's component is bound to.
 * A block removed and added back with its id before a frame keeps its component, which binds to the new state; the
 * endpoints then name the new state, for block ports and anchor ports.
 */

/** Schematic: stock anchors are created and own their ports. */
const NEAR = 0.5;
/** Minimalistic: stock anchors are not created, and the block owns its anchor ports. */
const FAR = 0.1;

const anchor = (blockId: string, type: "IN" | "OUT"): TAnchor => ({ id: type.toLowerCase(), blockId, type });

const block = (id: string, x: number): TBlock => ({
  is: "Block",
  id,
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors: [anchor(id, "IN"), anchor(id, "OUT")],
});

const BLOCKS = [block("a", 100), block("b", 600)];
/** From a's block port to b's block port. */
const BY_BLOCKS: TConnection = { id: "blocks", sourceBlockId: "a", targetBlockId: "b" };
/** From a's OUT anchor to b's IN anchor. */
const BY_ANCHORS: TConnection = {
  id: "anchors",
  sourceBlockId: "a",
  sourceAnchorId: "out",
  targetBlockId: "b",
  targetAnchorId: "in",
};

function frames(count = 6): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("connection endpoints follow the block state their component is bound to", () => {
  let graph: Graph;
  let stops: (() => void)[] = [];

  function start(scale: number): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBlocksAnchors: true, useBezierConnections: false } }, root);
    graph.setEntities({ blocks: BLOCKS, connections: [BY_BLOCKS, BY_ANCHORS] });
    graph.cameraService.set({ width: 1000, height: 800, x: 0, y: 0, scale });
    graph.start();
    frames();
  }

  const blockState = (id: string): BlockState => {
    const state = graph.rootStore.blocksList.getBlockState(id);
    if (!state) throw new Error(`no block state ${id}`);
    return state;
  };
  const connection = (id: string): ConnectionState => {
    const state = graph.rootStore.connectionsList.getConnectionState(id);
    if (!state) throw new Error(`no connection ${id}`);
    return state;
  };
  /** Watches the endpoint computeds, as their consumers do: a watched computed keeps its value until a source changes. */
  const watch = (state: ConnectionState): void => {
    stops.push(state.$sourceBlock.subscribe(() => undefined));
    stops.push(state.$targetBlock.subscribe(() => undefined));
    stops.push(state.$hidden.subscribe(() => undefined));
  };
  /** Removes both blocks and adds them back with the same ids, with no frame in between unless `frameBetween`. */
  const readdBlocks = (frameBetween = false): void => {
    graph.rootStore.blocksList.deleteBlocks(["a", "b"]);
    if (frameBetween) frames();
    BLOCKS.forEach((each) => graph.rootStore.blocksList.addBlock(each));
  };

  afterEach(() => {
    stops.forEach((stop) => stop());
    stops = [];
    graph.unmount();
  });

  describe.each([
    ["schematic, the anchors own their ports, no frame between", NEAR, false],
    ["minimalistic, the blocks own the anchor ports, no frame between", FAR, false],
    ["schematic, the anchors own their ports, a frame between", NEAR, true],
    ["minimalistic, the blocks own the anchor ports, a frame between", FAR, true],
  ])("at %s", (_level, scale, frameBetween) => {
    it.each([
      ["block ports", BY_BLOCKS.id as string],
      ["anchor ports", BY_ANCHORS.id as string],
    ])("names the replacement block states through %s", (_ports, id) => {
      start(scale);
      const state = connection(id);
      watch(state);
      const oldA = blockState("a");
      const oldB = blockState("b");
      expect(state.$sourceBlock.value === oldA).toBe(true);
      expect(state.$targetBlock.value === oldB).toBe(true);
      readdBlocks(frameBetween);
      frames();
      expect(state.$sourceBlock.value === blockState("a")).toBe(true);
      expect(state.$targetBlock.value === blockState("b")).toBe(true);
      expect(blockState("a") === oldA).toBe(false);
      // The removed states name no component, whichever way the block came back.
      expect(oldA.getViewComponent()).toBeUndefined();
      expect(oldB.getViewComponent()).toBeUndefined();
    });

    it.each([
      ["block ports", BY_BLOCKS.id as string],
      ["anchor ports", BY_ANCHORS.id as string],
    ])("hides the line through %s once both replacement blocks are hidden", (_ports, id) => {
      start(scale);
      const state = connection(id);
      watch(state);
      readdBlocks(frameBetween);
      frames();
      blockState("a").requestHidden(true);
      blockState("b").requestHidden(true);
      frames();
      expect(state.$hidden.value).toBe(true);
      const view = state.getViewComponent();
      expect(view instanceof BlockConnection && view.isPathVisible()).toBe(false);
      blockState("a").requestHidden(false);
      frames();
      expect(state.$hidden.value).toBe(false);
      expect(view instanceof BlockConnection && view.isPathVisible()).toBe(true);
    });
  });

  it("follows an anchor component's rebind through its anchor port", () => {
    start(NEAR);
    const state = connection(BY_ANCHORS.id as string);
    watch(state);
    const port = state.$sourcePortState.value;
    expect(port.component instanceof Anchor).toBe(true);
    readdBlocks();
    frames();
    // The same anchor component owns the port, bound to the anchor state of the new block state.
    expect(port.component instanceof Anchor).toBe(true);
    expect(state.$sourceBlock.value === blockState("a")).toBe(true);
  });

  it("keeps its value when nothing it reads changed", () => {
    start(NEAR);
    const state = connection(BY_BLOCKS.id as string);
    const values: unknown[] = [];
    stops.push(state.$sourceBlock.subscribe((value) => values.push(value)));
    graph.api.updateBlock({ id: "a", x: 150 });
    graph.rootStore.blocksList.addBlock(block("c", 900));
    frames();
    expect(values).toHaveLength(1);
    expect(values[0] === blockState("a")).toBe(true);
  });
});

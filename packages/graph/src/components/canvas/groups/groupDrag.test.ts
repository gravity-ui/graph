import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { BlockState } from "../../../store/block/Block";
import type { TBlock } from "../blocks/Block";

import { BlockGroups } from "./BlockGroups";

const block = (id: string, x: number, group?: string): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y: 10.25,
  width: 30.5,
  height: 20.75,
  anchors: [],
  meta: {},
  group,
});

const Grouping = BlockGroups.withBlockGrouping({
  groupingFn: (blocks) => {
    const groups: Record<string, BlockState[]> = {};
    for (const each of blocks) {
      const id = each.$state.value.group;
      if (id) (groups[id] ??= []).push(each);
    }
    return groups;
  },
  mapToGroups: (id, { rect }) => ({ id, rect }),
});
const Predefined = BlockGroups.withPredefinedGroups();

describe.each(["grouping", "predefined"] as const)("%s group drag", (kind) => {
  let graph: Graph;
  let layer: BlockGroups;
  const origin = 2 ** 32 + 0.125;
  const state = (id: string) => {
    const value = graph.blocks.getBlockState(id);
    if (!value) throw new Error(`Missing block ${id}`);
    return value;
  };

  beforeEach(() => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({}, root);
    graph.setEntities({
      blocks: [block("a", origin, "g"), block("b", origin + 100, "g"), block("c", origin + 200, "g"), block("o", 800)],
    });
    graph.start();
    if (kind === "predefined") {
      const predefined = graph.addLayer(Predefined, { updateBlocksOnDrag: true });
      predefined.defineGroups([{ id: "g", blocksIds: ["a", "b", "c"] }]);
      layer = predefined;
    } else {
      layer = graph.addLayer(Grouping, { updateBlocksOnDrag: true });
    }
    globalScheduler.performUpdate();
  });

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("settles the group once per drag step and preserves fractional, large-world bounds", () => {
    const groups = jest.spyOn(graph.rootStore.groupsList, "setGroups");
    layer.updateBlocks("g", { deltaX: 40.25, deltaY: 20.5 });
    expect(groups).toHaveBeenCalledTimes(1);
    expect([state("a").x, state("b").x, state("c").x]).toEqual([origin + 40.25, origin + 140.25, origin + 240.25]);
    expect(state("o").x).toBe(800);
    expect(graph.rootStore.groupsList.getGroupState("g")?.$state.value.rect).toEqual({
      x: origin + 40.25,
      y: 30.75,
      width: 230.5,
      height: 20.75,
    });
  });

  it("does not traverse unrelated block metadata to calculate group bounds", () => {
    const readMetadata = jest.fn(() => "payload");
    Object.defineProperty(state("a").$state.value.meta, "payload", { enumerable: true, get: readMetadata });
    layer.updateBlocks("g", { deltaX: 1, deltaY: 2 });
    expect(readMetadata).not.toHaveBeenCalled();
  });

  it("keeps synchronous per-member events, vetoes and replacement guards", () => {
    const oldC = state("c");
    const events: string[] = [];
    const geometry = jest.fn();
    graph.on("blocks-geometry-change", geometry);
    graph.on("block-change", (event) => {
      const id = String(event.detail.block.id);
      events.push(id);
      if (id === "b") {
        // Earlier accepted writes are readable before the next member's event.
        expect(state("a").x).toBe(origin + 40);
        expect(event.detail.block.x).toBe(origin + 100);
        event.preventDefault();
      }
      if (id === "c") {
        graph.blocks.deleteBlocks(["c"]);
        graph.api.addBlock(block("c", origin + 500, "g"));
      }
    });
    layer.updateBlocks("g", { deltaX: 40, deltaY: 20 });
    graph.blocks.flushBatchedBlocksGeometryEmit();
    expect(events).toEqual(["a", "b", "c"]);
    expect(state("a").x).toBe(origin + 40);
    expect(state("b").x).toBe(origin + 100);
    expect(state("c").x).toBe(origin + 500);
    expect(state("c")).not.toBe(oldC);
    expect(state("o").x).toBe(800);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(geometry.mock.calls[0][0].detail.blocks.map((each: { id: string }) => each.id)).toEqual(["a"]);
  });
});

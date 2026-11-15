import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TPort } from "../../../store/connection/port/Port";
import { createAnchorPortId, createBlockPointPortId } from "../../../store/connection/port/utils";

import type { TBlock } from "./Block";

/**
 * Task 17f: a block writes its ports on every state change; a change that leaves its geometry (here its `meta`) must
 * leave the ports' states, and so the geometry of the connections at them, as they are: a new port state made every
 * connection of a bulk meta change recompute and re-batch its path.
 */

const block = (id: string, x: number): TBlock => ({
  id,
  is: "Block",
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  meta: { status: "queued" },
  anchors: [
    { id: "in", blockId: id, type: "IN" },
    { id: "out", blockId: id, type: "OUT" },
  ],
});

function frames(count = 4): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

describe("Block ports on a state change", () => {
  let graph: Graph;

  beforeEach(() => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
    graph.start();
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    graph.setEntities({
      blocks: [block("a", 0), block("b", 400)],
      connections: [
        { id: "anchors", sourceBlockId: "a", sourceAnchorId: "out", targetBlockId: "b", targetAnchorId: "in" },
        { id: "points", sourceBlockId: "a", targetBlockId: "b" },
      ],
    });
    frames();
  });

  afterEach(() => {
    graph.unmount();
  });

  const portIds = (): string[] => [
    String(createAnchorPortId("a", "out")),
    String(createAnchorPortId("b", "in")),
    String(createBlockPointPortId("a", false)),
    String(createBlockPointPortId("b", true)),
  ];
  const portStates = (): Array<TPort | undefined> =>
    portIds().map((id) => graph.rootStore.connectionsList.ports.getPort(id)?.$state.peek());
  const geometries = (): unknown[] =>
    ["anchors", "points"].map((id) => graph.rootStore.connectionsList.getConnectionState(id)?.$geometry.value);

  it("keeps the port states and the connection geometry when only the meta changes", () => {
    const ports = portStates();
    const geometry = geometries();
    expect(ports.every((state) => state !== undefined && !state.lookup)).toBe(true);
    expect(geometry.every((value) => value !== undefined)).toBe(true);

    graph.api.updateBlock({ id: "a", meta: { status: "running" } });
    graph.api.updateBlock({ id: "b", meta: { status: "failed" } });
    frames();

    expect(graph.rootStore.blocksList.getBlockState("a")?.$state.value.meta).toEqual({ status: "running" });
    portStates().forEach((state, index) => expect(state).toBe(ports[index]));
    geometries().forEach((value, index) => expect(value).toBe(geometry[index]));
  });

  it("moves the ports and the connection geometry with the block", () => {
    const geometry = geometries();

    graph.api.updateBlock({ id: "a", x: 50 });
    frames();

    const [anchorOut, , pointOut] = portStates();
    expect(anchorOut?.x).toBe(250);
    expect(pointOut?.x).toBe(250);
    geometries().forEach((value, index) => expect(value).not.toBe(geometry[index]));
  });
});

import { Graph } from "../../graph";

import { PortState } from "./port/Port";

const block = { id: 0, is: "Block", name: "zero", x: 0, y: 0, width: 100, height: 100 };

test("zero IDs survive insertion and connection updates preserve identity", () => {
  const graph = new Graph({});
  expect(graph.api.addBlock(block)).toBe(0);
  expect(graph.api.addConnection({ id: 0, sourceBlockId: 0, targetBlockId: 0 })).toBe(0);
  const state = graph.connections.getConnectionState(0);
  graph.api.updateConnection(0, { id: "other" });
  expect(state?.id).toBe(0);
});

test("missing endpoints stay unresolved and are isolated between connections", () => {
  const graph = new Graph({});
  graph.api.addConnection({ id: "a" });
  graph.api.addConnection({ id: "b" });
  const a = graph.connections.getConnectionState("a");
  const b = graph.connections.getConnectionState("b");
  expect(a?.$geometry.value).toBeUndefined();
  expect(a?.$sourcePortId.value).not.toBe(b?.$sourcePortId.value);
  graph.connections.setConnections([]);
  expect(graph.connections.getAllPorts()).toHaveLength(0);
  // Retained state snapshots cannot resurrect port observers after deletion.
  expect(a?.$sourcePortState.value.observers.size).toBe(0);
  expect(graph.connections.getAllPorts()).toHaveLength(0);
});

test("port metadata replaces arbitrary consumer values and is preserved when omitted", () => {
  const port = new PortState<string>({ id: "p", x: 0, y: 0, meta: "old" });
  port.updatePort({ x: 10 });
  expect(port.meta).toBe("old");
  port.updatePort({ meta: "new" });
  expect(port.meta).toBe("new");
  port.updatePort({ meta: undefined });
  expect(port.meta).toBeUndefined();
});

test("geometry event excludes a block deleted by a block-change listener", () => {
  const graph = new Graph({ blocks: [block] });
  const changed = jest.fn();
  graph.on("blocks-geometry-change", changed);
  graph.on("block-change", () => graph.blocks.deleteBlocks([0]));
  graph.blocks.updatePosition(0, { x: 10, y: 20 });
  graph.blocks.flushBatchedBlocksGeometryEmit();
  expect(changed).not.toHaveBeenCalled();
  expect(graph.api.zoomToBlocks([0])).toBe(false);
});

test("changing endpoint releases old observers and explicit zero port IDs resolve", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: 0, targetPortId: "t" }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  const oldPort = state.$sourcePortState.value;
  expect(oldPort.id).toBe(0);
  graph.api.updateConnection("c", { sourcePortId: "next" });
  expect(state.$sourcePortState.value.id).toBe("next");
  expect(oldPort.observers.size).toBe(0);
  expect(graph.connections.getPort(0)).toBeUndefined();
});

test("destroyed connection cannot retain zero port observer or revive geometry", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: 0, targetPortId: 0 }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  const port = state.$sourcePortState.value;
  port.updatePort({ x: 10, y: 10, lookup: false });
  expect(state.$geometry.value).toBeDefined();
  graph.connections.deleteConnections([state]);
  expect(port.observers.size).toBe(0);
  expect(state.$geometry.value).toBeUndefined();
});

test("retained block state cannot move a replacement with the same ID", () => {
  const graph = new Graph({ blocks: [block] });
  const previous = graph.blocks.getBlockState(0);
  graph.blocks.deleteBlocks([0]);
  graph.api.addBlock({ ...block, x: 50 });
  previous?.updateXY(999, 999, true);
  expect(graph.blocks.getBlockState(0)?.x).toBe(50);
});

test("removing a port immediately invalidates retained connection geometry", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t" }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  state.$sourcePortState.value.updatePort({ lookup: false });
  state.$targetPortState.value.updatePort({ lookup: false });
  expect(state.$geometry.value).toBeDefined();
  graph.connections.deletePorts(["s"]);
  expect(state.$geometry.value).toBeUndefined();
});

test("zooming an empty rectangle before attachment keeps camera coordinates finite", () => {
  const graph = new Graph({});
  graph.api.zoomToRect({ x: 0, y: 0, width: 0, height: 0 });
  const camera = graph.cameraService.getCameraState();
  expect([camera.x, camera.y, camera.scale].every(Number.isFinite)).toBe(true);
});

test("retained anchor state cannot select a replacement with the same ID", () => {
  const anchor = { id: "a", blockId: 0, type: "OUT" };
  const graph = new Graph({ blocks: [{ ...block, anchors: [anchor] }] });
  const state = graph.blocks.getBlockState(0);
  const previous = state?.getAnchorById("a");
  state?.updateAnchors([]);
  state?.updateAnchors([anchor]);
  previous?.setSelection(true);
  expect(graph.blocks.anchorSelectionBucket.isSelected("a")).toBe(false);
});

test("arbitrary anchor types produce finite per-type indexes", () => {
  const graph = new Graph({
    blocks: [
      {
        ...block,
        anchors: [
          { id: "a", blockId: 0, type: "constructor" },
          { id: "b", blockId: 0, type: "constructor" },
          { id: "c", blockId: 0, type: "__proto__" },
        ],
      },
    ],
  });
  expect(Array.from(graph.blocks.getBlockState(0)?.$anchorIndexs.value.values() ?? [])).toEqual([0, 1, 0]);
});

test("deleting a port releases observers even before connection destruction", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "s", targetPortId: "t" }] });
  const state = graph.connections.getConnectionState("c");
  if (!state) throw new Error("Expected connection");
  const port = state.$sourcePortState.value;
  expect(port.observers.has(state)).toBe(true);
  graph.connections.deletePorts(["s"]);
  graph.connections.deleteConnections([state]);
  expect(port.observers.size).toBe(0);
});

test("pending geometry cannot describe a replacement block", () => {
  const graph = new Graph({ blocks: [block] });
  const changed = jest.fn();
  graph.on("blocks-geometry-change", changed);
  graph.blocks.updatePosition(0, { x: 10, y: 20 });
  graph.blocks.deleteBlocks([0]);
  graph.api.addBlock({ ...block, x: 500, y: 500 });
  graph.blocks.flushBatchedBlocksGeometryEmit();
  expect(changed).not.toHaveBeenCalled();
});

test("repeated deletion of a retained connection state preserves its replacement", () => {
  const graph = new Graph({ connections: [{ id: "c", sourcePortId: "old", targetPortId: "t" }] });
  const previous = graph.connections.getConnectionState("c");
  if (!previous) throw new Error("Expected connection");
  graph.connections.deleteConnections([previous]);
  graph.api.addConnection({ id: "c", sourcePortId: "new", targetPortId: "t" });
  const current = graph.connections.getConnectionState("c");
  if (!current) throw new Error("Expected replacement");
  const port = current.$sourcePortState.value;
  graph.connections.deleteConnections([previous]);
  expect(graph.connections.getConnectionState("c")).toBe(current);
  expect(port.observers.has(current)).toBe(true);
});

import { Graph } from "../../graph";

test("lookups and updates tolerate missing and removed IDs", () => {
  const graph = new Graph({});
  expect(graph.rootStore.blocksList.getBlockState("missing")).toBeUndefined();
  expect(graph.rootStore.blocksList.getBlockState("missing")?.getAnchorById("anchor")).toBeUndefined();
  expect(graph.rootStore.connectionsList.getConnectionState("missing")).toBeUndefined();
  expect(graph.api.getBlockById("missing")).toBeUndefined();
  expect(() => graph.api.updateConnection("missing", {})).not.toThrow();
  graph.setEntities({
    blocks: [
      {
        id: "block",
        is: "Block",
        name: "Block",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        anchors: [{ id: "anchor", blockId: "block", type: "IN" }],
      },
    ],
  });
  expect(graph.rootStore.blocksList.getBlockState("block")?.id).toBe("block");
  expect(graph.rootStore.blocksList.getBlockState("block")?.getAnchorById("anchor")?.id).toBe("anchor");
  graph.api.addConnection({ id: "connection", sourceBlockId: "block", targetBlockId: "block" });
  expect(graph.rootStore.connectionsList.getConnectionState("connection")?.id).toBe("connection");
  expect(graph.rootStore.connectionsList.getConnectionStates(["connection", "missing"])).toHaveLength(1);
  graph.setEntities({ blocks: [], connections: [] });
  expect(graph.rootStore.connectionsList.getConnectionState("connection")).toBeUndefined();
  expect(graph.rootStore.connectionsList.getConnectionStates(["connection"])).toEqual([]);
  expect(graph.rootStore.blocksList.getBlockState("block")).toBeUndefined();
  expect(graph.api.getBlockById("block")).toBeUndefined();
  expect(graph.rootStore.blocksList.getBlockState("block")?.getAnchorById("anchor")).toBeUndefined();
});

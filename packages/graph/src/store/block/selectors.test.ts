import { Graph } from "../../graph";
import { selectConnectionById } from "../connection/selectors";

import { selectBlockAnchor, selectBlockById } from "./selectors";

test("lookups and updates tolerate missing and removed IDs", () => {
  const graph = new Graph({});
  expect(selectBlockById(graph, "missing")).toBeUndefined();
  expect(selectBlockAnchor(graph, "missing", "anchor")).toBeUndefined();
  expect(selectConnectionById(graph, "missing")).toBeUndefined();
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
  expect(selectBlockById(graph, "block")?.id).toBe("block");
  expect(selectBlockAnchor(graph, "block", "anchor")?.id).toBe("anchor");
  graph.api.addConnection({ id: "connection", sourceBlockId: "block", targetBlockId: "block" });
  expect(selectConnectionById(graph, "connection")?.id).toBe("connection");
  expect(graph.rootStore.connectionsList.getConnectionStates(["connection", "missing"])).toHaveLength(1);
  graph.setEntities({ blocks: [], connections: [] });
  expect(selectConnectionById(graph, "connection")).toBeUndefined();
  expect(graph.rootStore.connectionsList.getConnectionStates(["connection"])).toEqual([]);
  expect(selectBlockById(graph, "block")).toBeUndefined();
  expect(graph.api.getBlockById("block")).toBeUndefined();
  expect(selectBlockAnchor(graph, "block", "anchor")).toBeUndefined();
});

export function sourceLookupTypeProbe(graph: Graph) {
  const block = selectBlockById(graph, "missing");
  const id = block?.id;
  // @ts-expect-error source selector cannot assert a subtype by ID
  selectBlockById<{ id: string }>(graph, "missing");
  return { id, block };
}

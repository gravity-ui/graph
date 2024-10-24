import { Graph } from "../../graph";
import { TBlockId } from "../block/Block";

import { ConnectionState, TConnectionId } from "./ConnectionState";

export function selectConnectionById(graph: Graph, id: TConnectionId) {
  return graph.rootStore.connectionsList.$connectionsMap.value.get(id);
}

export function selectConnectionsByBlockId(graph: Graph, id: TBlockId): ConnectionState[] {
  return graph.rootStore.connectionsList.$connections.value.filter((connection) =>
    [connection.targetBlockId, connection.sourceBlockId].includes(id)
  );
}

import { TBlockId } from "../block/Block";
import { ConnectionState } from "./ConnectionState";
import { Graph } from "../../graph";

export function selectConnectionById(graph: Graph, id: string) {
  return graph.rootStore.connectionsList.$connectionsMap.value.get(id);
}

export function selectConnectionsByBlockId(graph: Graph, id: TBlockId): ConnectionState[] {
  return graph.rootStore.connectionsList.$connections.value.filter((connection) =>
    [connection.targetBlockId, connection.sourceBlockId].includes(id)
  );
}

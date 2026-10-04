import { Graph } from "../../graph";

import { ConnectionState, TConnectionId } from "./ConnectionState";

export function selectConnectionById(graph: Graph, id: TConnectionId): ConnectionState | undefined {
  return graph.rootStore.connectionsList.$connectionsMap.value.get(id);
}

import { Graph } from "../../graph";

import { TConnectionId } from "./ConnectionState";

export function selectConnectionById(graph: Graph, id: TConnectionId) {
  return graph.rootStore.connectionsList.$connectionsMap.value.get(id);
}

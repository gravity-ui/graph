import type { TBlockId } from "@gravity-ui/graph";

import type { LayeredLayoutConnection } from "../types";

export type TBlockEndpoints = { sourceBlockId: TBlockId; targetBlockId: TBlockId };

/** Only connections between two blocks take part in the layout; port-only connections are skipped. */
export function hasBlockEndpoints<T extends LayeredLayoutConnection>(connection: T): connection is T & TBlockEndpoints {
  return (
    connection.sourceBlockId !== undefined &&
    connection.sourceBlockId !== null &&
    connection.targetBlockId !== undefined &&
    connection.targetBlockId !== null
  );
}

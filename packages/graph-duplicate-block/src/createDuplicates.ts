import { createAnchorPortId, createBlockPointPortId } from "@gravity-ui/graph";
import type {
  TBlock,
  TBlockId,
  TConnection,
  TConnectionId,
  TLabel,
  TMultipointConnection,
  TPoint,
  TPortId,
} from "@gravity-ui/graph";

export type TDuplicates = {
  blocks: TBlock[];
  connections: TConnection[];
};

export type TCreateDuplicatesParams = {
  /** Snapshots of the blocks being duplicated with the positions of their duplicates. */
  blocks: Array<{ block: TBlock; coord: TPoint }>;
  /** Snapshots of all connections in the graph. */
  connections: TMultipointConnection[];
  /** Offset applied to the route points and labels of duplicated connections. */
  delta: TPoint;
  /** Returns the ID of the duplicate of the given source block. */
  createId: (block: TBlock) => TBlockId;
  /** Returns the ID of the duplicate of the given source connection. */
  createConnectionId: (connection: TConnection) => TConnectionId;
};

export function createDuplicateBlockId(block: TBlock): TBlockId {
  return `${block.id.toString()}-added-from-shadow-${Date.now()}`;
}

let duplicatedConnectionsCount = 0;

export function createDuplicateConnectionId(connection: TConnection): TConnectionId {
  duplicatedConnectionsCount += 1;
  return `${String(connection.id ?? "connection")}-added-from-shadow-${Date.now()}-${duplicatedConnectionsCount}`;
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

function shiftLabel(label: TLabel, delta: TPoint): TLabel {
  return {
    ...label,
    ...(label.x === undefined ? {} : { x: label.x + delta.x }),
    ...(label.y === undefined ? {} : { y: label.y + delta.y }),
  };
}

/** Maps the ports core derives for a block (block points and anchors) to the same ports of its duplicate. */
function addDerivedPorts(ports: Map<TPortId, TPortId>, block: TBlock, duplicateId: TBlockId): void {
  ports.set(createBlockPointPortId(block.id, false), createBlockPointPortId(duplicateId, false));
  ports.set(createBlockPointPortId(block.id, true), createBlockPointPortId(duplicateId, true));
  for (const anchor of block.anchors ?? []) {
    ports.set(createAnchorPortId(block.id, anchor.id), createAnchorPortId(duplicateId, anchor.id));
  }
}

/**
 * Builds the duplicates of the given blocks and of the connections between them.
 *
 * Each duplicate keeps every field of its source except `id`, position and selection.
 *
 * Connections are duplicated only when at least two blocks are duplicated. Each end is resolved the way core
 * resolves it: by its port ID when it has one, otherwise by its block ID (with an optional anchor ID).
 * - A block end is duplicated when its block is duplicated; the anchor ID is kept.
 * - A port end is duplicated when it is a port core derives for a duplicated block (its block point or one
 *   of its anchors). Custom ports cannot be mapped to the duplicate, so such connections are skipped.
 * A connection is copied only when both ends can be duplicated. The copy keeps every field except selection,
 * gets an ID from `createConnectionId`, and its route points and positioned labels are shifted by `delta`.
 */
export function createDuplicates({
  blocks,
  connections,
  delta,
  createId,
  createConnectionId,
}: TCreateDuplicatesParams): TDuplicates {
  const idMap = new Map<string, TBlockId>();
  const portMap = new Map<TPortId, TPortId>();

  const duplicatedBlocks = blocks.map(({ block, coord }) => {
    const { selected: _selected, ...source } = block;
    const id = createId(block);
    idMap.set(block.id.toString(), id);
    addDerivedPorts(portMap, block, id);
    return { ...source, id, x: coord.x, y: coord.y };
  });

  if (idMap.size < 2) {
    return { blocks: duplicatedBlocks, connections: [] };
  }

  const mapBlockId = (blockId: TBlockId | undefined): TBlockId | undefined =>
    hasValue(blockId) ? idMap.get(blockId.toString()) : undefined;

  const duplicatedConnections = connections.flatMap((connection) => {
    const { id: _id, selected: _selected, ...source } = connection;
    const duplicate: TMultipointConnection = { ...source };

    for (const end of ["source", "target"] as const) {
      const portKey = end === "source" ? "sourcePortId" : "targetPortId";
      const blockKey = end === "source" ? "sourceBlockId" : "targetBlockId";
      const portId = connection[portKey];
      const blockId = connection[blockKey];
      if (hasValue(portId)) {
        const duplicatePortId = portMap.get(portId);
        if (duplicatePortId === undefined) return [];
        duplicate[portKey] = duplicatePortId;
        // A block ID next to a port ID is ignored by core; point it at the duplicate when it can, otherwise drop it.
        if (hasValue(blockId)) {
          const duplicateBlockId = mapBlockId(blockId);
          if (duplicateBlockId === undefined) delete duplicate[blockKey];
          else duplicate[blockKey] = duplicateBlockId;
        }
      } else {
        const duplicateBlockId = mapBlockId(blockId);
        if (duplicateBlockId === undefined) return [];
        duplicate[blockKey] = duplicateBlockId;
      }
    }

    duplicate.id = createConnectionId(connection);
    if (source.points) {
      duplicate.points = source.points.map((point) => ({ ...point, x: point.x + delta.x, y: point.y + delta.y }));
    }
    if (source.labels) {
      duplicate.labels = source.labels.map((label) => shiftLabel(label, delta));
    }
    return [duplicate];
  });

  return { blocks: duplicatedBlocks, connections: duplicatedConnections };
}

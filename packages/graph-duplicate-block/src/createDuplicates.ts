import type { TBlock, TBlockId, TConnection, TLabel, TMultipointConnection, TPoint } from "@gravity-ui/graph";

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
};

export function createDuplicateBlockId(block: TBlock): TBlockId {
  return `${block.id.toString()}-added-from-shadow-${Date.now()}`;
}

function shiftLabel(label: TLabel, delta: TPoint): TLabel {
  return {
    ...label,
    ...(label.x === undefined ? {} : { x: label.x + delta.x }),
    ...(label.y === undefined ? {} : { y: label.y + delta.y }),
  };
}

/**
 * Builds the duplicates of the given blocks and of the connections between them.
 *
 * Each duplicate keeps every field of its source except `id`, position and selection.
 * A connection is duplicated when at least two blocks are duplicated and both its ends are among them.
 * The copy keeps every field except `id`, selection and port IDs;
 * its route points and labels are shifted by `delta`.
 */
export function createDuplicates({ blocks, connections, delta, createId }: TCreateDuplicatesParams): TDuplicates {
  const idMap = new Map<string, TBlockId>();

  const duplicatedBlocks = blocks.map(({ block, coord }) => {
    const { selected: _selected, ...source } = block;
    const id = createId(block);
    idMap.set(block.id.toString(), id);
    return { ...source, id, x: coord.x, y: coord.y };
  });

  if (idMap.size < 2) {
    return { blocks: duplicatedBlocks, connections: [] };
  }

  const duplicatedConnections = connections.flatMap((connection) => {
    const sourceBlockId =
      connection.sourceBlockId === undefined ? undefined : idMap.get(connection.sourceBlockId.toString());
    const targetBlockId =
      connection.targetBlockId === undefined ? undefined : idMap.get(connection.targetBlockId.toString());
    if (sourceBlockId === undefined || targetBlockId === undefined) {
      return [];
    }

    const {
      id: _id,
      selected: _selected,
      sourcePortId: _sourcePortId,
      targetPortId: _targetPortId,
      ...source
    } = connection;
    const duplicate: TMultipointConnection = { ...source, sourceBlockId, targetBlockId };
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

import type { TAnchorId } from "../../components/canvas/anchors";
import type { TBlockId } from "../block/Block";

/** An anchor named by its block: anchor ids are unique only within their block. */
export type TAnchorAddress = { blockId: TBlockId; anchorId: TAnchorId };

/**
 * The entity id of an anchor: its id in the anchor selection bucket (`graph.selectionService`, `selectedTag`), its tag
 * address (`graph.scene.tags`, `explain("anchor", id)`) and `Anchor.getEntityId()`. Anchor ids are unique only within
 * their block, so the entity id names the block too.
 *
 * The id is `JSON.stringify([blockId, anchorId])`, for example `["block-1","out"]`. JSON escaping keeps it unambiguous
 * for any ids, separators and quotes included, and a number id stays a number (`[7,"out"]`, `["block-1",0]`), as in
 * the blocks map. Build it with this function and read it with {@link parseAnchorEntityId}; do not assemble it by
 * hand.
 */
export function anchorEntityId(blockId: TBlockId, anchorId: TAnchorId): string {
  return JSON.stringify([blockId, anchorId]);
}

function isId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/** The block id and anchor id of an anchor entity id; undefined for an id {@link anchorEntityId} did not build. */
export function parseAnchorEntityId(entityId: string | number): TAnchorAddress | undefined {
  if (typeof entityId !== "string" || !entityId.startsWith("[")) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(entityId);
  } catch {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [blockId, anchorId]: unknown[] = value;
  if (!isId(blockId) || !isId(anchorId)) return undefined;
  return { blockId, anchorId };
}

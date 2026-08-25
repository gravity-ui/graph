import { TBlockId } from "../../block/Block";

/**
 * Port ID Generation Utilities
 *
 * These functions create consistent, unique identifiers for ports based on
 * their type and location. The ID format ensures no collisions between
 * different port types.
 */

/**
 * Creates a port ID for a generic block connection point
 * Used when connecting to the center of a block without specific anchors
 *
 * @param blockId - ID of the block
 * @param isInput - Whether this is an input (true) or output (false) port
 * @returns Port ID in format "blockId_input" or "blockId_output"
 *
 * @example
 * ```typescript
 * createBlockPointPortId("block-1", false) // "block-1_output"
 * createBlockPointPortId("block-2", true)  // "block-2_input"
 * ```
 */
export const createBlockPointPortId = (blockId: TBlockId, isInput = false) => {
  return `${String(blockId)}_${isInput ? "input" : "output"}`;
};

/**
 * Creates a port ID for a specific anchor on a block
 * Used when connecting to named anchors (like "left", "right", "output", etc.)
 *
 * @param blockId - ID of the block that contains the anchor
 * @param anchorId - ID of the specific anchor
 * @returns Port ID in format "blockId/anchorId"
 *
 * @example
 * ```typescript
 * createAnchorPortId("block-1", "output") // "block-1/output"
 * createAnchorPortId("block-2", "left")   // "block-2/left"
 * ```
 */
export const createAnchorPortId = (blockId: TBlockId, anchorId: string) => {
  return `${String(blockId)}/${anchorId}`;
};

/**
 * Universal port ID creator that chooses the appropriate format
 * Convenience function that selects between anchor and block point formats
 *
 * @param blockId - ID of the block
 * @param anchorId - Optional anchor ID. If provided, creates anchor port ID
 * @param isInput - For block points, whether this is input or output
 * @returns Appropriate port ID based on whether anchorId is provided
 *
 * @example
 * ```typescript
 * createPortId("block-1", "output")       // "block-1/output" (anchor)
 * createPortId("block-1", undefined, true) // "block-1_input" (block point)
 * ```
 */
export const createPortId = (blockId: TBlockId, anchorId?: string, isInput = false) => {
  if (anchorId) {
    return `${String(blockId)}/${anchorId}`;
  } else {
    return `${String(blockId)}_${isInput ? "input" : "output"}`;
  }
};

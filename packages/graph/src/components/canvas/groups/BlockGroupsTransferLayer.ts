import { effect } from "@preact/signals-core";

import type { DragState } from "../../../services/drag/types";
import { Point } from "../../../utils/types/shapes";
import { Block, TBlock } from "../blocks/Block";

import { BlockGroups, BlockGroupsProps } from "./BlockGroups";
import { Group } from "./Group";

/**
 * Callback called when block transfer starts (Shift pressed during drag)
 * @param blockIds - IDs of blocks being transferred
 * @param sourceGroupIds - Set of source group IDs (groups blocks came from)
 */
export type OnTransferStart = (blockIds: TBlock["id"][], sourceGroupIds: Set<string>) => void;

/**
 * Callback called when block transfer ends (mouse released or Shift released)
 * @param blockIds - IDs of blocks that were transferred
 * @param targetGroupId - Target group ID (null if removed from group)
 */
export type OnTransferEnd = (blockIds: TBlock["id"][], targetGroupId: string | null) => void;

/**
 * Object representing a change in block's group membership
 */
export type TBlockGroupsTransferGroupChange = {
  blockId: TBlock["id"];
  sourceGroup?: string | null;
  targetGroup?: string | null;
};

/**
 * Callback called when blocks' groups change
 * @param changes - Array of changes to apply
 */
export type OnBlockGroupChange = (changes: TBlockGroupsTransferGroupChange[]) => void;

export type BlockGroupsTransferLayerProps = BlockGroupsProps & {
  /**
   * Enable/disable block transfer between groups with Shift+drag.
   * Default: true
   */
  transferEnabled?: boolean;

  /**
   * Called when block transfer starts (Shift pressed during drag)
   */
  onTransferStart?: OnTransferStart;

  /**
   * Called when block transfer ends (mouse released or Shift released)
   */
  onTransferEnd?: OnTransferEnd;

  /**
   * Called when a block's group changes
   */
  onBlockGroupChange?: OnBlockGroupChange;

  /**
   * If true, blocks will move when the group is dragged
   */
  updateBlocksOnDrag?: boolean;
};

type TransferState = {
  isTransferring: boolean;
  /** All blocks being transferred */
  blocks: TBlock[];
  /** Source group IDs for each block (null if block was not in a group) */
  sourceGroupIds: Set<string>;
  /** Current target group ID */
  targetGroupId: string | null;
  /** Currently highlighted group ID */
  highlightedGroupId: string | null;
};

/**
 * BlockGroups layer with block-to-group transfer functionality.
 *
 * ## Features
 * - Hold Shift during drag to activate transfer mode
 * - Release Shift to deactivate transfer mode and return to normal drag
 * - Groups highlight when blocks are dragged over them
 * - Multi-block transfer: all selected blocks are transferred together
 * - Source groups lock their size during transfer
 * - Callbacks for state synchronization with external stores (Redux, MobX, etc.)
 *
 * ## Basic Usage
 * ```typescript
 * const layer = graph.addLayer(BlockGroupsTransferLayer, {
 *   transferEnabled: true,
 *   draggable: true,
 * });
 * ```
 *
 * ## With Automatic Grouping
 * ```typescript
 * const GroupsLayer = BlockGroupsTransferLayer.withBlockGrouping({
 *   groupingFn: (blocks) => groupBy(blocks, (b) => b.$state.value.group),
 *   mapToGroups: (groupId, { rect }) => ({ id: groupId, rect }),
 * });
 *
 * graph.addLayer(GroupsLayer, {
 *   transferEnabled: true,
 *   updateBlocksOnDrag: true, // Blocks move with the group
 * });
 * ```
 *
 * ## With Redux Integration
 * ```typescript
 * graph.addLayer(GroupsLayer, {
 *   onTransferStart: (blockIds, sourceGroupIds) => {
 *     console.log('Transfer started:', blockIds);
 *   },
 *   onBlockGroupChange: (changes) => {
 *     // Sync with Redux
 *     changes.forEach(({ blockId, targetGroup }) => {
 *       store.dispatch(updateBlockGroup({ blockId, groupId: targetGroup }));
 *     });
 *   },
 *   onTransferEnd: (blockIds, targetGroupId) => {
 *     console.log('Transfer completed:', blockIds, 'to group:', targetGroupId);
 *   },
 * });
 * ```
 *
 * Uses DragService.$state.currentEvent.shiftKey to track Shift state in real-time.
 */
export class BlockGroupsTransferLayer<
  P extends BlockGroupsTransferLayerProps = BlockGroupsTransferLayerProps,
> extends BlockGroups<P> {
  /** Current transfer state */
  protected transferState: TransferState = this.createIdleState();

  /** Cleanup function for the drag state subscription */
  protected disposeSubscription: (() => void) | null = null;

  protected get isTransferEnabled(): boolean {
    return this.props.transferEnabled !== false;
  }

  protected afterInit(): void {
    super.afterInit();

    if (this.isTransferEnabled) {
      this.subscribeToDragState();
    }
  }

  /**
   * Subscribe to DragService state changes
   */
  protected subscribeToDragState(): void {
    const dragService = this.props.graph.dragService;
    if (!dragService) return;

    this.disposeSubscription = effect(() => {
      const isShiftPressed = this.props.graph.keyboardService.isShiftPressed();
      this.handleDragStateChange(dragService.$state.value, isShiftPressed ?? false);
    });
  }

  /**
   * Handle drag state changes - react to Shift key in real-time
   */
  protected handleDragStateChange(dragState: DragState, isShiftPressed: boolean): void {
    // Drag ended
    if (!dragState.isDragging) {
      if (this.transferState.isTransferring) {
        this.endTransfer();
      }
      return;
    }

    // During drag: check if Shift state changed
    if (isShiftPressed && !this.transferState.isTransferring) {
      // Shift pressed - activate transfer
      this.activateTransfer(dragState);
    } else if (!isShiftPressed && this.transferState.isTransferring) {
      // Shift released - deactivate transfer
      this.deactivateTransfer();
    }

    // Update highlighting if in transfer mode
    if (this.transferState.isTransferring && dragState.currentCoords) {
      this.updateHighlight(dragState.currentCoords);
    }
  }

  /**
   * Activate transfer mode for currently dragged blocks
   */
  protected activateTransfer(dragState: DragState): void {
    // Find all blocks among the dragged components
    const blocks = dragState.components
      .filter((c): c is Block => c instanceof Block)
      .map((block) => block.state as TBlock);

    if (blocks.length === 0) return;

    // Collect unique source group IDs (for tracking which groups blocks came from)
    const sourceGroupIds = new Set<string>();
    for (const block of blocks) {
      const groupId = this.$blockGroupsMap.value.get(block.id) ?? null;
      if (groupId) {
        sourceGroupIds.add(groupId);
      }
    }

    this.transferState = {
      isTransferring: true,
      blocks,
      sourceGroupIds,
      targetGroupId: null,
      highlightedGroupId: null,
    };

    // Lock ALL groups' sizes during transfer mode
    this.lockAllGroups();

    // Call onTransferStart callback
    this.props.onTransferStart?.(
      blocks.map((b) => b.id.toString()),
      sourceGroupIds
    );

    // Update highlight immediately if we have coordinates
    if (dragState.currentCoords) {
      this.updateHighlight(dragState.currentCoords);
    }
  }

  /**
   * Deactivate transfer mode - apply transfer and unlock groups
   * Called when Shift is released during drag
   */
  protected deactivateTransfer(): void {
    const { highlightedGroupId, targetGroupId, blocks } = this.transferState;

    // Unhighlight current group
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }

    // Apply the group change for all blocks (transfer happens on Shift release)
    const changes: TBlockGroupsTransferGroupChange[] = [];
    for (const block of blocks) {
      const oldGroupId = this.$blockGroupsMap.value.get(block.id) ?? null;

      // Only change if target is different from current
      if (oldGroupId !== targetGroupId) {
        changes.push({
          blockId: block.id,
          sourceGroup: oldGroupId,
          targetGroup: targetGroupId,
        });
      }
    }

    this.applyGroupChange(changes);

    // Unlock all groups
    this.unlockAllGroups();

    // Call onTransferEnd callback
    this.props.onTransferEnd?.(
      blocks.map((b) => b.id.toString()),
      targetGroupId
    );

    this.transferState = this.createIdleState();
  }

  /**
   * Lock all groups' sizes
   */
  protected lockAllGroups(): void {
    const groups = this.props.graph.rootStore.groupsList.$groups.value;
    for (const groupState of groups) {
      groupState.lockSize();
    }
  }

  /**
   * Unlock all groups' sizes
   */
  protected unlockAllGroups(): void {
    const groups = this.props.graph.rootStore.groupsList.$groups.value;
    for (const groupState of groups) {
      groupState.unlockSize();
    }
  }

  protected createIdleState(): TransferState {
    return {
      isTransferring: false,
      blocks: [],
      sourceGroupIds: new Set(),
      targetGroupId: null,
      highlightedGroupId: null,
    };
  }

  /**
   * Update highlighting based on cursor position
   */
  protected updateHighlight(point: [number, number]): void {
    if (!this.transferState.isTransferring) return;

    const targetGroup = this.findGroupAtPoint(point);
    const targetGroupId = targetGroup?.getEntityId() ?? null;

    // Update highlight visual if changed
    if (this.transferState.highlightedGroupId !== targetGroupId) {
      // Unhighlight previous group
      if (this.transferState.highlightedGroupId) {
        this.setGroupHighlight(this.transferState.highlightedGroupId, false);
      }

      // Highlight new group
      if (targetGroupId) {
        this.setGroupHighlight(targetGroupId, true);
      }
    }

    // Always store the actual target group (even if it's a source group)
    // The decision about what to do is made at drop time
    this.transferState = {
      ...this.transferState,
      targetGroupId, // Real target group under cursor
      highlightedGroupId: targetGroupId,
    };
  }

  /**
   * End transfer on drag end (mouseup) - apply transfer if in transfer mode
   */
  protected endTransfer(): void {
    const { highlightedGroupId, targetGroupId, blocks } = this.transferState;

    // Unhighlight the group
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }

    // Apply the group change for all blocks
    const changes: TBlockGroupsTransferGroupChange[] = [];
    for (const block of blocks) {
      const currentGroupId = this.$blockGroupsMap.value.get(block.id) ?? null;

      // Only change if target is different from current
      if (currentGroupId !== targetGroupId) {
        changes.push({
          blockId: block.id,
          sourceGroup: currentGroupId,
          targetGroup: targetGroupId,
        });
      }
    }

    this.applyGroupChange(changes);

    // Unlock all groups
    this.unlockAllGroups();

    // Call onTransferEnd callback
    this.props.onTransferEnd?.(
      blocks.map((b) => b.id.toString()),
      targetGroupId
    );

    this.transferState = this.createIdleState();
  }

  /**
   * Cancel the transfer operation without applying changes.
   *
   * This method can be called to abort an ongoing transfer without moving blocks to a new group.
   * It will unhighlight groups, unlock sizes, and reset the transfer state.
   *
   * @example
   * ```typescript
   * // Cancel transfer on Escape key
   * document.addEventListener('keydown', (e) => {
   *   if (e.key === 'Escape' && layer.isTransferring()) {
   *     layer.cancelTransfer();
   *   }
   * });
   * ```
   */
  public cancelTransfer(): void {
    const { highlightedGroupId } = this.transferState;

    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }

    this.unlockAllGroups();
    this.transferState = this.createIdleState();
  }

  /**
   * Find a group at the given point
   */
  protected findGroupAtPoint(point: [number, number]): Group | null {
    const [x, y] = point;
    return this.props.graph.getElementOverPoint(new Point(x, y), [Group]) ?? null;
  }

  /**
   * Set highlight state for a group directly on the component
   */
  protected setGroupHighlight(groupId: string, highlighted: boolean): void {
    const groupComponent = this.getGroupById(groupId);
    groupComponent?.setHighlighted(highlighted);
  }

  /**
   * Apply the group change to the block
   */
  protected applyGroupChange(changes: TBlockGroupsTransferGroupChange[]): void {
    if (changes.length > 0) {
      this.props.onBlockGroupChange?.(changes);
    }
  }

  /**
   * Check if a block transfer is currently in progress.
   *
   * @returns `true` if transfer mode is active (Shift is pressed during drag), `false` otherwise
   *
   * @example
   * ```typescript
   * if (layer.isTransferring()) {
   *   console.log('Transferring', layer.getTransferringBlocksCount(), 'blocks');
   * }
   * ```
   */
  public isTransferring(): boolean {
    return this.transferState.isTransferring;
  }

  /**
   * Get the number of blocks being transferred in the current operation.
   *
   * @returns Number of blocks currently being transferred, or 0 if no transfer is in progress
   *
   * @example
   * ```typescript
   * const count = layer.getTransferringBlocksCount();
   * console.log(`Transferring ${count} block${count !== 1 ? 's' : ''}`);
   * ```
   */
  public getTransferringBlocksCount(): number {
    return this.transferState.blocks.length;
  }

  protected unmountLayer(): void {
    // Cleanup drag subscription
    if (this.disposeSubscription) {
      this.disposeSubscription();
      this.disposeSubscription = null;
    }

    // Cleanup transfer state
    if (this.transferState.highlightedGroupId) {
      this.setGroupHighlight(this.transferState.highlightedGroupId, false);
    }
    this.transferState = this.createIdleState();

    super.unmountLayer();
  }
}

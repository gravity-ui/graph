import { computed } from "@preact/signals-core";

import type { DragState } from "../../../services/drag/types";
import { BlockState } from "../../../store/block/Block";
import { TGroup } from "../../../store/group/Group";
import { getBlocksRect } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";
import { Block, TBlock } from "../blocks/Block";

import { BlockGroups, BlockGroupsProps } from "./BlockGroups";
import { Group } from "./Group";

/**
 * Callback called when block transfer starts (Shift pressed during drag)
 * @param blockIds - IDs of blocks being transferred
 * @param sourceGroupIds - Set of source group IDs (groups blocks came from)
 */
export type OnTransferStart = (blockIds: string[], sourceGroupIds: Set<string>) => void;

/**
 * Callback called when block transfer ends (mouse released or Shift released)
 * @param blockIds - IDs of blocks that were transferred
 * @param targetGroupId - Target group ID (null if removed from group)
 */
export type OnTransferEnd = (blockIds: string[], targetGroupId: string | null) => void;

/**
 * Callback called when a block's group changes
 * @param blockId - Block ID
 * @param oldGroupId - Previous group ID (null if block was not in a group)
 * @param newGroupId - New group ID (null if block removed from group)
 */
export type OnBlockGroupChange = (blockId: string, oldGroupId: string | null, newGroupId: string | null) => void;

export type TransferableBlockGroupsProps = BlockGroupsProps & {
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
 * const layer = graph.addLayer(TransferableBlockGroups, {
 *   transferEnabled: true,
 *   draggable: true,
 * });
 * ```
 *
 * ## With Automatic Grouping
 * ```typescript
 * const GroupsLayer = TransferableBlockGroups.withBlockGrouping({
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
 *   onBlockGroupChange: (blockId, oldGroupId, newGroupId) => {
 *     // Sync with Redux
 *     store.dispatch(updateBlockGroup({ blockId, groupId: newGroupId }));
 *   },
 *   onTransferEnd: (blockIds, targetGroupId) => {
 *     console.log('Transfer completed:', blockIds, 'to group:', targetGroupId);
 *   },
 * });
 * ```
 *
 * Uses DragService.$state.currentEvent.shiftKey to track Shift state in real-time.
 */
export class TransferableBlockGroups<
  P extends TransferableBlockGroupsProps = TransferableBlockGroupsProps,
> extends BlockGroups<P> {
  /**
   * Create a TransferableBlockGroups layer with automatic block grouping.
   *
   * This static method creates a specialized layer class that automatically groups blocks
   * based on a grouping function and keeps the groups in sync with block changes.
   *
   * @param groupingFn - Function that takes all blocks and returns a map of group key to blocks array.
   *                     For example, `(blocks) => groupBy(blocks, (b) => b.$state.value.group)`
   * @param mapToGroups - Function that maps a group key and its blocks to a TGroup object.
   *                      Receives the group key, blocks array, and calculated rect.
   * @returns A TransferableBlockGroups class with automatic grouping support
   *
   * @example
   * ```typescript
   * // Group blocks by their 'group' field
   * const GroupsLayer = TransferableBlockGroups.withBlockGrouping({
   *   groupingFn: (blocks) => {
   *     const grouped: Record<string, BlockState[]> = {};
   *     blocks.forEach(block => {
   *       const groupId = block.$state.value.group;
   *       if (groupId) {
   *         grouped[groupId] = grouped[groupId] || [];
   *         grouped[groupId].push(block);
   *       }
   *     });
   *     return grouped;
   *   },
   *   mapToGroups: (groupId, { blocks, rect }) => ({
   *     id: groupId,
   *     rect,
   *     name: `Group ${groupId}`,
   *   }),
   * });
   *
   * // Use the layer with updateBlocksOnDrag to move blocks with groups
   * graph.addLayer(GroupsLayer, {
   *   transferEnabled: true,
   *   updateBlocksOnDrag: true,
   * });
   * ```
   */
  public static withBlockGrouping({
    groupingFn,
    mapToGroups,
  }: {
    groupingFn: (blocks: BlockState[]) => Record<string, BlockState[]>;
    mapToGroups: (key: string, params: { blocks: BlockState[]; rect: TRect }) => TGroup;
  }): typeof TransferableBlockGroups<TransferableBlockGroupsProps & { updateBlocksOnDrag?: boolean }> {
    return class TransferableBlockGroupWithGrouping extends TransferableBlockGroups<
      TransferableBlockGroupsProps & { updateBlocksOnDrag?: boolean }
    > {
      public $groupsBlocksMap = computed(() => {
        const blocks = this.props.graph.rootStore.blocksList.$blocks.value;
        return groupingFn(blocks);
      });

      protected afterInit(): void {
        this.onSignal(
          computed<TGroup[]>(() => {
            const groupedBlocks = this.$groupsBlocksMap.value;
            return Object.entries(groupedBlocks).map(([key, blocks]) => {
              const newRect = getBlocksRect(blocks.map((block) => block.asTBlock()));
              return mapToGroups(key, { blocks, rect: newRect });
            });
          }),
          (groups: TGroup[]) => {
            // Filter out groups that are size-locked - don't update their rect
            const groupsToUpdate = groups.map((group) => {
              const existingGroupState = this.props.graph.rootStore.groupsList.getGroupState(group.id);
              if (existingGroupState?.isSizeLocked()) {
                // Keep the existing rect when size is locked
                return { ...group, rect: existingGroupState.$state.value.rect };
              }
              return group;
            });
            this.setGroups(groupsToUpdate);
          }
        );
        super.afterInit();
      }

      /**
       * Override updateBlocks to support moving blocks with the group when updateBlocksOnDrag is enabled
       */
      public override updateBlocks = (groupId: string, delta: { deltaX: number; deltaY: number }) => {
        if (this.props.updateBlocksOnDrag) {
          const blocks = this.$groupsBlocksMap.value[groupId];
          if (blocks) {
            blocks.forEach((block) => {
              block.updateXY(block.x + delta.deltaX, block.y + delta.deltaY, true);
            });
          }
        }
      };
    };
  }

  /** Current transfer state */
  private transferState: TransferState = this.createIdleState();

  /** Cleanup function for the drag state subscription */
  private disposeSubscription: (() => void) | null = null;

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
  private subscribeToDragState(): void {
    const dragService = this.props.graph.dragService;
    if (!dragService) return;

    this.disposeSubscription = dragService.$state.subscribe((dragState) => {
      this.handleDragStateChange(dragState);
    });
  }

  /**
   * Handle drag state changes - react to Shift key in real-time
   */
  private handleDragStateChange(dragState: DragState): void {
    const isShiftPressed = dragState.currentEvent?.shiftKey ?? false;

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
  private activateTransfer(dragState: DragState): void {
    // Find all blocks among the dragged components
    const blocks = dragState.components
      .filter((c): c is Block => c instanceof Block)
      .map((block) => block.state as TBlock);

    if (blocks.length === 0) return;

    // Collect unique source group IDs (for tracking which groups blocks came from)
    const sourceGroupIds = new Set<string>();
    for (const block of blocks) {
      if (block.group) {
        sourceGroupIds.add(block.group);
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
  private deactivateTransfer(): void {
    const { highlightedGroupId, targetGroupId, blocks } = this.transferState;

    // Unhighlight current group
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }

    // Apply the group change for all blocks (transfer happens on Shift release)
    for (const block of blocks) {
      const currentGroupId = block.group ?? null;

      // Only change if target is different from current
      if (currentGroupId !== targetGroupId) {
        this.applyGroupChange(block.id, targetGroupId);
      }
    }

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
  private lockAllGroups(): void {
    const groups = this.props.graph.rootStore.groupsList.$groups.value;
    for (const groupState of groups) {
      groupState.lockSize();
    }
  }

  /**
   * Unlock all groups' sizes
   */
  private unlockAllGroups(): void {
    const groups = this.props.graph.rootStore.groupsList.$groups.value;
    for (const groupState of groups) {
      groupState.unlockSize();
    }
  }

  private createIdleState(): TransferState {
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
  private updateHighlight(point: [number, number]): void {
    if (!this.transferState.isTransferring) return;

    const targetGroup = this.findGroupAtPoint(point);
    const targetGroupId = targetGroup?.getEntityId() ?? null;

    // For highlighting, skip source groups (don't highlight the group block is already in)
    const shouldHighlight = targetGroupId && !this.transferState.sourceGroupIds.has(targetGroupId);
    const highlightGroupId = shouldHighlight ? targetGroupId : null;

    // Update highlight visual if changed
    if (this.transferState.highlightedGroupId !== highlightGroupId) {
      // Unhighlight previous group
      if (this.transferState.highlightedGroupId) {
        this.setGroupHighlight(this.transferState.highlightedGroupId, false);
      }

      // Highlight new group
      if (highlightGroupId) {
        this.setGroupHighlight(highlightGroupId, true);
      }
    }

    // Always store the actual target group (even if it's a source group)
    // The decision about what to do is made at drop time
    this.transferState = {
      ...this.transferState,
      targetGroupId, // Real target group under cursor
      highlightedGroupId: highlightGroupId, // Only non-source groups for visual
    };
  }

  /**
   * End transfer on drag end (mouseup) - apply transfer if in transfer mode
   */
  private endTransfer(): void {
    const { highlightedGroupId, targetGroupId, blocks } = this.transferState;

    // Unhighlight the group
    if (highlightedGroupId) {
      this.setGroupHighlight(highlightedGroupId, false);
    }

    // Apply the group change for all blocks
    for (const block of blocks) {
      const currentGroupId = block.group ?? null;

      // Only change if target is different from current
      if (currentGroupId !== targetGroupId) {
        this.applyGroupChange(block.id, targetGroupId);
      }
    }

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
  private findGroupAtPoint(point: [number, number]): Group | null {
    const [x, y] = point;
    const groups = this.props.graph.getElementsOverRect({ x, y, width: 0, height: 0 }, [Group]);
    return groups[0] ?? null;
  }

  /**
   * Find Group component by ID
   */
  private findGroupComponent(groupId: string): Group | null {
    return this.getGroupById(groupId);
  }

  /**
   * Set highlight state for a group directly on the component
   */
  private setGroupHighlight(groupId: string, highlighted: boolean): void {
    const groupComponent = this.findGroupComponent(groupId);
    groupComponent?.setHighlighted(highlighted);
  }

  /**
   * Apply the group change to the block
   */
  private applyGroupChange(blockId: TBlock["id"], newGroupId: string | null): void {
    const blockState = this.props.graph.rootStore.blocksList.getBlockState(blockId);
    const oldGroupId = blockState?.$state.value.group ?? null;

    if (blockState) {
      blockState.updateBlock({ group: newGroupId ?? undefined });

      // Call onBlockGroupChange callback
      this.props.onBlockGroupChange?.(blockId.toString(), oldGroupId, newGroupId);
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

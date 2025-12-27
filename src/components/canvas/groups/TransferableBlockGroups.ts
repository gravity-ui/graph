import { computed } from "@preact/signals-core";

import type { DragState } from "../../../services/drag/types";
import { BlockState } from "../../../store/block/Block";
import { TGroup } from "../../../store/group/Group";
import { getBlocksRect } from "../../../utils/functions";
import { TRect } from "../../../utils/types/shapes";
import { Block, TBlock } from "../blocks/Block";

import { BlockGroups, BlockGroupsProps } from "./BlockGroups";
import { Group } from "./Group";

export type TransferableBlockGroupsProps = BlockGroupsProps & {
  /**
   * Enable/disable block transfer between groups with Shift+drag.
   * Default: true
   */
  transferEnabled?: boolean;
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
 * Features:
 * - Hold Shift during drag to activate transfer mode
 * - Release Shift to deactivate transfer mode and return to normal drag
 * - Groups highlight when blocks are dragged over them
 * - Multi-block transfer: all selected blocks are transferred together
 * - Source groups lock their size during transfer
 *
 * Uses DragService.$state.currentEvent.shiftKey to track Shift state in real-time.
 */
export class TransferableBlockGroups<
  P extends TransferableBlockGroupsProps = TransferableBlockGroupsProps,
> extends BlockGroups<P> {
  /**
   * Create a TransferableBlockGroups layer with automatic block grouping.
   * Same as BlockGroups.withBlockGrouping but with transfer support.
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

    this.transferState = this.createIdleState();
  }

  /**
   * Cancel the transfer operation without applying changes
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
    if (blockState) {
      blockState.updateBlock({ group: newGroupId ?? undefined });
    }
  }

  /**
   * Check if a block transfer is currently in progress
   */
  public isTransferring(): boolean {
    return this.transferState.isTransferring;
  }

  /**
   * Get the number of blocks being transferred
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

import { Signal, signal } from "@preact/signals-core";

import { Graph } from "../../graph";

import { ESelectionStrategy, ISelectionBucket, TEntityId } from "./types";

/**
 * Implements a selection bucket that only allows a single entity to be selected at a time
 */
export class SingleSelectionBucket<IDType extends TEntityId> implements ISelectionBucket<IDType> {
  /**
   * The type of entity this bucket contains (e.g., 'block', 'group')
   */
  readonly entityType: string;

  /**
   * Signal containing the current set of selected entity IDs (will only ever contain 0 or 1 items)
   */
  readonly $selectedIds = signal(new Set<IDType>());

  /**
   * Creates a new SingleSelectionBucket
   * @param graph The graph instance used for event emission
   * @param entityType The type of entity this bucket manages
   * @param eventName The name of the event to emit on selection changes
   */
  constructor(
    protected graph: Graph,
    entityType: string,
    protected eventName: string
  ) {
    this.entityType = entityType;
  }

  /**
   * Updates the selection state, enforcing single selection rules
   * @param ids The entity IDs to include in the operation (only the first will be used when selecting)
   * @param select Whether to select (true) or deselect (false)
   * @param strategy The selection strategy to apply
   */
  public updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy): void {
    if (!ids.length) {
      return;
    }

    // Calculate the new selection state
    const currentSelectedIds = this.$selectedIds.value;
    const newSelectedIds = new Set<IDType>();
    const firstId = ids[0]; // In single selection mode, we only use the first ID

    // For single selection, TOGGLE and ADD both act like REPLACE
    if (
      select &&
      (strategy === ESelectionStrategy.REPLACE ||
        strategy === ESelectionStrategy.TOGGLE ||
        strategy === ESelectionStrategy.APPEND)
    ) {
      // If we're already selecting this ID, do nothing
      if (currentSelectedIds.has(firstId)) {
        return;
      }

      // Otherwise, select only the first ID
      newSelectedIds.add(firstId);
    } else if (!select || strategy === ESelectionStrategy.SUBTRACT) {
      // When deselecting, we only deselect if one of the provided IDs is currently selected
      if (ids.some((id) => currentSelectedIds.has(id))) {
        // Clear selection
      } else {
        // No change needed
        return;
      }
    }

    // Determine which IDs were added and removed
    const addedIds: IDType[] = [];
    const removedIds: IDType[] = [];

    // Find added IDs (in new but not in current)
    for (const id of newSelectedIds) {
      if (!currentSelectedIds.has(id)) {
        addedIds.push(id);
      }
    }

    // Find removed IDs (in current but not in new)
    for (const id of currentSelectedIds) {
      if (!newSelectedIds.has(id)) {
        removedIds.push(id);
      }
    }

    // Only emit event and update selection if there are actual changes
    if (addedIds.length > 0 || removedIds.length > 0) {
      // Prepare event payload
      const payload = {
        added: addedIds,
        removed: removedIds,
        selection: Array.from(newSelectedIds),
      };

      // Emit event and update selection if not prevented
      // We use a direct function for the default action to avoid type issues
      const updateSelection = () => {
        this.$selectedIds.value = newSelectedIds;
      };

      // Call the event action method with the necessary casting
      try {
        (this.graph as any).executеDefaultEventAction(this.eventName, payload, updateSelection);
      } catch (error) {
        // Fallback - just update the selection directly
        console.warn(`Failed to emit selection event: ${error}`);
        updateSelection();
      }
    }
  }

  /**
   * Resets the selection by clearing all selected IDs
   */
  public reset(): void {
    if (this.$selectedIds.value.size > 0) {
      const currentSelectedIds = Array.from(this.$selectedIds.value);
      this.updateSelection(currentSelectedIds, false, ESelectionStrategy.SUBTRACT);
    }
  }

  /**
   * Checks if a specific entity ID is currently selected
   * @param id The entity ID to check
   * @returns true if selected, false otherwise
   */
  public isSelected(id: IDType): boolean {
    return this.$selectedIds.value.has(id);
  }
}

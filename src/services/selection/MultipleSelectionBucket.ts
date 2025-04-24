import { signal } from "@preact/signals-core";

import { Graph } from "../../graph";

import { ESelectionStrategy, ISelectionBucket, TEntityId } from "./types";

/**
 * Implements a selection bucket that supports multiple selections of entities
 */
export class MultipleSelectionBucket<IDType extends TEntityId> implements ISelectionBucket<IDType> {
  /**
   * The type of entity this bucket contains (e.g., 'block', 'group')
   */
  readonly entityType: string;

  /**
   * Signal containing the current set of selected entity IDs
   */
  readonly $selectedIds = signal(new Set<IDType>());

  /**
   * Creates a new MultipleSelectionBucket
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
   * Updates the selection state according to the provided strategy
   * @param ids The entity IDs to include in the operation
   * @param select Whether to select (true) or deselect (false)
   * @param strategy The selection strategy to apply
   */
  public updateSelection(
    ids: IDType[],
    select: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ): void {
    if (!ids.length) {
      return;
    }

    // Calculate the new selection state based on strategy and current state
    const currentSelectedIds = this.$selectedIds.value;
    const newSelectedIds = new Set<IDType>(currentSelectedIds);

    switch (strategy) {
      case ESelectionStrategy.REPLACE:
        // Replace existing selection with new selection
        newSelectedIds.clear();
        if (select) {
          ids.forEach((id) => newSelectedIds.add(id));
        }
        break;

      case ESelectionStrategy.APPEND:
        // Add new IDs to existing selection
        if (select) {
          ids.forEach((id) => newSelectedIds.add(id));
        }
        break;

      case ESelectionStrategy.SUBTRACT:
        // Remove IDs from existing selection
        ids.forEach((id) => newSelectedIds.delete(id));
        break;

      case ESelectionStrategy.TOGGLE:
        // Toggle each ID (select if not selected, deselect if selected)
        ids.forEach((id) => {
          if (currentSelectedIds.has(id)) {
            newSelectedIds.delete(id);
          } else if (select) {
            newSelectedIds.add(id);
          }
        });
        break;
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
    const currentSelectedIds = Array.from(this.$selectedIds.value);
    if (currentSelectedIds.length > 0) {
      // Use updateSelection to clear all selections and ensure events are emitted
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

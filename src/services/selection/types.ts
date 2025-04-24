import { Signal } from "@preact/signals-core";

/**
 * Entity ID type that can be used across different entity types
 */
export type TEntityId = string | number;

/**
 * Selection strategies for managing entity selections
 */
export enum ESelectionStrategy {
  REPLACE = "replace",
  APPEND = "add",
  SUBTRACT = "subtract",
  TOGGLE = "toggle",
}

/**
 * Interface defining the contract for components that manage selection state
 * for a specific entity type.
 */
export interface ISelectionBucket<IDType extends TEntityId = TEntityId> {
  /**
   * Identifier for the entity type (e.g., 'block', 'group', 'connection')
   */
  readonly entityType: string;

  /**
   * Signal containing the set of currently selected entity IDs
   */
  readonly $selectedIds: Signal<Set<IDType>>;

  /**
   * Updates the selection state for the given IDs according to the specified strategy
   * @param ids The entity IDs to include in the selection operation
   * @param select Whether to select (true) or deselect (false)
   * @param strategy The selection strategy to apply
   */
  updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy): void;

  /**
   * Clears all selections in this bucket
   */
  reset(): void;

  /**
   * Checks if a specific ID is currently selected
   * @param id The entity ID to check
   * @returns true if the ID is selected, false otherwise
   */
  isSelected(id: IDType): boolean;
}

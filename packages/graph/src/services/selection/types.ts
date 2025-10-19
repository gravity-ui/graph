import { BaseSelectionBucket } from "./BaseSelectionBucket";

/**
 * Entity ID type that can be used across different entity types
 */
export type TSelectionEntityId = string | number;

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
 * Multi-entity selection input for selecting across multiple entity types
 */
export type TMultiEntitySelection = Record<string, TSelectionEntityId[]>;

export type TSelectionDiff<IDType extends TSelectionEntityId> = {
  /** List of next selection state */
  list: IDType[];
  /** Details of changes */
  changes: {
    /* A list of recently selected items */
    add: IDType[];
    /* A list of recently unselected items */
    removed: IDType[];
  };
};

/**
 * Interface defining the contract for components that manage selection state
 * for a specific entity type.
 */
export interface ISelectionBucket<IDType extends TSelectionEntityId = TSelectionEntityId>
  extends BaseSelectionBucket<IDType> {}

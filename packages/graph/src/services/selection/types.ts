import type { GraphComponent } from "../../components/canvas/GraphComponent";

import { BaseSelectionBucket } from "./BaseSelectionBucket";

/**
 * Entity ID type that can be used across different entity types
 */
export type TSelectionEntityId = string | number;

/**
 * Interface for entities that can provide a GraphComponent view
 * @template T The type of GraphComponent
 */
export interface IEntityWithComponent<T extends GraphComponent = GraphComponent> {
  getViewComponent(): T | undefined;
}

/**
 * Valid entity types for selection buckets.
 * Entities should preferably be either:
 * - GraphComponent instances themselves
 * - Objects with getViewComponent() method that returns GraphComponent (e.g., BlockState, ConnectionState)
 *
 * The constraint allows any object type for flexibility, but the $selectedComponents signal
 * will only resolve entities that actually implement the expected interface.
 */
export type TSelectionEntity = GraphComponent | IEntityWithComponent | object;

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
 * @template IDType The type of the unique identifier for the entities
 * @template TEntity The type of the entity that IDs resolve to. Must extend TSelectionEntity (GraphComponent or IEntityWithComponent).
 */
export interface ISelectionBucket<
  IDType extends TSelectionEntityId = TSelectionEntityId,
  TEntity extends TSelectionEntity = TSelectionEntity,
> extends BaseSelectionBucket<IDType, TEntity> {}

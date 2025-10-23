import { computed, signal } from "@preact/signals-core";

import { GraphComponent } from "../../components/canvas/GraphComponent";

import {
  ESelectionStrategy,
  IEntityWithComponent,
  ISelectionBucket,
  TMultiEntitySelection,
  TSelectionEntityId,
} from "./types";

/**
 * Service responsible for managing selection across different entity types
 * Acts as a central registry and coordinator for ISelectionBucket instances
 *
 * The SelectionService manages selection state for all graph elements.
 * During selection operations, the strategy determines how the selection will change:
 * - REPLACE: replaces current selection with new one, affects all entity types
 * - APPEND: adds new elements to current selection
 * - SUBTRACT: removes elements from current selection
 * - TOGGLE: toggles selection state of elements
 *
 * Supports two APIs:
 * 1. Single-type selection: select(entityType, ids, strategy)
 * 2. Multi-type selection: select({ type1: ids1, type2: ids2 }, strategy)
 *
 * @example
 * ```typescript
 * const selectionService = new SelectionService();
 *
 * // Single entity type selection
 * selectionService.registerBucket(new MultipleSelectionBucket<string>("block"));
 * selectionService.select("block", ["1", "2", "3"], ESelectionStrategy.REPLACE);
 * selectionService.$selection.value; // { block: ["1", "2", "3"] }
 *
 * // Multi-entity type selection
 * selectionService.registerBucket(new MultipleSelectionBucket<string>("connection"));
 * selectionService.select({
 *   block: ["1", "2"],
 *   connection: ["4", "5"]
 * }, ESelectionStrategy.REPLACE);
 * selectionService.$selection.value; // { block: ["1", "2"], connection: ["4", "5"] }
 * ```
 */
export class SelectionService {
  /**
   * Map of entity types to their corresponding selection buckets
   */
  private buckets = signal(new Map<string, ISelectionBucket>());

  /**
   * Computed signal aggregating selection from all buckets
   */
  public readonly $selection = computed(() => {
    const result = new Map<string, Set<TSelectionEntityId>>();
    for (const [type, bucket] of this.buckets.value.entries()) {
      // $selected всегда ReadonlySignal<Set<TEntityId>>
      result.set(type, bucket.$selected.value);
    }
    return result;
  });

  /**
   * Computed signal aggregating resolved entities from all buckets
   * Returns a flat array of all selected entities that have resolvers
   */
  public readonly $selectedEntities = computed(() => {
    const result: unknown[] = [];
    for (const bucket of this.buckets.value.values()) {
      const entities = bucket.$selectedEntities.value;
      result.push(...entities);
    }
    return result;
  });

  /**
   * Computed signal aggregating GraphComponent instances from all buckets
   * Returns a flat array of all selected GraphComponent instances that have resolvers and return GraphComponent
   */
  public readonly $selectedComponents = computed(() => {
    const result: GraphComponent[] = [];
    for (const bucket of this.buckets.value.values()) {
      const entities = bucket.$selectedEntities.value;
      for (const entity of entities) {
        if (entity instanceof GraphComponent) {
          result.push(entity as GraphComponent);
        } else {
          const component = (entity as IEntityWithComponent).getViewComponent();
          if (component) {
            result.push(component);
          }
        }
      }
    }
    return result;
  });

  /**
   * Registers a selection bucket for a specific entity type
   * @param bucket The selection bucket to register
   * @returns void
   */
  public registerBucket(bucket: ISelectionBucket): void {
    if (this.buckets.value.has(bucket.entityType)) {
      throw new Error(`Selection bucket for entityType '${bucket.entityType}' is already registered`);
    }
    const newMap = new Map(this.buckets.value);
    newMap.set(bucket.entityType, bucket);
    this.buckets.value = newMap;
  }

  /**
   * Unregisters a selection bucket for a specific entity type
   *
   * @param bucket The selection bucket to unregister
   * @returns void
   */
  public unregisterBucket(bucket: ISelectionBucket): void {
    const newMap = new Map(this.buckets.value);
    newMap.delete(bucket.entityType);
    this.buckets.value = newMap;
  }

  /**
   * Retrieves the selection bucket for a specific entity type
   *
   * @param entityType The entity type to get the bucket for
   * @returns {ISelectionBucket | undefined} The selection bucket or undefined if not found
   */
  public getBucket(entityType: string): ISelectionBucket | undefined {
    return this.buckets.value.get(entityType);
  }

  public getBucketByElement(element: GraphComponent): ISelectionBucket | undefined {
    return Array.from(this.buckets.value.values()).find((bucket) => bucket.isRelatedElement?.(element));
  }

  public selectRelatedElements(elements: GraphComponent[], strategy: ESelectionStrategy): void {
    const result = elements.reduce(
      (acc, element) => {
        const bucket = this.getBucketByElement(element);
        const id = element.getEntityId();
        if (bucket) {
          if (!acc[bucket.entityType]) {
            acc[bucket.entityType] = [];
          }
          acc[bucket.entityType].push(id);
        }
        return acc;
      },
      {} as Record<string, TSelectionEntityId[]>
    );
    this.select(result, strategy);
  }

  /**
   * Selects entities of a specific type according to the specified strategy
   *
   * @param entityType The type of entities to select
   * @param ids The IDs of the entities to select
   * @param strategy The selection strategy to apply
   * @returns void
   */
  public select(entityType: string, ids: TSelectionEntityId[], strategy: ESelectionStrategy): void;

  /**
   * Selects entities across multiple entity types according to the specified strategy
   *
   * @param selection Object mapping entity types to arrays of IDs to select
   * @param strategy The selection strategy to apply
   * @returns void
   */
  public select(selection: TMultiEntitySelection, strategy: ESelectionStrategy): void;

  /**
   * Selects entities using either single-type or multi-type selection API
   *
   * @param entityTypeOrSelection Either a single entity type or multi-entity selection object
   * @param idsOrStrategy Either array of IDs or selection strategy
   * @param strategy The selection strategy to apply (optional when using multi-entity API)
   * @returns void
   */
  public select(
    entityTypeOrSelection: string | TMultiEntitySelection,
    idsOrStrategy: TSelectionEntityId[] | ESelectionStrategy,
    strategy?: ESelectionStrategy
  ): void {
    // Detect which API is being used
    if (typeof entityTypeOrSelection === "string") {
      // Single entity type API
      const entityType = entityTypeOrSelection;
      const ids = idsOrStrategy as TSelectionEntityId[];
      const finalStrategy = strategy || ESelectionStrategy.REPLACE;

      if (finalStrategy === ESelectionStrategy.REPLACE) {
        // Reset selection in all other buckets
        for (const [type, bucket] of this.buckets.value.entries()) {
          if (type !== entityType) {
            bucket.reset();
          }
        }
      }
      const bucket = this.getBucket(entityType);
      if (bucket) {
        bucket.updateSelection(ids, true, finalStrategy);
      }
    } else {
      // Multi-entity selection API
      const selection = entityTypeOrSelection as TMultiEntitySelection;
      const finalStrategy = idsOrStrategy as ESelectionStrategy;

      if (finalStrategy === ESelectionStrategy.REPLACE) {
        // Reset selection in all buckets that are not in the selection
        const selectedTypes = Object.keys(selection);
        for (const [type, bucket] of this.buckets.value.entries()) {
          if (!selectedTypes.includes(type)) {
            bucket.reset();
          }
        }
      }

      // Apply selection to each entity type
      for (const [entityType, ids] of Object.entries(selection)) {
        const bucket = this.getBucket(entityType);
        if (bucket) {
          if (finalStrategy === ESelectionStrategy.REPLACE) {
            // For REPLACE, clear the bucket first
            bucket.updateSelection(ids, true, ESelectionStrategy.REPLACE);
          } else {
            // For APPEND and SUBTRACT, we need to get current selection and modify it
            const currentIds = bucket.$selected.value;
            const newIds = new Set(currentIds);

            if (finalStrategy === ESelectionStrategy.APPEND) {
              ids.forEach((id) => newIds.add(id));
            } else if (finalStrategy === ESelectionStrategy.SUBTRACT) {
              ids.forEach((id) => newIds.delete(id));
            }

            // Use REPLACE strategy to set the final state
            bucket.updateSelection(Array.from(newIds), true, ESelectionStrategy.REPLACE);
          }
        }
      }
    }
  }

  /**
   * Deselects entities of a specific type
   *
   * @param entityType The type of entities to deselect
   * @param ids The IDs of the entities to deselect
   * @returns void
   */
  public deselect(entityType: string, ids: TSelectionEntityId[]): void;

  /**
   * Deselects entities across multiple entity types
   *
   * @param selection Object mapping entity types to arrays of IDs to deselect
   * @returns void
   */
  public deselect(selection: TMultiEntitySelection): void;

  /**
   * Deselects entities using either single-type or multi-type deselection API
   *
   * @param entityTypeOrSelection Either a single entity type or multi-entity selection object
   * @param ids Array of IDs to deselect
   * @returns void
   */
  public deselect(entityTypeOrSelection: string | TMultiEntitySelection, ids?: TSelectionEntityId[]): void {
    // Detect which API is being used
    if (typeof entityTypeOrSelection === "string") {
      // Single entity type API
      const entityType = entityTypeOrSelection;
      const finalIds = ids || [];

      const bucket = this.getBucket(entityType);
      if (bucket) {
        bucket.updateSelection(finalIds, false, ESelectionStrategy.SUBTRACT);
      }
    } else {
      // Multi-entity deselection API
      const selection = entityTypeOrSelection as TMultiEntitySelection;

      // Deselect entities from each entity type
      for (const [entityType, entityIds] of Object.entries(selection)) {
        const bucket = this.getBucket(entityType);
        if (bucket) {
          const currentIds = bucket.$selected.value;
          const newIds = new Set(currentIds);

          entityIds.forEach((id) => newIds.delete(id));
          bucket.updateSelection(Array.from(newIds), true, ESelectionStrategy.REPLACE);
        }
      }
    }
  }

  /**
   * Checks if an entity is currently selected
   * @param entityType The type of the entity
   * @param id The ID of the entity
   * @returns true if selected, false otherwise
   */
  public isSelected(entityType: string, id: TSelectionEntityId): boolean;

  /**
   * Checks if an entity is currently selected
   * @param entityType The type of the entity
   * @param id The ID of the entity
   * @returns true if selected, false otherwise
   */
  public isSelected(entityType: string, id: TSelectionEntityId): boolean;

  /**
   * Checks selection status for multiple entities across different types
   * @param queries Object mapping entity types to IDs to check
   * @returns Object mapping entity types to boolean selection status
   */
  public isSelected(queries: TMultiEntitySelection): Record<string, boolean>;

  /**
   * Checks selection status for single entity or multiple entities
   * @param entityTypeOrQueries Either entity type or multi-entity queries
   * @param id ID of entity to check (only used for single entity API)
   * @returns Selection status
   */
  public isSelected(
    entityTypeOrQueries: string | TMultiEntitySelection,
    id?: TSelectionEntityId
  ): boolean | Record<string, boolean> {
    // Detect which API is being used
    if (typeof entityTypeOrQueries === "string") {
      // Single entity type API
      const entityType = entityTypeOrQueries;
      // When first param is string, id parameter is required
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const finalId = id!;

      const bucket = this.getBucket(entityType);
      return bucket ? bucket.isSelected(finalId) : false;
    } else {
      // Multi-entity queries API
      const queries = entityTypeOrQueries as TMultiEntitySelection;
      const results: Record<string, boolean> = {};

      for (const [entityType, ids] of Object.entries(queries)) {
        const bucket = this.getBucket(entityType);
        if (bucket) {
          results[entityType] = ids.some((id) => bucket.isSelected(id));
        } else {
          results[entityType] = false;
        }
      }

      return results;
    }
  }

  /**
   * Resets the selection for a specific entity type
   * @param entityType The type of entities to reset selection for
   */
  public resetSelection(entityType: string): void;

  /**
   * Resets the selection for multiple entity types
   * @param entityTypes Array of entity types to reset selection for
   */
  public resetSelection(entityTypes: string[]): void;

  /**
   * Resets the selection for single entity type or multiple entity types
   * @param entityTypeOrTypes Either single entity type or array of entity types
   */
  public resetSelection(entityTypeOrTypes: string | string[]): void {
    if (typeof entityTypeOrTypes === "string") {
      // Single entity type
      const bucket = this.getBucket(entityTypeOrTypes);
      if (bucket) {
        bucket.reset();
      }
    } else {
      // Multiple entity types
      for (const entityType of entityTypeOrTypes) {
        const bucket = this.getBucket(entityType);
        if (bucket) {
          bucket.reset();
        }
      }
    }
  }

  /**
   * Resets the selection for all registered buckets
   */
  public resetAllSelections(): void {
    for (const bucket of this.buckets.value.values()) {
      bucket.reset();
    }
  }
}

import { computed, signal } from "@preact/signals-core";

import { ESelectionStrategy, ISelectionBucket, TEntityId } from "./types";

/**
 * Service responsible for managing selection across different entity types
 * Acts as a central registry and coordinator for ISelectionBucket instances
 */
export class SelectionService {
  /**
   * Map of entity types to their corresponding selection buckets
   */
  private buckets = signal(new Map<string, ISelectionBucket>());

  /**
   * Computed signal aggregating selection from all buckets
   * Map<entityType, Set<TEntityId>>
   */
  public readonly $selection = computed(() => {
    const result = new Map<string, Set<TEntityId>>();
    for (const [type, bucket] of this.buckets.value.entries()) {
      // $selected всегда ReadonlySignal<Set<TEntityId>>
      result.set(type, bucket.$selected.value);
    }
    return result;
  });

  /**
   * Registers a selection bucket for a specific entity type
   * @param bucket The selection bucket to register
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
   * @param bucket The selection bucket to unregister
   */
  public unregisterBucket(bucket: ISelectionBucket): void {
    const newMap = new Map(this.buckets.value);
    newMap.delete(bucket.entityType);
    this.buckets.value = newMap;
  }

  /**
   * Retrieves the selection bucket for a specific entity type
   * @param entityType The entity type to get the bucket for
   * @returns The selection bucket or undefined if not found
   */
  public getBucket(entityType: string): ISelectionBucket | undefined {
    return this.buckets.value.get(entityType);
  }

  /**
   * Selects entities of a specific type according to the specified strategy
   * @param entityType The type of entities to select
   * @param ids The IDs of the entities to select
   * @param strategy The selection strategy to apply
   */
  public select(entityType: string, ids: TEntityId[], strategy: ESelectionStrategy): void {
    if (strategy === ESelectionStrategy.REPLACE) {
      // Reset selection in all other buckets
      for (const [type, bucket] of this.buckets.value.entries()) {
        if (type !== entityType) {
          bucket.reset();
        }
      }
    }
    const bucket = this.getBucket(entityType);
    if (bucket) {
      bucket.updateSelection(ids, true, strategy);
    }
  }

  /**
   * Deselects entities of a specific type
   * @param entityType The type of entities to deselect
   * @param ids The IDs of the entities to deselect
   */
  public deselect(entityType: string, ids: TEntityId[]): void {
    const bucket = this.getBucket(entityType);
    if (bucket) {
      bucket.updateSelection(ids, false, ESelectionStrategy.SUBTRACT);
    }
  }

  /**
   * Checks if an entity is currently selected
   * @param entityType The type of the entity
   * @param id The ID of the entity
   * @returns true if selected, false otherwise
   */
  public isSelected(entityType: string, id: TEntityId): boolean {
    const bucket = this.getBucket(entityType);
    return bucket ? bucket.isSelected(id) : false;
  }

  /**
   * Resets the selection for a specific entity type
   * @param entityType The type of entities to reset selection for
   */
  public resetSelection(entityType: string): void {
    const bucket = this.getBucket(entityType);
    if (bucket) {
      bucket.reset();
    }
  }
}

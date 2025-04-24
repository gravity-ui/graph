import { ESelectionStrategy, ISelectionBucket, TEntityId } from "./types";

/**
 * Service responsible for managing selection across different entity types
 * Acts as a central registry and coordinator for ISelectionBucket instances
 */
export class SelectionService {
  /**
   * Map of entity types to their corresponding selection buckets
   */
  private buckets = new Map<string, ISelectionBucket>();

  /**
   * Registers a selection bucket for a specific entity type
   * @param bucket The selection bucket to register
   */
  public registerBucket(bucket: ISelectionBucket): void {
    this.buckets.set(bucket.entityType, bucket);
  }

  /**
   * Retrieves the selection bucket for a specific entity type
   * @param entityType The entity type to get the bucket for
   * @returns The selection bucket or undefined if not found
   */
  public getBucket(entityType: string): ISelectionBucket | undefined {
    return this.buckets.get(entityType);
  }

  /**
   * Selects entities of a specific type according to the specified strategy
   * @param entityType The type of entities to select
   * @param ids The IDs of the entities to select
   * @param strategy The selection strategy to apply
   */
  public select(entityType: string, ids: TEntityId[], strategy: ESelectionStrategy): void {
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

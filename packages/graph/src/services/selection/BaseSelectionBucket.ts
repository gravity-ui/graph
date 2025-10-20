import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import type { GraphComponent } from "../../components/canvas/GraphComponent";

import type { SelectionService } from "./SelectionService";
import {
  ESelectionStrategy,
  IEntityWithComponent,
  ISelectionBucket,
  TSelectionDiff,
  TSelectionEntity,
  TSelectionEntityId,
} from "./types";

/**
 * @abstract
 * @template IDType The type of the unique identifier for the entities managed by this bucket (e.g., `string`, `number`).
 * @template TEntity The type of the entity that IDs resolve to. Must extend TSelectionEntity (GraphComponent or IEntityWithComponent).
 *
 * Base class for selection buckets.
 *
 * Selection buckets are fundamental components of the {@link SelectionService}.
 * Each bucket is responsible for managing the selection state (the set of selected IDs)
 * for a specific entity type within the graph (e.g., blocks, connections, anchors, or custom entities).
 *
 * This abstract class provides a common structure and basic functionality for all selection buckets,
 * including managing the internal reactive state of selected IDs using `@preact/signals-core`
 * and handling interaction with the central {@link SelectionService}.
 *
 * When creating a custom selection bucket, you should extend this class (or its concrete implementations
 * like {@link MultipleSelectionBucket} or {@link SingleSelectionBucket}) and define the specific
 * logic for selecting and deselecting entities of its type.
 *
 * @example
 * ```typescript
 * class MySelectionBucket extends BaseSelectionBucket<string, MyEntity> {
 *   public updateSelection(ids: string[], select: boolean, strategy: ESelectionStrategy, silent?: boolean): void {
 *     // implementation
 *   }
 * }
 * ```
 *
 * @implements {ISelectionBucket<IDType, TEntity>}
 * @see {@link SelectionService}
 * @see {@link ISelectionBucket}
 * @see {@link MultipleSelectionBucket}
 * @see {@link SingleSelectionBucket}
 * @see {@linkplain ../../docs/system/selection-manager.md SelectionManager Documentation} for more details on selection architecture.
 */
export abstract class BaseSelectionBucket<
  IDType extends TSelectionEntityId,
  TEntity extends TSelectionEntity = TSelectionEntity,
> implements ISelectionBucket<IDType, TEntity>
{
  protected readonly $selectedIds: Signal<Set<IDType>> = signal(new Set<IDType>());
  public readonly $selected: ReadonlySignal<Set<IDType>> = computed(() => new Set(this.$selectedIds.value));

  /**
   * Computed signal that resolves selected IDs to their corresponding entities.
   * Returns an empty array if no resolver function is provided.
   */
  public readonly $selectedEntities: ReadonlySignal<TEntity[]> = computed(() => {
    if (!this.resolver) {
      return [];
    }
    const ids = Array.from(this.$selectedIds.value);
    return this.resolver(ids);
  });

  /**
   * Computed signal that resolves selected entities to their GraphComponent views.
   * Works with entities that:
   * - Are GraphComponent instances themselves
   * - Implement IEntityWithComponent interface (have getViewComponent() method)
   * Returns an empty array if entities cannot be resolved to components.
   */
  public readonly $selectedComponents: ReadonlySignal<GraphComponent[]> = computed(() => {
    const entities = this.$selectedEntities.value;
    if (entities.length === 0) {
      return [];
    }

    return entities
      .map((entity) => {
        // Check if entity is already a GraphComponent
        if (this.isGraphComponent(entity)) {
          return entity as unknown as GraphComponent;
        }
        // Check if entity has getViewComponent method
        if (this.hasViewComponent(entity)) {
          return (entity as unknown as IEntityWithComponent).getViewComponent();
        }
        return undefined;
      })
      .filter((component): component is GraphComponent => component !== undefined);
  });

  protected manager: SelectionService | undefined;

  /**
   * Check if an entity is a GraphComponent
   */
  private isGraphComponent(entity: TEntity): boolean {
    return (
      typeof entity === "object" &&
      entity !== null &&
      "getEntityId" in entity &&
      typeof (entity as { getEntityId?: unknown }).getEntityId === "function"
    );
  }

  /**
   * Check if an entity has getViewComponent method
   */
  private hasViewComponent(entity: TEntity): boolean {
    return (
      typeof entity === "object" &&
      entity !== null &&
      "getViewComponent" in entity &&
      typeof (entity as { getViewComponent?: unknown }).getViewComponent === "function"
    );
  }

  constructor(
    public readonly entityType: string,
    protected onSelectionChange: (
      payload: TSelectionDiff<IDType>,
      defaultAction: (rewritenIds?: Set<IDType>) => void
    ) => void | boolean = (_payload, defaultAction) => {
      const result = defaultAction();
      return result ?? true;
    },
    public isRelatedElement?: (element: GraphComponent) => boolean,
    protected resolver?: (ids: IDType[]) => TEntity[]
  ) {}

  /**
   * Attaches the bucket to the manager
   *
   * @param manager {SelectionService} - The manager to attach to
   * @returns void
   */
  public attachToManager(manager: SelectionService): void {
    manager.registerBucket(this);
    this.manager = manager;
  }

  /**
   * Detaches the bucket from the manager
   * @param manager {SelectionService} - The manager to detach from
   * @returns void
   */
  public detachFromManager(manager: SelectionService): void {
    manager.unregisterBucket(this);
    this.manager = undefined;
  }

  /**
   * Selects the given ids
   *
   * @param ids {IDType[]} - The ids to select
   * @param strategy {ESelectionStrategy} - The strategy to use
   * @param silent {boolean} - Whether to suppress the selection change event
   * @returns void
   */
  public select(ids: IDType[], strategy: ESelectionStrategy = ESelectionStrategy.REPLACE, silent?: boolean): void {
    if (this.manager) {
      this.manager.select(this.entityType, ids, strategy);
    } else {
      this.updateSelection(ids, true, strategy, silent);
    }
  }

  /**
   * Deselects the given ids
   * Passed ids will be deselected with strategy SUBTRACT
   *
   * @param ids {IDType[]} - The ids to deselect
   * @param silent {boolean} - Whether to suppress the selection change event
   * @returns void
   */
  public deselect(ids: IDType[], silent?: boolean): void {
    if (this.manager) {
      this.manager.deselect(this.entityType, ids);
    } else {
      this.updateSelection(ids, false, ESelectionStrategy.SUBTRACT, silent);
    }
  }

  /**
   * Updates the selection
   * @param ids - The ids to update
   * @param select - Whether to select or deselect
   * @param strategy - The strategy to use
   * @param silent - Whether to suppress the selection change event
   */
  public abstract updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy, silent?: boolean): void;

  /**
   * Resets the selection
   * All selected ids will be deselected with strategy SUBTRACT
   *
   * @returns void
   */
  public reset(): void {
    const currentSelectedIds = Array.from(this.$selectedIds.value);
    if (currentSelectedIds.length > 0) {
      this.updateSelection(currentSelectedIds, false, ESelectionStrategy.SUBTRACT);
    }
  }

  /**
   * Checks if the given id is selected
   *
   * @param id {IDType} - The id to check
   * @returns boolean
   */
  public isSelected(id: IDType): boolean {
    return this.$selectedIds.value.has(id);
  }

  /**
   * Applies the selection
   * Generate diff between new and current selected ids and run onSelectionChange callback
   * If silent is true, the nextSelection state will be applied immediately, otherwise it will be applied after the callback is executed and
   *
   * @param newSelectedIds {Set<IDType>} - The new selected ids
   * @param currentSelectedIds {Set<IDType>} - The current selected ids
   * @param silent {boolean} - Whether to suppress the selection change event
   * @returns void
   */
  protected applySelection(newSelectedIds: Set<IDType>, currentSelectedIds: Set<IDType>, silent?: boolean): void {
    const addedIds: IDType[] = [];
    const removedIds: IDType[] = [];

    for (const id of newSelectedIds) {
      if (!currentSelectedIds.has(id)) {
        addedIds.push(id);
      }
    }
    for (const id of currentSelectedIds) {
      if (!newSelectedIds.has(id)) {
        removedIds.push(id);
      }
    }

    if (addedIds.length > 0 || removedIds.length > 0) {
      const payload = {
        list: Array.from(newSelectedIds),
        changes: {
          add: addedIds,
          removed: removedIds,
        },
      };

      let callbackUpdated = false;
      const updateSelection = (rewritenIds?: Set<IDType>) => {
        this.$selectedIds.value = rewritenIds ?? newSelectedIds;
        callbackUpdated = true;
      };

      const shouldUpdate = silent || this.onSelectionChange(payload, updateSelection);
      if (shouldUpdate && !callbackUpdated) {
        updateSelection();
      }
    }
  }
}

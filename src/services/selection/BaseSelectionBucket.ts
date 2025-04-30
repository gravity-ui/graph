import { ReadonlySignal, Signal, computed, signal } from "@preact/signals-core";

import { ESelectionStrategy, ISelectionBucket, TEntityId, TSelectionDiff } from "./types";

export abstract class BaseSelectionBucket<IDType extends TEntityId> implements ISelectionBucket<IDType> {
  protected readonly $selectedIds: Signal<Set<IDType>> = signal(new Set<IDType>());
  public readonly $selected: ReadonlySignal<Set<IDType>> = computed(() => new Set(this.$selectedIds.value));

  constructor(
    public readonly entityType: string,
    protected onSelectionChange: (payload: TSelectionDiff<IDType>, defaultAction: () => void) => void | boolean = (
      _payload,
      defaultAction
    ) => {
      defaultAction();
      return true;
    }
  ) {}

  public abstract updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy): void;

  public reset(): void {
    const currentSelectedIds = Array.from(this.$selectedIds.value);
    if (currentSelectedIds.length > 0) {
      this.updateSelection(currentSelectedIds, false, ESelectionStrategy.SUBTRACT);
    }
  }

  public isSelected(id: IDType): boolean {
    return this.$selectedIds.value.has(id);
  }

  protected applySelection(newSelectedIds: Set<IDType>, currentSelectedIds: Set<IDType>): void {
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
      const updateSelection = (rewritenIds?: Set<IDType>) => {
        this.$selectedIds.value = rewritenIds ?? newSelectedIds;
      };
      const shouldUpdate = this.onSelectionChange(payload, updateSelection);
      if (shouldUpdate) {
        updateSelection();
      }
    }
  }
}

import { BaseSelectionBucket } from "./BaseSelectionBucket";
import { ESelectionStrategy, TEntityId } from "./types";

/**
 * Implements a selection bucket that supports multiple selections of entities
 */
export class MultipleSelectionBucket<IDType extends TEntityId> extends BaseSelectionBucket<IDType> {
  public updateSelection(
    ids: IDType[],
    select: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ): void {
    if (!ids.length && strategy !== ESelectionStrategy.REPLACE) {
      return;
    }

    const currentSelectedIds = this.$selectedIds.value;
    const newSelectedIds = new Set<IDType>(currentSelectedIds);

    switch (strategy) {
      case ESelectionStrategy.REPLACE:
        newSelectedIds.clear();
        if (select) {
          ids.forEach((id) => newSelectedIds.add(id));
        }
        break;
      case ESelectionStrategy.APPEND:
        if (select) {
          ids.forEach((id) => newSelectedIds.add(id));
        }
        break;
      case ESelectionStrategy.SUBTRACT:
        ids.forEach((id) => newSelectedIds.delete(id));
        break;
      case ESelectionStrategy.TOGGLE:
        ids.forEach((id) => {
          if (currentSelectedIds.has(id)) {
            newSelectedIds.delete(id);
          } else if (select) {
            newSelectedIds.add(id);
          }
        });
        break;
    }

    this.applySelection(newSelectedIds, currentSelectedIds);
  }
}

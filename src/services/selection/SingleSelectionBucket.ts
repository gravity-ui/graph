import { BaseSelectionBucket } from "./BaseSelectionBucket";
import { ESelectionStrategy, TEntityId } from "./types";

/**
 * Implements a selection bucket that only allows a single entity to be selected at a time
 */
export class SingleSelectionBucket<IDType extends TEntityId> extends BaseSelectionBucket<IDType> {
  public updateSelection(ids: IDType[], select: boolean, strategy: ESelectionStrategy, silent?: boolean): void {
    if (ids.length === 0) {
      if (strategy === ESelectionStrategy.REPLACE) {
        this.applySelection(new Set(), this.$selectedIds.value, silent);
      }
      return;
    }

    const currentSelectedIds = this.$selectedIds.value;
    const newSelectedIds = new Set<IDType>();
    const firstId = ids[0];

    if (
      select &&
      (strategy === ESelectionStrategy.REPLACE ||
        strategy === ESelectionStrategy.TOGGLE ||
        strategy === ESelectionStrategy.APPEND)
    ) {
      if (currentSelectedIds.has(firstId)) {
        return;
      }
      newSelectedIds.add(firstId);
    } else if (!select || strategy === ESelectionStrategy.SUBTRACT) {
      if (ids.some((id) => currentSelectedIds.has(id))) {
        newSelectedIds.clear();
      } else {
        return;
      }
    }

    this.applySelection(newSelectedIds, currentSelectedIds, silent);
  }
}

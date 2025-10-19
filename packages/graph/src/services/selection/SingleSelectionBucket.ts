import { BaseSelectionBucket } from "./BaseSelectionBucket";
import { ESelectionStrategy, TSelectionEntityId } from "./types";

/**
 * A selection bucket implementation that allows only a single entity of a specific type to be selected at a time.
 * @template IDType The type of the unique identifier for the entities managed by this bucket (e.g., `string`, `number`)
 * @extends BaseSelectionBucket<IDType>
 * @see {@link BaseSelectionBucket}
 * @see {@link ISelectionBucket}
 * @see {@link MultipleSelectionBucket}
 */
export class SingleSelectionBucket<IDType extends TSelectionEntityId> extends BaseSelectionBucket<IDType> {
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

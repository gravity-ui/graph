import { BaseSelectionBucket } from "./BaseSelectionBucket";
import { ESelectionStrategy, TSelectionEntity, TSelectionEntityId } from "./types";

/**
 * A selection bucket implementation that allows multiple entities of a specific type to be selected simultaneously.
 * @template IDType The type of the unique identifier for the entities managed by this bucket (e.g., `string`, `number`)
 * @template TEntity The type of the entity that IDs resolve to. Must extend TSelectionEntity (GraphComponent or IEntityWithComponent).
 * @see {@link BaseSelectionBucket}
 * @see {@link ISelectionBucket}
 * @see {@link ../../../docs/system/selection-manager.md} for more details on selection architecture.
 */
export class MultipleSelectionBucket<
  IDType extends TSelectionEntityId,
  TEntity extends TSelectionEntity = TSelectionEntity,
> extends BaseSelectionBucket<IDType, TEntity> {
  public updateSelection(
    ids: IDType[],
    select: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE,
    silent?: boolean
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

    this.applySelection(newSelectedIds, currentSelectedIds, silent);
  }
}

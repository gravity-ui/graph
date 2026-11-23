/** The kind of a tagged entity: "block", "connection", "anchor", "group" or a type a layer registers. */
export type TEntityType = string;
/** Numeric and string IDs are distinct: 1 and "1" name different entities. */
export type TEntityId = string | number;

export type TEntityAddress = { readonly type: TEntityType; readonly id: TEntityId };

/** A tag is an object; the name is for debugging, devtools and React class names only. */
export interface TTag<V = true> {
  readonly id: number;
  readonly name: string;
  /** Type brand for the per-entity value; never set at runtime. */
  readonly __value?: V;
}

/** Members of one tag: entity type → ids (value `true`) or id → value. */
export type TTagMembers<V> = Partial<
  Record<TEntityType, ReadonlyMap<TEntityId, V> | (true extends V ? readonly TEntityId[] : never)>
>;

/** Entities without values, for removal. */
export type TTagIds = Partial<Record<TEntityType, readonly TEntityId[]>>;

/** The tags of one entity with their values. */
export type TTagSet = ReadonlyMap<TTag<unknown>, unknown>;

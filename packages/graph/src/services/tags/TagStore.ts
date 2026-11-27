import { batch, effect, signal } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import type { TEntityId, TEntityType, TTag, TTagIds, TTagMembers, TTagSet } from "./types";

const EMPTY_TAGS: TTagSet = new Map();

type TMembership = {
  values: Map<string, unknown>;
  /** Insertion positions let notifications follow membership order even when a patch lists its keys backwards. */
  order: Map<string, number>;
  nextOrder: number;
  snapshot?: Map<string, unknown>;
};

/** An opaque key that preserves the type of the entity ID. */
export function entityKey(type: TEntityType, id: TEntityId): string {
  if (typeof id === "string" && type !== "" && !type.includes("\u0000")) return `${type}\u0000${id}`;
  // A leading separator puts these keys outside the ordinary string ID namespace.
  return `\u0000${JSON.stringify([type, typeof id, String(id)])}`;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Whether two tag sets hold the same tags with equal values (as `apply` compares them). */
function sameTags(a: TTagSet, b: TTagSet): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [tag, value] of a) {
    if (!b.has(tag) || !sameValue(value, b.get(tag))) return false;
  }
  return true;
}

function normalize<V>(members: TTagMembers<V>): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [type, list] of Object.entries(members)) {
    if (!list) continue;
    if (Array.isArray(list)) {
      for (const id of list as readonly TEntityId[]) result.set(entityKey(type, id), true);
    } else {
      for (const [id, value] of list as ReadonlyMap<TEntityId, V>) result.set(entityKey(type, id), value);
    }
  }
  return result;
}

/**
 * Tags of graph entities, keyed by (entityType, id). Systems write tags; rules read them. Each tag has one writer:
 * either direct writes (set, add, delete, clear) or one bound source.
 */
export class TagStore {
  /** The graph's own tags, for graph-wide modes such as focus. */
  public readonly $root: ReadonlySignal<ReadonlySet<TTag<true>>>;

  private readonly root = signal<ReadonlySet<TTag<true>>>(new Set());

  private readonly members = new Map<TTag<unknown>, TMembership>();

  private readonly entityTags = new Map<string, Map<TTag<unknown>, unknown>>();

  /** The signal `$of` hands out per entity key, while it is watched or not yet released. */
  private readonly signals = new Map<string, Signal<TTagSet>>();

  /**
   * Watched signals of an entity other than the one in `signals`: a holder subscribed again to a signal released
   * earlier, after `$of` had made a new one (`watch`). Rare; `apply` writes them too.
   */
  private readonly strays = new Map<string, Set<Signal<TTagSet>>>();

  private readonly bound = new Map<TTag<unknown>, () => void>();

  constructor() {
    this.$root = this.root;
  }

  public set<V>(tag: TTag<V>, members: TTagMembers<V>): void {
    this.assertWritable(tag);
    this.apply(tag, normalize(members));
  }

  public add<V>(tag: TTag<V>, members: TTagMembers<V>): void {
    this.assertWritable(tag);
    const patch = normalize(members);
    const current = this.members.get(tag);
    if (!current) {
      this.apply(tag, patch);
      return;
    }
    const changed: string[] = [];
    for (const [key, value] of patch) {
      if (!current.values.has(key) || !sameValue(current.values.get(key), value)) changed.push(key);
    }
    if (!changed.length) return;
    for (const [key, value] of patch) {
      if (!current.values.has(key)) current.order.set(key, current.nextOrder++);
      current.values.set(key, value);
    }
    current.snapshot = undefined;
    changed.sort((a, b) => (current.order.get(a) as number) - (current.order.get(b) as number));
    this.notify(tag, current.values, changed);
  }

  public delete(tag: TTag<unknown>, ids: TTagIds): void {
    this.assertWritable(tag);
    const current = this.members.get(tag);
    if (!current) return;
    const keys = new Set<string>();
    for (const [type, list] of Object.entries(ids)) {
      for (const id of list ?? []) {
        const key = entityKey(type, id);
        if (current.values.has(key)) keys.add(key);
      }
    }
    if (!keys.size) return;
    const removed = [...keys].sort((a, b) => (current.order.get(a) as number) - (current.order.get(b) as number));
    for (const key of removed) {
      current.values.delete(key);
      current.order.delete(key);
    }
    current.snapshot = undefined;
    if (!current.values.size) this.members.delete(tag);
    this.notify(tag, current.values, removed);
  }

  public clear(tag: TTag<unknown>): void {
    this.assertWritable(tag);
    this.apply(tag, new Map());
  }

  /** Whether a signal currently owns writes to this tag. */
  public isBound(tag: TTag<unknown>): boolean {
    return this.bound.has(tag);
  }

  /** Derives a tag from a signal. The tag rejects direct writes until the returned function unbinds it. */
  public bind<V>(tag: TTag<V>, source: ReadonlySignal<TTagMembers<V>>): () => void {
    if (this.bound.has(tag)) throw new Error(`Tag "${tag.name}" is already bound`);
    const stop = effect(() => {
      const next = normalize(source.value);
      this.apply(tag, next);
    });
    const unbind = (): void => {
      if (this.bound.get(tag) !== unbind) return;
      stop();
      this.bound.delete(tag);
      this.apply(tag, new Map());
    };
    this.bound.set(tag, unbind);
    return unbind;
  }

  public setRoot(tag: TTag<true>, on: boolean): void {
    const current = this.root.peek();
    if (current.has(tag) === on) return;
    const next = new Set(current);
    if (on) next.add(tag);
    else next.delete(tag);
    this.root.value = next;
  }

  /**
   * The entity's tags; the signal changes only when this entity's tags or values change. The store releases it when
   * its last subscriber leaves, and a later call returns a new signal. A holder may still subscribe to a released
   * signal again (React StrictMode re-runs effects, `<Activity>` reconnects them): the store takes it back and its
   * first read gives the current tags.
   */
  public $of(type: TEntityType, id: TEntityId): ReadonlySignal<TTagSet> {
    const key = entityKey(type, id);
    const existing = this.signals.get(key);
    if (existing) return existing;
    const entry: Signal<TTagSet> = signal<TTagSet>(this.tagsOf(key), {
      watched: () => this.watch(key, entry),
      unwatched: () => this.unwatch(key, entry),
    });
    this.signals.set(key, entry);
    return entry;
  }

  /** The entity's tags now, without creating or tracking a signal. */
  public peekOf(type: TEntityType, id: TEntityId): TTagSet {
    return this.tagsOf(entityKey(type, id));
  }

  private tagsOf(key: string): TTagSet {
    const tags = this.entityTags.get(key);
    return tags ? new Map(tags) : EMPTY_TAGS;
  }

  /**
   * A signal gained its first subscriber. One the store still hands out is current. A released one (its holder
   * subscribed again) goes back into the store, as the signal `$of` hands out, or as a stray when `$of` made a new
   * one meanwhile, and catches up with the tags written while it was released. The subscriber has not read it yet.
   */
  private watch(key: string, entry: Signal<TTagSet>): void {
    const current = this.signals.get(key);
    if (current === entry) return;
    if (current === undefined) {
      this.signals.set(key, entry);
    } else {
      const strays = this.strays.get(key) ?? new Set<Signal<TTagSet>>();
      strays.add(entry);
      this.strays.set(key, strays);
    }
    const tags = this.tagsOf(key);
    if (!sameTags(entry.peek(), tags)) entry.value = tags;
  }

  /** A signal lost its last subscriber: the store releases it, and a stray of the entity takes its place. */
  private unwatch(key: string, entry: Signal<TTagSet>): void {
    const strays = this.strays.get(key);
    if (this.signals.get(key) === entry) {
      this.signals.delete(key);
      const next = strays?.values().next().value;
      if (strays && next) {
        strays.delete(next);
        this.signals.set(key, next);
      }
    } else {
      strays?.delete(entry);
    }
    if (strays?.size === 0) this.strays.delete(key);
  }

  /** Members of a tag by entity key (see entityKey), for devtools and tests. */
  public membersOf<V>(tag: TTag<V>): ReadonlyMap<string, V> {
    const current = this.members.get(tag);
    if (!current) return new Map();
    // Materialize on inspection so previous snapshots stay immutable through later sparse writes.
    return (current.snapshot ??= new Map(current.values)) as ReadonlyMap<string, V>;
  }

  /** @internal Unbinds every bound tag; the graph calls it on unmount. */
  public dispose(): void {
    for (const unbind of [...this.bound.values()]) unbind();
  }

  private assertWritable(tag: TTag<unknown>): void {
    if (this.bound.has(tag)) throw new Error(`Tag "${tag.name}" is bound to a source; write the source instead`);
  }

  private apply(tag: TTag<unknown>, next: Map<string, unknown>): void {
    const previous = this.members.get(tag)?.values;
    const changed: string[] = [];
    for (const [key, value] of next) {
      if (!previous?.has(key) || !sameValue(previous.get(key), value)) changed.push(key);
    }
    if (previous) for (const key of previous.keys()) if (!next.has(key)) changed.push(key);
    if (changed.length === 0) return;
    if (next.size > 0) {
      const order = new Map<string, number>();
      for (const key of next.keys()) order.set(key, order.size);
      this.members.set(tag, { values: next, order, nextOrder: next.size });
    } else {
      this.members.delete(tag);
    }
    this.notify(tag, next, changed);
  }

  private notify(tag: TTag<unknown>, next: ReadonlyMap<string, unknown>, changed: readonly string[]): void {
    batch(() => {
      for (const key of changed) {
        const tags = new Map(this.entityTags.get(key) ?? []);
        if (next.has(key)) tags.set(tag, next.get(key));
        else tags.delete(tag);
        if (tags.size > 0) this.entityTags.set(key, tags);
        else this.entityTags.delete(key);
        const entry = this.signals.get(key);
        const strays = this.strays.size > 0 ? this.strays.get(key) : undefined;
        if (!entry && !strays) continue;
        const value = tags.size > 0 ? new Map(tags) : EMPTY_TAGS;
        if (entry) entry.value = value;
        if (strays) for (const stray of strays) stray.value = value;
      }
    });
  }
}

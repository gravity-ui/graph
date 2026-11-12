import { batch, effect, signal } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";

import type { TEntityId, TEntityType, TTag, TTagIds, TTagMembers, TTagSet } from "./types";

const EMPTY_TAGS: TTagSet = new Map();

export function entityKey(type: TEntityType, id: TEntityId): string {
  return `${type}\u0000${String(id)}`;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
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

  private readonly members = new Map<TTag<unknown>, Map<string, unknown>>();

  private readonly entityTags = new Map<string, Map<TTag<unknown>, unknown>>();

  private readonly signals = new Map<string, Signal<TTagSet>>();

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
    const next = new Map(this.members.get(tag) ?? []);
    for (const [key, value] of normalize(members)) next.set(key, value);
    this.apply(tag, next);
  }

  public delete(tag: TTag<unknown>, ids: TTagIds): void {
    this.assertWritable(tag);
    const next = new Map(this.members.get(tag) ?? []);
    for (const [type, list] of Object.entries(ids)) {
      for (const id of list ?? []) next.delete(entityKey(type, id));
    }
    this.apply(tag, next);
  }

  public clear(tag: TTag<unknown>): void {
    this.assertWritable(tag);
    this.apply(tag, new Map());
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

  /** The entity's tags; the signal changes only when this entity's tags or values change. */
  public $of(type: TEntityType, id: TEntityId): ReadonlySignal<TTagSet> {
    const key = entityKey(type, id);
    let entry = this.signals.get(key);
    if (!entry) {
      const tags = this.entityTags.get(key);
      entry = signal<TTagSet>(tags ? new Map(tags) : EMPTY_TAGS);
      this.signals.set(key, entry);
    }
    return entry;
  }

  /** Members of a tag by entity key (see entityKey), for devtools and tests. */
  public membersOf<V>(tag: TTag<V>): ReadonlyMap<string, V> {
    return (this.members.get(tag) ?? new Map()) as ReadonlyMap<string, V>;
  }

  /** @internal Unbinds every bound tag; the graph calls it on unmount. */
  public dispose(): void {
    for (const unbind of [...this.bound.values()]) unbind();
  }

  private assertWritable(tag: TTag<unknown>): void {
    if (this.bound.has(tag)) throw new Error(`Tag "${tag.name}" is bound to a source; write the source instead`);
  }

  private apply(tag: TTag<unknown>, next: Map<string, unknown>): void {
    const previous = this.members.get(tag) ?? new Map<string, unknown>();
    const changed: string[] = [];
    for (const [key, value] of next) {
      if (!previous.has(key) || !sameValue(previous.get(key), value)) changed.push(key);
    }
    for (const key of previous.keys()) if (!next.has(key)) changed.push(key);
    if (changed.length === 0) return;
    if (next.size > 0) this.members.set(tag, next);
    else this.members.delete(tag);
    batch(() => {
      for (const key of changed) {
        const tags = new Map(this.entityTags.get(key) ?? []);
        if (next.has(key)) tags.set(tag, next.get(key));
        else tags.delete(tag);
        if (tags.size > 0) this.entityTags.set(key, tags);
        else this.entityTags.delete(key);
        const entry = this.signals.get(key);
        if (entry) entry.value = tags.size > 0 ? new Map(tags) : EMPTY_TAGS;
      }
    });
  }
}

import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { SceneStore } from "../../lib/scene/store/SceneStore";
import type { TSceneChange, TSceneElement } from "../../lib/scene/types";

/**
 * Dense ranks of the blocks shown in HTML (spec §10, T4; decision 9): 1 for the lowest of them in scene order. React
 * containers take their CSS z-index from the rank; the scene's `order` counter grows without bound, the rank does not.
 * A block counts while a container watches its `$viewState` (`track(id, true)`), delegated or not (review I11).
 * Changes of the set, of a tracked element's order or bucket, deletions and additions are ranked once per frame
 * (`flush`), so D containers mounting together cost one ranking.
 *
 * An id stays tracked while any container watches it, through a delete of its element: a block deleted and added again
 * with the same id while shown is ranked again, and a container that moves to the new view watches it before it
 * releases the old one. Consumers compare a rank value per id: `flush` builds a new map whenever anything changed.
 */
export class DelegatedRanks {
  public readonly $ranks: ReadonlySignal<ReadonlyMap<string, number>>;

  /** Watchers per tracked id. */
  private readonly ids = new Map<string, number>();

  private readonly generation = signal(0);

  private dirty = false;

  private disposed = false;

  private readonly unsubscribe: () => void;

  constructor(
    private readonly store: SceneStore,
    private readonly schedule: () => void
  ) {
    this.$ranks = computed(() => this.rank(this.generation.value));
    this.unsubscribe = store.subscribe((change) => this.onChange(change));
  }

  /** One watcher more (`shown`) or less for the element's block; the rank follows from the next flush. */
  public track(id: string, shown: boolean): void {
    // A container may stop watching after the graph unmounted.
    if (this.disposed) return;
    const watchers = this.ids.get(id) ?? 0;
    if (shown) {
      this.ids.set(id, watchers + 1);
      if (watchers > 0) return;
    } else {
      if (watchers === 0) return;
      if (watchers > 1) {
        this.ids.set(id, watchers - 1);
        return;
      }
      this.ids.delete(id);
    }
    this.markDirty();
  }

  /** The element's rank as of the last flush; 0 when it is not shown in HTML. */
  public rankOf(id: string): number {
    return this.$ranks.value.get(id) ?? 0;
  }

  /** Publishes the changes collected since the last frame; the scene calls it once per frame. */
  public flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.generation.value = this.generation.peek() + 1;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.unsubscribe();
    this.ids.clear();
    this.dirty = true;
    this.flush();
    this.disposed = true;
  }

  private onChange(change: TSceneChange): void {
    if (!this.ids.has(change.element.id)) return;
    if (change.type !== "update" || !change.fields || change.fields.has("order") || change.fields.has("zIndex")) {
      this.markDirty();
    }
  }

  private markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.schedule();
  }

  /** `_generation` only makes the computed run again. Tracked ids without an element are not ranked. */
  private rank(_generation: number): ReadonlyMap<string, number> {
    const elements: TSceneElement[] = [];
    for (const id of this.ids.keys()) {
      const element = this.store.get(id);
      if (element) elements.push(element);
    }
    elements.sort((a, b) => this.store.compareOrder(a, b));
    return new Map(elements.map((element, index) => [element.id, index + 1]));
  }
}

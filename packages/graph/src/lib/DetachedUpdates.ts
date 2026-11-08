/** One detached component's place in its tree's update queue. */
export type TDetachedEntry = {
  /** Position in the queue; -1 while not queued. */
  slot: number;
  /** Frame in which the entry last applied: an entry applies at most once per frame. */
  appliedFrame: number;
  /** Applies the component's pending update. */
  apply(): void;
};

/**
 * Pending updates of the detached components of one component tree. The frame does not walk detached components: a
 * component that changes enqueues itself, and the tree applies the queue once per frame before painting, so the cost
 * follows the number of changed components. Entries keep their slot, so enqueueing and removal cost no hashing.
 */
export class DetachedUpdates {
  private readonly queue: Array<TDetachedEntry | undefined> = [];

  private frame = 0;

  private flushing = false;

  /** Starts a new frame: entries that applied in the previous one may apply again. */
  public beginFrame(): void {
    this.frame++;
  }

  public enqueue(entry: TDetachedEntry): void {
    if (entry.slot >= 0) return;
    entry.slot = this.queue.length;
    this.queue.push(entry);
  }

  public delete(entry: TDetachedEntry): void {
    if (entry.slot < 0) return;
    this.queue[entry.slot] = undefined;
    entry.slot = -1;
  }

  /**
   * Applies queued entries in order, including entries queued while it runs. An entry that already applied in this
   * frame stays queued for the next one, like a tree node that asks for an update during its own preparation. A call
   * made while it runs does nothing: the running call reaches new entries. Returns whether any entry applied.
   *
   * An entry whose update throws leaves the queue, like a tree node whose preparation threw: it applies again when it
   * asks again, so a broken update does not throw in every frame. The entries behind it stay queued in order.
   */
  public flush(): boolean {
    if (this.flushing || !this.queue.length) return false;
    this.flushing = true;
    const queue = this.queue;
    let deferred: TDetachedEntry[] | undefined;
    let applied = false;
    let index = 0;
    try {
      for (; index < queue.length; index++) {
        const entry = queue[index];
        if (!entry) continue;
        queue[index] = undefined;
        entry.slot = -1;
        if (entry.appliedFrame === this.frame) {
          (deferred ??= []).push(entry);
          continue;
        }
        entry.appliedFrame = this.frame;
        applied = true;
        entry.apply();
      }
    } finally {
      // After a full pass nothing is behind `index`; after a failed update the entries behind it move to the front.
      let length = 0;
      for (let rest = index + 1; rest < queue.length; rest++) {
        const entry = queue[rest];
        if (!entry) continue;
        entry.slot = length;
        queue[length++] = entry;
      }
      queue.length = length;
      this.flushing = false;
      if (deferred) for (const entry of deferred) this.enqueue(entry);
    }
    return applied;
  }

  /** Drops every queued entry, for example when the tree's root unmounts. */
  public clear(): void {
    for (const entry of this.queue) if (entry) entry.slot = -1;
    this.queue.length = 0;
  }
}

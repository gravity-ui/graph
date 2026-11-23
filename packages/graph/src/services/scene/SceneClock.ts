type TPauseReason = "graph" | "hidden";

/**
 * Monotonic scene time in seconds. Starts paused; it stops while the graph is stopped or the page is hidden,
 * and continues from the frozen value without a jump.
 */
export class SceneClock {
  private elapsedMs = 0;

  /** Source timestamp of the last resume, or null while paused. */
  private startedAt: number | null = null;

  private readonly reasons = new Set<TPauseReason>(["graph"]);

  constructor(private readonly nowMs: () => number = () => performance.now()) {}

  /** Seconds since the clock was created, excluding paused time. */
  public now(): number {
    const running = this.startedAt === null ? 0 : this.nowMs() - this.startedAt;
    return (this.elapsedMs + running) / 1000;
  }

  public get paused(): boolean {
    return this.reasons.size > 0;
  }

  public pause(): void {
    this.addReason("graph");
  }

  public resume(): void {
    this.removeReason("graph");
  }

  /** Pauses while document.hidden; returns an unsubscribe. */
  public followVisibility(doc: Document): () => void {
    const sync = (): void => {
      if (doc.hidden) {
        this.addReason("hidden");
      } else {
        this.removeReason("hidden");
      }
    };
    doc.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      doc.removeEventListener("visibilitychange", sync);
      this.removeReason("hidden");
    };
  }

  private addReason(reason: TPauseReason): void {
    if (this.reasons.has(reason)) return;
    this.settle();
    this.reasons.add(reason);
  }

  private removeReason(reason: TPauseReason): void {
    if (!this.reasons.delete(reason)) return;
    if (this.reasons.size === 0) {
      this.startedAt = this.nowMs();
    }
  }

  /** Folds the running span into the accumulated time and stops counting. */
  private settle(): void {
    if (this.startedAt === null) return;
    this.elapsedMs += this.nowMs() - this.startedAt;
    this.startedAt = null;
  }
}

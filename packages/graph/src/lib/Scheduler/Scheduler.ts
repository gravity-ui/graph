const rAF = (callback: () => void) =>
  typeof window !== "undefined" ? window.requestAnimationFrame(callback) : globalThis.setTimeout(callback, 16);
type TFrameHandle = ReturnType<typeof rAF>;
const cAF = (handle: TFrameHandle) => {
  if (typeof window !== "undefined" && typeof handle === "number") {
    window.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout(handle);
  }
};
const getNow =
  typeof window !== "undefined"
    ? window.performance.now.bind(window.performance)
    : globalThis.Date.now.bind(globalThis.Date);

interface IScheduler {
  performUpdate: (time: number) => void;
}

export type TSchedulerPriority = 0 | 1 | 2 | 3 | 4;

type TSchedulerTreeNode = {
  data: {
    iterate: () => boolean;
  };
};

type TSchedulerTree = {
  traverseDown: (iterator: (node: TSchedulerTreeNode) => boolean) => void;
};

const MEDIUM_PRIORITY: TSchedulerPriority = 2;

/** Position of an in-progress iteration, adjusted when a task is removed before or at it. */
type TIterationCursor = { level: number; index: number };

/**
 * Runs registered tasks once per animation frame, in priority order. The frame loop runs exactly
 * while at least one task is registered: the first registration requests a frame, and removing the
 * last one cancels it. Owners (graphs, debounced helpers) register work and remove it when done.
 */
export class GlobalScheduler {
  private schedulers: [IScheduler[], IScheduler[], IScheduler[], IScheduler[], IScheduler[]];
  private _cAFID: TFrameHandle | undefined;
  /** Cursors of the iterations in progress (more than one only for nested performUpdate calls). */
  private cursors: TIterationCursor[] = [];
  private visibilityChangeHandler: (() => void) | null = null;

  constructor() {
    this.tick = this.tick.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

    this.schedulers = [[], [], [], [], []];
    this.setupVisibilityListener();
  }

  /**
   * Setup listener for page visibility changes.
   * When tab becomes visible after being hidden, force immediate update.
   * This fixes the issue where tabs opened in background don't render HTML until interaction.
   */
  private setupVisibilityListener(): void {
    if (typeof document === "undefined") {
      return; // Not in browser environment
    }

    this.visibilityChangeHandler = this.handleVisibilityChange;
    document.addEventListener("visibilitychange", this.visibilityChangeHandler);
  }

  /**
   * Handle page visibility changes.
   * When page becomes visible, perform immediate update if scheduler is running.
   */
  private handleVisibilityChange(): void {
    // Only update if page becomes visible and scheduler is running
    if (!document.hidden && this._cAFID !== undefined) {
      // Perform immediate update when tab becomes visible
      this.performUpdate();
    }
  }

  /**
   * Cleanup visibility listener
   */
  private cleanupVisibilityListener(): void {
    if (this.visibilityChangeHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  public getSchedulers() {
    return this.schedulers;
  }

  public addScheduler(scheduler: IScheduler, index: TSchedulerPriority = MEDIUM_PRIORITY): () => void {
    this.schedulers[index].push(scheduler);
    this.start();
    return () => this.removeScheduler(scheduler, index);
  }

  /**
   * Removes a task immediately. A task removed during a frame is not called later in that frame,
   * and the remaining tasks are not skipped.
   */
  public removeScheduler(scheduler: IScheduler, index: TSchedulerPriority = MEDIUM_PRIORITY): void {
    const tasks = this.schedulers[index];
    const taskIndex = tasks.indexOf(scheduler);
    if (taskIndex === -1) {
      return;
    }
    tasks.splice(taskIndex, 1);
    for (const cursor of this.cursors) {
      if (cursor.level === index && taskIndex <= cursor.index) {
        cursor.index -= 1;
      }
    }
    if (this.schedulers.every((level) => level.length === 0)) {
      this.stop();
    }
  }

  private start(): void {
    if (this._cAFID === undefined) {
      this._cAFID = rAF(this.tick);
    }
  }

  private stop(): void {
    if (this._cAFID !== undefined) {
      cAF(this._cAFID);
    }
    this._cAFID = undefined;
  }

  /**
   * Cleanup method to be called when GlobalScheduler is no longer needed.
   * Stops the scheduler and removes event listeners.
   */
  public destroy(): void {
    this.stop();
    this.cleanupVisibilityListener();
  }

  public tick() {
    if (this._cAFID !== undefined) {
      this._cAFID = rAF(this.tick);
    }
    this.performUpdate();
  }

  public performUpdate(): void {
    const startTime = getNow();
    const cursor: TIterationCursor = { level: 0, index: 0 };
    this.cursors.push(cursor);
    try {
      for (cursor.level = 0; cursor.level < this.schedulers.length; cursor.level += 1) {
        const tasks = this.schedulers[cursor.level];
        for (cursor.index = 0; cursor.index < tasks.length; cursor.index += 1) {
          tasks[cursor.index].performUpdate(getNow() - startTime);
        }
      }
    } finally {
      this.cursors.splice(this.cursors.indexOf(cursor), 1);
    }
  }
}

export const globalScheduler = new GlobalScheduler();

export const scheduler = globalScheduler;
/**
 * Update state of one component tree: a dirty flag and a traversal. It does not register anywhere;
 * whoever owns the root (the graph, for its layers) calls performUpdate on each frame.
 */
export class Scheduler {
  private sheduled = false;
  private root: TSchedulerTree | undefined;

  /** Sets the tree to traverse; `undefined` detaches it, so later updates do nothing. */
  public setRoot(root: TSchedulerTree | undefined): void {
    this.root = root;
  }

  public update() {
    this.root?.traverseDown(this.iterator);
  }

  public iterator(node: TSchedulerTreeNode) {
    return node.data.iterate();
  }

  public scheduleUpdate() {
    this.sheduled = true;
  }

  public performUpdate() {
    if (this.sheduled) {
      this.sheduled = false;
      this.update();
    }
  }
}

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

export class GlobalScheduler {
  private schedulers: [IScheduler[], IScheduler[], IScheduler[], IScheduler[], IScheduler[]];
  private _cAFID: TFrameHandle | undefined;
  private toRemove: Array<[IScheduler, TSchedulerPriority]> = [];
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

  public addScheduler(scheduler: IScheduler, index: TSchedulerPriority = MEDIUM_PRIORITY) {
    this.schedulers[index].push(scheduler);
    return () => this.removeScheduler(scheduler, index);
  }

  public removeScheduler(scheduler: IScheduler, index: TSchedulerPriority = MEDIUM_PRIORITY) {
    this.toRemove.push([scheduler, index]);
  }

  public start() {
    if (this._cAFID === undefined) {
      this._cAFID = rAF(this.tick);
    }
  }

  public stop() {
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

  public performUpdate() {
    const startTime = getNow();
    let schedulers: IScheduler[] = [];

    for (let i = 0; i < this.schedulers.length; i += 1) {
      schedulers = this.schedulers[i];

      for (let j = 0; j < schedulers.length; j += 1) {
        schedulers[j].performUpdate(getNow() - startTime);
      }
    }

    // Process deferred removals after all schedulers have been executed
    for (const [scheduler, index] of this.toRemove) {
      const schedulerIndex = this.schedulers[index].indexOf(scheduler);
      if (schedulerIndex !== -1) {
        this.schedulers[index].splice(schedulerIndex, 1);
      }
    }
    this.toRemove.length = 0;
  }
}

export const globalScheduler = new GlobalScheduler();

export const scheduler = globalScheduler;
export class Scheduler {
  private sheduled: boolean;
  private root: TSchedulerTree | undefined;
  private registration: IScheduler | undefined;

  constructor() {
    this.performUpdate = this.performUpdate.bind(this);

    this.sheduled = false;

    this.start();
  }

  public setRoot(root: TSchedulerTree) {
    this.root = root;
  }

  public start() {
    if (this.registration) return;
    const registration = {
      performUpdate: () => {
        if (this.registration === registration) this.performUpdate();
      },
    };
    this.registration = registration;
    globalScheduler.addScheduler(registration);
  }

  public stop() {
    if (!this.registration) return;
    globalScheduler.removeScheduler(this.registration);
    this.registration = undefined;
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

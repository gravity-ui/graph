import { Tree } from "./Tree";

const rAF: Function = typeof window !== "undefined" ? window.requestAnimationFrame : (fn) => global.setTimeout(fn, 16);
const cAF: Function = typeof window !== "undefined" ? window.cancelAnimationFrame : global.clearTimeout;
const getNow =
  typeof window !== "undefined" ? window.performance.now.bind(window.performance) : global.Date.now.bind(global.Date);

interface IScheduler {
  performUpdate: Function;
}

export class GlobalScheduler {
  private schedulers: IScheduler[][];
  private _cAFID: number;

  constructor() {
    this.tick = this.tick.bind(this);

    this.schedulers = [[], [], [], [], []];
  }

  public getSchedulers() {
    return this.schedulers;
  }

  public addScheduler(scheduler: IScheduler, index = 2) {
    this.schedulers[index].push(scheduler);
  }

  public removeScheduler(scheduler: IScheduler, index = 2) {
    const i = this.schedulers[index].indexOf(scheduler);

    if (i !== -1) {
      this.schedulers[index].splice(i, 1);
    }
  }

  public start() {
    if (!this._cAFID) {
      this._cAFID = rAF(this.tick);
    }
  }

  public stop() {
    cAF(this._cAFID);
    this._cAFID = undefined;
  }

  public tick() {
    this.performUpdate();
    this._cAFID = rAF(this.tick);
  }

  public performUpdate() {
    const startTime = getNow();
    let schedulers = [];

    for (let i = 0; i < this.schedulers.length; i += 1) {
      schedulers = this.schedulers[i];

      for (let j = 0; j < schedulers.length; j += 1) {
        schedulers[j].performUpdate(getNow() - startTime);
      }
    }
  }
}

export const globalScheduler = new GlobalScheduler();

export const scheduler = globalScheduler;
export class Scheduler {
  private sheduled: boolean;
  private root: Tree;

  constructor() {
    this.performUpdate = this.performUpdate.bind(this);

    this.sheduled = false;

    globalScheduler.addScheduler(this);
  }

  public setRoot(root: Tree) {
    this.root = root;
  }

  public start() {
    globalScheduler.addScheduler(this);
  }

  public stop() {
    globalScheduler.removeScheduler(this);
  }

  public update() {
    this.root?.traverseDown(this.iterator);
  }

  public iterator(node: Tree) {
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

import { Node } from './Tree';

const rAF: Function = typeof window !== 'undefined'
  ? window.requestAnimationFrame
  : (fn) => global.setTimeout(fn, 16);
const cAF: Function = typeof window !== 'undefined'
  ? window.cancelAnimationFrame
  : global.clearTimeout;
const getNow = typeof window !== 'undefined'
  ? window.performance.now.bind(window.performance)
  : global.Date.now.bind(global.Date);

interface IScheduler {
  performUpdate: Function
}

export class GlobalScheduler {
  private schedulers: IScheduler[][];
  private _cAFID: number;

  constructor () {
    this.tick = this.tick.bind(this);

    this.schedulers = [[], [], [], [], []];
  }

  getSchedulers () {
    return this.schedulers;
  }

  addScheduler (scheduler: IScheduler, index = 2) {
    this.schedulers[index].push(scheduler);
  }

  removeScheduler (scheduler: IScheduler, index = 2) {
    const i = this.schedulers[index].indexOf(scheduler);

    if (i !== -1) {
      this.schedulers[index].splice(i, 1);
    }
  }

  start () {
    if (!this._cAFID) {
      this._cAFID = rAF(this.tick)
    }
  }

  stop () {
    cAF(this._cAFID);
    this._cAFID = undefined;
  }

  tick () {
    this.performUpdate();
    this._cAFID = rAF(this.tick);
  }

  performUpdate () {
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
  private root: Node;

  constructor () {
    this.performUpdate = this.performUpdate.bind(this);

    this.sheduled = false;

    globalScheduler.addScheduler(this);
  }

  setRoot (root: Node) {
    this.root = root;
  }

  start () {
    globalScheduler.addScheduler(this);
  }

  stop () {
    globalScheduler.removeScheduler(this);
  }

  update () {
    this.root && this.root.traverseDown(this.iterator);
  }

  iterator (node: Node) {
    return node.data.iterate();
  }

  scheduleUpdate () {
    this.sheduled = true;
  }

  performUpdate () {
    if (this.sheduled) {
      this.sheduled = false;
      this.update();
    }
  }
}

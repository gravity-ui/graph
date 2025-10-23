/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: throtled with leading need test

import { scheduler } from "../../lib/Scheduler";

const getNowTime = () => performance.now();

type Options = {
  delay?: number;
  leading?: boolean;
  throttle?: boolean;
  lightFrame?: boolean;
  frameTime?: number;
};

type BindedFunction = ((...args: unknown[]) => unknown) & {
  inOrder: boolean;
  args?: any;
  delay?: number;
};

export class FrameDebouncer {
  private nextFrameFns: ((...args: unknown[]) => unknown)[] = [];

  private tmpFns: ((...args: unknown[]) => unknown)[] = [];

  private mapOriginalToBindedFn: WeakMap<(...args: unknown[]) => unknown, BindedFunction> = new WeakMap();

  public run(frameTime: number) {
    const start = getNowTime();

    if (this.nextFrameFns.length === 0) return;

    for (let i = 0; i < this.nextFrameFns.length; i += 1) {
      this.nextFrameFns[i](frameTime + getNowTime() - start);
    }

    this.nextFrameFns = this.tmpFns;
    this.tmpFns = [];
  }

  public add(fn: any, options: Options = {}) {
    const bindedFn = this.getBindedFunction(fn, options);

    this.mapOriginalToBindedFn.set(fn, bindedFn);

    return (...args: any[]) => {
      if (!bindedFn.inOrder) {
        this.nextFrameFns.push(bindedFn);
        bindedFn.inOrder = true;
      }
      bindedFn.args = args;
      bindedFn.delay = options.throttle || options.leading ? bindedFn.delay : options.delay ?? 0;
    };
  }

  public delete(fn: any) {
    const bindedFn = this.mapOriginalToBindedFn.get(fn);
    if (!bindedFn) return;

    const i = this.nextFrameFns.indexOf(bindedFn);

    if (i !== -1) {
      this.nextFrameFns.splice(i, 1);
      bindedFn.inOrder = false;
    }
  }

  private getBindedFunction(fn: (...args: unknown[]) => unknown, options: Options): BindedFunction {
    const bindedFn = this.createBindedFunction(fn, options);

    bindedFn.delay = options.delay;
    bindedFn.args = [];

    return bindedFn;
  }

  private createBindedFunction(fn: any, options: Options): any {
    // Complex debouncing algorithm with frame time optimization - complexity is necessary
    // eslint-disable-next-line complexity
    const bindedFn: any = (frameTime: number) => {
      const frameTimeLimit = options.frameTime ?? 16;
      const hardFrame = options.lightFrame ? frameTime > 16 : frameTime > frameTimeLimit;
      const delayLimit = options.delay ?? 0;
      const skip = options.leading ? (bindedFn.delay ?? 0) < delayLimit : (bindedFn.delay ?? 0) > 0;

      if (hardFrame || skip) {
        // skip original function
        if (options.leading) {
          bindedFn.delay = (bindedFn.delay ?? 0) + 1;

          if (hardFrame || (bindedFn.delay ?? 0) < delayLimit) {
            this.tmpFns.push(bindedFn);
          } else {
            bindedFn.inOrder = false;
          }
        } else {
          this.tmpFns.push(bindedFn);
          bindedFn.delay = (bindedFn.delay ?? 0) - 1;
        }

        return;
      }

      const run = options.leading ? (bindedFn.delay ?? 0) >= delayLimit : (bindedFn.delay ?? 0) < 1;

      if (run) {
        // perform original function
        fn(...bindedFn.args);

        if (options.throttle) {
          bindedFn.delay = delayLimit;
        }

        if (options.leading) {
          bindedFn.delay = 0;
          this.tmpFns.push(bindedFn);
        } else {
          bindedFn.inOrder = false;
        }
      }
    };

    return bindedFn;
  }
}

export const frameDebouncer = new FrameDebouncer();

scheduler.addScheduler({ performUpdate: frameDebouncer.run.bind(frameDebouncer) }, 4);

import { noop } from "./functions";

const TIME_PER_FRAME_FOR_GC = 5; // 5 mc
const globalObject = typeof window === "undefined" ? global : window;
const rIC = globalObject.requestIdleCallback || globalObject.setTimeout;

const getTime = () => performance.now();
type EmitterEventsDefinition = Record<string, (...args: unknown[]) => void>;
export class Emitter<T extends EmitterEventsDefinition = EmitterEventsDefinition> {
  private gcLaunched: boolean;

  private eventsForGC? = new Set<keyof T>();

  private mapEventToFnWrapper?: Map<keyof T, FnWrapper<T[keyof T]>[]>;

  private mapEventToMapFnToFnWrapper?: Map<keyof T, WeakMap<T[keyof T], FnWrapper<T[keyof T]>>>;

  constructor() {
    this.eventsForGC = new Set();
    this.mapEventToFnWrapper = new Map();
    this.mapEventToMapFnToFnWrapper = new Map();
  }

  public on<Name extends keyof T>(event: Name, fn: T[Name]) {
    this._on(event, fn, false);
    return this;
  }

  public once<Name extends keyof T>(event: Name, fn: T[Name]) {
    this._on(event, fn, true);
    return this;
  }

  public off<Name extends keyof T>(event?: Name, fn?: T[Name]) {
    if (event === undefined) {
      this.eventsForGC = new Set();
      this.mapEventToFnWrapper = new Map();
      this.mapEventToMapFnToFnWrapper = new Map();
      return this;
    }

    if (this.mapEventToMapFnToFnWrapper?.has(event)) {
      if (typeof fn === "function" && this.mapEventToMapFnToFnWrapper.get(event)?.has(fn)) {
        this.mapEventToMapFnToFnWrapper.get(event)?.get(fn)?.destroy();

        this.eventsForGC?.add(event);
        this._launchGC();
      }

      if (fn === undefined) {
        const fnWrappers = this.mapEventToFnWrapper?.get(event) ?? [];

        for (let i = 0; i < fnWrappers.length; i += 1) {
          fnWrappers[i].destroy();
        }

        this.eventsForGC?.add(event);
        this._launchGC();
      }
    }

    return this;
  }

  public emit<Name extends keyof T>(event: Name, ...args: Parameters<T[Name]>) {
    if (!this.mapEventToFnWrapper?.has(event)) return;

    const fnWrappers = this.mapEventToFnWrapper.get(event) ?? [];

    for (let i = 0; i < fnWrappers.length; i += 1) {
      fnWrappers[i].run(...args);
    }
    return this;
  }

  public destroy() {
    this.eventsForGC = new Set();
    this.mapEventToFnWrapper = new Map();
    this.mapEventToMapFnToFnWrapper = new Map();
  }

  private _on<Name extends keyof T>(event: Name, fn: T[Name], once: boolean) {
    if (!this.mapEventToFnWrapper?.has(event)) {
      this.mapEventToFnWrapper?.set(event, []);
      this.mapEventToMapFnToFnWrapper?.set(event, new WeakMap());
    }

    const fnWrapper = new FnWrapper(fn, Boolean(once));

    this.mapEventToFnWrapper?.get(event)?.push(fnWrapper);
    this.mapEventToMapFnToFnWrapper?.get(event)?.set(fn, fnWrapper);
  }

  private _launchGC() {
    if (this.gcLaunched) return;

    this.gcLaunched = true;

    rIC(() => {
      this.gcLaunched = false;
      this._walkGC();
    });
  }

  private _walkGC() {
    const startTime = getTime();

    for (const event of this.eventsForGC ?? []) {
      const newFnWrappers = [];
      const fnWrappers = this.mapEventToFnWrapper?.get(event) ?? [];

      for (let i = 0; i < fnWrappers.length; i += 1) {
        if (!fnWrappers[i].canBeDeleted) {
          newFnWrappers.push(fnWrappers[i]);
        }
      }

      this.mapEventToFnWrapper?.set(event, newFnWrappers);
      this.eventsForGC?.delete(event);

      if (getTime() - startTime >= TIME_PER_FRAME_FOR_GC) {
        this._launchGC();
        return;
      }
    }
  }
}

type EmitterFn = (...args: unknown[]) => void;

class FnWrapper<Fn extends EmitterFn> {
  public fn: Fn;

  public once: boolean;

  public canBeDeleted: boolean;

  constructor(fn: Fn, once: boolean) {
    this.fn = fn;
    this.once = once;
    this.canBeDeleted = false;
  }

  public run(...args: Parameters<Fn>) {
    this.fn.apply(null, Array.from(args));
    if (this.once) {
      this.destroy();
    }
  }

  public destroy() {
    this.fn = noop as Fn;
    this.canBeDeleted = true;
  }
}

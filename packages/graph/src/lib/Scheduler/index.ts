import type { Tree } from "../Tree";

import {
  GlobalScheduler as RuntimeGlobalScheduler,
  Scheduler as RuntimeScheduler,
  globalScheduler as runtimeGlobalScheduler,
  scheduler as runtimeScheduler,
} from "./Scheduler";

interface IScheduler {
  performUpdate: (time: number) => void;
}

export enum ESchedulerPriority {
  HIGHEST = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  LOWEST = 4,
}

type TGlobalSchedulerConstructor = new () => GlobalScheduler;

export interface GlobalScheduler {
  getSchedulers(): [IScheduler[], IScheduler[], IScheduler[], IScheduler[], IScheduler[]];
  addScheduler(scheduler: IScheduler, index?: ESchedulerPriority): () => void;
  removeScheduler(scheduler: IScheduler, index?: ESchedulerPriority): void;
  /** Keeps the frame loop running until the same owner releases it; started graphs retain it. */
  retain(owner: object): void;
  /** Releases an owner; the frame loop stops once no owner retains it. */
  release(owner: object): void;
  /** Whether the frame loop is currently scheduled. */
  isRunning(): boolean;
  start(): void;
  /** Stops the frame loop regardless of owners; the next retain() starts it again. */
  stop(): void;
  destroy(): void;
  tick(): void;
  performUpdate(): void;
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GlobalScheduler: TGlobalSchedulerConstructor = RuntimeGlobalScheduler;
export const globalScheduler: GlobalScheduler = runtimeGlobalScheduler;
export const scheduler: GlobalScheduler = runtimeScheduler;

export interface Scheduler {
  setRoot(root: Tree): void;
  start(): void;
  stop(): void;
  update(): void;
  iterator(node: Tree): boolean;
  scheduleUpdate(): void;
  performUpdate(): void;
}

type TSchedulerConstructor = new (autoStart?: boolean) => Scheduler;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Scheduler: TSchedulerConstructor = RuntimeScheduler;
export type { TSchedulerPriority } from "./Scheduler";
export { debounce, schedule, throttle } from "./schedule";
export type { TDebounceOptions, TScheduleOptions } from "./schedule";

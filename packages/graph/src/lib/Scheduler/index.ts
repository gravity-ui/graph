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
  start(): void;
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

type TSchedulerConstructor = new () => Scheduler;

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Scheduler: TSchedulerConstructor = RuntimeScheduler;
export type { TSchedulerPriority } from "./Scheduler";
export { debounce, schedule, throttle } from "./schedule";
export type { TDebounceOptions, TScheduleOptions } from "./schedule";

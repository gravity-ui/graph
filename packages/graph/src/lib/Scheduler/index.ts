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

/**
 * Frame loop shared by all graphs. It runs while at least one task is registered; registering a
 * task requests a frame and removing the last task cancels the loop.
 */
export interface GlobalScheduler {
  getSchedulers(): [IScheduler[], IScheduler[], IScheduler[], IScheduler[], IScheduler[]];
  /** Registers a task and starts the frame loop if needed; returns a function that removes it. */
  addScheduler(scheduler: IScheduler, index?: ESchedulerPriority): () => void;
  /** Removes a task immediately; the loop stops when no task remains. */
  removeScheduler(scheduler: IScheduler, index?: ESchedulerPriority): void;
  destroy(): void;
  tick(): void;
  performUpdate(): void;
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GlobalScheduler: TGlobalSchedulerConstructor = RuntimeGlobalScheduler;
export const globalScheduler: GlobalScheduler = runtimeGlobalScheduler;
export const scheduler: GlobalScheduler = runtimeScheduler;

/** Update state of one component tree; its owner calls performUpdate on each frame. */
export interface Scheduler {
  setRoot(root: Tree | undefined): void;
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

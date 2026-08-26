import {
  GlobalScheduler as PrivateGlobalScheduler,
  Scheduler as PrivateScheduler,
  globalScheduler as privateGlobalScheduler,
  scheduler as privateScheduler,
} from "@gravity-ui/graph-scheduler";

import { Tree } from "./Tree";

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

type TGlobalSchedulerConstructor = new () => GlobalScheduler;

// The interface keeps declarations graph-owned while the constructor value delegates to the private package.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const GlobalScheduler = PrivateGlobalScheduler as unknown as TGlobalSchedulerConstructor;
export const globalScheduler = privateGlobalScheduler as unknown as GlobalScheduler;
export const scheduler = privateScheduler as unknown as GlobalScheduler;

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

// The interface keeps declarations graph-owned while the constructor value delegates to the private package.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Scheduler = PrivateScheduler as unknown as TSchedulerConstructor;

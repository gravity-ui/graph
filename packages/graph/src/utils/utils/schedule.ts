import {
  debounce as privateDebounce,
  schedule as privateSchedule,
  throttle as privateThrottle,
} from "@gravity-ui/graph-scheduler";

import { ESchedulerPriority } from "../../lib";

export type TScheduleOptions = {
  priority: ESchedulerPriority;
  frameInterval: number;
  once?: boolean;
};

export const schedule = privateSchedule as unknown as (fn: Function, options: TScheduleOptions) => () => void;

export type TDebounceOptions = {
  priority?: ESchedulerPriority;
  frameInterval?: number;
  frameTimeout?: number;
};

export const debounce = privateDebounce as unknown as <T extends (...args: Parameters<T>) => void>(
  fn: T,
  options?: TDebounceOptions
) => T & { cancel: () => void; flush: () => void; isScheduled: () => boolean };

export const throttle = privateThrottle as unknown as <T extends (...args: Parameters<T>) => void>(
  fn: T,
  options?: TDebounceOptions
) => T & { cancel: () => void; flush: () => void };

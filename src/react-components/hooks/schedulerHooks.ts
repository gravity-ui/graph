import { useEffect, useMemo } from "react";

import { debounce } from "../../utils/functions";
import { TDebounceOptions, TScheduleOptions, schedule, throttle } from "../../utils/utils/schedule";
import { useFn } from "../utils/hooks/useFn";

/**
 * Hook to create a debounced function that delays execution until both frame and time conditions are met.
 *
 * The function will only execute when BOTH conditions are satisfied:
 * - At least `frameInterval` frames have passed since the last invocation
 * - At least `frameTimeout` milliseconds have passed since the last invocation
 *
 * @template T - The function type to debounce
 * @param fn - The function to debounce
 * @param options - Configuration options
 * @param options.priority - Scheduler priority (default: MEDIUM)
 * @param options.frameInterval - Number of frames to wait before execution (default: 1)
 * @param options.frameTimeout - Minimum time in milliseconds to wait before execution (default: 0)
 * @returns A debounced version of the function with a `cancel()` method to abort pending executions
 * @see TDebounceOptions
 * @example
 * ```tsx
 * const debouncedSearch = useSchedulerDebounce(
 *   (query: string) => fetchResults(query),
 *   { frameInterval: 2, frameTimeout: 300 }
 * );
 *
 * // Later: cancel pending execution
 * debouncedSearch.cancel();
 * ```
 */
export function useSchedulerDebounce<T extends (...args: Parameters<T>) => void>(fn: T, options: TDebounceOptions) {
  const handle = useFn(fn);

  /* Use memo to avoid re-creation of the debounce options on each render */
  const debounceOptions = useMemo(() => {
    return {
      ...options,
    };
  }, [options.frameInterval, options.frameTimeout, options.priority]);

  const debouncedFn = useMemo(() => debounce(handle, debounceOptions), [debounceOptions, handle]);

  useEffect(() => {
    return () => {
      debouncedFn.cancel();
    };
  }, [debouncedFn]);

  return debouncedFn;
}

/**
 * Hook to create a throttled function that limits execution frequency.
 *
 * The function will execute at most once when BOTH conditions are satisfied:
 * - At least `frameInterval` frames have passed since the last execution
 * - At least `frameTimeout` milliseconds have passed since the last execution
 *
 * Unlike debounce, throttle executes immediately on the first call and then enforces the delay.
 *
 * @template T - The function type to throttle
 * @param fn - The function to throttle
 * @param options - Configuration options
 * @param options.priority - Scheduler priority (default: MEDIUM)
 * @param options.frameInterval - Number of frames to wait between executions (default: 1)
 * @param options.frameTimeout - Minimum time in milliseconds to wait between executions (default: 0)
 * @returns A throttled version of the function with a `cancel()` method to abort pending executions
 * @see TDebounceOptions
 * @example
 * ```tsx
 * const throttledResize = useSchedulerThrottle(
 *   (width: number, height: number) => handleResize(width, height),
 *   { frameInterval: 1, frameTimeout: 100 }
 * );
 * ```
 */
export function useSchedulerThrottle<T extends (...args: Parameters<T>) => void>(fn: T, options: TDebounceOptions) {
  const handle = useFn(fn);

  /* Use memo to avoid re-creation of the throttle options on each render */
  const throttleOptions = useMemo(() => {
    return {
      ...options,
    };
  }, [options.frameInterval, options.frameTimeout, options.priority]);

  const throttledFn = useMemo(() => throttle(handle, throttleOptions), [throttleOptions, handle]);

  useEffect(() => {
    return () => {
      throttledFn.cancel();
    };
  }, [throttledFn]);

  return throttledFn;
}

type TSchedulerTaskFn = (...args: unknown[]) => void;

/**
 * Hook to schedule a task for execution after a certain number of frames have passed.
 *
 * The scheduled task will execute once the specified frame interval has elapsed.
 * The task is automatically cancelled when the component unmounts.
 *
 * @template T - The function type to schedule
 * @param fn - The function to schedule for execution
 * @param options - Configuration options
 * @param options.priority - Scheduler priority (default: MEDIUM)
 * @param options.frameInterval - Number of frames to wait before execution (default: 1)
 * @returns void - The task cleanup is handled automatically on unmount
 * @see TScheduleOptions
 * @example
 * ```tsx
 * useScheduledTask(
 *   () => updateLayout(),
 *   { frameInterval: 2, priority: 'HIGH' }
 * );
 * ```
 */
export function useScheduledTask<T extends TSchedulerTaskFn>(fn: T, options: Omit<TScheduleOptions, "once">) {
  const handle = useFn(fn);
  /* Use memo to avoid re-creation of the schedule options on each render */
  const scheduleOptions = useMemo(() => {
    return {
      ...options,
    };
  }, [options.frameInterval, options.priority]);

  const removeSchedulerFn = useMemo(() => schedule(handle, scheduleOptions), [scheduleOptions, handle]);

  useEffect(() => {
    return () => {
      removeSchedulerFn();
    };
  }, [removeSchedulerFn]);
}

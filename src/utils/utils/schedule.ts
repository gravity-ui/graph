import { ESchedulerPriority, scheduler } from "../../lib";

// Helper to get current time (similar to scheduler implementation)
const getNow =
  typeof globalThis !== "undefined"
    ? globalThis.performance.now.bind(globalThis.performance)
    : global.Date.now.bind(global.Date);

export type TScheduleOptions = {
  priority: ESchedulerPriority;
  frameInterval: number;
  once?: boolean;
};

export const schedule = (fn: Function, options: TScheduleOptions) => {
  const { priority, frameInterval, once } = options;
  let frameCounter = 0;
  let isRemoved = false;
  const debounceScheduler = {
    performUpdate: () => {
      frameCounter++;
      if (frameCounter >= frameInterval) {
        if (once && !isRemoved) {
          scheduler.removeScheduler(debounceScheduler, priority);
          isRemoved = true;
        }
        fn();
        frameCounter = 0;
        if (once) {
          isRemoved = true;
          scheduler.removeScheduler(debounceScheduler, priority);
        }
      }
    },
  };
  return scheduler.addScheduler(debounceScheduler, priority);
};

export type TDebounceOptions = {
  priority?: ESchedulerPriority;
  frameInterval?: number;
  frameTimeout?: number;
};

/**
 * Debounced wrapper: same parameter list as `F`, return type `void`, plus scheduler controls.
 * Uses `Parameters<F>` so optional and rest parameters infer correctly.
 */
export type DebouncedFunction<F extends (...args: never[]) => unknown> = ((...args: Parameters<F>) => void) & {
  cancel: () => void;
  flush: () => void;
  isScheduled: () => boolean;
};

/**
 * Throttled wrapper: same parameter list as `F`, return type `void`, plus cancel/flush.
 */
export type ThrottledFunction<F extends (...args: never[]) => unknown> = ((...args: Parameters<F>) => void) & {
  cancel: () => void;
  flush: () => void;
};

/**
 * Creates a debounced function that delays execution until after frameInterval frames
 * and frameTimeout milliseconds have passed since it was last invoked.
 * Both conditions must be met for execution.
 * @param fn - The function to debounce
 * @param options - Configuration options
 * @param options.priority - Scheduler priority (default: MEDIUM)
 * @param options.frameInterval - Number of frames to wait before execution (default: 1)
 * @param options.frameTimeout - Minimum time in milliseconds to wait before execution (default: 0)
 * @returns A debounced version of the function with cancel and flush methods
 */
export const debounce = <F extends (...args: never[]) => unknown>(
  fn: F,
  { priority = ESchedulerPriority.MEDIUM, frameInterval = 1, frameTimeout = 0 }: TDebounceOptions = {}
): DebouncedFunction<F> => {
  type Args = Parameters<F>;
  let frameCounter = 0;
  let isScheduled = false;
  let cancelled = false;
  let removeScheduler: (() => void) | null = null;
  let latestArgs: Args | undefined;
  let startTime = 0;

  const debouncedScheduler = {
    performUpdate: () => {
      // cancel() was called before this frame's performUpdate ran — skip execution
      if (cancelled) {
        cancelled = false;
        return;
      }
      frameCounter++;
      const currentTime = getNow();
      const elapsedTime = currentTime - startTime;

      if (frameCounter >= frameInterval && elapsedTime >= frameTimeout) {
        // Save the current removeScheduler before resetting state
        // to prevent race condition when fn() triggers new debounced calls
        const currentRemoveScheduler = removeScheduler;
        isScheduled = false;
        frameCounter = 0;
        startTime = 0;
        removeScheduler = null;
        const args = latestArgs;
        latestArgs = undefined;
        const invokeArgs = (args ?? ([] as unknown as Args)) as Args;
        fn(...invokeArgs);
        if (currentRemoveScheduler) {
          currentRemoveScheduler();
        }
      }
    },
  };

  const cancel = () => {
    if (isScheduled && removeScheduler) {
      // Mark as cancelled so performUpdate skips execution if it runs this frame
      // before GlobalScheduler processes the deferred removal from toRemove
      cancelled = true;
      removeScheduler();
    }
    isScheduled = false;
    frameCounter = 0;
    startTime = 0;
    removeScheduler = null;
    latestArgs = undefined;
  };

  const flush = () => {
    if (isScheduled && latestArgs !== undefined) {
      fn(...latestArgs);
      cancel();
    }
  };

  const debouncedFn = ((...args: Args) => {
    latestArgs = args;
    frameCounter = 0;
    startTime = getNow();
    cancelled = false;

    if (!isScheduled) {
      isScheduled = true;
      removeScheduler = scheduler.addScheduler(debouncedScheduler, priority);
    }
  }) as DebouncedFunction<F>;

  debouncedFn.cancel = cancel;
  debouncedFn.flush = flush;
  debouncedFn.isScheduled = () => {
    return isScheduled;
  };

  return debouncedFn;
};

/**
 * Creates a throttled function that only executes at most once per frameInterval frames
 * and frameTimeout milliseconds. Both conditions must be met for execution.
 * @param fn - The function to throttle
 * @param options - Configuration options
 * @param options.priority - Scheduler priority (default: MEDIUM)
 * @param options.frameInterval - Number of frames between executions (default: 1)
 * @param options.frameTimeout - Minimum time in milliseconds between executions (default: 0)
 * @returns A throttled version of the function with cancel and flush methods
 */
export const throttle = <F extends (...args: never[]) => unknown>(
  fn: F,
  { priority = ESchedulerPriority.MEDIUM, frameInterval = 1, frameTimeout = 0 }: TDebounceOptions = {}
): ThrottledFunction<F> => {
  type Args = Parameters<F>;
  let frameCounter = 0;
  let canExecute = true;
  let isScheduled = false;
  let removeScheduler: (() => void) | null = null;
  let startTime = 0;

  const throttledScheduler = {
    performUpdate: () => {
      frameCounter++;
      const currentTime = getNow();
      const elapsedTime = currentTime - startTime;

      if (frameCounter >= frameInterval && elapsedTime >= frameTimeout) {
        // Save the current removeScheduler before resetting state
        // to prevent race condition when new throttled calls happen
        const currentRemoveScheduler = removeScheduler;
        canExecute = true;
        isScheduled = false;
        frameCounter = 0;
        startTime = 0;
        removeScheduler = null;
        if (currentRemoveScheduler) {
          currentRemoveScheduler();
        }
      }
    },
  };

  const cancel = () => {
    if (isScheduled && removeScheduler) {
      removeScheduler();
      removeScheduler = null;
    }
    isScheduled = false;
    frameCounter = 0;
    startTime = 0;
    canExecute = true; // Reset throttle state
  };

  const flush = () => {
    cancel(); // Reset the timer and allow immediate execution
  };

  const throttledFn = ((...args: Args) => {
    if (canExecute) {
      fn(...args);
      canExecute = false;
      frameCounter = 0;
      startTime = getNow(); // Start timing from this execution

      if (!isScheduled) {
        isScheduled = true;
        removeScheduler = scheduler.addScheduler(throttledScheduler, priority);
      }
    }
  }) as ThrottledFunction<F>;

  throttledFn.cancel = cancel;
  throttledFn.flush = flush;

  return throttledFn;
};

/**
 * Usage examples:
 *
 * // Minimal usage - all defaults (1 frame, 0ms)
 * const minimalDebounce = debounce(() => console.log('Minimal'));
 *
 * // Only time-based control
 * const timeOnlyDebounce = debounce(
 *   (query: string) => console.log('Time-based search:', query),
 *   { frameTimeout: 200 }
 * );
 *
 * // Only frame-based control
 * const frameOnlyDebounce = debounce(
 *   (query: string) => console.log('Frame-based search:', query),
 *   { frameInterval: 5 }
 * );
 *
 * // Both controls (original behavior)
 * const dualControlDebounce = debounce(
 *   (query: string) => console.log('Dual control search:', query),
 *   { frameInterval: 5, frameTimeout: 100 }
 * );
 *
 * // Throttle examples
 * const immediateThrottle = throttle(
 *   () => console.log('Immediate execution'),
 *   { frameTimeout: 50 }  // Only time limit
 * );
 *
 * const performanceThrottle = throttle(
 *   (event: MouseEvent) => console.log('Mouse at:', event.clientX, event.clientY),
 *   { frameInterval: 2, frameTimeout: 16 } // ~30fps with frame control
 * );
 *
 * // High priority throttle with minimal setup
 * const priorityThrottle = throttle(
 *   () => console.log('High priority task'),
 *   { priority: ESchedulerPriority.HIGH }
 * );
 *
 * // Usage scenarios:
 * minimalDebounce(); // Executes after 1 frame
 * timeOnlyDebounce('test'); // Executes after 200ms (ignoring frames)
 * frameOnlyDebounce('test'); // Executes after 5 frames (ignoring time)
 * dualControlDebounce('test'); // Executes after 5 frames AND 100ms
 *
 * // Using cancel and flush methods:
 *
 * // Debounce with cancel
 * const searchDebounce = debounce(
 *   (query: string) => console.log('Searching:', query),
 *   { frameInterval: 10, frameTimeout: 300 }
 * );
 * searchDebounce('test');
 * searchDebounce.cancel(); // Cancels the pending execution
 *
 * // Debounce with flush
 * const saveDebounce = debounce(
 *   (data: string) => console.log('Saving:', data),
 *   { frameTimeout: 1000 }
 * );
 * saveDebounce('document');
 * saveDebounce.flush(); // Immediately executes with 'document'
 *
 * // Throttle with cancel
 * const scrollThrottle = throttle(
 *   () => console.log('Scroll handled'),
 *   { frameInterval: 3, frameTimeout: 50 }
 * );
 * scrollThrottle();
 * scrollThrottle.cancel(); // Resets throttle state, allows immediate next execution
 *
 * // Throttle with flush
 * const resizeThrottle = throttle(
 *   () => console.log('Resize handled'),
 *   { frameTimeout: 100 }
 * );
 * resizeThrottle();
 * resizeThrottle.flush(); // Resets throttle timer, allows immediate next execution
 */

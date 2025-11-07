import { ESchedulerPriority, scheduler } from "../../lib";

// Helper to get current time (similar to scheduler implementation)
const getNow =
  typeof window !== "undefined" ? window.performance.now.bind(window.performance) : global.Date.now.bind(global.Date);

export const schedule = (
  fn: Function,
  { priority, frameInterval, once }: { priority: ESchedulerPriority; frameInterval: number; once?: boolean }
) => {
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
export const debounce = <T extends (...args: unknown[]) => void>(
  fn: T,
  {
    priority = ESchedulerPriority.MEDIUM,
    frameInterval = 1,
    frameTimeout = 0,
  }: {
    priority?: ESchedulerPriority;
    frameInterval?: number;
    frameTimeout?: number;
  } = {}
): T & { cancel: () => void; flush: () => void; isScheduled: () => boolean } => {
  let frameCounter = 0;
  let isScheduled = false;
  let removeScheduler: (() => void) | null = null;
  let latestArgs: Parameters<T>;
  let startTime = 0;

  const debouncedScheduler = {
    performUpdate: () => {
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
        fn(...latestArgs);
        if (currentRemoveScheduler) {
          currentRemoveScheduler();
        }
      }
    },
  };

  const cancel = () => {
    if (isScheduled && removeScheduler) {
      removeScheduler();
    }
    isScheduled = false;
    frameCounter = 0;
    startTime = 0;
  };

  const flush = () => {
    if (isScheduled && latestArgs) {
      fn(...latestArgs);
      cancel();
    }
  };

  const debouncedFn = ((...args: Parameters<T>) => {
    latestArgs = args; // Store latest arguments
    frameCounter = 0; // Reset counter on each call
    startTime = getNow(); // Reset start time on each call

    if (!isScheduled) {
      isScheduled = true;
      removeScheduler = scheduler.addScheduler(debouncedScheduler, priority);
    }
  }) as T & { cancel: () => void; flush: () => void; isScheduled: () => boolean };

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
export const throttle = <T extends (...args: unknown[]) => void>(
  fn: T,
  {
    priority = ESchedulerPriority.MEDIUM,
    frameInterval = 1,
    frameTimeout = 0,
  }: {
    priority?: ESchedulerPriority;
    frameInterval?: number;
    frameTimeout?: number;
  } = {}
): T & { cancel: () => void; flush: () => void } => {
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

  const throttledFn = ((...args: Parameters<T>) => {
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
  }) as T & { cancel: () => void; flush: () => void };

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

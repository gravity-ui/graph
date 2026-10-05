import type { TSchedulerPriority } from "./Scheduler";
import { scheduler } from "./Scheduler";

// Helper to get current time (similar to scheduler implementation)
const getNow =
  typeof globalThis !== "undefined"
    ? globalThis.performance.now.bind(globalThis.performance)
    : globalThis.Date.now.bind(globalThis.Date);

export type TScheduleOptions = {
  priority: TSchedulerPriority;
  frameInterval: number;
  once?: boolean;
};

export const schedule = (fn: (this: void) => unknown, options: TScheduleOptions) => {
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
  priority?: TSchedulerPriority;
  frameInterval?: number;
  frameTimeout?: number;
};

type TCallback = (...args: never[]) => unknown;
type TWrappedCallback<T extends TCallback> = (this: ThisParameterType<T>, ...args: Parameters<T>) => void;
type TDebounced<T extends TCallback> = TWrappedCallback<T> & {
  cancel: () => void;
  flush: () => void;
  isScheduled: () => boolean;
};
type TThrottled<T extends TCallback> = TWrappedCallback<T> & {
  cancel: () => void;
  flush: () => void;
};

/**
 * Delay the latest invocation until both frameInterval frames and frameTimeout milliseconds pass.
 * Arguments and the receiver are forwarded; callback results are discarded.
 * flush invokes a pending call immediately, and cancel discards it.
 */
export const debounce = <T extends TCallback>(
  fn: T,
  { priority = 2, frameInterval = 1, frameTimeout = 0 }: TDebounceOptions = {}
): TDebounced<T> => {
  let frameCounter = 0;
  let startTime = 0;
  let executionDepth = 0;
  let latestCall: { args: Parameters<T>; receiver: ThisParameterType<T> } | undefined;
  let registration: { performUpdate: () => void } | undefined;
  let removeScheduler: (() => void) | undefined;

  const release = () => {
    const remove = removeScheduler;
    registration = undefined;
    removeScheduler = undefined;
    remove?.();
  };

  const cancel = () => {
    latestCall = undefined;
    if (executionDepth === 0) release();
  };

  const flush = () => {
    const call = latestCall;
    if (!call) return;
    latestCall = undefined;
    executionDepth++;
    try {
      // The wrapper's Parameters<T>/ThisParameterType<T> checked this invocation before storage.
      Reflect.apply(fn, call.receiver, call.args);
    } finally {
      executionDepth--;
      // Keep the registration while invoking callbacks (including nested flush calls).
      // Even cancel + replacement inside fn must not register another task in this frame.
      if (executionDepth === 0 && !latestCall) release();
    }
  };

  const wrapped = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    latestCall = { args, receiver: this };
    frameCounter = 0;
    startTime = getNow();
    if (registration) return;

    const nextRegistration = {
      performUpdate: () => {
        // Removals are deferred; a cancelled registration must not advance a new call's timer.
        if (registration !== nextRegistration || !latestCall) return;
        frameCounter++;
        if (frameCounter >= frameInterval && getNow() - startTime >= frameTimeout) flush();
      },
    };
    registration = nextRegistration;
    removeScheduler = scheduler.addScheduler(nextRegistration, priority);
  };

  return Object.assign(wrapped, { cancel, flush, isScheduled: () => latestCall !== undefined });
};

/**
 * Run immediately, then suppress invocations until both frameInterval frames and frameTimeout
 * milliseconds pass. Arguments and the receiver are forwarded; callback results are discarded.
 * cancel and flush reset the cooldown; suppressed calls are not queued.
 */
export const throttle = <T extends TCallback>(
  fn: T,
  { priority = 2, frameInterval = 1, frameTimeout = 0 }: TDebounceOptions = {}
): TThrottled<T> => {
  let registration: { performUpdate: () => void } | undefined;
  let removeScheduler: (() => void) | undefined;

  const cancel = () => {
    const remove = removeScheduler;
    registration = undefined;
    removeScheduler = undefined;
    remove?.();
  };

  const wrapped = function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    if (registration) return;
    let frameCounter = 0;
    const startTime = getNow();
    const nextRegistration = {
      performUpdate: () => {
        if (registration !== nextRegistration) return;
        frameCounter++;
        if (frameCounter >= frameInterval && getNow() - startTime >= frameTimeout) cancel();
      },
    };
    registration = nextRegistration;
    removeScheduler = scheduler.addScheduler(nextRegistration, priority);
    // Enter the cooldown before invoking fn so recursive calls are also throttled.
    Reflect.apply(fn, this, args);
  };

  return Object.assign(wrapped, { cancel, flush: cancel });
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

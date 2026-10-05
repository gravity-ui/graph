import { debounce, throttle, schedule, getFontSize, measureText, ESchedulerPriority } from "@gravity-ui/graph";

// Compile-only public contracts: wrappers forward arguments, not results or arbitrary callback properties.
function schedulingContracts() {
  const callback = (count: number, label?: string) => ({ count, label });
  const debounced = debounce(callback);
  const throttled = throttle(callback);
  const result: void = debounced(1, "label");
  const throttleResult: void = throttled(2);
  // @ts-expect-error Deferred calls cannot return the original callback result.
  const originalResult: { count: number } = debounced(1);
  // @ts-expect-error Throttle also discards the callback result, even when executing immediately.
  const originalThrottleResult: { count: number } = throttled(1);
  // @ts-expect-error The callback's first argument remains a number.
  debounced("wrong");
  // @ts-expect-error Required callback arguments cannot be omitted.
  throttled();
  const withMetadata = debounce(Object.assign(callback, { description: "callback metadata" }));
  // @ts-expect-error The wrapper does not copy arbitrary properties from its input function.
  withMetadata.description;
  const scheduled: boolean = debounced.isScheduled();
  debounced.cancel();
  debounced.flush();
  throttled.cancel();
  throttled.flush();
  const needsReceiver = function (this: { prefix: string }, value: number) {
    return this.prefix + value;
  };
  const receiver = { prefix: "id-", debounced: debounce(needsReceiver), throttled: throttle(needsReceiver) };
  receiver.debounced(1);
  receiver.throttled(2);
  const bare = receiver.debounced;
  // @ts-expect-error This callback requires its receiver rather than a bare function call.
  bare(1);
  const remove: () => void = schedule(() => 123, { priority: ESchedulerPriority.MEDIUM, frameInterval: 1 });
  remove();
  // @ts-expect-error schedule never supplies required callback arguments.
  schedule((count: number) => count, { priority: ESchedulerPriority.MEDIUM, frameInterval: 1 });
  const scheduledReceiver = function (this: { prefix: string }) {
    return this.prefix;
  };
  schedule(scheduledReceiver.bind({ prefix: "bound-" }), { priority: ESchedulerPriority.MEDIUM, frameInterval: 1 });
  // @ts-expect-error schedule supplies no receiver; bind callbacks that require one.
  schedule(scheduledReceiver, { priority: ESchedulerPriority.MEDIUM, frameInterval: 1 });
  // @ts-expect-error A priority outside the Scheduler's range is invalid.
  debounce(callback, { priority: 5 });
  const size: number = getFontSize(12, 2);
  const width: number = measureText("label", "12px sans-serif");
  // @ts-expect-error Font size is numeric; text input is not silently accepted.
  getFontSize("12px", 2);
  void result;
  void throttleResult;
  void originalResult;
  void originalThrottleResult;
  void scheduled;
  void size;
  void width;
}
void schedulingContracts;

// A callback union is callable only with arguments/receivers safe for every possible branch.
function unionCallbackContracts(flag: boolean) {
  const incompatible = flag ? (value: string) => value.toUpperCase() : (value: number) => value.toFixed();
  const debounced = debounce(incompatible);
  const throttled = throttle(incompatible);
  // @ts-expect-error The selected callback may require a string, so a number is unsafe.
  debounced(123);
  // @ts-expect-error The selected callback may require a number, so a string is unsafe.
  throttled("unsafe");
  const compatible = flag ? (value: string) => value.toUpperCase() : (value: string) => value.length;
  const result: void = debounce(compatible)("safe");
  const differingReceivers = flag
    ? function (this: { label: string }, value: number) {
        return this.label + value;
      }
    : function (this: { count: number }, value: number) {
        return this.count + value;
      };
  const safeReceiver = { label: "item", count: 1, wrapped: debounce(differingReceivers) };
  safeReceiver.wrapped(1);
  const unsafeReceiver = { label: "item", wrapped: throttle(differingReceivers) };
  // @ts-expect-error The selected callback may require count on its receiver.
  unsafeReceiver.wrapped(1);
  const mixedArity: (() => void) | ((value: number) => void) = flag
    ? () => {}
    : (value: number) => {
        void value;
      };
  debounce(mixedArity)(1);
  const optionalSecond: ((value: number) => void) | ((value: number, label?: string) => void) = flag
    ? (value: number) => {
        void value;
      }
    : (value: number, label?: string) => {
        void value;
        void label;
      };
  throttle(optionalSecond)(1, "safe");
  void result;
}
void unionCallbackContracts;

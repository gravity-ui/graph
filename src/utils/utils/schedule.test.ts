import { ESchedulerPriority, scheduler } from "../../lib";

import { debounce } from "./schedule";

describe("debounce.flush", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    scheduler.start();
  });

  afterEach(() => {
    scheduler.stop();
    jest.useRealTimers();
  });

  it("keeps pending schedule when flush callback re-schedules", () => {
    type TDebounced = ReturnType<typeof debounce<(arg: string) => void>>;
    const debouncedRef: { fn: TDebounced | null } = { fn: null };

    const mockFn = jest.fn((arg: string) => {
      if (arg === "initial") {
        debouncedRef.fn?.("follow-up");
      }
    });

    debouncedRef.fn = debounce(mockFn, {
      frameInterval: 1,
      frameTimeout: 0,
      priority: ESchedulerPriority.LOWEST,
    });
    const debouncedFn = debouncedRef.fn;

    debouncedFn("initial");
    debouncedFn.flush();

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith("initial");
    // Old flush() called cancel() after fn(), wiping this re-schedule.
    expect(debouncedFn.isScheduled()).toBe(true);
  });
});

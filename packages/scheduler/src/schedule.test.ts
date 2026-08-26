import { scheduler } from "./Scheduler";
import { debounce, schedule, throttle } from "./schedule";

const MEDIUM_PRIORITY = 2;
const LOWEST_PRIORITY = 4;

function resetScheduler() {
  for (const scheduledTasks of scheduler.getSchedulers()) {
    scheduledTasks.length = 0;
  }

  // Drain deferred removals left by cancel/remove handles.
  scheduler.performUpdate();
}

describe("schedule", () => {
  beforeEach(resetScheduler);
  afterEach(resetScheduler);

  it("runs at the configured frame interval until removed", () => {
    const callback = jest.fn();
    const remove = schedule(callback, {
      priority: MEDIUM_PRIORITY,
      frameInterval: 2,
    });

    scheduler.performUpdate();
    expect(callback).not.toHaveBeenCalled();

    scheduler.performUpdate();
    expect(callback).toHaveBeenCalledTimes(1);

    remove();
    scheduler.performUpdate();
    scheduler.performUpdate();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("runs only once when requested", () => {
    const callback = jest.fn();

    schedule(callback, {
      priority: MEDIUM_PRIORITY,
      frameInterval: 1,
      once: true,
    });

    scheduler.performUpdate();
    scheduler.performUpdate();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("debounce", () => {
  beforeEach(resetScheduler);
  afterEach(resetScheduler);

  it("runs once with the latest arguments after the configured frame interval", () => {
    const callback = jest.fn();
    const debounced = debounce(callback, {
      priority: MEDIUM_PRIORITY,
      frameInterval: 2,
    });

    debounced("first");
    debounced("latest");

    scheduler.performUpdate();
    expect(callback).not.toHaveBeenCalled();

    scheduler.performUpdate();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("latest");
    expect(debounced.isScheduled()).toBe(false);
  });

  it("cancels a pending call", () => {
    const callback = jest.fn();
    const debounced = debounce(callback, { priority: MEDIUM_PRIORITY });

    debounced("pending");
    debounced.cancel();
    scheduler.performUpdate();

    expect(callback).not.toHaveBeenCalled();
    expect(debounced.isScheduled()).toBe(false);
  });

  it("keeps pending schedule when flush callback re-schedules", () => {
    type TDebounced = ReturnType<typeof debounce<(arg: string) => void>>;
    const debouncedRef: { fn: TDebounced | null } = { fn: null };

    const callback = jest.fn((arg: string) => {
      if (arg === "initial") {
        debouncedRef.fn?.("follow-up");
      }
    });

    debouncedRef.fn = debounce(callback, {
      frameInterval: 1,
      frameTimeout: 0,
      priority: LOWEST_PRIORITY,
    });
    const debounced = debouncedRef.fn;

    debounced("initial");
    debounced.flush();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("initial");
    expect(debounced.isScheduled()).toBe(true);
  });
});

describe("throttle", () => {
  beforeEach(resetScheduler);
  afterEach(resetScheduler);

  it("runs immediately and suppresses calls until the configured frame interval elapses", () => {
    const callback = jest.fn();
    const throttled = throttle(callback, {
      priority: MEDIUM_PRIORITY,
      frameInterval: 2,
    });

    throttled("first");
    throttled("suppressed");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith("first");

    scheduler.performUpdate();
    throttled("still-suppressed");
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.performUpdate();
    throttled("next");

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith("next");

    throttled.cancel();
  });
});

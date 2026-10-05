/** @jest-environment node */
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

  it("removing a task prevents a pending invocation even before deferred removal is processed", () => {
    const callback = jest.fn();
    const remove = schedule(callback, { priority: MEDIUM_PRIORITY, frameInterval: 1 });
    remove();
    remove();
    scheduler.performUpdate();
    expect(callback).not.toHaveBeenCalled();
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
  it("a once task stays removed during a callback-triggered nested scheduler update", () => {
    let calls = 0;
    schedule(
      () => {
        calls++;
        if (calls === 1) scheduler.performUpdate();
      },
      { priority: MEDIUM_PRIORITY, frameInterval: 1, once: true }
    );
    scheduler.performUpdate();
    expect(calls).toBe(1);
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

// Wrappers discard callback results, but keep the invocation's arguments and receiver.
describe("scheduling invocation contracts", () => {
  beforeEach(resetScheduler);
  afterEach(resetScheduler);

  it("debounce invokes the latest receiver with the latest arguments", () => {
    const calls: string[] = [];
    const wrapped = debounce(function (this: { name: string }, suffix: string) {
      calls.push(this.name + suffix);
      return calls.length;
    });
    expect(wrapped.call({ name: "first" }, "-old")).toBeUndefined();
    expect(wrapped.call({ name: "latest" }, "-new")).toBeUndefined();
    wrapped.flush();
    expect(calls).toEqual(["latest-new"]);
  });

  it("debounce cancellation followed by rescheduling waits the whole interval", () => {
    const calls: string[] = [];
    const wrapped = debounce((value: string) => calls.push(value), { frameInterval: 2 });
    wrapped("cancelled");
    wrapped.cancel();
    wrapped("latest");
    scheduler.performUpdate();
    expect(calls).toEqual([]);
    scheduler.performUpdate();
    expect(calls).toEqual(["latest"]);
    scheduler.performUpdate();
    expect(calls).toEqual(["latest"]);
  });

  it("a debounced callback can schedule a follow-up for a later frame", () => {
    const calls: string[] = [];
    const wrapped = debounce((value: string) => {
      calls.push(value);
      if (value === "initial") wrapped("follow-up");
    });
    wrapped("initial");
    scheduler.performUpdate();
    expect(calls).toEqual(["initial"]);
    expect(wrapped.isScheduled()).toBe(true);
    scheduler.performUpdate();
    expect(calls).toEqual(["initial", "follow-up"]);
    expect(wrapped.isScheduled()).toBe(false);
  });

  it("a debounced callback can cancel and replace its follow-up without running twice in a frame", () => {
    const calls: string[] = [];
    const wrapped = debounce((value: string) => {
      calls.push(value);
      if (value === "initial") {
        wrapped("discarded");
        wrapped.cancel();
        wrapped("replacement");
      }
    });
    wrapped("initial");
    scheduler.performUpdate();
    expect(calls).toEqual(["initial"]);
    scheduler.performUpdate();
    expect(calls).toEqual(["initial", "replacement"]);
  });

  it("throttle preserves the receiver and discards callback results", () => {
    const calls: string[] = [];
    const wrapped = throttle(function (this: { name: string }, suffix: string) {
      calls.push(this.name + suffix);
      return calls.length;
    });
    expect(wrapped.call({ name: "first" }, "-allowed")).toBeUndefined();
    wrapped.call({ name: "second" }, "-suppressed");
    expect(calls).toEqual(["first-allowed"]);
    wrapped.flush();
    wrapped.call({ name: "second" }, "-allowed");
    expect(calls).toEqual(["first-allowed", "second-allowed"]);
    wrapped.cancel();
  });

  it("throttle cancellation followed by rescheduling does not shorten the cooldown", () => {
    const callback = jest.fn();
    const wrapped = throttle(callback, { frameInterval: 2 });
    wrapped("first");
    wrapped.cancel();
    wrapped("second");
    scheduler.performUpdate();
    wrapped("suppressed");
    expect(callback).toHaveBeenCalledTimes(2);
    scheduler.performUpdate();
    wrapped("third");
    expect(callback).toHaveBeenLastCalledWith("third");
    wrapped.cancel();
  });
});

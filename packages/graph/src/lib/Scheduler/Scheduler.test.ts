/** @jest-environment node */
import { GlobalScheduler, Scheduler, globalScheduler } from "./Scheduler";

describe("GlobalScheduler", () => {
  let scheduler: GlobalScheduler;

  beforeEach(() => {
    scheduler = new GlobalScheduler();
  });

  afterEach(() => {
    scheduler.destroy();
  });

  it("adds schedulers to the requested and default priorities", () => {
    const explicitPriority = { performUpdate: jest.fn() };
    const defaultPriority = { performUpdate: jest.fn() };

    scheduler.addScheduler(explicitPriority, 1);
    scheduler.addScheduler(defaultPriority);

    expect(scheduler.getSchedulers()[1]).toEqual([explicitPriority]);
    expect(scheduler.getSchedulers()[2]).toEqual([defaultPriority]);
    expect(scheduler.getSchedulers().flat()).toHaveLength(2);

    scheduler.performUpdate();

    expect(explicitPriority.performUpdate).toHaveBeenCalledTimes(1);
    expect(explicitPriority.performUpdate).toHaveBeenCalledWith(expect.any(Number));
    expect(defaultPriority.performUpdate).toHaveBeenCalledTimes(1);
  });

  it("removes a task immediately", () => {
    const task = { performUpdate: jest.fn() };
    const remove = scheduler.addScheduler(task, 3);

    remove();

    expect(scheduler.getSchedulers()[3]).toEqual([]);
    scheduler.performUpdate();
    expect(task.performUpdate).not.toHaveBeenCalled();
  });

  it("does not skip remaining schedulers when one removes itself", () => {
    let removeFirst = () => {};
    const first = {
      performUpdate: jest.fn(() => removeFirst()),
    };
    const second = {
      performUpdate: jest.fn(),
    };

    removeFirst = scheduler.addScheduler(first);
    scheduler.addScheduler(second);

    scheduler.performUpdate();

    expect(first.performUpdate).toHaveBeenCalledTimes(1);
    expect(second.performUpdate).toHaveBeenCalledTimes(1);
    expect(scheduler.getSchedulers()[2]).toEqual([second]);

    scheduler.performUpdate();

    expect(first.performUpdate).toHaveBeenCalledTimes(1);
    expect(second.performUpdate).toHaveBeenCalledTimes(2);
  });

  it("does not call a task that an earlier task removed in the same frame", () => {
    let removeLater = () => {};
    const earlier = { performUpdate: jest.fn(() => removeLater()) };
    const later = { performUpdate: jest.fn() };
    const last = { performUpdate: jest.fn() };
    scheduler.addScheduler(earlier);
    removeLater = scheduler.addScheduler(later);
    scheduler.addScheduler(last);

    scheduler.performUpdate();

    expect(later.performUpdate).not.toHaveBeenCalled();
    expect(last.performUpdate).toHaveBeenCalledTimes(1);
  });

  it("keeps the outer frame consistent when a nested update removes a task", () => {
    let removeLater = () => {};
    let removeNested = () => {};
    const nested = {
      performUpdate: jest.fn(() => {
        removeNested();
        scheduler.performUpdate();
        removeLater();
      }),
    };
    const later = { performUpdate: jest.fn() };
    const last = { performUpdate: jest.fn() };
    removeNested = scheduler.addScheduler(nested);
    removeLater = scheduler.addScheduler(later);
    scheduler.addScheduler(last);

    scheduler.performUpdate();

    // The nested update ran later and last once; the outer frame skips the removed task only.
    expect(nested.performUpdate).toHaveBeenCalledTimes(1);
    expect(later.performUpdate).toHaveBeenCalledTimes(1);
    expect(last.performUpdate).toHaveBeenCalledTimes(2);
  });

  it("calls a task added during a frame in that frame when it comes later", () => {
    const added = { performUpdate: jest.fn() };
    const adding = { performUpdate: jest.fn(() => scheduler.addScheduler(added, 4)) };
    const remove = scheduler.addScheduler(adding, 0);

    scheduler.performUpdate();
    remove();

    expect(added.performUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("GlobalScheduler frame lifecycle", () => {
  let scheduler: GlobalScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    scheduler = new GlobalScheduler();
  });

  afterEach(() => {
    scheduler.destroy();
    jest.useRealTimers();
  });

  it("runs the frame loop exactly while tasks are registered", () => {
    expect(jest.getTimerCount()).toBe(0);
    const first = { performUpdate: jest.fn() };
    const second = { performUpdate: jest.fn() };
    const removeFirst = scheduler.addScheduler(first);
    const removeSecond = scheduler.addScheduler(second);
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(16);
    expect(first.performUpdate).toHaveBeenCalledTimes(1);

    removeFirst();
    jest.advanceTimersByTime(16);
    expect(second.performUpdate).toHaveBeenCalledTimes(2);

    removeSecond();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(32);
    expect(second.performUpdate).toHaveBeenCalledTimes(2);

    scheduler.addScheduler(first);
    jest.advanceTimersByTime(16);
    expect(first.performUpdate).toHaveBeenCalledTimes(2);
  });

  it("stops when the last task removes itself during a frame", () => {
    let remove = () => {};
    const task = { performUpdate: jest.fn(() => remove()) };
    remove = scheduler.addScheduler(task);
    jest.advanceTimersByTime(48);
    expect(task.performUpdate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("Scheduler root readiness", () => {
  it("does not register in the global scheduler", () => {
    const before = globalScheduler.getSchedulers().flat().length;
    const scheduler = new Scheduler();
    scheduler.scheduleUpdate();
    expect(globalScheduler.getSchedulers().flat()).toHaveLength(before);
  });

  it("treats updates before root initialization as a no-op", () => {
    const scheduler = new Scheduler();
    expect(() => scheduler.update()).not.toThrow();
    scheduler.scheduleUpdate();
    expect(() => scheduler.performUpdate()).not.toThrow();
    const iterate = jest.fn(() => true);
    scheduler.setRoot({
      traverseDown: (iterator) => {
        iterator({ data: { iterate } });
      },
    });
    scheduler.performUpdate();
    expect(iterate).not.toHaveBeenCalled();
    scheduler.scheduleUpdate();
    scheduler.performUpdate();
    expect(iterate).toHaveBeenCalledTimes(1);
  });
});

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

  it("defers removal until the next update completes", () => {
    const task = { performUpdate: jest.fn() };
    const remove = scheduler.addScheduler(task, 3);

    remove();

    expect(scheduler.getSchedulers()[3]).toEqual([task]);

    scheduler.performUpdate();

    expect(task.performUpdate).toHaveBeenCalledTimes(1);
    expect(scheduler.getSchedulers()[3]).toEqual([]);

    scheduler.performUpdate();

    expect(task.performUpdate).toHaveBeenCalledTimes(1);
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

  it("starts only one loop and restarts after repeated stops", () => {
    const task = { performUpdate: jest.fn() };
    scheduler.addScheduler(task);
    scheduler.start();
    scheduler.start();
    jest.advanceTimersByTime(16);
    expect(task.performUpdate).toHaveBeenCalledTimes(1);
    scheduler.stop();
    scheduler.stop();
    jest.advanceTimersByTime(32);
    expect(task.performUpdate).toHaveBeenCalledTimes(1);
    scheduler.start();
    jest.advanceTimersByTime(16);
    expect(task.performUpdate).toHaveBeenCalledTimes(2);
  });

  it("stays stopped when an update stops the loop", () => {
    const task = { performUpdate: jest.fn(() => scheduler.stop()) };
    scheduler.addScheduler(task);
    scheduler.start();
    jest.advanceTimersByTime(48);
    expect(task.performUpdate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("Scheduler root readiness", () => {
  it("keeps one active registration across start, repeated stop and immediate restart", () => {
    const before = globalScheduler.getSchedulers()[2].length;
    const scheduler = new Scheduler();
    const iterate = jest.fn(() => true);
    scheduler.setRoot({
      traverseDown: (iterator) => {
        iterator({ data: { iterate } });
      },
    });
    scheduler.start();
    scheduler.start();
    expect(globalScheduler.getSchedulers()[2]).toHaveLength(before + 1);
    scheduler.stop();
    scheduler.stop();
    scheduler.scheduleUpdate();
    globalScheduler.performUpdate();
    expect(iterate).not.toHaveBeenCalled();
    scheduler.start();
    scheduler.stop();
    scheduler.start();
    globalScheduler.performUpdate();
    expect(iterate).toHaveBeenCalledTimes(1);
    expect(globalScheduler.getSchedulers()[2]).toHaveLength(before + 1);
    scheduler.scheduleUpdate();
    globalScheduler.performUpdate();
    expect(iterate).toHaveBeenCalledTimes(2);
    scheduler.stop();
    globalScheduler.performUpdate();
    expect(globalScheduler.getSchedulers()[2]).toHaveLength(before);
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
    scheduler.stop();
    globalScheduler.performUpdate();
  });
});

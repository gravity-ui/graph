import { GlobalScheduler } from "./Scheduler";

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

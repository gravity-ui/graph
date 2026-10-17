/** @jest-environment jsdom */
import { GlobalScheduler } from "./index";

it("treats browser frame zero as pending and remains stopped after visibility changes", () => {
  let onFrame: FrameRequestCallback | undefined;
  const request = jest.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
    onFrame = next;
    return 0;
  });
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const scheduler = new GlobalScheduler();
  const update = jest.fn();
  const task = { performUpdate: update };
  try {
    const remove = scheduler.addScheduler(task);
    scheduler.addScheduler({ performUpdate: () => undefined }, 4)();
    expect(request).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
    remove();
    remove();
    expect(cancel).toHaveBeenCalledWith(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
    scheduler.addScheduler(task);
    onFrame?.(16);
    expect(update).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    scheduler.destroy();
    request.mockRestore();
    cancel.mockRestore();
  }
});

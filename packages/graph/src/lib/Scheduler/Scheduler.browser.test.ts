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
  scheduler.addScheduler({ performUpdate: update });
  try {
    scheduler.start();
    scheduler.start();
    expect(request).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
    scheduler.stop();
    scheduler.stop();
    expect(cancel).toHaveBeenCalledWith(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
    scheduler.start();
    onFrame?.(16);
    expect(update).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    scheduler.destroy();
    request.mockRestore();
    cancel.mockRestore();
  }
});

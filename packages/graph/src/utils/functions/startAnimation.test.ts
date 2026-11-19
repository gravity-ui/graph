import { ESchedulerPriority, schedule, scheduler } from "../../lib/Scheduler";

import { startAnimation } from "./index";

describe("camera animations", () => {
  it("advances before rendering and removes the task on the last frame", () => {
    let now = 500;
    const clock = jest.spyOn(performance, "now").mockImplementation(() => now);
    let camera = 0;
    const drawn: number[] = [];
    const stopRender = schedule(() => drawn.push(camera), { priority: ESchedulerPriority.MEDIUM, frameInterval: 1 });
    const move = jest.fn((progress: number) => {
      camera = progress;
    });
    try {
      startAnimation(100, move);
      for (now of [525, 650, 700]) scheduler.performUpdate();
      expect(drawn).toEqual([0.25, 1, 1]);
      expect(move.mock.calls).toEqual([[0.25], [1]]);
    } finally {
      stopRender();
      clock.mockRestore();
    }
  });

  it("unregisters an animation whose callback fails", () => {
    const fail = jest.fn(() => {
      throw new Error("failed camera");
    });
    startAnimation(100, fail);
    expect(() => scheduler.performUpdate()).toThrow("failed camera");
    scheduler.performUpdate();
    expect(fail).toHaveBeenCalledTimes(1);
  });
});

import { ESchedulerPriority, scheduler } from "../../lib";

export const schedule = (
  fn: Function,
  { priority, frameInterval, once }: { priority: ESchedulerPriority; frameInterval: number; once?: boolean }
) => {
  let frameCounter = 0;
  let isRemoved = false;
  const debounceScheduler = {
    performUpdate: () => {
      frameCounter++;
      if (frameCounter >= frameInterval) {
        if (once && !isRemoved) {
          scheduler.removeScheduler(debounceScheduler, priority);
          isRemoved = true;
        }
        fn();
        frameCounter = 0;
        if (once) {
          isRemoved = true;
          scheduler.removeScheduler(debounceScheduler, priority);
        }
      }
    },
  };
  return scheduler.addScheduler(debounceScheduler, priority);
};

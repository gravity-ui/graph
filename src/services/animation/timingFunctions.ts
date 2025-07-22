import { TimingFunction } from "./types";

export type EasingFunction = (t: number) => number;

export const timingFunctions: Record<TimingFunction, EasingFunction> = {
  linear: (t: number): number => t,

  "ease-in": (t: number): number => t * t,

  "ease-out": (t: number): number => 1 - Math.pow(1 - t, 2),

  "ease-in-out": (t: number): number => {
    if (t < 0.5) {
      return 2 * t * t;
    }
    return 1 - Math.pow(-2 * t + 2, 2) / 2;
  },
};

export function getTimingFunction(timing: TimingFunction): EasingFunction {
  return timingFunctions[timing] || timingFunctions.linear;
}

import { ESchedulerPriority, globalScheduler } from "../../lib/Scheduler";

import { getTimingFunction } from "./timingFunctions";
import {
  AnimationCallback,
  AnimationConfigBase,
  AnimationParameters,
  AnimationState,
  AnimationStep,
  TimingFunction,
} from "./types";

interface IScheduler {
  performUpdate: (time: number) => void;
}

export class GraphAnimation implements IScheduler {
  private callback: AnimationCallback;
  private defaultConfig: AnimationConfigBase;
  private state: AnimationState = "initial";
  private startTime = 0;
  private duration = 1000;
  private timing: TimingFunction = "linear";
  private infinite = false;
  private fromParams: AnimationParameters = {};
  private toParams: AnimationParameters = {};
  private currentParams: AnimationParameters = {};
  private removeScheduler?: () => void;

  constructor(callback: AnimationCallback, defaultConfig: AnimationConfigBase = {}) {
    this.callback = callback;
    this.defaultConfig = defaultConfig;
    this.performUpdate = this.performUpdate.bind(this);
  }

  public get step(): AnimationStep {
    if (this.state !== "running") {
      return {
        progress: 0,
        timing: 0,
        elapsed: 0,
      };
    }

    const now = performance.now();
    const elapsed = now - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);
    const timingFunction = getTimingFunction(this.timing);
    const timing = timingFunction(progress);

    return {
      progress,
      timing,
      elapsed,
    };
  }

  public get animationState(): AnimationState {
    return this.state;
  }

  public get isInfinite(): boolean {
    return this.infinite;
  }

  public start(toParams: AnimationParameters, config: AnimationConfigBase = {}): void {
    this.stop();

    const finalConfig = { ...this.defaultConfig, ...config };
    this.duration = finalConfig.duration ?? 1000;
    this.timing = finalConfig.timing ?? "linear";
    this.infinite = finalConfig.infinite ?? false;

    this.fromParams = { ...this.currentParams };
    this.toParams = toParams;

    // Initialize currentParams with fromParams if empty
    if (Object.keys(this.currentParams).length === 0) {
      this.currentParams = { ...this.fromParams };
    }

    // Ensure all toParams keys exist in fromParams
    Object.keys(toParams).forEach((key) => {
      if (!(key in this.fromParams)) {
        this.fromParams[key] = 0;
      }
    });

    this.startTime = performance.now();
    this.state = "running";

    // Add to scheduler with LOW priority
    this.removeScheduler = globalScheduler.addScheduler(this, ESchedulerPriority.LOW);
  }

  public stop(): void {
    if (this.removeScheduler) {
      this.removeScheduler();
      this.removeScheduler = undefined;
    }
    // Don't change state if animation completed naturally
    if (this.state !== "completed") {
      this.state = "stopped";
    }
  }

  public performUpdate(_deltaTime: number): void {
    if (this.state !== "running") {
      return;
    }

    const stepInfo = this.step;
    const { progress, timing } = stepInfo;

    // Interpolate parameters
    Object.keys(this.toParams).forEach((key) => {
      const from = this.fromParams[key] ?? 0;
      const to = this.toParams[key];
      this.currentParams[key] = from + (to - from) * timing;
    });

    // Call callback with interpolated params
    this.callback(this.currentParams, progress);

    // Check if animation is complete
    if (progress >= 1) {
      if (this.infinite) {
        // Restart infinite animation
        this.restartInfiniteAnimation();
      } else {
        this.state = "completed";
        this.stop();
      }
    }
  }

  public getCurrentParams(): AnimationParameters {
    return { ...this.currentParams };
  }

  public setCurrentParams(params: AnimationParameters): void {
    this.currentParams = { ...params };
  }

  private restartInfiniteAnimation(): void {
    // Swap from and to parameters for ping-pong effect
    const newFromParams = { ...this.toParams };
    const newToParams = { ...this.fromParams };

    this.fromParams = newFromParams;
    this.toParams = newToParams;
    this.currentParams = { ...newFromParams };

    // Restart with new cycle
    this.startTime = performance.now();
  }
}

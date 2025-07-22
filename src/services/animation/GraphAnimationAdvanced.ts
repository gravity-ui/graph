import { ESchedulerPriority, globalScheduler } from "../../lib/Scheduler";

import { getTimingFunction } from "./timingFunctions";
import {
  AnimationCallback,
  AnimationConfig,
  AnimationParameters,
  AnimationState,
  AnimationStep,
  EndContext,
  ProgressContext,
  TimingFunction,
} from "./types";

interface IScheduler {
  performUpdate: (time: number) => void;
}

export class GraphAnimationAdvanced<Params = AnimationParameters, AnimParams = Params> implements IScheduler {
  private callback: AnimationCallback<AnimParams>;
  private defaultConfig: AnimationConfig<Params>;
  private state: AnimationState = "initial";
  private startTime = 0;
  private duration = 1000;
  private timing: TimingFunction = "linear";
  private infinite = false;
  private fromParams: Params = {} as Params;
  private toParams: Params = {} as Params;
  private currentParams: Params = {} as Params;
  private removeScheduler?: () => void;

  constructor(callback: AnimationCallback<AnimParams>, defaultConfig: AnimationConfig<Params> = {}) {
    this.callback = callback;
    this.defaultConfig = defaultConfig;
    this.performUpdate = this.performUpdate.bind(this);
  }

  public get step(): AnimationStep {
    if (this.state !== "running") {
      return {
        progress: this.state === "completed" ? 1 : 0,
        timing: this.state === "completed" ? 1 : 0,
        elapsed: 0,
      };
    }

    const currentTime = performance.now();
    const elapsed = currentTime - this.startTime;
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

  public start(toParams: Params, config: AnimationConfig<Params> = {}): void {
    this.stop();

    const finalConfig = { ...this.defaultConfig, ...config };
    this.duration = finalConfig.duration ?? 1000;
    this.timing = finalConfig.timing ?? "linear";
    this.infinite = finalConfig.infinite ?? false;

    // Call init hook if provided
    let processedToParams = toParams;
    if (finalConfig.init) {
      processedToParams = finalConfig.init(toParams);
    }

    this.fromParams = { ...this.currentParams };
    this.toParams = processedToParams;

    // Initialize currentParams with fromParams if empty
    if (Object.keys(this.currentParams as any).length === 0) {
      this.currentParams = { ...this.fromParams };
    }

    // Ensure all toParams keys exist in fromParams (for AnimationParameters compatibility)
    if (typeof this.toParams === "object" && this.toParams !== null) {
      Object.keys(this.toParams as any).forEach((key) => {
        if (!(key in (this.fromParams as any))) {
          (this.fromParams as any)[key] = 0;
        }
      });
    }

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
    const currentTime = performance.now();

    // Call progress hook if provided
    const finalConfig = this.defaultConfig;
    let animationParams: AnimParams;

    if (finalConfig.progress) {
      const progressContext: ProgressContext<Params> = {
        currentTime,
        startTime: this.startTime,
        progress,
        params: this.currentParams,
      };
      const customParams = finalConfig.progress(progressContext);
      animationParams = customParams as AnimParams;
    } else {
      // Default interpolation for AnimationParameters
      const interpolatedParams: any = {};
      if (typeof this.toParams === "object" && this.toParams !== null) {
        Object.keys(this.toParams as any).forEach((key) => {
          const from = (this.fromParams as any)[key] ?? 0;
          const to = (this.toParams as any)[key];
          interpolatedParams[key] = from + (to - from) * timing;
        });
      }
      this.currentParams = interpolatedParams as Params;
      animationParams = interpolatedParams as AnimParams;
    }

    // Call callback with interpolated params
    this.callback(animationParams, progress);

    // Check if animation is complete
    if (progress >= 1) {
      // Call end hook if provided
      if (finalConfig.end) {
        const endContext: EndContext = {
          currentTime,
          startTime: this.startTime,
          progress,
          infinite: this.infinite,
        };
        finalConfig.end(endContext);
      }

      if (this.infinite) {
        // Restart infinite animation
        this.restartInfiniteAnimation();
      } else {
        this.state = "completed";
        this.stop();
      }
    }
  }

  public getCurrentParams(): Params {
    return { ...this.currentParams };
  }

  public setCurrentParams(params: Params): void {
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

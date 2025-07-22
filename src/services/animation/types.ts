export type TimingFunction = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export type AnimationState = "initial" | "running" | "completed" | "stopped";

export interface AnimationParameters {
  [key: string]: number;
}

export interface AnimationConfig<Params = AnimationParameters> {
  timing?: TimingFunction;
  duration?: number;
  infinite?: boolean;
  init?: (startParams: Params) => Params;
  progress?: (context: ProgressContext<Params>) => AnimationParameters;
  end?: (context: EndContext) => void;
}

// Обратная совместимость для базового GraphAnimation
export interface AnimationConfigBase {
  timing?: TimingFunction;
  duration?: number;
  infinite?: boolean;
}

export interface ProgressContext<Params = AnimationParameters> {
  currentTime: number;
  startTime: number;
  progress: number;
  params: Params;
}

export interface EndContext {
  currentTime: number;
  startTime: number;
  progress: number;
  infinite: boolean;
}

export type AnimationCallback<AnimParams = AnimationParameters> = (params: AnimParams, progress: number) => void;

export interface AnimationStep {
  progress: number;
  timing: number;
  elapsed: number;
}

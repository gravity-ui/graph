import { useCallback, useEffect, useRef } from "react";

import { GraphAnimation } from "./GraphAnimation";
import type { AnimationCallback, AnimationConfig, AnimationParameters } from "./types";

export interface UseGraphAnimationOptions {
  onUpdate?: (params: AnimationParameters, progress: number) => void;
  defaultConfig?: AnimationConfig;
  syncWithReact?: boolean; // Whether to synchronize updates with React rendering
}

export interface UseGraphAnimationReturn {
  animation: GraphAnimation | null;
  start: (toParams: AnimationParameters, config?: AnimationConfig) => void;
  stop: () => void;
  isRunning: boolean;
  isCompleted: boolean;
  isInfinite: boolean;
  currentParams: AnimationParameters;
}

/**
 * React hook for using GraphAnimation with proper React synchronization
 *
 * @param options Configuration options
 * @returns Animation controls and state
 */
export function useGraphAnimation(options: UseGraphAnimationOptions = {}): UseGraphAnimationReturn {
  const { onUpdate, defaultConfig, syncWithReact = true } = options;

  const animationRef = useRef<GraphAnimation | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const isCompletedRef = useRef(false);
  const currentParamsRef = useRef<AnimationParameters>({});

  // Create callback that optionally syncs with React
  const animationCallback = useCallback<AnimationCallback>(
    (params, progress) => {
      currentParamsRef.current = params;

      if (onUpdate) {
        if (syncWithReact) {
          // Cancel previous RAF if it exists
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
          }

          // Schedule update on next frame to sync with React
          rafIdRef.current = requestAnimationFrame(() => {
            onUpdate(params, progress);
            rafIdRef.current = null;
          });
        } else {
          // Direct update without RAF synchronization
          onUpdate(params, progress);
        }
      }
    },
    [onUpdate, syncWithReact]
  );

  // Initialize animation
  useEffect(() => {
    animationRef.current = new GraphAnimation(animationCallback, defaultConfig);

    return () => {
      animationRef.current?.stop();
      // Cancel any pending RAF
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [animationCallback, defaultConfig]);

  // Start animation
  const start = useCallback((toParams: AnimationParameters, config?: AnimationConfig) => {
    if (animationRef.current) {
      animationRef.current.start(toParams, config);
      isRunningRef.current = true;
      isCompletedRef.current = false;

      // Monitor animation state
      const checkState = () => {
        if (!animationRef.current) return;

        const state = animationRef.current.animationState;

        if (state === "completed") {
          isRunningRef.current = false;
          isCompletedRef.current = true;
        } else if (state === "stopped") {
          isRunningRef.current = false;
          isCompletedRef.current = false;
        } else if (state === "running") {
          // Continue monitoring
          setTimeout(checkState, 16); // ~60fps check
        }
      };

      setTimeout(checkState, 16);
    }
  }, []);

  // Stop animation
  const stop = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      isRunningRef.current = false;
      isCompletedRef.current = false;
    }

    // Cancel any pending RAF
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
  }, []);

  return {
    animation: animationRef.current,
    start,
    stop,
    isRunning: isRunningRef.current,
    isCompleted: isCompletedRef.current,
    isInfinite: animationRef.current?.isInfinite ?? false,
    currentParams: currentParamsRef.current,
  };
}

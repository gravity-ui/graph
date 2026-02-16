import { DependencyList, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { computed, effect } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import { useFn } from "../utils/hooks/useFn";

/**
 * Hook to subscribe to a signal and get the current value.
 * @param signal - Signal to subscribe to
 * @returns Current value of the signal
 *
 * @example
 * ```tsx
 * const geometry = useSignal(block.$geometry);
 * ```
 */
export function useSignal<T>(signal: Signal<T>) {
  const subscribe = useCallback(
    (onChangeFn: () => void) => {
      return signal.subscribe(onChangeFn);
    },
    [signal]
  );
  const getSnapshot = useCallback(() => {
    return signal.value;
  }, [signal]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook to subscribe to a computed signal and get the current value.
 * @param compute - Computed function to subscribe to
 * @param deps - Dependencies to subscribe to
 * @returns Current value of the computed signal
 *
 * @example
 * ```tsx
 * const geometry = useComputedSignal(() => block.$geometry.value, [block]);
 * ```
 */
export function useComputedSignal<T>(compute: () => T, deps: DependencyList) {
  const handle = useFn(compute);
  const signal = useMemo(() => computed(() => handle()), deps);

  return useSignal(signal);
}

/**
 * Hook to subscribe to a signal and get the current value.
 * @param effectFn - Effect function to subscribe to
 * @param deps - Dependencies recreate the effect when they change
 * @returns Current value of the signal
 *
 * @example
 * ```tsx
 * useSignalEffect(() => {
 *   console.log(block.$geometry.value);
 * }, [block]);
 * ```
 */
export function useSignalEffect(effectFn: () => void, deps: DependencyList) {
  const handle = useFn(effectFn);
  useEffect(() => {
    return effect(() => handle());
  }, deps);
}

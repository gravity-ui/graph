import { useEffect, useRef } from "react";

/**
 * Hook for tracking the previous value of a state.
 *
 * @example
 * ```tsx
 * const [count, setCount] = useState(0);
 * const prevCount = usePrevious(count);
 *
 * ```
 *
 * @template T - Type of the value being tracked
 * @param value - Current value whose previous state needs to be tracked
 * @returns Previous value or undefined on first render
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

import { useRef, useState } from "react";

import { useFn } from "./useFn";

/*
 * Calls setState only if the new value differs from the already saved.
 * It is useful if the setState call occurs very often, which leads to freezes.
 */
export function useCompareState<T>(value: T): [T, (value: T) => void] {
  const [stateValue, setStateValue] = useState<T>(value);
  const refValue = useRef<T>(value);

  const setValue = useFn((newValue: T) => {
    if (newValue === refValue.current) return;

    setStateValue(newValue);
    refValue.current = newValue;
  });

  return [stateValue, setValue];
}

import { useCallback, useRef } from "react";

export function useFn<Args extends unknown[], Result>(handler: (...args: Args) => Result) {
  const handlerRef = useRef(handler);

  handlerRef.current = handler;

  return useCallback((...args: Args) => handlerRef.current(...args), []);
}

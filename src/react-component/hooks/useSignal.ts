import { useState, useRef, useEffect } from "react";

import type { Signal } from "@preact/signals-core";

export function useSignal<T>(signal: Signal<T>) {
  const [state, setState] = useState(signal.value);
  const ref = useRef(setState);
  ref.current = setState;
  useEffect(() => {
    return signal.subscribe((v) => ref.current(v));
  }, [ref, signal]);
  return state;
}

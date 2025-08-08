import { useEffect, useState } from "react";

import type { Signal } from "@preact/signals-core";

export function useSignal<T>(signal: Signal<T>) {
  const [state, setState] = useState(signal.value);
  useEffect(() => {
    return signal.subscribe(setState);
  }, [signal]);
  return state;
}

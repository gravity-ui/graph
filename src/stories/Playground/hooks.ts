import { useState } from "react";
import { useFn } from "../../utils/hooks/useFn";

export function useRerender() {
  const [tick, setTick] = useState(Date.now());
  return useFn(() => {
    setTick(Date.now());
  })
}
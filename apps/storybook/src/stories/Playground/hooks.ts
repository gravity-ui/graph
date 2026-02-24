import { useCallback, useState } from "react";

export function useRerender() {
  const [_, setTick] = useState(Date.now());
  return useCallback(() => {
    setTick(Date.now());
  }, []);
}

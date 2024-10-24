import { useState } from "react";

import { useFn } from "../../utils/hooks/useFn";

export function useRerender() {
  const [_, setTick] = useState(Date.now());
  return useFn(() => {
    setTick(Date.now());
  });
}

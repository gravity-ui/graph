import { useState } from "react";

import { useFn } from "@gravity-ui/graph";

export function useRerender() {
  const [_, setTick] = useState(Date.now());
  return useFn(() => {
    setTick(Date.now());
  });
}

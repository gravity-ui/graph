import { useState } from "react";

import { useFn } from "@gravity-ui/graph-react/utils/hooks/useFn";

export function useRerender() {
  const [_, setTick] = useState(Date.now());
  return useFn(() => {
    setTick(Date.now());
  });
}

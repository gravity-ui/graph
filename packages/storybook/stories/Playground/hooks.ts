import { useCallback } from "react";

export function useRerender() {
  return useCallback(() => {
    // This function will be recreated on every render
  }, []);
}

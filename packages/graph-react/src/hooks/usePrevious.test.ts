import { renderHook } from "@testing-library/react";

import { usePrevious } from "./usePrevious";

describe("usePrevious hook", () => {
  it("should return undefined on the first render", () => {
    const { result } = renderHook(() => usePrevious(42));

    expect(result.current).toBeUndefined();
  });

  it("should return the previous value after re-render", () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 1 },
    });

    // First render - should return undefined
    expect(result.current).toBeUndefined();

    // Re-render with new value
    rerender({ value: 2 });

    // Should return previous value (1)
    expect(result.current).toBe(1);
  });
});

import { renderHook } from "@testing-library/react";

import { usePrevious } from "./usePrevious";

it("returns the previous value on each render", () => {
  const { result, rerender } = renderHook(({ value }) => usePrevious(value), { initialProps: { value: 1 } });
  expect(result.current).toBeUndefined();
  rerender({ value: 2 });
  expect(result.current).toBe(1);
  rerender({ value: 3 });
  expect(result.current).toBe(2);
});

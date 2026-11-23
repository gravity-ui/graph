import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal, Signal } from "@preact/signals-core";
import { act, renderHook } from "@testing-library/react";

import { useComputedSignal, useSignal, useSignalEffect, useSignalLayoutEffect } from "./useSignal";

function useComputedValue(source: Signal<number>) {
  return useComputedSignal(() => source.value * 2, [source]);
}

it.each([
  ["useSignal", useSignal, 1],
  ["useComputedSignal", useComputedValue, 2],
] as const)("%s follows its source and releases it after unmount", (_name, useValue, multiplier) => {
  const unwatched = jest.fn();
  const source = signal(0, { unwatched });
  const mount = () => renderHook(() => useValue(source));

  const first = mount();
  expect(first.result.current).toBe(0);
  act(() => {
    source.value = 1;
  });
  expect(first.result.current).toBe(multiplier);
  act(() => {
    source.value = 2;
  });
  expect(first.result.current).toBe(2 * multiplier);
  first.unmount();
  expect(unwatched).toHaveBeenCalledTimes(1);

  source.value = 3;
  const second = mount();
  expect(second.result.current).toBe(3 * multiplier);
  act(() => {
    source.value = 4;
  });
  expect(second.result.current).toBe(4 * multiplier);
  second.unmount();
  expect(unwatched).toHaveBeenCalledTimes(2);
});

describe("useSignal hook", () => {
  it("should not trigger rerender when signal value stays the same", () => {
    // Setup
    const testSignal: Signal<string> = signal("same");
    let renderCount = 0;

    // Execute
    const { result, rerender } = renderHook(() => {
      renderCount++;
      return useSignal(testSignal);
    });

    // Verify initial render
    expect(result.current).toBe("same");
    const initialRenderCount = renderCount;

    // Set same value (should not trigger rerender)
    act(() => {
      testSignal.value = "same";
    });

    // Force a rerender to check
    rerender();

    // The render count should only increase by 1 (the forced rerender)
    // If the signal triggered a rerender, it would be +2
    expect(renderCount).toBe(initialRenderCount + 1);
  });
});

describe("useComputedSignal hook", () => {
  describe("Dependencies management", () => {
    it("should recompute when dependencies change", () => {
      // Setup
      const signal1: Signal<string> = signal("value1");
      const signal2: Signal<string> = signal("value2");
      let currentSignal = signal1;

      // Execute
      const { result, rerender } = renderHook(({ sig }) => useComputedSignal(() => `${sig.value} computed`, [sig]), {
        initialProps: { sig: currentSignal },
      });

      // Verify initial value
      expect(result.current).toBe("value1 computed");

      // Change to different signal
      currentSignal = signal2;
      act(() => {
        rerender({ sig: currentSignal });
      });

      // Verify value computed from new signal
      expect(result.current).toBe("value2 computed");

      // Change new signal value
      act(() => {
        signal2.value = "updated value2";
      });
      expect(result.current).toBe("updated value2 computed");

      // Old signal changes should not affect result
      act(() => {
        signal1.value = "updated value1";
      });
      expect(result.current).toBe("updated value2 computed");
    });

    it("should not recreate computed signal when dependencies stay the same", () => {
      // Setup
      const baseSignal: Signal<string> = signal("value");
      const computeFn = jest.fn(() => `${baseSignal.value} computed`);

      // Execute
      const { rerender } = renderHook(() => useComputedSignal(computeFn, [baseSignal]));

      // Get initial call count
      const initialCallCount = computeFn.mock.calls.length;

      // Rerender without changing dependencies
      act(() => {
        rerender();
      });

      // Verify compute function was not called again (useMemo should prevent it)
      expect(computeFn.mock.calls.length).toBe(initialCallCount);
    });
  });
});

it.each([
  ["useSignalEffect", useSignalEffect],
  ["useSignalLayoutEffect", useSignalLayoutEffect],
] as const)("%s observes while mounted and reads the latest value when remounted", (_name, useObserve) => {
  const source = signal(0);
  const observed = jest.fn();
  const mount = () => renderHook(() => useObserve(() => observed(source.value), [source]));

  const first = mount();
  act(() => {
    source.value = 1;
  });
  act(() => {
    source.value = 2;
  });
  first.unmount();
  source.value = 3;
  expect(observed.mock.calls).toEqual([[0], [1], [2]]);

  const second = mount();
  act(() => {
    source.value = 4;
  });
  second.unmount();
  source.value = 5;
  expect(observed.mock.calls).toEqual([[0], [1], [2], [3], [4]]);
});

describe("useSignalEffect hook", () => {
  describe("Dependencies management", () => {
    it("should recreate effect when dependencies change", () => {
      // Setup
      const signal1: Signal<string> = signal("value1");
      const signal2: Signal<string> = signal("value2");
      const effectFn = jest.fn();
      let currentSignal = signal1;

      // Execute
      const { rerender } = renderHook(
        ({ sig }) =>
          useSignalEffect(() => {
            effectFn(sig.value);
          }, [sig]),
        { initialProps: { sig: currentSignal } }
      );

      // Verify initial effect with signal1
      expect(effectFn).toHaveBeenCalledWith("value1");
      expect(effectFn).toHaveBeenCalledTimes(1);

      // Change to different signal
      currentSignal = signal2;
      effectFn.mockClear();
      act(() => {
        rerender({ sig: currentSignal });
      });

      // Verify effect recreated with signal2
      expect(effectFn).toHaveBeenCalledWith("value2");

      // Change new signal
      act(() => {
        signal2.value = "updated2";
      });
      expect(effectFn).toHaveBeenCalledWith("updated2");

      // Old signal changes should not trigger effect
      const callCountBeforeOldSignalChange = effectFn.mock.calls.length;
      act(() => {
        signal1.value = "updated1";
      });
      expect(effectFn).toHaveBeenCalledTimes(callCountBeforeOldSignalChange);
    });
  });
});

test("useSignal handles absence and switches readonly subscriptions", () => {
  const source = signal(1);
  const readonly = computed(() => source.value * 2);
  const { result, rerender, unmount } = renderHook(({ sig }) => useSignal(sig), {
    initialProps: { sig: undefined as ReadonlySignal<number> | null | undefined },
  });
  expect(result.current).toBeUndefined();
  rerender({ sig: readonly });
  expect(result.current).toBe(2);
  act(() => {
    source.value = 3;
  });
  expect(result.current).toBe(6);
  rerender({ sig: null });
  expect(result.current).toBeUndefined();
  act(() => {
    source.value = 4;
  });
  expect(result.current).toBeUndefined();
  unmount();
});

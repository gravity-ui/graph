import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";
import { act, renderHook } from "@testing-library/react";

import { useComputedSignal, useSignal, useSignalEffect } from "./useSignal";

describe("useSignal hook", () => {
  describe("Getting signal value", () => {
    it("should return current signal value", () => {
      // Setup
      const testSignal: Signal<string> = signal("initial value");

      // Execute
      const { result } = renderHook(() => useSignal(testSignal));

      // Verify
      expect(result.current).toBe("initial value");
    });
  });

  describe("Rerender on signal change", () => {
    it("should trigger rerender when signal value changes", () => {
      // Setup
      const testSignal: Signal<string> = signal("initial");

      // Execute
      const { result } = renderHook(() => useSignal(testSignal));

      // Verify initial value
      expect(result.current).toBe("initial");

      // Change signal value
      act(() => {
        testSignal.value = "updated";
      });

      // Verify value updated
      expect(result.current).toBe("updated");
    });

    it("should trigger multiple rerenders on multiple signal changes", () => {
      // Setup
      const testSignal: Signal<string> = signal("first");

      // Execute
      const { result } = renderHook(() => useSignal(testSignal));

      // Verify initial value
      expect(result.current).toBe("first");

      // First change
      act(() => {
        testSignal.value = "second";
      });
      expect(result.current).toBe("second");

      // Second change
      act(() => {
        testSignal.value = "third";
      });
      expect(result.current).toBe("third");

      // Third change
      act(() => {
        testSignal.value = "fourth";
      });
      expect(result.current).toBe("fourth");
    });

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

  describe("Unsubscribe on unmount", () => {
    it("should not react to signal changes after unmount", () => {
      // Setup
      const testSignal: Signal<string> = signal("initial");
      const callback = jest.fn();

      // Execute
      const { result, unmount } = renderHook(() => {
        const value = useSignal(testSignal);
        callback(value);
        return value;
      });

      // Verify initial state
      expect(result.current).toBe("initial");
      expect(callback).toHaveBeenCalledWith("initial");

      // Unmount the component
      act(() => {
        unmount();
      });

      // Clear previous calls
      callback.mockClear();

      // Change signal value after unmount
      act(() => {
        testSignal.value = "after unmount";
      });

      // Verify callback was not called after unmount
      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle multiple mount/unmount cycles correctly", () => {
      // Setup
      const testSignal: Signal<string> = signal("initial");

      // First mount
      const { result: result1, unmount: unmount1 } = renderHook(() => useSignal(testSignal));
      expect(result1.current).toBe("initial");

      // Change value while mounted
      act(() => {
        testSignal.value = "first change";
      });
      expect(result1.current).toBe("first change");

      // Unmount
      act(() => {
        unmount1();
      });

      // Change value while unmounted
      act(() => {
        testSignal.value = "while unmounted";
      });

      // Second mount - should get current value
      const { result: result2, unmount: unmount2 } = renderHook(() => useSignal(testSignal));
      expect(result2.current).toBe("while unmounted");

      // Change value while mounted again
      act(() => {
        testSignal.value = "second change";
      });
      expect(result2.current).toBe("second change");

      // Unmount second time
      act(() => {
        unmount2();
      });

      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });
});

describe("useComputedSignal hook", () => {
  describe("Getting computed value", () => {
    it("should return computed signal value", () => {
      // Setup
      const baseSignal: Signal<string> = signal("hello");
      const compute = () => `${baseSignal.value} world`;

      // Execute
      const { result } = renderHook(() => useComputedSignal(compute, [baseSignal]));

      // Verify
      expect(result.current).toBe("hello world");
    });
  });

  describe("Recompute on signal change", () => {
    it("should trigger rerender when underlying signal changes", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const compute = () => `${baseSignal.value} computed`;

      // Execute
      const { result } = renderHook(() => useComputedSignal(compute, [baseSignal]));

      // Verify initial value
      expect(result.current).toBe("initial computed");

      // Change signal value
      act(() => {
        baseSignal.value = "updated";
      });

      // Verify value recomputed
      expect(result.current).toBe("updated computed");
    });

    it("should handle multiple recomputations", () => {
      // Setup
      const baseSignal: Signal<string> = signal("first");
      const compute = () => `${baseSignal.value} value`;

      // Execute
      const { result } = renderHook(() => useComputedSignal(compute, [baseSignal]));

      // Verify initial value
      expect(result.current).toBe("first value");

      // First change
      act(() => {
        baseSignal.value = "second";
      });
      expect(result.current).toBe("second value");

      // Second change
      act(() => {
        baseSignal.value = "third";
      });
      expect(result.current).toBe("third value");

      // Third change
      act(() => {
        baseSignal.value = "fourth";
      });
      expect(result.current).toBe("fourth value");
    });
  });

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

  describe("Unsubscribe on unmount", () => {
    it("should not react to signal changes after unmount", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const callback = jest.fn();

      // Execute
      const { result, unmount } = renderHook(() => {
        const value = useComputedSignal(() => {
          const computed = `${baseSignal.value} computed`;
          callback(computed);
          return computed;
        }, [baseSignal]);
        return value;
      });

      // Verify initial state
      expect(result.current).toBe("initial computed");

      // Unmount the component
      act(() => {
        unmount();
      });

      // Clear previous calls
      callback.mockClear();

      // Change signal value after unmount
      act(() => {
        baseSignal.value = "after unmount";
      });

      // Verify callback was not called after unmount
      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle multiple mount/unmount cycles correctly", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const compute = () => `${baseSignal.value} computed`;

      // First mount
      const { result: result1, unmount: unmount1 } = renderHook(() => useComputedSignal(compute, [baseSignal]));
      expect(result1.current).toBe("initial computed");

      // Change value while mounted
      act(() => {
        baseSignal.value = "first change";
      });
      expect(result1.current).toBe("first change computed");

      // Unmount
      act(() => {
        unmount1();
      });

      // Change value while unmounted
      act(() => {
        baseSignal.value = "while unmounted";
      });

      // Second mount - should compute with current value
      const { result: result2, unmount: unmount2 } = renderHook(() => useComputedSignal(compute, [baseSignal]));
      expect(result2.current).toBe("while unmounted computed");

      // Change value while mounted again
      act(() => {
        baseSignal.value = "second change";
      });
      expect(result2.current).toBe("second change computed");

      // Unmount second time
      act(() => {
        unmount2();
      });

      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });
});

describe("useSignalEffect hook", () => {
  describe("Effect execution", () => {
    it("should execute effect on mount", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const effectFn = jest.fn();

      // Execute
      renderHook(() =>
        useSignalEffect(() => {
          effectFn(baseSignal.value);
        }, [baseSignal])
      );

      // Verify effect was called on mount
      expect(effectFn).toHaveBeenCalledWith("initial");
      expect(effectFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("Effect reactivity", () => {
    it("should react to signal changes", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const effectFn = jest.fn();

      // Execute
      renderHook(() =>
        useSignalEffect(() => {
          effectFn(baseSignal.value);
        }, [baseSignal])
      );

      // Verify initial call
      expect(effectFn).toHaveBeenCalledWith("initial");
      expect(effectFn).toHaveBeenCalledTimes(1);

      // Change signal value
      act(() => {
        baseSignal.value = "updated";
      });

      // Verify effect was called again
      expect(effectFn).toHaveBeenCalledWith("updated");
      expect(effectFn).toHaveBeenCalledTimes(2);
    });

    it("should react to multiple signal changes", () => {
      // Setup
      const baseSignal: Signal<string> = signal("first");
      const effectFn = jest.fn();

      // Execute
      renderHook(() =>
        useSignalEffect(() => {
          effectFn(baseSignal.value);
        }, [baseSignal])
      );

      // Verify initial call
      expect(effectFn).toHaveBeenCalledWith("first");

      // First change
      act(() => {
        baseSignal.value = "second";
      });
      expect(effectFn).toHaveBeenCalledWith("second");

      // Second change
      act(() => {
        baseSignal.value = "third";
      });
      expect(effectFn).toHaveBeenCalledWith("third");

      // Verify total calls
      expect(effectFn).toHaveBeenCalledTimes(3);
    });
  });

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

  describe("Cleanup on unmount", () => {
    it("should not react to signal changes after unmount", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const effectFn = jest.fn();

      // Execute
      const { unmount } = renderHook(() =>
        useSignalEffect(() => {
          effectFn(baseSignal.value);
        }, [baseSignal])
      );

      // Verify initial call
      expect(effectFn).toHaveBeenCalledWith("initial");
      expect(effectFn).toHaveBeenCalledTimes(1);

      // Unmount
      act(() => {
        unmount();
      });

      // Clear calls
      effectFn.mockClear();

      // Change signal after unmount
      act(() => {
        baseSignal.value = "after unmount";
      });

      // Verify effect was not called
      expect(effectFn).not.toHaveBeenCalled();
    });

    it("should handle multiple mount/unmount cycles correctly", () => {
      // Setup
      const baseSignal: Signal<string> = signal("initial");
      const effectFn = jest.fn();

      // First mount
      const { unmount: unmount1 } = renderHook(() =>
        useSignalEffect(() => {
          effectFn(baseSignal.value);
        }, [baseSignal])
      );

      // Verify initial call
      expect(effectFn).toHaveBeenCalledWith("initial");

      // Change while mounted
      act(() => {
        baseSignal.value = "first change";
      });
      expect(effectFn).toHaveBeenCalledWith("first change");

      // Unmount
      act(() => {
        unmount1();
      });

      // Clear calls
      effectFn.mockClear();

      // Change while unmounted (should not trigger)
      act(() => {
        baseSignal.value = "while unmounted";
      });
      expect(effectFn).not.toHaveBeenCalled();

      // Second mount
      const { unmount: unmount2 } = renderHook(() =>
        useSignalEffect(() => {
          effectFn(baseSignal.value);
        }, [baseSignal])
      );

      // Verify effect called with current value
      expect(effectFn).toHaveBeenCalledWith("while unmounted");

      // Change while mounted again
      act(() => {
        baseSignal.value = "second change";
      });
      expect(effectFn).toHaveBeenCalledWith("second change");

      // Unmount second time
      act(() => {
        unmount2();
      });

      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });
});

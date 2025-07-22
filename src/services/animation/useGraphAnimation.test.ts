import { renderHook } from "@testing-library/react";

import { useGraphAnimation } from "./useGraphAnimation";

// Mock performance.now
const mockNow = jest.fn();
Object.defineProperty(global, "performance", {
  value: {
    now: mockNow,
  },
  writable: true,
});

// Mock globalScheduler
jest.mock("../../lib/Scheduler", () => ({
  globalScheduler: {
    addScheduler: jest.fn(() => jest.fn()),
  },
  ESchedulerPriority: {
    LOW: 3,
  },
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
  cb(0); // Pass timestamp
  return 1;
});
global.cancelAnimationFrame = jest.fn();

describe("useGraphAnimation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNow.mockReturnValue(0);
  });

  it("should initialize with default values", () => {
    const { result } = renderHook(() => useGraphAnimation());

    expect(result.current.animation).toBeDefined();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isCompleted).toBe(false);
    expect(result.current.currentParams).toEqual({});
  });

  it("should initialize hook with onUpdate callback", () => {
    const onUpdate = jest.fn();

    const { result } = renderHook(() =>
      useGraphAnimation({
        onUpdate,
        syncWithReact: false,
      })
    );

    // Just verify the hook initializes without errors
    expect(result.current.start).toBeDefined();
    expect(result.current.stop).toBeDefined();
  });

  it("should provide start and stop methods", () => {
    const { result } = renderHook(() => useGraphAnimation());

    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(result.current.animation).toBeDefined();
  });

  it("should create animation with default config", () => {
    const defaultConfig = { timing: "ease-in" as const, duration: 2000 };

    const { result } = renderHook(() =>
      useGraphAnimation({
        defaultConfig,
      })
    );

    expect(result.current.animation).toBeDefined();
  });

  it("should clean up on unmount without errors", () => {
    const { unmount } = renderHook(() => useGraphAnimation());

    // Just verify unmounting doesn't throw errors
    expect(() => unmount()).not.toThrow();
  });
});

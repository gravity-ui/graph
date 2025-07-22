import { GraphAnimation } from "./GraphAnimation";

// Mock performance.now
const mockNow = jest.fn();

// Ensure performance.now is properly mocked
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

describe("GraphAnimation", () => {
  let animation: GraphAnimation;
  let callback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNow.mockReturnValue(0);

    callback = jest.fn();
    animation = new GraphAnimation(callback, {
      timing: "linear",
      duration: 1000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should create animation with initial state", () => {
    expect(animation.animationState).toBe("initial");
  });

  it("should start animation and change state to running", () => {
    animation.start({ x: 100, y: 200 });
    expect(animation.animationState).toBe("running");
  });

  it("should interpolate values during animation", () => {
    animation.setCurrentParams({ x: 0, y: 0 });

    // Set start time to 1000ms
    mockNow.mockReturnValue(1000);
    animation.start({ x: 100, y: 200 }, { duration: 1000 });

    // Simulate 500ms passed (50% progress) - now at 1500ms
    mockNow.mockReturnValue(1500);
    animation.performUpdate(0);

    expect(callback).toHaveBeenCalledWith({ x: 50, y: 100 }, 0.5);
  });

  it("should complete animation when progress reaches 100%", () => {
    animation.setCurrentParams({ x: 0 });

    // Set start time to 2000ms
    mockNow.mockReturnValue(2000);
    animation.start({ x: 100 }, { duration: 1000 });

    // Simulate 1000ms passed (100% progress) - now at 3000ms
    mockNow.mockReturnValue(3000);
    animation.performUpdate(0);

    expect(animation.animationState).toBe("completed");
  });

  it("should stop animation", () => {
    animation.start({ x: 100 });
    animation.stop();
    expect(animation.animationState).toBe("stopped");
  });

  it("should get step information", () => {
    // Set start time to 4000ms
    mockNow.mockReturnValue(4000);
    animation.start({ x: 100 }, { duration: 1000 });

    // Simulate 250ms passed (25% progress) - now at 4250ms
    mockNow.mockReturnValue(4250);

    const step = animation.step;
    expect(step.progress).toBe(0.25);
    expect(step.timing).toBe(0.25); // linear timing
    expect(step.elapsed).toBe(250);
  });

  it("should restart animation", () => {
    animation.setCurrentParams({ x: 0 });

    // Set start time to 5000ms
    mockNow.mockReturnValue(5000);
    animation.start({ x: 50 });

    // Simulate 500ms passed (50% progress) - now at 5500ms
    mockNow.mockReturnValue(5500);
    animation.performUpdate(0);

    // Restart with new target at 6000ms
    mockNow.mockReturnValue(6000);
    animation.start({ x: 100 });

    expect(animation.animationState).toBe("running");
    // Should start from current position (25 at 50% of first animation)
    expect(animation.getCurrentParams().x).toBe(25);
  });
});

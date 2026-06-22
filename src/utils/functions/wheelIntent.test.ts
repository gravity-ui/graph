import { EWheelIntent, createWheelIntentResolver, enableWheelIntentDebug, isPinchZoomGesture } from "./wheelIntent";
import type { TWheelIntentDebugEntry } from "./wheelIntent";

function makeWheelEvent(
  overrides: Partial<{
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }> = {}
): WheelEvent {
  return new WheelEvent("wheel", {
    deltaX: 0,
    deltaY: -10,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    ...overrides,
  });
}

describe("createWheelIntentResolver", () => {
  let nowMs = 0;

  beforeEach(() => {
    nowMs = 0;
    jest.spyOn(performance, "now").mockImplementation(() => nowMs);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    enableWheelIntentDebug(null);
  });

  function advanceMs(ms: number): void {
    nowMs += ms;
  }

  it("slow integer vertical wheel resolves to pan (integer PIXEL = trackpad)", () => {
    const resolver = createWheelIntentResolver();
    const intent = resolver(makeWheelEvent({ deltaY: -100 }), "zoom");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("integer PIXEL scroll stays pan in both directions and at any magnitude", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: 1 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: 11 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: 20 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -1 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -11 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -20 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -100 }), "zoom")).toBe(EWheelIntent.Pan);
  });

  it("integer PIXEL scroll with deltaX noise stays pan", () => {
    const resolver = createWheelIntentResolver();

    expect(resolver(makeWheelEvent({ deltaY: -100, deltaX: 2 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -20, deltaX: 3 }), "zoom")).toBe(EWheelIntent.Pan);
  });

  it("slow integer scroll uses I3:integer-trackpad-slow rule id", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    nowMs = 1000;
    const resolver = createWheelIntentResolver();
    resolver(makeWheelEvent({ deltaY: -4, deltaX: 0 }), "zoom");

    expect(entries[0]?.rule).toBe("I3:integer-trackpad-slow");
    expect(entries[0]?.result).toBe(EWheelIntent.Pan);
  });

  it("rapid discrete mouse wheel steps (≥20px fractional) with MOUSE_WHEEL_BEHAVIOR=zoom stay zoom", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -25.5 }), "zoom");
    const intent = resolver(makeWheelEvent({ deltaY: -25.5 }), "zoom");

    expect(intent).toBe(EWheelIntent.Zoom);
  });

  it("rapid integer vertical wheel with MOUSE_WHEEL_BEHAVIOR=scroll resolves to pan", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -10 }), "scroll");
    const intent = resolver(makeWheelEvent({ deltaY: -10 }), "scroll");

    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("rapid LINE-mode wheel ticks respect MOUSE_WHEEL_BEHAVIOR", () => {
    const resolver = createWheelIntentResolver();
    const lineEvent = makeWheelEvent({
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
    });

    resolver(lineEvent, "zoom");
    expect(resolver(lineEvent, "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(lineEvent, "scroll")).toBe(EWheelIntent.Pan);
  });

  it("vertical wheel with deltaX noise stays zoom when vertical dominates (fractional mouse)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -100.5, deltaX: 2.1 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -120.25, deltaX: -3.4 }), "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("fractional smoothing events after a wheel tick stay zoom in burst", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -25.5 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -6.4, deltaX: 0 }), "zoom")).toBe(EWheelIntent.Zoom);
    expect(entries[1]?.rule).toBe("I4-burst:smoothing");
    expect(resolver(makeWheelEvent({ deltaY: -25.5 }), "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("smooth mouse wheel ramp (fractional deltas) stays zoom", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: 4.000244140625 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: 34.15283203125 }), "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(makeWheelEvent({ deltaY: 153.34228515625 }), "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("rapid small fractional deltas resolve to pan (trackpad inertia)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -2.5, deltaX: 0.3 }), "zoom");
    const intent = resolver(makeWheelEvent({ deltaY: -1.7, deltaX: 0.1 }), "zoom");

    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("pinch gesture (ctrl + small delta) resolves to zoom", () => {
    const resolver = createWheelIntentResolver();
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const intent = resolver(makeWheelEvent({ deltaY: -2, ctrlKey: true }), "zoom");

    expect(intent).toBe(EWheelIntent.Zoom);
    expect(entries[0]?.rule).toBe("I1:pinch");
    expect(isPinchZoomGesture(makeWheelEvent({ deltaY: -2, ctrlKey: true }))).toBe(true);
  });

  it("predominant horizontal scroll resolves to pan", () => {
    const resolver = createWheelIntentResolver();

    const intent = resolver(makeWheelEvent({ deltaX: -10, deltaY: -1 }), "zoom");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("diagonal scroll resolves to pan regardless of MOUSE_WHEEL_BEHAVIOR", () => {
    const resolver = createWheelIntentResolver();
    expect(resolver(makeWheelEvent({ deltaX: -5, deltaY: -5 }), "zoom")).toBe(EWheelIntent.Pan);
  });

  it("slow small fractional mouse notch respects MOUSE_WHEEL_BEHAVIOR=zoom", () => {
    const resolver = createWheelIntentResolver();

    nowMs = 1000;
    expect(resolver(makeWheelEvent({ deltaY: -4.000244140625 }), "zoom")).toBe(EWheelIntent.Zoom);
    advanceMs(850);
    expect(resolver(makeWheelEvent({ deltaY: -4.000244140625 }), "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("slow small fractional mouse notch respects MOUSE_WHEEL_BEHAVIOR=scroll", () => {
    const resolver = createWheelIntentResolver();

    nowMs = 1000;
    expect(resolver(makeWheelEvent({ deltaY: -4.000244140625 }), "scroll")).toBe(EWheelIntent.Pan);
  });

  it("slow ambiguous scroll with scroll mode resolves to pan via integer trackpad", () => {
    const resolver = createWheelIntentResolver();

    const intent = resolver(makeWheelEvent({ deltaY: -4, deltaX: 0 }), "scroll");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("slow ambiguous fractional vertical scroll uses MOUSE_WHEEL_BEHAVIOR=zoom", () => {
    const resolver = createWheelIntentResolver();

    const intent = resolver(makeWheelEvent({ deltaY: -4.5, deltaX: 0 }), "zoom");
    expect(intent).toBe(EWheelIntent.Zoom);
  });

  it("I5:last-intent carries forward previous classification", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const resolver = createWheelIntentResolver();

    nowMs = 1000;
    resolver(makeWheelEvent({ deltaY: -4.000244140625 }), "scroll");
    advanceMs(850);
    const intent = resolver(makeWheelEvent({ deltaY: -2.2, deltaX: 0 }), "zoom");

    expect(intent).toBe(EWheelIntent.Pan);
    expect(entries[1]?.rule).toBe("I5:last-intent");
  });

  it("LINE mode rapid wheel is mouse (deltaMode !== 0), never trackpad pan", () => {
    const resolver = createWheelIntentResolver();
    const lineEvent = makeWheelEvent({
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
    });

    resolver(lineEvent, "zoom");
    expect(resolver(lineEvent, "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("enableWheelIntentDebug emits full resolver input and signals", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const resolver = createWheelIntentResolver();
    resolver(makeWheelEvent({ deltaY: -25.5, deltaX: 0 }), "zoom");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.input.deltaY).toBe(-25.5);
    expect(entries[0]?.mouseWheelBehavior).toBe("zoom");
    expect(entries[0]?.signals.isClassicMouseWheelStep).toBe(true);
    expect(entries[0]?.signals.isPixelDeltaMode).toBe(true);
    expect(entries[0]?.rule).toBe("I4:mouse-wheel-step");
  });
});

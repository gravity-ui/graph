import {
  EWheelIntent,
  createWheelIntentResolver,
  enableWheelIntentDebug,
} from "./wheelIntent";
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
  });

  function resolve(event: WheelEvent, mouseWheelBehavior: "zoom" | "scroll" = "zoom", advanceMs = 0): EWheelIntent {
    nowMs += advanceMs;
    return createWheelIntentResolver()(event, 1, mouseWheelBehavior);
  }

  it("slow integer vertical wheel resolves to pan (integer PIXEL = trackpad)", () => {
    const resolver = createWheelIntentResolver();
    const intent = resolver(makeWheelEvent({ deltaY: -100 }), 1, "zoom");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("rapid discrete mouse wheel steps (≥20px fractional) with MOUSE_WHEEL_BEHAVIOR=zoom stay zoom", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -25.5 }), 1, "zoom");
    const intent = resolver(makeWheelEvent({ deltaY: -25.5 }), 1, "zoom");

    expect(intent).toBe(EWheelIntent.Zoom);
  });

  it("integer PIXEL scroll stays pan", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: 1 }), 1, "zoom");
    expect(resolver(makeWheelEvent({ deltaY: 11 }), 1, "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: 20 }), 1, "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -100 }), 1, "zoom")).toBe(EWheelIntent.Pan);
  });

  it("trackpad integer scroll both directions stays pan", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: 1 }), 1, "zoom");
    expect(resolver(makeWheelEvent({ deltaY: 11 }), 1, "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: 20 }), 1, "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -1 }), 1, "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -11 }), 1, "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -20 }), 1, "zoom")).toBe(EWheelIntent.Pan);
  });

  it("rapid integer vertical wheel with MOUSE_WHEEL_BEHAVIOR=scroll resolves to pan", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -10 }), 1, "scroll");
    const intent = resolver(makeWheelEvent({ deltaY: -10 }), 1, "scroll");

    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("rapid LINE-mode wheel ticks respect MOUSE_WHEEL_BEHAVIOR", () => {
    const resolver = createWheelIntentResolver();
    const lineEvent = makeWheelEvent({
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
    });

    resolver(lineEvent, 1, "zoom");
    expect(resolver(lineEvent, 1, "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(lineEvent, 1, "scroll")).toBe(EWheelIntent.Pan);
  });

  it("vertical wheel with deltaX noise stays zoom when vertical dominates (fractional mouse)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -100.5, deltaX: 2.1 }), 1, "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -120.25, deltaX: -3.4 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("fractional smoothing events after a wheel tick stay zoom in burst", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -25.5 }), 1, "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -6.4, deltaX: 0 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(makeWheelEvent({ deltaY: -25.5 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("smooth mouse wheel ramp (fractional deltas) stays zoom", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: 4.000244140625 }), 1, "zoom");
    expect(resolver(makeWheelEvent({ deltaY: 34.15283203125 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(makeWheelEvent({ deltaY: 153.34228515625 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("rapid small fractional deltas resolve to pan (trackpad inertia)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -2.5, deltaX: 0.3 }), 1, "zoom");
    const intent = resolver(makeWheelEvent({ deltaY: -1.7, deltaX: 0.1 }), 1, "zoom");

    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("diagonal scroll resolves to pan regardless of MOUSE_WHEEL_BEHAVIOR", () => {
    const intent = resolve(makeWheelEvent({ deltaX: -5, deltaY: -5 }), "zoom");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("slow ambiguous small integer vertical scroll resolves to pan", () => {
    const resolver = createWheelIntentResolver();

    const intent = resolver(makeWheelEvent({ deltaY: -4, deltaX: 0 }), 1, "zoom");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("slow small fractional mouse notch respects MOUSE_WHEEL_BEHAVIOR=zoom", () => {
    const resolver = createWheelIntentResolver();

    nowMs = 1000;
    expect(resolver(makeWheelEvent({ deltaY: -4.000244140625 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
    nowMs += 850;
    expect(resolver(makeWheelEvent({ deltaY: -4.000244140625 }), 1, "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("slow small fractional mouse notch respects MOUSE_WHEEL_BEHAVIOR=scroll", () => {
    const resolver = createWheelIntentResolver();

    nowMs = 1000;
    expect(resolver(makeWheelEvent({ deltaY: -4.000244140625 }), 1, "scroll")).toBe(EWheelIntent.Pan);
  });

  it("slow ambiguous scroll with scroll mode resolves to pan", () => {
    const resolver = createWheelIntentResolver();

    const intent = resolver(makeWheelEvent({ deltaY: -4, deltaX: 0 }), 1, "scroll");
    expect(intent).toBe(EWheelIntent.Pan);
  });

  it("slow ambiguous fractional vertical scroll uses MOUSE_WHEEL_BEHAVIOR=zoom", () => {
    const resolver = createWheelIntentResolver();

    const intent = resolver(makeWheelEvent({ deltaY: -4.5, deltaX: 0 }), 1, "zoom");
    expect(intent).toBe(EWheelIntent.Zoom);
  });

  it("LINE mode rapid wheel is mouse (deltaMode !== 0), never trackpad pan", () => {
    const resolver = createWheelIntentResolver();
    const lineEvent = makeWheelEvent({
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
    });

    resolver(lineEvent, 1, "zoom");
    expect(resolver(lineEvent, 1, "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("enableWheelIntentDebug emits full resolver input and signals", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const resolver = createWheelIntentResolver();
    resolver(makeWheelEvent({ deltaY: -25.5, deltaX: 0 }), 2, "zoom");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.input.deltaY).toBe(-25.5);
    expect(entries[0]?.dpr).toBe(2);
    expect(entries[0]?.mouseWheelBehavior).toBe("zoom");
    expect(entries[0]?.signals.isClassicMouseWheelStep).toBe(true);
    expect(entries[0]?.signals.isPixelDeltaMode).toBe(true);
    expect(entries[0]?.rule).toBe("I4:mouse-wheel-step");

    enableWheelIntentDebug(null);
  });
});

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

/** Mac Chrome/YaBrowser trackpad: integer PIXEL deltaY + wheelDeltaY ≈ ∓3 × deltaY. */
function makeMacChromeTrackpadWheelEvent(
  overrides: Partial<{
    deltaX: number;
    deltaY: number;
    deltaMode: number;
  }> = {}
): WheelEvent {
  const deltaY = overrides.deltaY ?? 10;
  const event = makeWheelEvent({ deltaY, ...overrides });
  const legacyDelta = -deltaY * 3;
  Object.defineProperty(event, "wheelDelta", { configurable: true, value: legacyDelta });
  Object.defineProperty(event, "wheelDeltaY", { configurable: true, value: legacyDelta });
  Object.defineProperty(event, "wheelDeltaX", {
    configurable: true,
    value: (overrides.deltaX ?? 0) > 0 ? -(overrides.deltaX ?? 0) * 3 : 0,
  });
  return event;
}

/** Chromium/Edge on Windows: integer PIXEL deltaY + legacy wheelDeltaY ≈ ∓120. */
function makeChromiumMouseWheelEvent(
  overrides: Partial<{
    deltaX: number;
    deltaY: number;
    deltaMode: number;
  }> = {}
): WheelEvent {
  const deltaY = overrides.deltaY ?? 100;
  const event = makeWheelEvent({ deltaY, ...overrides });
  const legacyDelta = deltaY > 0 ? -120 : 120;
  Object.defineProperty(event, "wheelDelta", { configurable: true, value: legacyDelta });
  Object.defineProperty(event, "wheelDeltaY", { configurable: true, value: legacyDelta });
  return event;
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

  it("slow large integer PIXEL step follows MOUSE_WHEEL_BEHAVIOR (Chromium/Windows mouse)", () => {
    const resolver = createWheelIntentResolver();

    expect(resolver(makeChromiumMouseWheelEvent({ deltaY: 100 }), "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(makeChromiumMouseWheelEvent({ deltaY: 100 }), "scroll")).toBe(EWheelIntent.Pan);
  });

  it("Chromium mouse rapid stream with wheelDelta ±120 stays zoom (Windows log repro)", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const resolver = createWheelIntentResolver();
    const tick = (): EWheelIntent => resolver(makeChromiumMouseWheelEvent({ deltaY: 100 }), "zoom");

    expect(tick()).toBe(EWheelIntent.Zoom);
    advanceMs(33);
    expect(tick()).toBe(EWheelIntent.Zoom);
    advanceMs(33);
    expect(tick()).toBe(EWheelIntent.Zoom);
    advanceMs(33);
    expect(tick()).toBe(EWheelIntent.Zoom);

    expect(entries.every((entry) => entry.rule === "I4:mouse-wheel-step")).toBe(true);
    expect(entries.every((entry) => entry.result === EWheelIntent.Zoom)).toBe(true);
    expect(entries.every((entry) => entry.signals.hasLegacyMouseWheelDelta)).toBe(true);
  });

  it("small integer PIXEL scroll stays pan (trackpad ticks)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: 1 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: 11 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: 20 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -1 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -11 }), "zoom")).toBe(EWheelIntent.Pan);
    expect(resolver(makeWheelEvent({ deltaY: -20 }), "zoom")).toBe(EWheelIntent.Pan);
  });

  it("large integer PIXEL scroll stays pan inside a rapid stream (trackpad)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -20 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -100 }), "zoom")).toBe(EWheelIntent.Pan);
  });

  it("Mac Chrome fast trackpad swipe stays pan despite linear wheelDelta (YaBrowser log repro)", () => {
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    const resolver = createWheelIntentResolver();
    const tick = (deltaY: number, deltaX = 0): EWheelIntent =>
      resolver(makeMacChromeTrackpadWheelEvent({ deltaY, deltaX }), "zoom");

    nowMs = 1000;
    expect(tick(5)).toBe(EWheelIntent.Pan);
    advanceMs(32);
    expect(tick(313, 4)).toBe(EWheelIntent.Pan);
    advanceMs(8);
    expect(tick(70)).toBe(EWheelIntent.Pan);
    advanceMs(8);
    expect(tick(450)).toBe(EWheelIntent.Pan);
    advanceMs(8);
    expect(tick(34)).toBe(EWheelIntent.Pan);
    advanceMs(8);
    expect(tick(86)).toBe(EWheelIntent.Pan);
    advanceMs(8);
    expect(tick(1)).toBe(EWheelIntent.Pan);

    expect(entries.every((entry) => entry.result === EWheelIntent.Pan)).toBe(true);
    expect(entries.every((entry) => entry.rule.startsWith("I3:"))).toBe(true);
    expect(entries.every((entry) => entry.signals.hasLegacyMouseWheelDelta === false)).toBe(true);
  });

  it("integer PIXEL scroll with deltaX noise stays pan in rapid stream", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -4 }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -100, deltaX: 2 }), "zoom")).toBe(EWheelIntent.Pan);
    resolver(makeWheelEvent({ deltaY: -4 }), "zoom");
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

  it("Mac Cmd+scroll with large integer deltas resolves to zoom (not trackpad pan)", () => {
    const resolver = createWheelIntentResolver();
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    resolver(makeWheelEvent({ deltaY: -100, metaKey: true }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -20, metaKey: true }), "zoom")).toBe(EWheelIntent.Zoom);
    expect(entries[0]?.rule).toBe("I1:pinch");
    expect(entries[1]?.rule).toBe("I1:pinch");
    expect(isPinchZoomGesture(makeWheelEvent({ deltaY: -100, metaKey: true }))).toBe(true);
  });

  it("Mac Cmd+scroll stays zoom through inertia tail (fractional small deltas)", () => {
    const resolver = createWheelIntentResolver();

    resolver(makeWheelEvent({ deltaY: -100, metaKey: true }), "zoom");
    expect(resolver(makeWheelEvent({ deltaY: -2.5, deltaX: 0.3, metaKey: true }), "zoom")).toBe(EWheelIntent.Zoom);
    advanceMs(850);
    expect(resolver(makeWheelEvent({ deltaY: -1.7, deltaX: 0.1, metaKey: true }), "zoom")).toBe(EWheelIntent.Zoom);
  });

  it("modifier + large integer PIXEL delta resolves to zoom (trackpad Ctrl/Cmd scroll)", () => {
    const resolver = createWheelIntentResolver();
    const entries: TWheelIntentDebugEntry[] = [];
    enableWheelIntentDebug((entry) => {
      entries.push(entry);
    });

    expect(resolver(makeWheelEvent({ deltaY: -100, ctrlKey: true }), "zoom")).toBe(EWheelIntent.Zoom);
    expect(entries[0]?.rule).toBe("I1:pinch");
    expect(isPinchZoomGesture(makeWheelEvent({ deltaY: -100, ctrlKey: true }))).toBe(true);
  });

  it("modifier + LINE mode wheel still follows MOUSE_WHEEL_BEHAVIOR (mouse, not trackpad)", () => {
    const resolver = createWheelIntentResolver();
    const lineEvent = makeWheelEvent({
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      ctrlKey: true,
    });

    expect(resolver(lineEvent, "zoom")).toBe(EWheelIntent.Zoom);
    expect(resolver(lineEvent, "scroll")).toBe(EWheelIntent.Pan);
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

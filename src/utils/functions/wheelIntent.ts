export type TMouseWheelBehavior = "zoom" | "scroll";

/**
 * Wheel input classification for camera routing.
 *
 * The library resolves **intent** (pan vs zoom), not device type. This boundary prepares
 * for a future input event bus where raw DOM events (`wheel`, `pointerdown`, …) are
 * normalized into semantic graph events (`camera:pan`, `camera:zoom`, …) before Camera
 * handles them.
 */

/** Wheel input intent for camera routing (pan vs zoom). */
export enum EWheelIntent {
  Pan = "pan",
  Zoom = "zoom",
}

/**
 * Classifies a wheel event as pan or zoom intent.
 * Configured as `resolveWheelIntent` on graph settings (`TGraphSettingsConfig`).
 *
 * @param dpr Device pixel ratio from the graph layer; reserved for future heuristics (unused today).
 */
export type TResolveWheelIntent = (
  event: WheelEvent,
  dpr: number,
  mouseWheelBehavior: TMouseWheelBehavior
) => EWheelIntent;

/** Snapshot of resolver inputs, derived signals, session state, and the winning rule. */
export type TWheelIntentDebugEntry = {
  /** Third argument to {@link TResolveWheelIntent}. */
  mouseWheelBehavior: TMouseWheelBehavior;
  /** Second argument to {@link TResolveWheelIntent}. */
  dpr: number;
  /** Raw {@link WheelEvent} fields passed into the resolver. */
  input: {
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    deltaModeLabel: string;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  };
  /** Pixel-equivalent deltas after {@link normalizeWheelDelta}. */
  normalized: {
    deltaX: number;
    deltaY: number;
    /** min(|x|, |y|) / max(|x|, |y|); null when both axes are ~0. */
    diagonalAxisRatio: number | null;
  };
  /** Timing and resolver session state at classification time. */
  session: {
    timeSinceLastMs: number;
    isRapidStream: boolean;
    isInMouseWheelBurst: boolean;
    mouseWheelBurstRemainingMs: number | null;
    lastIntentBefore: EWheelIntent;
  };
  /** Boolean predicates evaluated for I1–I5 (see `docs/system/wheel-intent.md`). */
  signals: {
    isPinchZoom: boolean;
    isDiagonalScroll: boolean;
    isPredominantHorizontalScroll: boolean;
    isClassicMouseWheelStep: boolean;
    isDominantAxisLargeWheel: boolean;
    isVerticalOnly: boolean;
    hasFractionalDelta: boolean;
    isSmallDelta: boolean;
    /** Trackpads always emit `deltaMode === DOM_DELTA_PIXEL` (0); mice use LINE/PAGE or PIXEL. */
    isPixelDeltaMode: boolean;
  };
  /** Winning rule id and resolved intent. */
  rule: string;
  result: EWheelIntent;
};

export type TWheelIntentDebugLogger = (entry: TWheelIntentDebugEntry) => void;

const WHEEL_INTENT_DEBUG_GLOBAL_KEY = "__graphWheelIntentDebugLogger__";

type TGlobalWithWheelIntentDebug = typeof globalThis & {
  [WHEEL_INTENT_DEBUG_GLOBAL_KEY]?: TWheelIntentDebugLogger | null;
};

/** Normalized wheel deltas and derived flags computed once per event. */
type TWheelContext = {
  event: WheelEvent;
  normX: number;
  normY: number;
  absX: number;
  absY: number;
  hasFractionalDelta: boolean;
  isPixelDeltaMode: boolean;
  isSmallDelta: boolean;
  isVerticalOnly: boolean;
};

function getWheelIntentDebugLogger(): TWheelIntentDebugLogger | null {
  return (globalThis as TGlobalWithWheelIntentDebug)[WHEEL_INTENT_DEBUG_GLOBAL_KEY] ?? null;
}

function setWheelIntentDebugLogger(logger: TWheelIntentDebugLogger | null): void {
  (globalThis as TGlobalWithWheelIntentDebug)[WHEEL_INTENT_DEBUG_GLOBAL_KEY] = logger;
}

function deltaModeLabel(deltaMode: number): string {
  return ["PIXEL", "LINE", "PAGE"][deltaMode] ?? String(deltaMode);
}

function formatDiagonalAxisRatio(normX: number, normY: number): number | null {
  const maxAxis = Math.max(normX, normY);
  if (maxAxis < 0.001) {
    return null;
  }
  return Math.min(normX, normY) / maxAxis;
}

function defaultDebugLogger(entry: TWheelIntentDebugEntry): void {
  const { input, session } = entry;
  const summary = `[wheel-intent] ${entry.rule} → ${entry.result} | Δ(${input.deltaX.toFixed(2)}, ${input.deltaY.toFixed(2)}) ${input.deltaModeLabel} +${Math.round(session.timeSinceLastMs)}ms`;
  // Stringify so logs are copy-pasteable as plain text (not expandable DevTools objects).
  // eslint-disable-next-line no-console
  console.log(summary);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry, null, 2));
}

/**
 * Enables per-event debug logging for {@link createWheelIntentResolver}.
 *
 * Stored on `globalThis` so it works even when webpack loads duplicate module copies
 * (e.g. Storybook preview vs story bundle).
 *
 * @example
 * ```typescript
 * import { enableWheelIntentDebug } from "@gravity-ui/graph";
 * enableWheelIntentDebug();         // default console.log: summary + JSON string
 * enableWheelIntentDebug(entry => myTelemetry.record(entry)); // custom logger
 * enableWheelIntentDebug(null);     // disable
 * ```
 */
export function enableWheelIntentDebug(logger: TWheelIntentDebugLogger | null = defaultDebugLogger): void {
  setWheelIntentDebugLogger(logger);
  if (logger !== null) {
    // eslint-disable-next-line no-console
    console.log("[wheel-intent] debug logging enabled");
  }
}

/** After a classic mouse wheel tick, treat nearby vertical fractional events as wheel smoothing. */
const MOUSE_WHEEL_BURST_MS = 120;

/** Events closer than this are treated as a continuous stream (typical two-finger scroll / inertia). */
const RAPID_STREAM_MS = 38;

/** Both axes must contribute at least this share of the larger axis to count as diagonal pan. */
const DIAGONAL_AXIS_MIN_RATIO = 0.5;

/** Minimum absolute delta on both axes to count as diagonal scroll. */
const DIAGONAL_MIN_ABS = 2;

/** Normalized horizontal delta at or above this suggests pan (not a vertical-only wheel step). */
const MIN_HORIZONTAL_SCROLL_ABS = 2;

const SMALL_DELTA_THRESHOLD = 50;

/** Trackpad inertia: per-event normalized delta below this on both axes (I3). */
const TRACKPAD_I3_MAX_PX = 20;

/** Minimum normalized vertical delta for a discrete mouse wheel step (I4). */
const MOUSE_WHEEL_DISCRETE_MIN_PX = 20;

/** Smooth-scroll mouse notch band (slow fractional PIXEL step, e.g. Δy ≈ -4.000244). */
const MOUSE_WHEEL_NOTCH_MIN_PX = 3;
const MOUSE_WHEEL_NOTCH_MAX_PX = 5;

/** Approximate pixel equivalent of one scroll LINE (WheelEvent.deltaMode === 1). */
const LINE_TO_PIXEL_APPROX = 16;

/** Approximate pixel equivalent of one scroll PAGE (WheelEvent.deltaMode === 2). */
const PAGE_TO_PIXEL_APPROX = 600;

/**
 * Converts a wheel delta value to approximate pixel units.
 * WheelEvent.deltaMode: 0 = PIXEL, 1 = LINE, 2 = PAGE.
 */
function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_TO_PIXEL_APPROX;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * PAGE_TO_PIXEL_APPROX;
  return delta;
}

function createWheelContext(event: WheelEvent): TWheelContext {
  const normX = normalizeWheelDelta(event.deltaX, event.deltaMode);
  const normY = normalizeWheelDelta(event.deltaY, event.deltaMode);
  const absX = Math.abs(normX);
  const absY = Math.abs(normY);
  const isPixelDeltaMode = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
  const hasFractionalDelta = isPixelDeltaMode && (!Number.isInteger(event.deltaY) || !Number.isInteger(event.deltaX));

  return {
    event,
    normX,
    normY,
    absX,
    absY,
    hasFractionalDelta,
    isPixelDeltaMode,
    isSmallDelta: absX < SMALL_DELTA_THRESHOLD && absY < SMALL_DELTA_THRESHOLD,
    isVerticalOnly: absX < MIN_HORIZONTAL_SCROLL_ABS,
  };
}

/**
 * Vertical-only wheel step — physical mouse (LINE/PAGE, or PIXEL delta ≥ discrete minimum).
 *
 * PIXEL mode with **integer** deltas is trackpad — excluded here regardless of magnitude.
 */
function isClassicMouseWheelStep(ctx: TWheelContext): boolean {
  const { event, absY, isPixelDeltaMode, hasFractionalDelta } = ctx;
  if (Math.abs(event.deltaX) >= 0.5) {
    return false;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE || event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  if (absY < MOUSE_WHEEL_DISCRETE_MIN_PX) {
    return false;
  }
  if (isPixelDeltaMode && !hasFractionalDelta) {
    return false;
  }
  return true;
}

/** Trackpad scroll in PIXEL mode: integer `deltaX` and `deltaY`. */
function isIntegerPixelTrackpadScroll(ctx: TWheelContext): boolean {
  return ctx.isPixelDeltaMode && !ctx.hasFractionalDelta;
}

/** Rapid PIXEL-mode stream with small deltas — fractional trackpad inertia on some drivers. */
function isTrackpadLikeRapidSmall(ctx: TWheelContext, isRapidStream: boolean): boolean {
  if (!isRapidStream || !ctx.isPixelDeltaMode) {
    return false;
  }
  return ctx.absY < TRACKPAD_I3_MAX_PX && ctx.absX < TRACKPAD_I3_MAX_PX;
}

/** Smooth-scroll mouse: slow vertical-only **fractional** PIXEL delta in the notch band. */
function isSlowFractionalMouseWheelStep(
  ctx: TWheelContext,
  isRapidStream: boolean,
  inMouseWheelBurst: boolean
): boolean {
  if (
    isRapidStream ||
    inMouseWheelBurst ||
    !ctx.hasFractionalDelta ||
    !ctx.isVerticalOnly ||
    !ctx.isSmallDelta ||
    !ctx.isPixelDeltaMode
  ) {
    return false;
  }
  return ctx.absY >= MOUSE_WHEEL_NOTCH_MIN_PX && ctx.absY <= MOUSE_WHEEL_NOTCH_MAX_PX;
}

/** One axis dominates (large step), the other ~0 — classic mouse wheel click. */
function isDominantAxisLargeWheel(ctx: TWheelContext): boolean {
  const { event, absX, absY } = ctx;
  return (
    (absX >= SMALL_DELTA_THRESHOLD && Math.abs(event.deltaY) < 0.5) ||
    (absY >= SMALL_DELTA_THRESHOLD && Math.abs(event.deltaX) < 0.5)
  );
}

function isPinchZoomWheelEvent(ctx: TWheelContext): boolean {
  const { event, hasFractionalDelta, isSmallDelta } = ctx;
  return (event.ctrlKey || event.metaKey) && (hasFractionalDelta || isSmallDelta);
}

/**
 * Returns true for OS-synthesized trackpad pinch-to-zoom gestures (ctrl/meta + fractional or small delta).
 * Used by Camera for pinch zoom speed; excludes Ctrl+scroll on a mechanical wheel (large steps ≥ I4 threshold).
 */
export function isPinchZoomGesture(event: WheelEvent): boolean {
  return isPinchZoomWheelEvent(createWheelContext(event));
}

/** Horizontal movement dominates — ignores deltaX noise on predominantly vertical wheel ticks. */
function isPredominantHorizontalScroll(ctx: TWheelContext): boolean {
  return ctx.absX >= MIN_HORIZONTAL_SCROLL_ABS && ctx.absX > ctx.absY;
}

function isDiagonalScroll(ctx: TWheelContext): boolean {
  const { event, absX, absY } = ctx;
  if (event.shiftKey || absX <= DIAGONAL_MIN_ABS || absY <= DIAGONAL_MIN_ABS) {
    return false;
  }
  const minAxis = Math.min(absX, absY);
  const maxAxis = Math.max(absX, absY);
  return minAxis / maxAxis >= DIAGONAL_AXIS_MIN_RATIO;
}

function buildWheelSignals(ctx: TWheelContext): TWheelIntentDebugEntry["signals"] {
  return {
    isPinchZoom: isPinchZoomWheelEvent(ctx),
    isDiagonalScroll: isDiagonalScroll(ctx),
    isPredominantHorizontalScroll: isPredominantHorizontalScroll(ctx),
    isClassicMouseWheelStep: isClassicMouseWheelStep(ctx),
    isDominantAxisLargeWheel: isDominantAxisLargeWheel(ctx),
    isVerticalOnly: ctx.isVerticalOnly,
    hasFractionalDelta: ctx.hasFractionalDelta,
    isSmallDelta: ctx.isSmallDelta,
    isPixelDeltaMode: ctx.isPixelDeltaMode,
  };
}

function intentFromMouseWheelBehavior(mouseWheelBehavior: TMouseWheelBehavior): EWheelIntent {
  return mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
}

function emitDebugEntry(
  ctx: TWheelContext,
  dpr: number,
  mouseWheelBehavior: TMouseWheelBehavior,
  timeSinceLastWheel: number,
  isRapidStream: boolean,
  isInMouseWheelBurst: boolean,
  mouseWheelBurstRemainingMs: number | null,
  lastIntentBefore: EWheelIntent,
  signals: TWheelIntentDebugEntry["signals"],
  rule: string,
  result: EWheelIntent
): void {
  const debugLogger = getWheelIntentDebugLogger();
  if (debugLogger === null) {
    return;
  }

  const { event, normX, normY } = ctx;

  debugLogger({
    mouseWheelBehavior,
    dpr,
    input: {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      deltaModeLabel: deltaModeLabel(event.deltaMode),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    },
    normalized: {
      deltaX: normX,
      deltaY: normY,
      diagonalAxisRatio: formatDiagonalAxisRatio(Math.abs(normX), Math.abs(normY)),
    },
    session: {
      timeSinceLastMs: timeSinceLastWheel === Number.POSITIVE_INFINITY ? -1 : timeSinceLastWheel,
      isRapidStream,
      isInMouseWheelBurst,
      mouseWheelBurstRemainingMs,
      lastIntentBefore,
    },
    signals,
    rule,
    result,
  });
}

/**
 * Creates the default wheel intent resolver (`TGraphSettingsConfig.resolveWheelIntent`).
 *
 * Classifies **intent** from gesture shape — not from inferred device type:
 *
 * | Signal                                | Intent          |
 * |---------------------------------------|-----------------|
 * | ctrlKey / metaKey + scroll            | Zoom (I1)       |
 * | Horizontal or diagonal movement       | Pan  (I2)       |
 * | Integer PIXEL delta (trackpad)        | Pan  (I3)       |
 * | Classic mouse wheel step (fractional) | Zoom/Pan (I4)*  |
 * | Rapid stream + small delta (fractional)| Pan  (I3)      |
 * | Anything else                         | Last intent (I5)|
 *
 * *I4 respects `mouseWheelBehavior`: `"scroll"` → Pan, `"zoom"` → Zoom.
 *
 * Trackpad: `deltaMode === 0` (PIXEL) + **integer** `deltaX`/`deltaY` → pan; **fractional** PIXEL → mouse (I4).
 * LINE/PAGE mode (`deltaMode !== 0`) is never trackpad — always mouse (I4).
 * See `docs/system/wheel-intent.md` for rationale.
 */
export function createWheelIntentResolver(): TResolveWheelIntent {
  let lastIntent: EWheelIntent = EWheelIntent.Zoom;
  let lastTimestamp: number | null = null;
  let mouseWheelBurstUntil: number | null = null;

  const markMouseWheelBurst = (now: number): void => {
    mouseWheelBurstUntil = now + MOUSE_WHEEL_BURST_MS;
  };

  const isInMouseWheelBurst = (now: number): boolean => mouseWheelBurstUntil !== null && now <= mouseWheelBurstUntil;

  return (event: WheelEvent, _dpr: number, mouseWheelBehavior: TMouseWheelBehavior): EWheelIntent => {
    const now = performance.now();
    const timeSince = lastTimestamp !== null ? now - lastTimestamp : Number.POSITIVE_INFINITY;
    lastTimestamp = now;

    const isRapidStream = timeSince < RAPID_STREAM_MS;
    const inMouseWheelBurst = isInMouseWheelBurst(now);
    const mouseWheelBurstRemainingMs = mouseWheelBurstUntil !== null ? Math.max(0, mouseWheelBurstUntil - now) : null;

    const ctx = createWheelContext(event);
    const signals = buildWheelSignals(ctx);
    const lastIntentBefore = lastIntent;

    let intent: EWheelIntent;
    let rule: string;

    if (signals.isPinchZoom) {
      intent = EWheelIntent.Zoom;
      rule = "I1:pinch";
    } else if (signals.isDiagonalScroll || signals.isPredominantHorizontalScroll) {
      intent = EWheelIntent.Pan;
      rule = "I2:horizontal-or-diagonal";
    } else if (isIntegerPixelTrackpadScroll(ctx)) {
      intent = EWheelIntent.Pan;
      rule = isRapidStream ? "I3:integer-trackpad" : "I3:integer-trackpad-slow";
    } else if (signals.isDominantAxisLargeWheel || signals.isClassicMouseWheelStep) {
      intent = intentFromMouseWheelBehavior(mouseWheelBehavior);
      rule = signals.isClassicMouseWheelStep ? "I4:mouse-wheel-step" : "I4:large-step";
      markMouseWheelBurst(now);
    } else if (isTrackpadLikeRapidSmall(ctx, isRapidStream)) {
      if (inMouseWheelBurst && signals.isVerticalOnly) {
        intent = intentFromMouseWheelBehavior(mouseWheelBehavior);
        rule = "I4-burst:smoothing";
        markMouseWheelBurst(now);
      } else {
        intent = EWheelIntent.Pan;
        rule = "I3:rapid-small";
      }
    } else if (isSlowFractionalMouseWheelStep(ctx, isRapidStream, inMouseWheelBurst)) {
      intent = intentFromMouseWheelBehavior(mouseWheelBehavior);
      rule = "I4:fractional-mouse";
      markMouseWheelBurst(now);
    } else {
      intent = lastIntent;
      rule = "I5:last-intent";
    }

    lastIntent = intent;
    if (getWheelIntentDebugLogger() !== null) {
      emitDebugEntry(
        ctx,
        _dpr,
        mouseWheelBehavior,
        timeSince,
        isRapidStream,
        inMouseWheelBurst,
        mouseWheelBurstRemainingMs,
        lastIntentBefore,
        signals,
        rule,
        intent
      );
    }
    return intent;
  };
}

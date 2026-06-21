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

/** OS hint for wheel intent heuristics (trackpad vs mouse priors). */
export enum EWheelIntentPlatform {
  MacOS = "macos",
  Other = "other",
}

export type TWheelIntentResolverPlatform = EWheelIntentPlatform | "auto";

export type TWheelIntentResolverOptions = {
  /**
   * Platform prior for ambiguous gestures (I5) and threshold tuning.
   * @default "auto" — {@link detectWheelIntentPlatform} at resolver creation time.
   */
  platform?: TWheelIntentResolverPlatform;
};

/** Thresholds and priors applied by {@link createWheelIntentResolver} for one platform. */
export type TWheelIntentPlatformProfile = {
  platform: EWheelIntentPlatform;
  /** I5 initial `lastIntent` and macOS slow-ambiguous fallback. */
  ambiguousIntent: EWheelIntent;
  trackpadI3MaxPx: number;
  mouseWheelDiscreteMinPx: number;
};

/**
 * Classifies a wheel event as pan or zoom intent.
 * Configured as `resolveWheelIntent` on graph settings (`TGraphSettingsConfig`).
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
  /** Platform profile used for this classification. */
  platform: EWheelIntentPlatform;
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
  const summary = `[wheel-intent] ${entry.rule} → ${entry.result} | ${entry.platform} | Δ(${input.deltaX.toFixed(2)}, ${input.deltaY.toFixed(2)}) ${input.deltaModeLabel} +${Math.round(session.timeSinceLastMs)}ms`;
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
const TRACKPAD_I3_MAX_PX_DEFAULT = 20;

const MOUSE_WHEEL_DISCRETE_MIN_PX_DEFAULT = 20;

/**
 * Detects macOS-like environment for wheel intent priors (trackpad more likely than mouse).
 * SSR-safe: returns {@link EWheelIntentPlatform.Other} when `navigator` is unavailable.
 */
export function detectWheelIntentPlatform(): EWheelIntentPlatform {
  if (typeof navigator === "undefined") {
    return EWheelIntentPlatform.Other;
  }

  const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  if (userAgentData?.platform === "macOS") {
    return EWheelIntentPlatform.MacOS;
  }

  const navPlatform = navigator.platform;
  if (navPlatform === "MacIntel" || navPlatform === "MacPPC" || navPlatform === "Mac68K") {
    return EWheelIntentPlatform.MacOS;
  }

  if (/Mac OS X|Macintosh/.test(navigator.userAgent) && !/Windows/.test(navigator.userAgent)) {
    return EWheelIntentPlatform.MacOS;
  }

  return EWheelIntentPlatform.Other;
}

function resolveWheelIntentPlatform(platform: TWheelIntentResolverPlatform | undefined): EWheelIntentPlatform {
  if (platform === undefined || platform === "auto") {
    return detectWheelIntentPlatform();
  }
  return platform;
}

/** Builds threshold/prior profile for a platform. */
export function getWheelIntentPlatformProfile(platform: EWheelIntentPlatform): TWheelIntentPlatformProfile {
  if (platform === EWheelIntentPlatform.MacOS) {
    return {
      platform,
      ambiguousIntent: EWheelIntent.Pan,
      trackpadI3MaxPx: TRACKPAD_I3_MAX_PX_DEFAULT,
      mouseWheelDiscreteMinPx: MOUSE_WHEEL_DISCRETE_MIN_PX_DEFAULT,
    };
  }

  return {
    platform,
    ambiguousIntent: EWheelIntent.Zoom,
    trackpadI3MaxPx: TRACKPAD_I3_MAX_PX_DEFAULT,
    mouseWheelDiscreteMinPx: MOUSE_WHEEL_DISCRETE_MIN_PX_DEFAULT,
  };
}

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

function hasFractionalWheelDelta(e: WheelEvent): boolean {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
    return false;
  }
  return !Number.isInteger(e.deltaY) || !Number.isInteger(e.deltaX);
}

/**
 * macOS PIXEL-mode wheel event with integer `deltaX` and `deltaY`.
 * Primary trackpad signal on macOS — smooth-scroll mice emit fractional deltas instead.
 */
function isMacOsIntegerPixelDelta(e: WheelEvent, profile: TWheelIntentPlatformProfile): boolean {
  return (
    profile.platform === EWheelIntentPlatform.MacOS &&
    e.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
    !hasFractionalWheelDelta(e)
  );
}

/**
 * Vertical-only wheel step — physical mouse (LINE/PAGE, or PIXEL delta ≥ discrete minimum).
 *
 * On macOS PIXEL mode, **integer** deltas are trackpad — excluded here regardless of magnitude.
 */
function isClassicMouseWheelStep(
  e: WheelEvent,
  profile: TWheelIntentPlatformProfile,
  hasFractionalDelta: boolean
): boolean {
  if (Math.abs(e.deltaX) >= 0.5) {
    return false;
  }
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE || e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return true;
  }
  const normY = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  if (normY < profile.mouseWheelDiscreteMinPx) {
    return false;
  }
  if (
    profile.platform === EWheelIntentPlatform.MacOS &&
    e.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
    !hasFractionalDelta
  ) {
    return false;
  }
  return true;
}

/**
 * macOS trackpad scroll in PIXEL mode: integer deltas, vertical-dominant, rapid stream or small step.
 */
function isMacOsIntegerTrackpadScroll(
  e: WheelEvent,
  profile: TWheelIntentPlatformProfile,
  isRapidStream: boolean,
  isSmallDelta: boolean,
  isVerticalOnly: boolean
): boolean {
  if (!isMacOsIntegerPixelDelta(e, profile) || !isVerticalOnly) {
    return false;
  }
  return isRapidStream || isSmallDelta;
}

/** Rapid stream with per-event deltas below mouse-wheel threshold — non-macOS trackpad inertia. */
function isTrackpadLikeRapidSmall(
  e: WheelEvent,
  isRapidStream: boolean,
  profile: TWheelIntentPlatformProfile
): boolean {
  if (!isRapidStream) {
    return false;
  }
  return (
    Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode)) < profile.trackpadI3MaxPx &&
    Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode)) < profile.trackpadI3MaxPx
  );
}

/**
 * macOS smooth-scroll mouse: slow vertical-only **fractional** PIXEL delta.
 * Integer slow scroll is trackpad — handled by {@link isMacOsIntegerTrackpadScroll}.
 */
function isMacOsSlowFractionalMouseWheelStep(
  e: WheelEvent,
  profile: TWheelIntentPlatformProfile,
  isRapidStream: boolean,
  inMouseWheelBurst: boolean,
  hasFractionalDelta: boolean,
  isSmallDelta: boolean,
  isVerticalOnly: boolean
): boolean {
  if (
    profile.platform !== EWheelIntentPlatform.MacOS ||
    isRapidStream ||
    inMouseWheelBurst ||
    !hasFractionalDelta ||
    !isVerticalOnly ||
    !isSmallDelta
  ) {
    return false;
  }
  return e.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
}

/** One axis dominates (large step), the other ~0 — classic mouse wheel click. */
function isDominantAxisLargeWheel(e: WheelEvent): boolean {
  const ax = Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode));
  const ay = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  return (
    (ax >= SMALL_DELTA_THRESHOLD && Math.abs(e.deltaY) < 0.5) ||
    (ay >= SMALL_DELTA_THRESHOLD && Math.abs(e.deltaX) < 0.5)
  );
}

function isSmallWheelDelta(e: WheelEvent): boolean {
  return (
    Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode)) < SMALL_DELTA_THRESHOLD &&
    Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode)) < SMALL_DELTA_THRESHOLD
  );
}

function isPinchZoomWheelEvent(e: WheelEvent, hasFractionalDelta: boolean, isSmallDelta: boolean): boolean {
  return (e.ctrlKey || e.metaKey) && (hasFractionalDelta || isSmallDelta);
}

/**
 * Returns true for OS-synthesized trackpad pinch-to-zoom gestures (ctrl/meta + fractional or small delta).
 * Used by Camera for pinch zoom speed; excludes Ctrl+scroll on a mechanical wheel (large steps ≥ I4 threshold).
 */
export function isPinchZoomGesture(event: WheelEvent): boolean {
  return isPinchZoomWheelEvent(event, hasFractionalWheelDelta(event), isSmallWheelDelta(event));
}

function isVerticalOnlyWheel(e: WheelEvent): boolean {
  return Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode)) < MIN_HORIZONTAL_SCROLL_ABS;
}

/** Horizontal movement dominates — ignores deltaX noise on predominantly vertical wheel ticks. */
function isPredominantHorizontalScroll(e: WheelEvent): boolean {
  const normX = Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode));
  const normY = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  return normX >= MIN_HORIZONTAL_SCROLL_ABS && normX > normY;
}

function isDiagonalScroll(e: WheelEvent): boolean {
  const normX = Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode));
  const normY = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  if (e.shiftKey || normX <= DIAGONAL_MIN_ABS || normY <= DIAGONAL_MIN_ABS) {
    return false;
  }
  const minAxis = Math.min(normX, normY);
  const maxAxis = Math.max(normX, normY);
  return minAxis / maxAxis >= DIAGONAL_AXIS_MIN_RATIO;
}

function emitDebugEntry(
  e: WheelEvent,
  dpr: number,
  mouseWheelBehavior: TMouseWheelBehavior,
  platform: EWheelIntentPlatform,
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

  const normDeltaX = normalizeWheelDelta(e.deltaX, e.deltaMode);
  const normDeltaY = normalizeWheelDelta(e.deltaY, e.deltaMode);

  debugLogger({
    mouseWheelBehavior,
    dpr,
    platform,
    input: {
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      deltaModeLabel: deltaModeLabel(e.deltaMode),
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    },
    normalized: {
      deltaX: normDeltaX,
      deltaY: normDeltaY,
      diagonalAxisRatio: formatDiagonalAxisRatio(Math.abs(normDeltaX), Math.abs(normDeltaY)),
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
 * | macOS integer PIXEL delta (trackpad)  | Pan  (I3/I5)    |
 * | Classic mouse wheel step (fractional) | Zoom/Pan (I4)*  |
 * | Rapid stream + small delta (other)    | Pan  (I3)       |
 * | Anything else (slow small vertical)   | Last intent (I5)|
 *
 * *I4 respects `mouseWheelBehavior`: `"scroll"` → Pan, `"zoom"` → Zoom.
 *
 * On macOS PIXEL mode, **integer** `deltaX`/`deltaY` → trackpad pan; **fractional** → mouse (I4).
 * See `docs/system/wheel-intent.md` for rationale and platform notes.
 */
export function createWheelIntentResolver(options?: TWheelIntentResolverOptions): TResolveWheelIntent {
  const profile = getWheelIntentPlatformProfile(resolveWheelIntentPlatform(options?.platform));
  let lastIntent: EWheelIntent = profile.ambiguousIntent;
  let lastTimestamp: number | null = null;
  let mouseWheelBurstUntil: number | null = null;

  const markMouseWheelBurst = (now: number): void => {
    mouseWheelBurstUntil = now + MOUSE_WHEEL_BURST_MS;
  };

  const isInMouseWheelBurst = (now: number): boolean => mouseWheelBurstUntil !== null && now <= mouseWheelBurstUntil;

  return (e: WheelEvent, dpr: number, mouseWheelBehavior: TMouseWheelBehavior): EWheelIntent => {
    const now = performance.now();
    const timeSince = lastTimestamp !== null ? now - lastTimestamp : Number.POSITIVE_INFINITY;
    lastTimestamp = now;

    const isRapidStream = timeSince < RAPID_STREAM_MS;
    const inMouseWheelBurst = isInMouseWheelBurst(now);
    const mouseWheelBurstRemainingMs = mouseWheelBurstUntil !== null ? Math.max(0, mouseWheelBurstUntil - now) : null;

    const hasFractionalDelta = hasFractionalWheelDelta(e);
    const isSmallDelta = isSmallWheelDelta(e);
    const lastIntentBefore = lastIntent;

    const signals: TWheelIntentDebugEntry["signals"] = {
      isPinchZoom: isPinchZoomWheelEvent(e, hasFractionalDelta, isSmallDelta),
      isDiagonalScroll: isDiagonalScroll(e),
      isPredominantHorizontalScroll: isPredominantHorizontalScroll(e),
      isClassicMouseWheelStep: isClassicMouseWheelStep(e, profile, hasFractionalDelta),
      isDominantAxisLargeWheel: isDominantAxisLargeWheel(e),
      isVerticalOnly: isVerticalOnlyWheel(e),
      hasFractionalDelta,
      isSmallDelta,
    };

    let intent: EWheelIntent;
    let rule: string;

    if (signals.isPinchZoom) {
      intent = EWheelIntent.Zoom;
      rule = "I1:pinch";
    } else if (signals.isDiagonalScroll || signals.isPredominantHorizontalScroll) {
      intent = EWheelIntent.Pan;
      rule = "I2:horizontal-or-diagonal";
    } else if (isMacOsIntegerTrackpadScroll(e, profile, isRapidStream, isSmallDelta, signals.isVerticalOnly)) {
      intent = EWheelIntent.Pan;
      rule = isRapidStream ? "I3:integer-trackpad" : "I5:integer-trackpad";
    } else if (signals.isDominantAxisLargeWheel || signals.isClassicMouseWheelStep) {
      intent = mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
      rule = signals.isClassicMouseWheelStep ? "I4:mouse-wheel-step" : "I4:large-step";
      markMouseWheelBurst(now);
    } else if (isTrackpadLikeRapidSmall(e, isRapidStream, profile)) {
      if (inMouseWheelBurst && signals.isVerticalOnly) {
        intent = mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
        rule = "I4-burst:smoothing";
        markMouseWheelBurst(now);
      } else {
        intent = EWheelIntent.Pan;
        rule = "I3:rapid-small";
      }
    } else if (
      isMacOsSlowFractionalMouseWheelStep(
        e,
        profile,
        isRapidStream,
        inMouseWheelBurst,
        hasFractionalDelta,
        isSmallDelta,
        signals.isVerticalOnly
      )
    ) {
      intent = mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
      rule = "I4:macos-fractional-mouse";
      markMouseWheelBurst(now);
    } else {
      intent = lastIntent;
      rule = "I5:last-intent";
    }

    lastIntent = intent;
    if (getWheelIntentDebugLogger() !== null) {
      emitDebugEntry(
        e,
        dpr,
        mouseWheelBehavior,
        profile.platform,
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

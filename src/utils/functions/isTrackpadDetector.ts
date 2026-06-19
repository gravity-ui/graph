export type TMouseWheelBehavior = "zoom" | "scroll";

/** Wheel input intent for camera routing (pan vs zoom). */
export enum EWheelIntent {
  Pan = "pan",
  Zoom = "zoom",
}

/**
 * Classifies a wheel event as pan or zoom intent.
 * Configured as `resolveWheelIntent` on graph settings (`TGraphSettingsConfig`).
 */
export type TResolveWheelIntent = (
  event: WheelEvent,
  dpr: number,
  mouseWheelBehavior: TMouseWheelBehavior
) => EWheelIntent;

/** Snapshot of every signal and the winning rule for one WheelEvent — emitted when debug is enabled. */
export type TWheelDeviceDebugEntry = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  timeSinceLastMs: number;
  isRapidStream: boolean;
  isColdStart: boolean;
  hasFractionalDelta: boolean;
  isSmallDelta: boolean;
  isDominantAxisLargeWheel: boolean;
  isVerticalOnly: boolean;
  rule: string;
  result: EWheelIntent;
};

export type TWheelDeviceDebugLogger = (entry: TWheelDeviceDebugEntry) => void;

/** Module-level slot: set via {@link enableWheelDeviceDebug}. */
let _debugLogger: TWheelDeviceDebugLogger | null = defaultDebugLogger;

function defaultDebugLogger(entry: TWheelDeviceDebugEntry): void {
  const mode = ["PIXEL", "LINE", "PAGE"][entry.deltaMode] ?? entry.deltaMode;
  const flags = [
    entry.isRapidStream ? "rapid" : "slow",
    entry.isColdStart ? "cold" : "warm",
    entry.hasFractionalDelta ? "frac" : "int",
    entry.isSmallDelta ? "small" : "large",
    entry.isDominantAxisLargeWheel ? "domAxis" : "",
    entry.isVerticalOnly ? "vertOnly" : "",
  ]
    .filter(Boolean)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(
    `[wheel-device] Δx=${entry.deltaX.toFixed(2)} Δy=${entry.deltaY.toFixed(2)} ${mode} +${Math.round(entry.timeSinceLastMs)}ms | ${flags} → ${entry.rule} → ${entry.result}`
  );
}

/**
 * Enables per-event debug logging for the global {@link isTrackpadWheelEvent} detector.
 *
 * @example
 * // In the browser console:
 * import { enableWheelDeviceDebug } from "@gravity-ui/graph";
 * enableWheelDeviceDebug();         // default console.debug output
 * enableWheelDeviceDebug(entry => myTelemetry.record(entry)); // custom logger
 * enableWheelDeviceDebug(null);     // disable
 */
export function enableWheelDeviceDebug(logger: TWheelDeviceDebugLogger | null = defaultDebugLogger): void {
  _debugLogger = logger;
}

// Time in milliseconds to keep trackpad detection state
const TRACKPAD_DETECTION_STATE_TIMEOUT = 60_000; // 1 minute

/** Events closer than this are treated as a continuous stream (typical trackpad / inertia). */
const TRACKPAD_HIGH_FREQUENCY_MS = 38;

/** Minimum absolute delta on both axes to count as diagonal scroll (trackpad-like). */
const TRACKPAD_DIAGONAL_MIN_ABS = 2;

/** Ignore sub-pixel horizontal noise (deltaX=1) for horizontal-only trackpad detection. */
const MIN_HORIZONTAL_SCROLL_ABS = 2;

const SMALL_DELTA_THRESHOLD = 50;

/** If |deltaX| is below this, treat scroll as vertical-only (mouse wheel reports deltaY only). */
const VERTICAL_ONLY_DELTA_X_EPSILON = 0.5;

/**
 * Wider threshold for the rapid-stream rule only: some mice/drivers emit deltaX=1 on vertical scroll;
 * real trackpad two-finger scroll usually has |deltaX| >= 2 on many events.
 */
const VERTICAL_ONLY_FOR_RAPID_STREAM_EPSILON = 1.5;

/** After this gap without wheel events, treat the next as a cold start (no stream context). */
const STREAM_COLD_START_MS = 3_000;

/**
 * After H8 self-correction (large non-rapid step clears trackpad state), stay in "mouse confirmed"
 * mode for this duration. In this mode, weak trackpad signals (H4a, H4c, H6, H7) are suppressed —
 * only definitive signals (H1 pinch, H2 diagonal, H3 rapid stream, H5 horizontal) can re-enter
 * trackpad mode. This prevents smooth-scroll mouse from oscillating back to trackpad on every new
 * cold-start gesture once H8 has identified it as a mouse.
 */
const MOUSE_CONFIRMED_TIMEOUT_MS = 30_000;

/** Approximate pixel equivalent of one scroll LINE (WheelEvent.deltaMode === 1). */
const LINE_TO_PIXEL_APPROX = 16;

/** Approximate pixel equivalent of one scroll PAGE (WheelEvent.deltaMode === 2). */
const PAGE_TO_PIXEL_APPROX = 600;

/**
 * Converts a wheel delta value to approximate pixel units.
 * WheelEvent.deltaMode: 0 = PIXEL, 1 = LINE, 2 = PAGE.
 * All magnitude thresholds (SMALL_DELTA_THRESHOLD etc.) are in pixel units, so normalizing
 * before comparisons ensures consistent behavior across platforms and browsers.
 */
function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_TO_PIXEL_APPROX;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * PAGE_TO_PIXEL_APPROX;
  return delta;
}

function isVerticalOnlyWheelEvent(e: WheelEvent): boolean {
  return Math.abs(e.deltaX) < VERTICAL_ONLY_DELTA_X_EPSILON;
}

function isVerticalOnlyForRapidStreamRule(e: WheelEvent): boolean {
  return Math.abs(e.deltaX) < VERTICAL_ONLY_FOR_RAPID_STREAM_EPSILON;
}

/** One axis dominates (large step), the other ~0 — typical mouse wheel (vertical or horizontal). */
function isDominantAxisLargeWheel(e: WheelEvent): boolean {
  const ax = Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode));
  const ay = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  // Minor-axis check uses the raw (pre-normalization) value so that LINE-mode events
  // (which are always integers) only pass when the axis is strictly zero, not just "small".
  return (
    (ax >= SMALL_DELTA_THRESHOLD && Math.abs(e.deltaY) < 0.5) ||
    (ay >= SMALL_DELTA_THRESHOLD && Math.abs(e.deltaX) < 0.5)
  );
}

function hasFractionalWheelDelta(e: WheelEvent): boolean {
  // LINE (1) and PAGE (2) modes always deliver integer values in their native units;
  // sub-pixel fractions that distinguish precision trackpads only appear in PIXEL (0) mode.
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  // Check only raw values. Multiplying by DPR before the integer test was intended to catch
  // sub-pixel precision at non-1x DPR, but it produces false positives on Windows at
  // non-integer OS scaling (e.g. 110 % → DPR ≈ 1.1): an ordinary mouse wheel with an
  // integer delta of 3 becomes 3.3 after scaling, wrongly flagging the event as fractional.
  return !Number.isInteger(e.deltaY) || !Number.isInteger(e.deltaX);
}

function isSmallWheelDelta(e: WheelEvent): boolean {
  return (
    Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode)) < SMALL_DELTA_THRESHOLD &&
    Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode)) < SMALL_DELTA_THRESHOLD
  );
}

function isPinchTrackpadGesture(e: WheelEvent, hasFractionalDelta: boolean, isSmallDelta: boolean): boolean {
  return (e.ctrlKey || e.metaKey) && (hasFractionalDelta || isSmallDelta);
}

function isDiagonalTrackpadScroll(e: WheelEvent): boolean {
  const normX = Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode));
  const normY = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  return !e.shiftKey && normX > TRACKPAD_DIAGONAL_MIN_ABS && normY > TRACKPAD_DIAGONAL_MIN_ABS;
}

/**
 * Returns true if the device likely has a trackpad or touchscreen (navigator.maxTouchPoints > 0).
 * Used as a soft disambiguation signal — not reliable alone, since a desktop with a touchscreen
 * also returns true — but combined with small-delta checks it significantly reduces false negatives
 * for Windows / Linux precision touchpads while preserving macOS smooth-scroll-mouse accuracy.
 */
function hasPointerOrTouchDevice(): boolean {
  return (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
}

/**
 * Strong per-event / stream signals that indicate trackpad (before sticky-session fallback).
 * Returns a rule-name string when a trackpad signal is detected, `false` otherwise.
 * The string is truthy and also carries the specific heuristic for debug logging.
 */
function hasStrongTrackpadSignals(
  e: WheelEvent,
  hasFractionalDelta: boolean,
  isSmallDelta: boolean,
  isRapidStream: boolean,
  isMouseRecentlyConfirmed: boolean
): string | false {
  if (isPinchTrackpadGesture(e, hasFractionalDelta, isSmallDelta)) {
    return "H1:pinch";
  }
  if (isDiagonalTrackpadScroll(e)) {
    return "H2:diagonal";
  }
  // Large one-axis steps in a tight stream are still mouse smooth-scroll, not trackpad inertia.
  if (isRapidStream && (isSmallDelta || (hasFractionalDelta && !isDominantAxisLargeWheel(e)))) {
    // Clear horizontal component in rapid stream → strong trackpad signal.
    if (!isVerticalOnlyForRapidStreamRule(e)) {
      return "H3a:rapid-horizontal";
    }
    // Vertical-dominant rapid stream:
    //   integer deltas      → trackpad (macOS trackpad with integer pixel driver)
    //   fractional + small  → trackpad (macOS trackpad or Precision Touchpad)
    //   fractional + large  → smooth mouse scroll (Logitech MX etc.)
    // Note: hasPointerOrTouchDevice() is intentionally omitted here because macOS reports
    // maxTouchPoints=0 even with a Magic Trackpad / built-in trackpad (no touchscreen),
    // making the touch-capability check a false negative for the most common trackpad platform.
    if (!hasFractionalDelta) return "H3b:rapid-vertical-integer";
    if (isSmallDelta) return "H3b:rapid-vertical-small";
    return false;
  }
  // H4a / H4c: weak signals that fire for smooth-scroll mice too (small fractional events during
  // scroll acceleration look identical to slow trackpad scroll on macOS). Skip them when H8 has
  // recently confirmed a mouse — only definitive signals (H1-H3, H5) can re-enter trackpad mode.
  if (!isMouseRecentlyConfirmed && hasFractionalDelta) {
    if (isVerticalOnlyWheelEvent(e)) {
      // Large vertical fractional → smooth mouse scroll (momentum wheel on macOS / Windows).
      // Small vertical fractional → trackpad (macOS trackpad, Windows/Linux Precision Touchpad).
      // Note: macOS reports maxTouchPoints=0 even with trackpad, so hasPointerOrTouchDevice()
      // is not a reliable signal here; isSmallDelta alone is the discriminator.
      return isSmallDelta ? "H4a:vertical-fractional-small" : false;
    }
    if (isDominantAxisLargeWheel(e)) {
      return false;
    }
    return "H4c:fractional-mixed";
  }
  if (
    Math.abs(normalizeWheelDelta(e.deltaX, e.deltaMode)) >= MIN_HORIZONTAL_SCROLL_ABS &&
    !e.shiftKey &&
    (isRapidStream || isSmallDelta)
  ) {
    return "H5:horizontal";
  }
  return false;
}

/**
 * Cold-start guard: returns true when the first event of a new gesture should be
 * optimistically classified as trackpad before any stream context is available.
 *
 * Fires when the event is either fractional or small AND the device is plausibly a
 * precision pointer (touch-capable OR PIXEL-mode). PIXEL mode covers macOS where
 * maxTouchPoints=0 even with a Magic Trackpad.
 *
 * LINE/PAGE-mode mice without touch capability are excluded — they report
 * e.deltaMode !== 0 and hasPointerOrTouchDevice()=false.
 */
function isColdStartTrackpadCandidate(
  e: WheelEvent,
  isColdStart: boolean,
  hasFractionalDelta: boolean,
  isSmallDelta: boolean,
  isMouseRecentlyConfirmed: boolean
): boolean {
  if (!isColdStart || isMouseRecentlyConfirmed) return false;
  return (hasFractionalDelta || isSmallDelta) && (hasPointerOrTouchDevice() || e.deltaMode === 0);
}

function checkMouseConfirmed(mouseConfirmedAt: number | null, now: number): boolean {
  return mouseConfirmedAt !== null && now - mouseConfirmedAt < MOUSE_CONFIRMED_TIMEOUT_MS;
}

/**
 * Returns true for signals that are unambiguous enough to override a recent mouse confirmation
 * and re-enter trackpad mode. Weak signals (H4a, H4c) are excluded — those fire for smooth-scroll
 * mice too, and would cause immediate re-entry after H8 clears mouse state.
 */
function isDefinitiveTrackpadSignal(rule: string): boolean {
  return rule === "H1:pinch" || rule === "H2:diagonal" || rule.startsWith("H3") || rule === "H5:horizontal";
}

function makeStickyRule(stickyRejected: boolean): string {
  return stickyRejected ? "H9:sticky-cleared→H7:sticky" : "H7:sticky";
}

function makeDefaultMouseRule(isMouseWheelStep: boolean): string {
  return isMouseWheelStep ? "H8:mouse-wheel-step" : "default:mouse";
}

function emitDebugEntry(
  e: WheelEvent,
  timeSinceLastWheel: number,
  isRapidStream: boolean,
  isColdStart: boolean,
  hasFractionalDelta: boolean,
  isSmallDelta: boolean,
  rule: string,
  result: boolean
): void {
  if (_debugLogger === null) return;
  _debugLogger({
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaMode: e.deltaMode,
    timeSinceLastMs: timeSinceLastWheel === Number.POSITIVE_INFINITY ? -1 : timeSinceLastWheel,
    isRapidStream,
    isColdStart,
    hasFractionalDelta,
    isSmallDelta,
    isDominantAxisLargeWheel: isDominantAxisLargeWheel(e),
    isVerticalOnly: isVerticalOnlyWheelEvent(e),
    rule,
    result: result ? EWheelIntent.Pan : EWheelIntent.Zoom,
  });
}

function tryClearStickyForMouseLikeVerticalFractional(
  e: WheelEvent,
  hasStrongSignals: boolean,
  isRapidStream: boolean,
  hasFractionalDelta: boolean,
  wasTrackpad: boolean,
  lastAt: number | null
): { trackpad: boolean; lastTime: number | null; rejected: boolean } {
  if (!wasTrackpad || lastAt === null || hasStrongSignals || !isVerticalOnlyWheelEvent(e) || !hasFractionalDelta) {
    return { trackpad: wasTrackpad, lastTime: lastAt, rejected: false };
  }
  const normDeltaY = Math.abs(normalizeWheelDelta(e.deltaY, e.deltaMode));
  const isSmallDelta = normDeltaY < SMALL_DELTA_THRESHOLD;
  // Clear sticky trackpad state only for the winding-down mouse inertia tail:
  // non-rapid + small delta is the hallmark of a momentum wheel coasting to a stop.
  // Do NOT clear for rapid + large — that pattern is ambiguous between a smooth-scroll
  // mouse (Logitech MX) and a vigorous vertical trackpad swipe; clearing on it causes
  // the detector to incorrectly drop trackpad state mid-gesture.
  if (!isRapidStream && isSmallDelta) {
    return { trackpad: false, lastTime: null, rejected: true };
  }
  return { trackpad: wasTrackpad, lastTime: lastAt, rejected: false };
}

/**
 * Creates a trackpad detection function that distinguishes between trackpad and mouse wheel events.
 *
 * Uses a hybrid of per-event and stream-based heuristics (similar to common canvas editors):
 *
 * - **Pinch-to-zoom**: wheel + Ctrl/Meta with small or fractional deltas.
 * - **Diagonal scroll**: meaningful delta on both axes at once (uncommon for a physical wheel).
 * - **High-frequency stream**: short intervals plus small/fractional deltas. When |deltaX| < 1.5 and the
 *   stream is rapid, integer deltas favor trackpad and fractional + small + touch-capable device
 *   favor Windows/Linux Precision Touchpad; large fractional favor smoothed mouse wheel.
 * - **Fractional deltas**: vertical-only small fractional on touch-capable devices → Windows/Linux
 *   Precision Touchpad; large vertical-only fractional → smooth mouse scroll (Logitech etc.).
 * - **Horizontal scroll**: requires normalized |deltaX| ≥ 2 and a rapid stream or small deltas.
 * - **deltaMode normalization**: LINE (×16) and PAGE (×600) deltas are converted to approximate
 *   pixel units before all magnitude comparisons, fixing detection on Linux/Firefox LINE-mode events.
 * - **Cold start**: on the first event or after 3 s of inactivity, small-delta events on
 *   touch-capable devices are optimistically classified as trackpad to prevent a spurious zoom
 *   on the opening gesture; a subsequent large mouse wheel step self-corrects.
 *
 * The detector keeps session state across events. Once a trackpad is detected, the result can
 * stay consistent for up to one minute before resetting (unless DPR changes or a discrete
 * mouse wheel step is observed).
 *
 * @returns A detection function that accepts WheelEvent and optional devicePixelRatio
 *
 * @example
 * ```typescript
 * const isTrackpad = isTrackpadDetector();
 *
 * element.addEventListener("wheel", (e) => {
 *   if (isTrackpad(e)) {
 *     // Trackpad scroll
 *   } else {
 *     // Mouse wheel
 *   }
 * });
 * ```
 */
function isTrackpadDetector() {
  let isTrackpadDetected = false;
  let lastDetectionTime: number | null = null;
  let lastDpr = 0;

  let lastWheelTimestamp: number | null = null;
  /** Timestamp set when H8 self-correction fires; suppresses weak signals (H4a/H6/H7) until
   *  a definitive trackpad signal (H1-H3, H5) resets it or the timeout expires. */
  // eslint-disable-next-line prefer-const
  let mouseConfirmedAt: number | null = null;

  const markAsTrackpad = (dpr: number, isDefinitive = false): void => {
    // Definitive signals (H1-H3, H5) reset the mouse-confirmed timestamp so H7 sticky
    // and H4a work normally after rapid-stream trackpad use, even if H8 fired earlier.
    if (isDefinitive) {
      mouseConfirmedAt = null;
    }
    isTrackpadDetected = true;
    lastDetectionTime = performance.now();
    lastDpr = dpr;
  };

  /**
   * Analyzes a wheel event to determine if it originated from a trackpad.
   *
   * @param e - The WheelEvent to analyze
   * @param dpr - Device pixel ratio for normalizing delta values. Defaults to window.devicePixelRatio.
   * @returns `true` if the event is from a trackpad, `false` if from a mouse wheel
   */
  return (e: WheelEvent, dpr: number = globalThis.devicePixelRatio || 1) => {
    const now = performance.now();
    const timeSinceLastWheel = lastWheelTimestamp !== null ? now - lastWheelTimestamp : Number.POSITIVE_INFINITY;
    const isRapidStream = timeSinceLastWheel < TRACKPAD_HIGH_FREQUENCY_MS;
    // No stream context on the very first event or after a long idle between gestures.
    const isColdStart = lastWheelTimestamp === null || timeSinceLastWheel > STREAM_COLD_START_MS;

    try {
      if (isTrackpadDetected && lastDetectionTime !== null) {
        if (now - lastDetectionTime >= TRACKPAD_DETECTION_STATE_TIMEOUT || lastDpr !== dpr) {
          isTrackpadDetected = false;
          lastDetectionTime = null;
        }
      }

      const hasFractionalDelta = hasFractionalWheelDelta(e);
      const isSmallDelta = isSmallWheelDelta(e);

      const isLikelyMouseWheelStep = !isRapidStream && isDominantAxisLargeWheel(e);

      if (isTrackpadDetected && isLikelyMouseWheelStep) {
        isTrackpadDetected = false;
        lastDetectionTime = null;
        // H8 self-correction: record that a mouse was confirmed. Subsequent weak signals
        // (H4a, H6, H7) are suppressed until a definitive trackpad signal resets this.
        mouseConfirmedAt = now;
      }

      const isMouseRecentlyConfirmed = checkMouseConfirmed(mouseConfirmedAt, now);
      const strongSignals = hasStrongTrackpadSignals(
        e,
        hasFractionalDelta,
        isSmallDelta,
        isRapidStream,
        isMouseRecentlyConfirmed
      );

      const stickyMouse = tryClearStickyForMouseLikeVerticalFractional(
        e,
        Boolean(strongSignals),
        isRapidStream,
        hasFractionalDelta,
        isTrackpadDetected,
        lastDetectionTime
      );
      if (stickyMouse.rejected) {
        isTrackpadDetected = stickyMouse.trackpad;
        lastDetectionTime = stickyMouse.lastTime;
      }

      let rule: string;
      let result: boolean;

      if (strongSignals) {
        // isDefinitiveTrackpadSignal check is inside markAsTrackpad — no extra branch here.
        markAsTrackpad(dpr, isDefinitiveTrackpadSignal(strongSignals));
        rule = strongSignals;
        result = true;
      } else if (
        isColdStartTrackpadCandidate(e, isColdStart, hasFractionalDelta, isSmallDelta, isMouseRecentlyConfirmed)
      ) {
        markAsTrackpad(dpr);
        rule = "H6:cold-start";
        result = true;
      } else if (isTrackpadDetected && lastDetectionTime !== null && !isMouseRecentlyConfirmed) {
        if (isSmallDelta) {
          lastDetectionTime = now;
        }
        rule = makeStickyRule(stickyMouse.rejected);
        result = true;
      } else {
        isTrackpadDetected = false;
        lastDetectionTime = null;
        rule = makeDefaultMouseRule(isLikelyMouseWheelStep);
        result = false;
      }

      emitDebugEntry(e, timeSinceLastWheel, isRapidStream, isColdStart, hasFractionalDelta, isSmallDelta, rule, result);

      return result;
    } finally {
      lastWheelTimestamp = now;
    }
  };
}

/**
 * Global trackpad detector instance for wheel events.
 *
 * Use this pre-configured detector to check if a wheel event originated from a trackpad
 * rather than a traditional mouse wheel. The detector maintains state across calls to provide
 * consistent results throughout a scroll session.
 *
 * @example
 * ```typescript
 * import { isTrackpadWheelEvent } from "./utils/functions";
 *
 * canvas.addEventListener("wheel", (event) => {
 *   if (isTrackpadWheelEvent(event)) {
 *     applyMomentumScrolling(event);
 *   } else {
 *     applySteppedScrolling(event);
 *   }
 * });
 * ```
 */
export const isTrackpadWheelEvent = isTrackpadDetector();

/**
 * Default `TResolveWheelIntent`: built-in heuristics from {@link isTrackpadWheelEvent}.
 *
 * Returns {@link EWheelIntent.Pan} for trackpad two-finger scroll or when `mouseWheelBehavior` is
 * `"scroll"`, and {@link EWheelIntent.Zoom} for trackpad pinch-to-zoom or mouse wheel zoom.
 */
export function defaultResolveWheelIntent(
  event: WheelEvent,
  dpr: number,
  mouseWheelBehavior: TMouseWheelBehavior
): EWheelIntent {
  const isTrackpad = isTrackpadWheelEvent(event, dpr);
  if (isTrackpad) {
    return event.ctrlKey || event.metaKey ? EWheelIntent.Zoom : EWheelIntent.Pan;
  }
  return mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
}

/**
 * Creates an intent-based wheel resolver — an alternative to the default
 * device-detection strategy.
 *
 * Instead of asking "which device produced this event?", this strategy asks
 * "what does the user want to do?" and reads the answer from the gesture shape:
 *
 * | Signal                                | Intent          |
 * |---------------------------------------|-----------------|
 * | ctrlKey / metaKey + scroll            | Zoom (I1)       |
 * | Horizontal or diagonal movement       | Pan  (I2)       |
 * | Rapid stream + small delta            | Pan  (I3)       |
 * | Large single-axis step, not rapid     | Zoom (I4)       |
 * | Anything else (slow small vertical)   | Last intent (I5)|
 *
 * The "last intent" fallback is the only state the strategy keeps — one bit,
 * no 60-second sticky windows, no device-type inference.
 *
 * **Trade-off:** a smooth-scroll mouse at low velocity produces events that fall
 * into I5 (ambiguous). If the previous event was pan, those events will pan too.
 * This is the same fundamental ambiguity as the device-detection strategy, just
 * expressed differently.
 *
 * @example
 * ```typescript
 * // Swap in for debugging / A-B testing:
 * graph.rootStore.settings.set({
 *   resolveWheelIntent: intentWheelDeviceDetector(),
 * });
 * ```
 */
export function intentWheelDeviceDetector(): TResolveWheelIntent {
  let lastIntent: EWheelIntent = EWheelIntent.Zoom;
  let lastTimestamp: number | null = null;

  return (e: WheelEvent, _dpr: number, mouseWheelBehavior: TMouseWheelBehavior): EWheelIntent => {
    const now = performance.now();
    const timeSince = lastTimestamp !== null ? now - lastTimestamp : Number.POSITIVE_INFINITY;
    lastTimestamp = now;

    const isRapid = timeSince < TRACKPAD_HIGH_FREQUENCY_MS;
    const hasFrac = hasFractionalWheelDelta(e);
    const isSmall = isSmallWheelDelta(e);

    let intent: EWheelIntent;

    if (isPinchTrackpadGesture(e, hasFrac, isSmall)) {
      // I1: explicit pinch-to-zoom gesture (ctrlKey synthesised by OS for trackpad pinch,
      // or ctrlKey held while scrolling with a mouse) → zoom
      intent = EWheelIntent.Zoom;
    } else if (isDiagonalTrackpadScroll(e) || Math.abs(e.deltaX) >= MIN_HORIZONTAL_SCROLL_ABS) {
      // I2: horizontal or diagonal movement → unambiguously pan
      intent = EWheelIntent.Pan;
    } else if (isRapid && isSmall) {
      // I3: rapid tight stream — the opening of a trackpad two-finger swipe
      intent = EWheelIntent.Pan;
    } else if (!isRapid && isDominantAxisLargeWheel(e)) {
      // I4: large single-axis non-rapid step — classic mouse wheel click
      intent = mouseWheelBehavior === "scroll" ? EWheelIntent.Pan : EWheelIntent.Zoom;
    } else {
      // I5: ambiguous (slow small vertical) — carry forward the last known intent
      intent = lastIntent;
    }

    lastIntent = intent;
    return intent;
  };
}

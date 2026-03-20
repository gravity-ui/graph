/** Wheel input class for camera routing (pan vs zoom/scroll). */
export enum EWheelDeviceKind {
  Trackpad = "trackpad",
  Mouse = "mouse",
}

/**
 * Classifies a wheel event as trackpad-like (two-finger / pinch semantics) or mouse wheel.
 * Configured as `resolveWheelDevice` on graph settings (`TGraphSettingsConfig`).
 */
export type TResolveWheelDevice = (event: WheelEvent) => EWheelDeviceKind;

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

function isVerticalOnlyWheelEvent(e: WheelEvent): boolean {
  return Math.abs(e.deltaX) < VERTICAL_ONLY_DELTA_X_EPSILON;
}

function isVerticalOnlyForRapidStreamRule(e: WheelEvent): boolean {
  return Math.abs(e.deltaX) < VERTICAL_ONLY_FOR_RAPID_STREAM_EPSILON;
}

/** One axis dominates (large step), the other ~0 — typical mouse wheel (vertical or horizontal). */
function isDominantAxisLargeWheel(e: WheelEvent): boolean {
  const ax = Math.abs(e.deltaX);
  const ay = Math.abs(e.deltaY);
  return (ax >= SMALL_DELTA_THRESHOLD && ay < 0.5) || (ay >= SMALL_DELTA_THRESHOLD && ax < 0.5);
}

function hasFractionalWheelDelta(e: WheelEvent, dpr: number): boolean {
  const normalizedDeltaY = e.deltaY * dpr;
  const normalizedDeltaX = e.deltaX * dpr;
  return (
    !Number.isInteger(e.deltaY) ||
    !Number.isInteger(e.deltaX) ||
    !Number.isInteger(normalizedDeltaY) ||
    !Number.isInteger(normalizedDeltaX)
  );
}

function isSmallWheelDelta(e: WheelEvent): boolean {
  return Math.abs(e.deltaY) < SMALL_DELTA_THRESHOLD && Math.abs(e.deltaX) < SMALL_DELTA_THRESHOLD;
}

function isPinchTrackpadGesture(e: WheelEvent, hasFractionalDelta: boolean, isSmallDelta: boolean): boolean {
  return (e.ctrlKey || e.metaKey) && (hasFractionalDelta || isSmallDelta);
}

function isDiagonalTrackpadScroll(e: WheelEvent): boolean {
  return (
    !e.shiftKey && Math.abs(e.deltaX) > TRACKPAD_DIAGONAL_MIN_ABS && Math.abs(e.deltaY) > TRACKPAD_DIAGONAL_MIN_ABS
  );
}

/**
 * Strong per-event / stream signals that indicate trackpad (before sticky-session fallback).
 */
function hasStrongTrackpadSignals(
  e: WheelEvent,
  hasFractionalDelta: boolean,
  isSmallDelta: boolean,
  isRapidStream: boolean
): boolean {
  if (isPinchTrackpadGesture(e, hasFractionalDelta, isSmallDelta)) {
    return true;
  }
  if (isDiagonalTrackpadScroll(e)) {
    return true;
  }
  // Large one-axis steps in a tight stream are still mouse smooth-scroll, not trackpad inertia.
  if (isRapidStream && (isSmallDelta || (hasFractionalDelta && !isDominantAxisLargeWheel(e)))) {
    // Clear horizontal component in rapid stream → strong trackpad signal.
    if (!isVerticalOnlyForRapidStreamRule(e)) {
      return true;
    }
    // Vertical-dominant (|deltaX| < 1.5): on many macOS setups trackpad reports integer pixel
    // deltas while smoothed mouse wheel uses fractional deltas — disambiguate long scroll here.
    return !hasFractionalDelta;
  }
  if (hasFractionalDelta) {
    // Vertical-only fractional deltas: mouse smooth scroll (Chrome/macOS); trackpad noise on X is common.
    if (isVerticalOnlyWheelEvent(e)) {
      return false;
    }
    if (isDominantAxisLargeWheel(e)) {
      return false;
    }
    return true;
  }
  if (Math.abs(e.deltaX) >= MIN_HORIZONTAL_SCROLL_ABS && !e.shiftKey && (isRapidStream || isSmallDelta)) {
    return true;
  }
  return false;
}

function tryClearStickyForMouseLikeVerticalFractional(
  e: WheelEvent,
  hasStrongSignals: boolean,
  isRapidStream: boolean,
  hasFractionalDelta: boolean,
  wasTrackpad: boolean,
  lastAt: number | null
): { trackpad: boolean; lastTime: number | null; rejected: boolean } {
  if (
    wasTrackpad &&
    lastAt !== null &&
    !hasStrongSignals &&
    isVerticalOnlyWheelEvent(e) &&
    !isRapidStream &&
    hasFractionalDelta &&
    Math.abs(e.deltaY) < SMALL_DELTA_THRESHOLD
  ) {
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
 *   stream is rapid, integer deltas favor trackpad and fractional deltas favor smoothed mouse wheel
 *   (observed on some macOS + Chrome setups; devices vary).
 * - **Fractional deltas**: only when there is horizontal component (|deltaX| ≥ 0.5); vertical-only
 *   fractional deltas are treated as mouse (Chrome/macOS smooth wheel). Dominant-axis large steps skip.
 * - **Horizontal scroll**: requires |deltaX| ≥ 2 and a rapid stream or small deltas (avoids deltaX=1 noise).
 *
 * The detector keeps session state across events. Once a trackpad is detected, the result can
 * stay consistent for up to one minute before resetting (unless DPR
 * changes or a discrete mouse wheel step is observed).
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

  const markAsTrackpad = (dpr: number): void => {
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

    try {
      if (isTrackpadDetected && lastDetectionTime !== null) {
        if (now - lastDetectionTime >= TRACKPAD_DETECTION_STATE_TIMEOUT || lastDpr !== dpr) {
          isTrackpadDetected = false;
          lastDetectionTime = null;
        }
      }

      const hasFractionalDelta = hasFractionalWheelDelta(e, dpr);
      const isSmallDelta = isSmallWheelDelta(e);

      const isLikelyMouseWheelStep = !isRapidStream && isDominantAxisLargeWheel(e);

      if (isTrackpadDetected && isLikelyMouseWheelStep) {
        isTrackpadDetected = false;
        lastDetectionTime = null;
      }

      const strongSignals = hasStrongTrackpadSignals(e, hasFractionalDelta, isSmallDelta, isRapidStream);

      const stickyMouse = tryClearStickyForMouseLikeVerticalFractional(
        e,
        strongSignals,
        isRapidStream,
        hasFractionalDelta,
        isTrackpadDetected,
        lastDetectionTime
      );
      if (stickyMouse.rejected) {
        isTrackpadDetected = stickyMouse.trackpad;
        lastDetectionTime = stickyMouse.lastTime;
      }

      if (strongSignals) {
        markAsTrackpad(dpr);
        return true;
      }

      if (isTrackpadDetected && lastDetectionTime !== null) {
        if (isSmallDelta) {
          lastDetectionTime = now;
        }
        return true;
      }

      isTrackpadDetected = false;
      lastDetectionTime = null;
      return false;
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

/** Default `TResolveWheelDevice`: built-in heuristics from {@link isTrackpadWheelEvent}. */
export function defaultResolveWheelDevice(event: WheelEvent): EWheelDeviceKind {
  return isTrackpadWheelEvent(event) ? EWheelDeviceKind.Trackpad : EWheelDeviceKind.Mouse;
}

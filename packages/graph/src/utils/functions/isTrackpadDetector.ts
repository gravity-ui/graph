// Time in milliseconds to keep trackpad detection state
const TRACKPAD_DETECTION_STATE_TIMEOUT = 60_000; // 1 minute

/**
 * Creates a trackpad detection function that distinguishes between trackpad and mouse wheel events.
 *
 * This factory function returns a detector that analyzes WheelEvent characteristics to determine
 * the input device type. The detection is based on several behavioral patterns:
 *
 * - **Pinch-to-zoom gestures**: Trackpads generate wheel events with modifier keys (Ctrl/Meta)
 *   and continuous (usually fractional) delta values.
 * - **Horizontal scrolling**: Trackpads naturally produce horizontal scroll events (deltaX),
 *   while mice typically only scroll vertically (unless Shift is pressed).
 * - **Continuous scrolling**: Trackpad scroll deltas are usually fractional or very small values,
 *   while mouse wheels produce discrete larger integer values (typically 100 or 120).
 *
 * The detector maintains state across events to provide consistent results during a scroll session.
 * Once a trackpad is detected, the state persists for 60 seconds before resetting.
 *
 * @returns A detection function that accepts WheelEvent and optional devicePixelRatio
 *
 * @example
 * ```typescript
 * const isTrackpad = isTrackpadDetector();
 *
 * element.addEventListener('wheel', (e) => {
 *   if (isTrackpad(e)) {
 *     console.log('Trackpad scroll detected');
 *   } else {
 *     console.log('Mouse wheel detected');
 *   }
 * });
 * ```
 */
function isTrackpadDetector() {
  let isTrackpadDetected = false;
  let lastDetectionTime: number | null = null;
  let lastDpr = 0;

  /**
   * Marks the current input device as trackpad and records the detection time.
   * This ensures consistent detection during continuous scroll operations.
   */
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
   *              This normalization accounts for browser zoom levels.
   * @returns `true` if the event is from a trackpad, `false` if from a mouse wheel
   */
  return (e: WheelEvent, dpr: number = globalThis.devicePixelRatio || 1) => {
    const now = performance.now();

    // Fast path: if we have valid cached detection state and DPR hasn't changed,
    // we already know it's a trackpad. We refresh the detection if we see more evidence below.
    if (isTrackpadDetected && lastDetectionTime !== null) {
      if (now - lastDetectionTime < TRACKPAD_DETECTION_STATE_TIMEOUT && lastDpr === dpr) {
        // We'll continue to check for new evidence to refresh the timeout
      } else {
        // State expired or DPR changed - need to re-evaluate
        isTrackpadDetected = false;
        lastDetectionTime = null;
      }
    }

    const normalizedDeltaY = e.deltaY * dpr;
    const normalizedDeltaX = e.deltaX * dpr;

    // Detection 1: Small or fractional deltas
    // Trackpads produce fractional values or very small integers.
    // Mouse produce large integers
    const hasFractionalDelta =
      !Number.isInteger(e.deltaY) ||
      !Number.isInteger(e.deltaX) ||
      !Number.isInteger(normalizedDeltaY) ||
      !Number.isInteger(normalizedDeltaX);

    const isSmallDelta = Math.abs(e.deltaY) < 50 && Math.abs(e.deltaX) < 50;

    // Detection 2: Pinch-to-zoom gesture
    // Trackpad pinch-to-zoom generates wheel events with ctrlKey or metaKey.
    // Combined with small or fractional deltas, this is a very strong indicator of trackpad.
    // Note: Mouse wheel with Ctrl pressed usually has large delta (e.g., 100).
    if ((e.ctrlKey || e.metaKey) && (hasFractionalDelta || isSmallDelta)) {
      markAsTrackpad(dpr);
      return true;
    }

    // Detection 3: Horizontal scroll (deltaX)
    // Trackpad naturally produces horizontal scroll events.
    // Note: When Shift is pressed, browsers swap deltaX and deltaY for mouse wheel,
    // so we skip this check to avoid false positives from mouse.
    if (normalizedDeltaX !== 0 && !e.shiftKey) {
      markAsTrackpad(dpr);
      return true;
    }

    // Detection 4: Smooth scrolling
    // If we have non-integer values, it's almost certainly a trackpad or high-precision scroll.
    if (hasFractionalDelta) {
      markAsTrackpad(dpr);
      return true;
    }

    // Fallback: If we already detected a trackpad recently, stay in trackpad mode
    // unless we see obvious mouse-like behavior (large integer deltas).
    if (isTrackpadDetected && lastDetectionTime !== null) {
      // If it's still small delta, refresh the timestamp to keep trackpad state alive
      if (isSmallDelta) {
        lastDetectionTime = now;
      }
      return true;
    }

    // No trackpad detected
    isTrackpadDetected = false;
    lastDetectionTime = null;
    return false;
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
 * import { isTrackpadWheelEvent } from './utils/functions';
 *
 * canvas.addEventListener('wheel', (event) => {
 *   if (isTrackpadWheelEvent(event)) {
 *     // Handle smooth trackpad scrolling
 *     applyMomentumScrolling(event);
 *   } else {
 *     // Handle discrete mouse wheel steps
 *     applySteppedScrolling(event);
 *   }
 * });
 * ```
 */
export const isTrackpadWheelEvent = isTrackpadDetector();

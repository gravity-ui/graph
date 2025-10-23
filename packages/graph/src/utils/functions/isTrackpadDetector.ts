// Time in milliseconds to keep trackpad detection state
const TRACKPAD_DETECTION_STATE_TIMEOUT = 60_000; // 1 minute

/**
 * Creates a trackpad detection function that distinguishes between trackpad and mouse wheel events.
 *
 * This factory function returns a detector that analyzes WheelEvent characteristics to determine
 * the input device type. The detection is based on several behavioral patterns:
 *
 * - **Pinch-to-zoom gestures**: Trackpads generate wheel events with modifier keys (Ctrl/Meta)
 *   and continuous (non-integer) delta values
 * - **Horizontal scrolling**: Trackpads naturally produce horizontal scroll events (deltaX),
 *   while mice typically only scroll vertically
 * - **Continuous scrolling**: Trackpad scroll deltas are usually fractional values, while mouse
 *   wheels produce discrete integer values
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
  let cleanStateTimer: number | null = null;

  /**
   * Marks the current input device as trackpad and resets the state timeout.
   * This ensures consistent detection during continuous scroll operations.
   */
  const markAsTrackpad = (): void => {
    isTrackpadDetected = true;
    clearTimeout(cleanStateTimer);
    cleanStateTimer = setTimeout(() => {
      isTrackpadDetected = false;
    }, TRACKPAD_DETECTION_STATE_TIMEOUT) as unknown as number;
  };

  /**
   * Analyzes a wheel event to determine if it originated from a trackpad.
   *
   * @param e - The WheelEvent to analyze
   * @param dpr - Device pixel ratio for normalizing delta values. Defaults to window.devicePixelRatio.
   *              This normalization accounts for browser zoom levels to improve detection accuracy.
   * @returns `true` if the event is from a trackpad, `false` if from a mouse wheel
   */
  return (e: WheelEvent, dpr: number = globalThis.devicePixelRatio || 1) => {
    const normalizedDeltaY = e.deltaY * dpr;
    const normalizedDeltaX = e.deltaX * dpr;
    const hasFractionalDelta = normalizedDeltaY && !Number.isInteger(normalizedDeltaY);

    // Detection 1: Pinch-to-zoom gesture
    // Trackpad pinch-to-zoom generates wheel events with ctrlKey or metaKey.
    // Combined with non-integer deltaY, this is a strong indicator of trackpad.
    const isPinchToZoomGesture = (e.ctrlKey || e.metaKey) && hasFractionalDelta;
    if (isPinchToZoomGesture) {
      markAsTrackpad();
      return true;
    }

    // Detection 2: Horizontal scroll (deltaX)
    // Trackpad naturally produces horizontal scroll events.
    // Note: When Shift is pressed, browser swaps deltaX and deltaY for mouse wheel,
    // so we skip this check to avoid false positives.
    const hasHorizontalScroll = normalizedDeltaX !== 0;
    const isShiftPressed = e.shiftKey;
    if (hasHorizontalScroll && !isShiftPressed) {
      markAsTrackpad();
      return true;
    }

    // Detection 3: Fractional deltaY (mouse produces integer values)
    // If we have non-integer deltaY without ctrl/meta keys, it's likely NOT trackpad
    // (could be browser zoom or other factors), so we explicitly return false.
    if (hasFractionalDelta) {
      return false;
    }

    // Fallback: Return previously detected state
    // This helps maintain consistency across rapid scroll events.
    return isTrackpadDetected;
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

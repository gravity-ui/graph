/**
 * Touch utilities for handling touch events and gestures
 */

/**
 * Detects if the device supports touch events
 * @returns {boolean} True if the device supports touch events
 */
export function isTouchDevice(): boolean {
  return (
    navigator.maxTouchPoints > 0 ||
    typeof (window as unknown as { DocumentTouch?: unknown }).DocumentTouch !== "undefined"
  );
}

/**
 * Extracts page coordinates from mouse or touch event
 * @param {MouseEvent | TouchEvent} event - The input event
 * @returns {object} Page coordinates with pageX and pageY properties
 */
export function getEventPageCoordinates(event: MouseEvent | TouchEvent): { pageX: number; pageY: number } {
  if ("touches" in event) {
    const touch = event.touches[0] || event.changedTouches[0];
    return { pageX: touch.pageX, pageY: touch.pageY };
  }
  return { pageX: event.pageX, pageY: event.pageY };
}

/**
 * Extracts client coordinates from mouse or touch event
 * @param {MouseEvent | TouchEvent} event - The input event
 * @returns {object} Client coordinates with clientX and clientY properties
 */
export function getEventClientCoordinates(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } {
  if ("touches" in event) {
    const touch = event.touches[0] || event.changedTouches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  return { clientX: event.clientX, clientY: event.clientY };
}

/**
 * Calculates distance between two touch points
 * @param {TouchEvent} event - Touch event with at least 2 touches
 * @returns {number} Distance between first two touch points
 */
export function getTouchDistance(event: TouchEvent): number {
  if (event.touches.length < 2) return 0;

  const touch1 = event.touches[0];
  const touch2 = event.touches[1];

  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates center point between two touches
 * @param {TouchEvent} event - Touch event with at least 2 touches
 * @returns {object} Center coordinates with x and y properties
 */
export function getTouchCenter(event: TouchEvent): { x: number; y: number } {
  if (event.touches.length < 2) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  const touch1 = event.touches[0];
  const touch2 = event.touches[1];

  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

/**
 * Prevents default touch behavior for multi-touch events
 * @param {TouchEvent} event - Touch event
 * @param {number} minTouches - Minimum number of touches to prevent default (default: 2)
 * @returns {void}
 */
export function preventDefaultForMultiTouch(event: TouchEvent, minTouches = 2): void {
  if (event.touches.length >= minTouches) {
    event.preventDefault();
  }
}

/**
 * Checks if the event is a multi-touch event
 * @param {TouchEvent} event - Touch event
 * @param {number} minTouches - Minimum number of touches to consider multi-touch (default: 2)
 * @returns {boolean} True if it's a multi-touch event
 */
export function isMultiTouch(event: TouchEvent, minTouches = 2): boolean {
  return event.touches.length >= minTouches;
}

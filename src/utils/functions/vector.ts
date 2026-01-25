import { TPoint } from "../types/shapes";

/**
 * Calculate Euclidean distance between two points
 *
 * @param p1 First point
 * @param p2 Second point
 * @returns Distance between the points
 *
 * @example
 * ```typescript
 * const distance = vectorDistance({ x: 0, y: 0 }, { x: 3, y: 4 });
 * console.log(distance); // 5
 * ```
 */
export function vectorDistance(p1: TPoint, p2: TPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared Euclidean distance between two points
 * Faster than vectorDistance as it avoids the square root operation
 * Useful for comparisons where the actual distance value is not needed
 *
 * @param p1 First point
 * @param p2 Second point
 * @returns Squared distance between the points
 *
 * @example
 * ```typescript
 * const distSq = vectorDistanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 });
 * console.log(distSq); // 25
 *
 * // Useful for distance comparisons without sqrt
 * if (vectorDistanceSquared(p1, p2) < threshold * threshold) {
 *   // Point is within threshold
 * }
 * ```
 */
export function vectorDistanceSquared(p1: TPoint, p2: TPoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

/**
 * Generates a smooth curve through a series of points with adjustable corner rounding.
 *
 * This function creates a `Path2D` object representing a curved line passing through the provided points.
 * The curve's corners are rounded based on the specified radius, which is dynamically adjusted
 * to fit between points and scaled according to the angle between segments.
 *
 * @param {Array<{x: number, y: number}>} points - The array of points through which the curve will pass.
 * Each point should be an object with `x` and `y` properties.
 *
 * @param {number} baseRadius - The base radius for rounding corners. The actual radius is adjusted
 * dynamically to ensure it fits between points and scales proportionally to the angle between segments.
 *
 * @returns {Path2D} A `Path2D` object representing the smoothed curve.
 *
 * @example
 * const points = [
 *   { x: 0, y: 0 },
 *   { x: 50, y: 100 },
 *   { x: 100, y: 50 },
 *   { x: 150, y: 150 },
 * ];
 * const radius = 20;
 * const path = curvePolyline(points, radius);
 * ctx.stroke(path);
 *
 * @remarks
 * - If the angle between segments is close to 180°, the rounding will be minimal.
 * - The radius is automatically reduced if it cannot fit between points.
 * - For two points, the function creates a straight line instead of a curve.
 */
export function curvePolyline(points: { x: number; y: number }[], baseRadius: number): Path2D {
  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const prevPoint = points[i - 1];
    const currPoint = points[i];
    const nextPoint = points[i + 1];

    const vectorPrev = {
      x: currPoint.x - prevPoint.x,
      y: currPoint.y - prevPoint.y,
    };
    const vectorNext = {
      x: nextPoint.x - currPoint.x,
      y: nextPoint.y - currPoint.y,
    };

    const lenPrev = Math.hypot(vectorPrev.x, vectorPrev.y);
    const lenNext = Math.hypot(vectorNext.x, vectorNext.y);

    const unitVecPrev = {
      x: vectorPrev.x / lenPrev,
      y: vectorPrev.y / lenPrev,
    };
    const unitVecNext = {
      x: vectorNext.x / lenNext,
      y: vectorNext.y / lenNext,
    };

    // angle between points
    const dotProduct = unitVecPrev.x * unitVecNext.x + unitVecPrev.y * unitVecNext.y;
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

    // Adjust raduis to prevent this problem
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arcTo#result_of_a_large_radius
    let adjustedRadius = Math.min(baseRadius, (angle / Math.PI) * baseRadius);
    const maxRadius = Math.min(lenPrev / 2, lenNext / 2);
    adjustedRadius = Math.min(adjustedRadius, maxRadius);

    // Координаты для начала и конца дуги
    const startArcX = currPoint.x - unitVecPrev.x * adjustedRadius;
    const startArcY = currPoint.y - unitVecPrev.y * adjustedRadius;

    const endArcX = currPoint.x + unitVecNext.x * adjustedRadius;
    const endArcY = currPoint.y + unitVecNext.y * adjustedRadius;

    path.lineTo(startArcX, startArcY);

    if (angle < Math.PI - 0.01) {
      path.arcTo(currPoint.x, currPoint.y, endArcX, endArcY, adjustedRadius);
    }
  }

  path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  return path;
}

import { clamp } from "../functions/clamp";

/**
 * Creates a Path2D object that represents a triangle pointing towards the direction defined by
 * two points, with its tip at a parameterized position along the line and a given height and base width.
 *
 * @param {Object} start - The starting point of the vector.
 * @param {Object} end - The ending point of the vector.
 * @param {number} [height=10] - The height of the triangle from the base to the tip.
 * @param {number} [baseWidth=5] - The width of the triangle's base.
 * @param {number} [t=1] - A parameter [0, 1] that determines where the tip of the triangle is placed along the line. 0 - start point, 1 - end point
 * @returns {Path2D} The Path2D object representing the triangle.
 */
export function trangleArrowForVector(
  start: { x: number; y: number },
  end: { x: number; y: number },
  height = 10,
  baseWidth = 5,
  t = 1
): Path2D {
  const normalizedT = clamp(t, 0, 1);
  // Calculate the tip of the triangle on the line between start and end
  const tipx = (1 - normalizedT) * start.x + normalizedT * end.x;
  const tipy = (1 - normalizedT) * start.y + normalizedT * end.y;

  // Calculate the angle direction from start to end
  const lineAngle = Math.atan2(end.y - start.y, end.x - start.x);

  // Positions for the midpoint of the base, offset backward by the height from the tip
  const baseMidX = tipx - Math.cos(lineAngle) * height;
  const baseMidY = tipy - Math.sin(lineAngle) * height;

  // Half of the base width
  const baseHalfWidth = baseWidth / 2;

  // Calculate angles perpendicular to the line to formulate the end points of the base
  const leftAngle = lineAngle + Math.PI / 2;
  const rightAngle = lineAngle - Math.PI / 2;

  // Position of the left base point
  const leftx = baseMidX + Math.cos(leftAngle) * baseHalfWidth;
  const lefty = baseMidY + Math.sin(leftAngle) * baseHalfWidth;

  // Position of the right base point
  const rightx = baseMidX + Math.cos(rightAngle) * baseHalfWidth;
  const righty = baseMidY + Math.sin(rightAngle) * baseHalfWidth;

  const trianglePath = new Path2D();
  trianglePath.moveTo(tipx, tipy); // Tip of the triangle
  trianglePath.lineTo(leftx, lefty); // Left point of the base
  trianglePath.lineTo(rightx, righty); // Right point of the base
  trianglePath.closePath();

  return trianglePath;
}

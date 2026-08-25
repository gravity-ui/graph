export function polyline(points: { x: number; y: number }[]) {
  const path = new Path2D();
  if (!points.length) {
    return path;
  }
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i].x, points[i].y);
  }

  return path;
}

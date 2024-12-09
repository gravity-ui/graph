export function polyline(points: {x: number, y: number}[]) {
    const path = new Path2D();
    let i = 0;
    path.moveTo(points[0].x, points[0].y);
    for (i = 1; i < points.length; i++) {
        path.lineTo(points[i].x, points[i].y);
    }

    return path;
}

export function curve(points: {x: number, y: number}[], radius: number) {
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);

    if(points.length === 2) {
        path.lineTo(points[1].x, points[1].y);
        return path;
    }
 
    for (let i = 1; i < points.length - 1; i++) {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      const nextPoint = points[i + 1];
 
      const vectorPrev = {
        x: currPoint.x - prevPoint.x,
        y: currPoint.y - prevPoint.y
      };
      const vectorNext = {
        x: nextPoint.x - currPoint.x,
        y: nextPoint.y - currPoint.y
      };
 
      const lenPrev = Math.hypot(vectorPrev.x, vectorPrev.y);
      const lenNext = Math.hypot(vectorNext.x, vectorNext.y);
 
      const unitVecPrev = {
        x: vectorPrev.x / lenPrev,
        y: vectorPrev.y / lenPrev
      };
      const unitVecNext = {
        x: vectorNext.x / lenNext,
        y: vectorNext.y / lenNext
      };
 
      const startArcX = currPoint.x - unitVecPrev.x * radius;
      const startArcY = currPoint.y - unitVecPrev.y * radius;
 
      const endArcX = currPoint.x + unitVecNext.x * radius;
      const endArcY = currPoint.y + unitVecNext.y * radius;
 
      path.lineTo(startArcX, startArcY);
 
      path.arcTo(currPoint.x, currPoint.y, endArcX, endArcY, radius);
    }
 
    // Последний сегмент линии
    path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    return path;
}

export function getElkArrowCoords(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    height = 8,
  ) {
    const angle = Math.PI / 4;

    const x = x2;
    const y = y2;
    const lineangle = Math.atan2(y2 - y1, x2 - x1);
  
    // h is the line length of a side of the arrow head
    const h = Math.abs(height / Math.cos(angle));
  
    const angle1 = lineangle + Math.PI + angle;
    const topx = x + Math.cos(angle1) * h;
    const topy = y + Math.sin(angle1) * h;
  
    const angle2 = lineangle + Math.PI - angle;
    const botx = x + Math.cos(angle2) * h;
    const boty = y + Math.sin(angle2) * h;

    const trianglePath = new Path2D();
    trianglePath.moveTo(topx, topy);      // Вершина треугольника
    trianglePath.lineTo(x, y);  // Левая точка основания
    trianglePath.lineTo(botx, boty);  // Правая точка основания
    trianglePath.closePath();
  
    return trianglePath;
  }
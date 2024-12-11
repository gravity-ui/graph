// export function trangleArrowForVector(start: { x: number; y: number }, end: { x: number; y: number }, height = 8) {
//   const angle = Math.PI / 4;

//   const x = end.x;
//   const y = end.y;
//   const lineangle = Math.atan2(end.y - start.y, end.x - start.x);

//   // h is the line length of a side of the arrow head
//   const h = Math.abs(height / Math.cos(angle));

//   const angle1 = lineangle + Math.PI + angle;
//   const topx = x + Math.cos(angle1) * h;
//   const topy = y + Math.sin(angle1) * h;

//   const angle2 = lineangle + Math.PI - angle;
//   const botx = x + Math.cos(angle2) * h;
//   const boty = y + Math.sin(angle2) * h;

//   const trianglePath = new Path2D();
//   trianglePath.moveTo(topx, topy); // Вершина треугольника
//   trianglePath.lineTo(x, y); // Левая точка основания
//   trianglePath.lineTo(botx, boty); // Правая точка основания
//   trianglePath.closePath();

//   return trianglePath;
// }

// export function trangleArrowForVector(
//   start: { x: number; y: number },
//   end: { x: number; y: number },
//   height = 10,
//   baseWidth = 5
// ) {
//   const angle = Math.PI / 4;

//   const x = end.x;
//   const y = end.y;
//   const lineangle = Math.atan2(end.y - start.y, end.x - start.x);

//   // h is the line length from the tip to the base along the direction of the arrow
//   const h = Math.abs(height / Math.cos(angle));
//   // bw is half of the width of the base of the triangle
//   const bw = baseWidth / 2;

//   // Calculate top point of the triangle
//   const angle1 = lineangle + Math.PI + angle;
//   const topx = x + Math.cos(angle1) * h;
//   const topy = y + Math.sin(angle1) * h;

//   // Calculate bottom left point of the base
//   const angle2 = lineangle + Math.PI / 2;
//   const leftx = x + Math.cos(angle2) * bw;
//   const lefty = y + Math.sin(angle2) * bw;

//   // Calculate bottom right point of the base
//   const angle3 = lineangle - Math.PI / 2;
//   const rightx = x + Math.cos(angle3) * bw;
//   const righty = y + Math.sin(angle3) * bw;

//   const trianglePath = new Path2D();
//   trianglePath.moveTo(topx, topy); // Вершина треугольника
//   trianglePath.lineTo(leftx, lefty); // Левая точка основания
//   trianglePath.lineTo(rightx, righty); // Правая точка основания
//   trianglePath.closePath();

//   return trianglePath;
// }

export function trangleArrowForVector(
  start: { x: number; y: number },
  end: { x: number; y: number },
  height = 24,
  width = 12,
  t = 1 // параметр [0, 1], где будет вершина треугольника
): Path2D {
  const tipx = (1 - t) * start.x + t * end.x;
  const tipy = (1 - t) * start.y + t * end.y;

  // Вычисляем угол направления от start к end
  const lineAngle = Math.atan2(tipy - start.y, tipx - start.x);

  // Позиции для средней точки основания, отстоящей назад на расстояние height от вершины
  const baseMidX = tipx - Math.cos(lineAngle) * height;
  const baseMidY = tipy - Math.sin(lineAngle) * height;

  // Наполовину ширина основания
  const baseHalfWidth = width / 2;

  // Рассчитываем углы, перпендикулярные линии для вычисления крайних точек основания
  const leftAngle = lineAngle + Math.PI / 2;
  const rightAngle = lineAngle - Math.PI / 2;

  // Положение левой точки основания
  const leftx = baseMidX + Math.cos(leftAngle) * baseHalfWidth;
  const lefty = baseMidY + Math.sin(leftAngle) * baseHalfWidth;

  // Положение правой точки основания
  const rightx = baseMidX + Math.cos(rightAngle) * baseHalfWidth;
  const righty = baseMidY + Math.sin(rightAngle) * baseHalfWidth;

  const trianglePath = new Path2D();
  trianglePath.moveTo(tipx, tipy); // Вершина треугольника
  trianglePath.lineTo(leftx, lefty); // Левая точка основания
  trianglePath.lineTo(rightx, righty); // Правая точка основания
  trianglePath.closePath();

  return trianglePath;
}

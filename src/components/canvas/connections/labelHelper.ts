import { clamp } from "../../../utils/functions/clamp";

export function getLabelCoords(
  x1: number, // source anchor x
  y1: number, // source anchor y
  x2: number, // target anchor x
  y2: number, // target anchor y
  width: number, // label width
  height: number, // label height
  GRID_SIZE: number // graph constant
): { x: number; y: number } {
  const alpha = x2 === x1 ? 0 : (y2 - y1) / (x2 - x1);
  const c = y2 - alpha * x2;
  const maxOffsetY = GRID_SIZE * 8;
  /*
    4 cases of label alignment:

    [x1, y1]
            [x2, y2]

            [x1, y1]
    [x2, y2]

    [x2, y2]
            [x1, y1]

            [x2, y2]
    [x1, y1]
  */

  let x: number;
  let y: number;
  let aligment: CanvasTextAlign = "right";

  if (x1 <= x2 && y1 <= y2) {
    const labelRightBottomX = x2 - GRID_SIZE;
    const labelRightBottomY = alpha * labelRightBottomX + c - GRID_SIZE;
    x = labelRightBottomX - width;
    y = clamp(labelRightBottomY, y2 - maxOffsetY, y2 + maxOffsetY) - height;
  } else if (x1 >= x2 && y1 <= y2) {
    const labelLeftBottomX = x2 + GRID_SIZE;
    const labelLeftBottomY = alpha * labelLeftBottomX + c + GRID_SIZE;

    x = labelLeftBottomX;
    y = clamp(labelLeftBottomY, y2 - maxOffsetY, y2 + maxOffsetY) - height;
  } else if (x1 >= x2 && y1 >= y2) {
    const labelLeftTopX = x2 + GRID_SIZE;
    const labelLeftTopY = alpha * labelLeftTopX + c + GRID_SIZE;

    x = labelLeftTopX;
    y = clamp(labelLeftTopY, y2 - maxOffsetY, y2 + maxOffsetY);
  } else {
    const labelRightTopX = x2 - GRID_SIZE;
    const labelRightTopY = alpha * labelRightTopX + c - GRID_SIZE;

    x = labelRightTopX - width;
    y = clamp(labelRightTopY, y2 - maxOffsetY, y2 + maxOffsetY);
  }

  // Currently labels can (and will) overlap.
  // See https://en.wikipedia.org/wiki/Automatic_label_placement and
  // https://mikekling.com/comparing-algorithms-for-dispersing-overlapping-rectangles/
  // for possible solutions.
  return { x, y };
}

import type { CanvasRenderingContext2DEvent } from "jest-canvas-mock";

/** The geometry actually stroked, with coordinates rounded to a millionth of a canvas unit. */
export function pathCommands(path: Path2D): string[] {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Missing 2D context");
  ctx.stroke(path);
  const events: CanvasRenderingContext2DEvent[] = ctx.__getDrawCalls()[0].props.path;
  return events.map(({ type, props }) => {
    const coords: number[] = [];
    if (type === "arcTo") coords.push(props.cpx1, props.cpy1, props.cpx2, props.cpy2, props.radius);
    if (type === "lineTo" || type === "moveTo") coords.push(props.x, props.y);
    return [type, ...coords.map((value) => Number(value.toFixed(6)))].join(" ");
  });
}

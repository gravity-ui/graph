import type { TConnectionEditingIcon } from "./types";

/** Draws an SVG path icon centered in `rect`. Copied from the core's internal `renderSVG`. */
export function renderIcon(
  ctx: CanvasRenderingContext2D,
  icon: TConnectionEditingIcon,
  rect: { x: number; y: number; width: number; height: number }
): void {
  ctx.save();
  const iconPath = new Path2D(icon.path);
  const coefX = icon.width / icon.viewWidth;
  const coefY = icon.height / icon.viewHeight;
  ctx.translate(rect.x + rect.width / 2 - icon.width / 2, rect.y + rect.height / 2 - icon.height / 2);
  ctx.scale(coefX, coefY);
  ctx.fill(iconPath, "evenodd");
  ctx.restore();
}

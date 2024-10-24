import { render } from "./render";

export function renderSVG(
  icon: {
    path: string;
    width: number;
    height: number;
    iniatialWidth: number;
    initialHeight: number;
  },
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number }
) {
  render(ctx, (isolatedCtx) => {
    const iconPath = new Path2D(icon.path);
    const coefX = icon.width / icon.iniatialWidth;
    const coefY = icon.height / icon.initialHeight;
    // MoveTo position
    isolatedCtx.translate(rect.x + rect.width / 2 - icon.width / 2, rect.y + rect.height / 2 - icon.height / 2);
    isolatedCtx.scale(coefX, coefY);
    isolatedCtx.fill(iconPath, "evenodd");
  });
}

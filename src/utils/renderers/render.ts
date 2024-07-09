export function render(ctx: CanvasRenderingContext2D, cb: (ctx: CanvasRenderingContext2D) => void) {
  ctx.save();
  cb(ctx);
  ctx.restore();
}

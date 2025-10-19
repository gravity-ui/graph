export function render(ctx: CanvasRenderingContext2D, cb: (ctx: CanvasRenderingContext2D) => void) {
  ctx.save();
  // eslint-disable-next-line callback-return
  cb(ctx);
  ctx.restore();
}

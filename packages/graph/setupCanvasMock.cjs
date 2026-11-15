// Runs after jest-canvas-mock, which lacks CanvasRenderingContext2D.roundRect: the scene interpreter draws every
// block's rects with it, so any test whose camera sees a block calls it.
if (typeof CanvasRenderingContext2D !== "undefined" && !("roundRect" in CanvasRenderingContext2D.prototype)) {
  Object.defineProperty(CanvasRenderingContext2D.prototype, "roundRect", {
    value: function roundRect() {},
    configurable: true,
    writable: true,
  });
}

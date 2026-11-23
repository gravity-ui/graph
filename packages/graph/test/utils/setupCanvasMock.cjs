// jest-canvas-mock lacks the rounded outlines and composite paths used by the scene.
const missingMethods = [
  [globalThis.CanvasRenderingContext2D, "roundRect"],
  [globalThis.Path2D, "roundRect"],
  [globalThis.Path2D, "addPath"],
];
for (const [owner, name] of missingMethods) {
  if (owner && !(name in owner.prototype)) {
    Object.defineProperty(owner.prototype, name, { value() {}, configurable: true, writable: true });
  }
}

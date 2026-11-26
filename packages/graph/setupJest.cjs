// A plain class rather than jest.fn(): a mock would keep every observer callback in mock.calls,
// and with it every graph that ever created an observer.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom lacks the native constructor used by the browser input fixtures.
if (typeof MouseEvent !== "undefined" && !global.PointerEvent) {
  global.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "";
      this.isPrimary = init.isPrimary ?? false;
    }
  };
}

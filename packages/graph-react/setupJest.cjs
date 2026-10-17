// A plain class rather than jest.fn(): a mock would keep every observer callback in mock.calls,
// and with it every graph that ever created an observer.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

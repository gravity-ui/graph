/**
 * Observes devicePixelRatio changes (e.g. when a window is moved between monitors
 * with different scaling). Calls `fn` whenever the DPR changes.
 *
 * Uses matchMedia with a resolution query tied to the current DPR value.
 * When the DPR changes the query no longer matches, so we re-subscribe
 * with the updated value — this is why `once: true` is used.
 *
 * The callback is deferred to the next animation frame to avoid a race condition
 * where the `change` event fires before the browser has updated `devicePixelRatio`.
 *
 * @param fn - Callback receiving the current devicePixelRatio
 * @returns Unsubscribe function that stops observing DPR changes
 */
export function observeDPR(fn: (dpr: number) => void): () => void {
  let dprMediaQuery: MediaQueryList | undefined;
  let rafId: number | undefined;

  function onChange(): void {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = undefined;
      fn(globalThis.devicePixelRatio || 1);
      watch();
    });
  }

  function watch(): void {
    unwatch();
    const mqString = `(resolution: ${globalThis.devicePixelRatio || 1}dppx)`;
    dprMediaQuery = globalThis.matchMedia?.(mqString);
    dprMediaQuery?.addEventListener("change", onChange, { once: true });
  }

  function unwatch(): void {
    dprMediaQuery?.removeEventListener("change", onChange);
    dprMediaQuery = undefined;
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
    }
  }

  watch();

  return unwatch;
}

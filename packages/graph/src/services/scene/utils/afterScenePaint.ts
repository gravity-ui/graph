/** Let queued scene notifications run, then give their DOM updates a paint before expensive main-thread work. */
export function afterScenePaint(doc: Document): Promise<void> {
  const view = doc.defaultView;
  if (!view || doc.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    view.setTimeout(() => {
      if (doc.hidden) {
        resolve();
        return;
      }
      // A visible but offscreen iframe can go without animation frames.
      const timeout = view.setTimeout(finish, 250);
      const frame = view.requestAnimationFrame(() => view.setTimeout(finish, 0));
      const onVisibility = () => {
        if (doc.hidden) finish();
      };
      function finish() {
        view?.cancelAnimationFrame(frame);
        view?.clearTimeout(timeout);
        doc.removeEventListener("visibilitychange", onVisibility);
        resolve();
      }
      doc.addEventListener("visibilitychange", onVisibility);
    }, 0);
  });
}

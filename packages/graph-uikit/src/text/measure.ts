const MAX_ENTRIES = 5000;

const widths = new Map<string, number>();

let fontListenerAttached = false;

export function clearUikitTextCache(): void {
  widths.clear();
}

function attachFontListener(): void {
  if (fontListenerAttached) {
    return;
  }
  fontListenerAttached = true;
  // TODO(graph-core): measureText cache is never cleared — stale widths after web fonts load.
  globalThis.document?.fonts?.addEventListener?.("loadingdone", clearUikitTextCache);
}

export function measureTextWidth(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  attachFontListener();
  const key = `${font}\u0000${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (widths.size >= MAX_ENTRIES) {
    widths.clear();
  }
  ctx.font = font;
  const width = ctx.measureText(text).width;
  widths.set(key, width);
  return width;
}

let measureContext: CanvasRenderingContext2D | null = null;

export function getMeasureContext(): CanvasRenderingContext2D | null {
  measureContext ??= globalThis.document?.createElement("canvas").getContext("2d") ?? null;
  return measureContext;
}

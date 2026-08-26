export function random(start: number, end: number) {
  return start + (end - start) * Math.random();
}

export function computeCssVariable(value: string) {
  if (!value.startsWith("var(")) {
    return value;
  }

  const body = globalThis.document.body;
  if (!body) {
    return value;
  }

  const variableName = value.slice(4, -1);
  return window.getComputedStyle(body).getPropertyValue(variableName).trim();
}

const measuredText = new Map<string, number>();

export function measureText(text: string, font: string, approximate = true) {
  const key = `${text}-${font}`;
  const cachedWidth = measuredText.get(key);
  if (approximate && cachedWidth !== undefined) {
    return cachedWidth;
  }

  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return 0;
  }

  context.font = font;
  const width = Math.floor(context.measureText(text).width + 1);
  if (approximate) {
    measuredText.set(key, width);
  }
  return width;
}

export function renderSVG(
  icon: {
    path: string;
    width: number;
    height: number;
    iniatialWidth: number;
    initialHeight: number;
  },
  context: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number }
) {
  context.save();
  const iconPath = new Path2D(icon.path);
  context.translate(rect.x + rect.width / 2 - icon.width / 2, rect.y + rect.height / 2 - icon.height / 2);
  context.scale(icon.width / icon.iniatialWidth, icon.height / icon.initialHeight);
  context.fill(iconPath, "evenodd");
  context.restore();
}

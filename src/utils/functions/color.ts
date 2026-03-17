// Cache for parsed colors
const parseColorCache = new Map<string, { r: number; g: number; b: number; a: number }>();

// Cache for colors with applied alpha
const applyAlphaCache = new Map<string, string>();

// Shared canvas context used only for fillStyle normalization — no drawing, no getImageData.
let colorNormCtx: CanvasRenderingContext2D | null = null;

function getColorNormContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }

  if (!colorNormCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorNormCtx = canvas.getContext("2d");
  }

  return colorNormCtx;
}

/**
 * Parses a color string and returns RGBA components.
 *
 * Normalization works by assigning the color to a canvas `fillStyle` and
 * reading the value back — the browser converts any CSS color format
 * (named colors, hsl/hsla, hex, rgb/rgba) into either `#rrggbb` or
 * `rgba(r, g, b, a)`. No pixels are drawn or read via getImageData,
 * so there are no clearRect / compositing issues that affect Safari
 * with OffscreenCanvas.
 *
 * @param color - Color in any valid CSS format
 * @returns RGBA components or null if parsing fails
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  const cached = parseColorCache.get(color);
  if (cached) {
    return cached;
  }

  const ctx = getColorNormContext();
  if (!ctx) {
    return null;
  }

  // Assign the color — the browser normalises it immediately.
  // Reading fillStyle back gives '#rrggbb' or 'rgba(r, g, b, a)'.
  // No pixel is drawn; no getImageData is needed.
  ctx.fillStyle = "#000000"; // fallback if user passes invalid color
  ctx.fillStyle = color;
  const normalized = ctx.fillStyle as string;

  let result: { r: number; g: number; b: number; a: number } | null = null;

  // '#rrggbb' (opaque shorthand browsers emit for solid colors)
  const hex = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    result = {
      r: parseInt(hex[1], 16),
      g: parseInt(hex[2], 16),
      b: parseInt(hex[3], 16),
      a: 1,
    };
  }

  if (!result) {
    // 'rgba(r, g, b, a)' or 'rgb(r, g, b)'
    const rgba = normalized.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (rgba) {
      result = {
        r: parseInt(rgba[1], 10),
        g: parseInt(rgba[2], 10),
        b: parseInt(rgba[3], 10),
        a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
      };
    }
  }

  if (!result) {
    return null;
  }

  parseColorCache.set(color, result);
  return result;
}

/**
 * Applies alpha (opacity) to a color string.
 * This is useful as an alternative to using ctx.globalAlpha, which affects all drawing operations.
 * Instead, you can apply opacity directly to specific colors.
 *
 * @param color - Color in any valid CSS format (hex, rgb, rgba, hsl, hsla, named colors)
 * @param alpha - Alpha value between 0 (fully transparent) and 1 (fully opaque)
 * @returns Color string in rgba format with applied alpha
 *
 * @example
 * applyAlpha('#ff0000', 0.5) // returns 'rgba(255, 0, 0, 0.5)'
 * applyAlpha('rgb(255, 0, 0)', 0.5) // returns 'rgba(255, 0, 0, 0.5)'
 * applyAlpha('rgba(255, 0, 0, 0.8)', 0.5) // returns 'rgba(255, 0, 0, 0.4)' - multiplies existing alpha
 * applyAlpha('red', 0.5) // returns 'rgba(255, 0, 0, 0.5)'
 */
export function applyAlpha(color: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));

  const cacheKey = `${color}|${clampedAlpha}`;
  const cachedResult = applyAlphaCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const parsed = parseColor(color);
  if (!parsed) {
    // Fallback for SSR or parsing failure
    return color;
  }

  // Multiply existing alpha with new alpha
  const finalAlpha = parsed.a * clampedAlpha;

  const result = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${finalAlpha})`;

  applyAlphaCache.set(cacheKey, result);
  return result;
}

/**
 * Clears the color cache to free up memory.
 * Use this if you've processed a large number of unique colors and want to reclaim memory.
 */
export function clearColorCache(): void {
  parseColorCache.clear();
  applyAlphaCache.clear();
  colorNormCtx = null;
}

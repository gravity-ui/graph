// Color cache sprite: stores already computed color conversions
const colorCache = new Map<string, { r: number; g: number; b: number; a: number }>();

// Offscreen canvas for color parsing (created once and reused)
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

function getColorParsingContext(): OffscreenCanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }

  if (!offscreenCtx) {
    offscreenCanvas = new OffscreenCanvas(1, 1);
    // Optimize context for frequent color reading
    offscreenCtx = offscreenCanvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
  }

  return offscreenCtx;
}

/**
 * Parses a color string and returns RGBA components.
 * Uses cached sprite for frequently used colors to avoid repeated canvas operations.
 *
 * @param color - Color in any valid CSS format
 * @returns RGBA components or null if parsing fails
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Check cache first (sprite)
  const cached = colorCache.get(color);
  if (cached) {
    return cached;
  }

  const ctx = getColorParsingContext();
  if (!ctx) {
    return null;
  }

  // Clear previous color (fill with white since alpha is disabled)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1, 1);

  // Set the color and draw a pixel
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);

  // Get the parsed color data
  const imageData = ctx.getImageData(0, 0, 1, 1).data;
  const result = {
    r: imageData[0],
    g: imageData[1],
    b: imageData[2],
    a: imageData[3] / 255,
  };

  // Add to cache (sprite)
  colorCache.set(color, result);

  return result;
}

/**
 * Applies alpha (opacity) to a color string.
 * This is useful as an alternative to using ctx.globalAlpha, which affects all drawing operations.
 * Instead, you can apply opacity directly to specific colors.
 *
 * Uses optimized offscreen canvas with caching for performance.
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
  // Clamp alpha to valid range [0, 1]
  const clampedAlpha = Math.max(0, Math.min(1, alpha));

  // Try to use cached sprite
  const cacheKey = `${color}|${clampedAlpha}`;
  const cachedResult = colorCache.get(cacheKey);
  if (cachedResult) {
    return `rgba(${cachedResult.r}, ${cachedResult.g}, ${cachedResult.b}, ${cachedResult.a})`;
  }

  const parsed = parseColor(color);
  if (!parsed) {
    // Fallback for SSR or parsing failure
    return color;
  }

  // Multiply existing alpha with new alpha
  const finalAlpha = parsed.a * clampedAlpha;

  const result = {
    r: parsed.r,
    g: parsed.g,
    b: parsed.b,
    a: finalAlpha,
  };

  // Cache the final result
  colorCache.set(cacheKey, result);

  return `rgba(${result.r}, ${result.g}, ${result.b}, ${result.a})`;
}

/**
 * Clears the color cache to free up memory.
 * Use this if you've processed a large number of unique colors and want to reclaim memory.
 */
export function clearColorCache(): void {
  colorCache.clear();
}

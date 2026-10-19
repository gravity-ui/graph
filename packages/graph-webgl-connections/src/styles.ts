/**
 * Declarative connection style. Everything the GPU needs is plain data: there is no `render(ctx)`
 * hook, which is what keeps the WebGL path cheap.
 */
export type TWebGLConnectionStyle = {
  /** Any CSS color the browser understands. */
  color: string;
  /** Stroke width. Units depend on the layer `widthUnits` option (world units by default). */
  width: number;
  /** Dash and gap lengths in world units. Omit for a solid line. */
  dash?: [dash: number, gap: number];
  /** Draw the arrow in the middle of the connection. */
  arrow?: boolean;
};

/** Style slots available in one draw call (uniform arrays in the shaders). */
export const MAX_STYLES = 64;

export type TRGBA = [r: number, g: number, b: number, a: number];

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` into 0..1 floats. */
export function parseColor(color: string): TRGBA | undefined {
  const value = color.trim();
  const hex = HEX_RE.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = digits
        .split("")
        .map((digit) => digit + digit)
        .join("");
    }
    const channel = (index: number) => parseInt(digits.slice(index * 2, index * 2 + 2), 16) / 255;
    return [channel(0), channel(1), channel(2), digits.length === 8 ? channel(3) : 1];
  }
  const rgb = RGB_RE.exec(value);
  if (rgb) {
    const alphaText = rgb[4];
    let alpha = 1;
    if (alphaText !== undefined) {
      alpha = alphaText.endsWith("%") ? parseFloat(alphaText) / 100 : parseFloat(alphaText);
    }
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, alpha];
  }
  return undefined;
}

let normalizer: CanvasRenderingContext2D | null | undefined;

/** Resolves named and other CSS colors through the browser, falling back to opaque black. */
export function resolveColor(color: string): TRGBA {
  const parsed = parseColor(color);
  if (parsed) return parsed;
  if (normalizer === undefined) {
    normalizer = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (normalizer) {
    normalizer.fillStyle = "#000000";
    normalizer.fillStyle = color;
    const normalized = parseColor(String(normalizer.fillStyle));
    if (normalized) return normalized;
  }
  return [0, 0, 0, 1];
}

/**
 * Interns styles into a fixed table uploaded as shader uniforms. Instances reference styles by index.
 * When the table is full, new styles fall back to slot 0 and a warning is printed once.
 */
export class StyleTable {
  /** RGBA per slot, premultiplied in the shader. */
  public readonly colors = new Float32Array(MAX_STYLES * 4);

  /** width, dash, gap, arrow (0/1) per slot. */
  public readonly params = new Float32Array(MAX_STYLES * 4);

  private readonly slots = new Map<string, number>();

  private readonly arrows: boolean[] = [];

  private warned = false;

  public get size(): number {
    return this.slots.size;
  }

  public intern(style: TWebGLConnectionStyle): number {
    const dash = style.dash && style.dash[0] > 0 ? style.dash : undefined;
    const key = `${style.color}|${style.width}|${dash ? dash.join(",") : ""}|${style.arrow ? 1 : 0}`;
    const existing = this.slots.get(key);
    if (existing !== undefined) return existing;
    if (this.slots.size >= MAX_STYLES) {
      if (!this.warned) {
        this.warned = true;
        console.warn(
          `[graph-webgl-connections] more than ${MAX_STYLES} distinct connection styles; extra styles use the first one`
        );
      }
      return 0;
    }
    const slot = this.slots.size;
    this.slots.set(key, slot);
    this.colors.set(resolveColor(style.color), slot * 4);
    this.params.set([style.width, dash ? dash[0] : 0, dash ? dash[1] : 0, style.arrow ? 1 : 0], slot * 4);
    this.arrows[slot] = Boolean(style.arrow);
    return slot;
  }

  public hasArrow(slot: number): boolean {
    return this.arrows[slot] ?? false;
  }

  public width(slot: number): number {
    return this.params[slot * 4];
  }

  public clear(): void {
    this.slots.clear();
    this.arrows.length = 0;
    this.colors.fill(0);
    this.params.fill(0);
    this.warned = false;
  }
}

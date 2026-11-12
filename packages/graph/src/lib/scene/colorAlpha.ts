import { parseColor } from "../../utils/functions/color";

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const FUNCTIONAL = /^rgba?\((.*)\)$/i;

/** r, g, b in 0..255 and a in 0..1, straight (not premultiplied). */
export type TRgba = readonly [number, number, number, number];

/**
 * Alpha of a CSS colour in 0..1, read as `readColorRgba` reads it: `#rgba`, `#rrggbbaa`, `rgba()`, `rgb()` with a
 * `/ a` part and, with a DOM, `hsla()`, `transparent` and the like carry one. A colour that does not parse is opaque.
 */
export function parseColorAlpha(color: string): number {
  return readColorRgba(color)?.[3] ?? 1;
}

/** A number or a percentage of `full`; NaN when the token is neither. */
function channel(token: string, full: number): number {
  return token.endsWith("%") ? (Number(token.slice(0, -1)) / 100) * full : Number(token);
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value));
}

function parseHex(digits: string): TRgba {
  const short = digits.length <= 4;
  const at = (index: number): number =>
    short ? parseInt(digits[index] + digits[index], 16) : parseInt(digits.slice(2 * index, 2 * index + 2), 16);
  const hasAlpha = digits.length === 4 || digits.length === 8;
  return [at(0), at(1), at(2), hasAlpha ? at(3) / 255 : 1];
}

/**
 * The channels of a `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` or `rgba()` colour (commas or spaces, an optional
 * `/ a`, numbers or percentages); undefined for any other colour (named colours, `hsl()`, malformed values). Needs no
 * DOM; `readColorRgba` falls back to the DOM for the other syntaxes.
 */
export function parseColorRgba(color: string): TRgba | undefined {
  const text = color.trim();
  const hex = HEX.exec(text);
  if (hex) return parseHex(hex[1]);
  const functional = FUNCTIONAL.exec(text);
  if (!functional) return undefined;
  const parts = functional[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return undefined;
  const values = [
    channel(parts[0], 255),
    channel(parts[1], 255),
    channel(parts[2], 255),
    parts.length === 4 ? channel(parts[3], 1) : 1,
  ];
  if (!values.every(Number.isFinite)) return undefined;
  return [clamp(values[0], 255), clamp(values[1], 255), clamp(values[2], 255), clamp(values[3], 1)];
}

/** Parsed colours by text; cleared when it grows past `CACHE_LIMIT`, so a stream of distinct colours cannot pile up. */
const parsed = new Map<string, TRgba | null>();

const CACHE_LIMIT = 1024;

function parseUncached(color: string): TRgba | undefined {
  // An empty colour paints nothing (the interpreter skips it); the DOM would read it as black.
  if (color.trim() === "") return undefined;
  const own = parseColorRgba(color);
  if (own) return own;
  const dom = parseColor(color);
  return dom ? [dom.r, dom.g, dom.b, dom.a] : undefined;
}

/**
 * The channels of a CSS colour, read as both scene renderers read paints: `parseColorRgba` first, then the DOM
 * (`parseColor`, the parser of the WebGL encoders), which reads named colours, `hsl()`, `hwb()` and the rest. Without a
 * document the DOM parser reads nothing, so only the syntaxes of `parseColorRgba` are read. An empty colour is
 * undefined. Cached.
 */
export function readColorRgba(color: string): TRgba | undefined {
  let value = parsed.get(color);
  if (value === undefined) {
    if (parsed.size >= CACHE_LIMIT) parsed.clear();
    value = parseUncached(color) ?? null;
    parsed.set(color, value);
  }
  return value ?? undefined;
}

function rgbaText(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/**
 * `color` moved towards `toward` by `amount` (clamped to [0, 1]) in straight rgb, as `rgba(r, g, b, a)` with `color`'s
 * own alpha: an opaque colour stays opaque. With `amount` 0, or when either colour does not parse (`readColorRgba`),
 * returns `color` as is.
 */
export function mixColor(color: string, toward: string, amount: number): string {
  const t = amount > 0 ? Math.min(1, amount) : 0;
  if (t === 0) return color;
  const from = readColorRgba(color);
  const to = readColorRgba(toward);
  if (!from || !to) return color;
  const mix = (index: number): number => from[index] + (to[index] - from[index]) * t;
  return rgbaText(mix(0), mix(1), mix(2), from[3]);
}

/**
 * `color` with its alpha multiplied by `opacity` (clamped to [0, 1]), as `rgba(r, g, b, a)`. With `opacity` 1 or more
 * or NaN, or when the colour does not parse (`readColorRgba`), returns `color` as is.
 */
export function fadeColor(color: string, opacity: number): string {
  if (!(opacity < 1)) return color;
  const rgba = readColorRgba(color);
  if (!rgba) return color;
  return rgbaText(rgba[0], rgba[1], rgba[2], rgba[3] * Math.max(0, opacity));
}

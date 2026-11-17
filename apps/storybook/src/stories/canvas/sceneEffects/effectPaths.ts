import { dashFlow, pulse } from "@gravity-ui/graph";
import type { TConnectionEffectScaleRange, TScenePartStyle, TScenePrimitive } from "@gravity-ui/graph";

import { glow, gradient, particles } from "../webglConnections/lines";

/**
 * The effect parts of the scene blocks. Each effect is one part, hidden by a base rule and shown by a tag rule, so a tag
 * switches it without running the block's level methods again. A scene holds at most 15 part names, with the block's
 * own (body, border, title, halo, badge), the anchor's (anchor) and the status stripe these 9 make 15.
 */
export const EFFECT_PARTS = ["march", "comet", "pulse", "particles", "spinner", "glow", "gradient", "spark"] as const;

export type TEffectPart = (typeof EFFECT_PARTS)[number];

/** One part style for each of the given effect parts: `effectParts(EFFECT_PARTS, { visible: false })`. */
export function effectParts(
  parts: readonly TEffectPart[],
  style: TScenePartStyle
): Partial<Record<TEffectPart, TScenePartStyle>> {
  const out: Partial<Record<TEffectPart, TScenePartStyle>> = {};
  for (const part of parts) out[part] = style;
  return out;
}

/** A box in the block's frame, in world units, with its corner radius. */
export type TBox = { x: number; y: number; width: number; height: number; radius: number };

/** A path of cubic segments (8 numbers each: p0, c1, c2, p3) and its length in world units. */
export type TPath = { segments: Float32Array; length: number };

/** A quarter circle as one cubic: the control points lie this far along the tangents, times the radius. */
const KAPPA = 0.5522847498;

function pushStraight(out: number[], x0: number, y0: number, x1: number, y1: number): void {
  const dx = (x1 - x0) / 3;
  const dy = (y1 - y0) / 3;
  out.push(x0, y0, x0 + dx, y0 + dy, x1 - dx, y1 - dy, x1, y1);
}

/** The box grown by `by` on every side (shrunk for a negative `by`); the radius follows. */
export function outset(box: TBox, by: number): TBox {
  return {
    x: box.x - by,
    y: box.y - by,
    width: box.width + 2 * by,
    height: box.height + 2 * by,
    radius: Math.max(0, box.radius + by),
  };
}

/**
 * The outline on which a stroke of `width` lies inside the box: half a stroke in from the edge, the radius reduced by
 * as much (never below 0). The stroke's outer edge is then the box's edge.
 */
export function strokeInside(box: TBox, width: number): TBox {
  return outset(box, -width / 2);
}

/**
 * The outline of a rounded box, clockwise from the end of the top-left corner: four straight sides and four quarter
 * arcs. The arcs keep the tangent continuous, so a stroke has no notch at the corners (WebGL draws each segment as its
 * own ribbon, with no join between them).
 */
export function roundedRectPath({ x, y, width, height, radius }: TBox): TPath {
  const r = Math.min(radius, width / 2, height / 2);
  const k = r * KAPPA;
  const right = x + width;
  const bottom = y + height;
  const out: number[] = [];
  pushStraight(out, x + r, y, right - r, y);
  out.push(right - r, y, right - r + k, y, right, y + r - k, right, y + r);
  pushStraight(out, right, y + r, right, bottom - r);
  out.push(right, bottom - r, right, bottom - r + k, right - r + k, bottom, right - r, bottom);
  pushStraight(out, right - r, bottom, x + r, bottom);
  out.push(x + r, bottom, x + r - k, bottom, x, bottom - r + k, x, bottom - r);
  pushStraight(out, x, bottom - r, x, y + r);
  out.push(x, y + r, x, y + r - k, x + r - k, y, x + r, y);
  return { segments: new Float32Array(out), length: 2 * (width + height) - 8 * r + 2 * Math.PI * r };
}

/** A circle as four cubics, clockwise on screen from its rightmost point. */
export function circlePath(cx: number, cy: number, r: number): TPath {
  const k = r * KAPPA;
  // One quarter per row: p0, c1, c2, p3.
  // prettier-ignore
  const segments = new Float32Array([
    cx + r, cy, cx + r, cy + k, cx + k, cy + r, cx, cy + r,
    cx, cy + r, cx - k, cy + r, cx - r, cy + k, cx - r, cy,
    cx - r, cy, cx - r, cy - k, cx - k, cy - r, cx, cy - r,
    cx, cy - r, cx + k, cy - r, cx + r, cy - k, cx + r, cy,
  ]);
  return { segments, length: 2 * Math.PI * r };
}

/** A straight line as one cubic. */
export function linePath(x0: number, y0: number, x1: number, y1: number): TPath {
  const out: number[] = [];
  pushStraight(out, x0, y0, x1, y1);
  return { segments: new Float32Array(out), length: Math.hypot(x1 - x0, y1 - y0) };
}

/**
 * A polyline smoothed through its points (Catmull-Rom as cubics): one cubic per pair of points, tangent-continuous, so
 * the stroke has no notch at the points.
 */
export function smoothPolylinePath(points: readonly (readonly [number, number])[]): TPath {
  const out: number[] = [];
  let length = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    out.push(x1, y1, x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
    length += Math.hypot(x2 - x1, y2 - y1);
  }
  return { segments: new Float32Array(out), length };
}

/**
 * A dash pattern stretched so that a whole number of periods fits a closed path: the dashes run across its start
 * without a seam.
 */
export function fitPattern(length: number, on: number, off: number): [number, number] {
  const periods = Math.max(1, Math.round(length / (on + off)));
  const stretch = length / (periods * (on + off));
  return [on * stretch, off * stretch];
}

/** Puts a primitive on the camera scales [minScale, maxScale): one look of an effect per zoom range. */
export function onScales(primitive: TScenePrimitive, minScale?: number, maxScale?: number): TScenePrimitive {
  return { ...primitive, minScale, maxScale };
}

/** A dash running around the box: `dashFlow` with a short pattern. */
export function marchingBorder(
  box: TBox,
  look: { width: number; color: string; on: number; off: number; speed: number },
  range?: TConnectionEffectScaleRange
): TScenePrimitive {
  const path = roundedRectPath(box);
  const pattern = fitPattern(path.length, look.on, look.off);
  return {
    kind: "path",
    part: "march",
    segments: path.segments,
    stroke: { color: look.color, width: look.width },
    effect: dashFlow.use({ pattern, speed: look.speed }, range),
  };
}

/**
 * One comet per perimeter: `dashFlow` with `fade`, a pattern as long as the outline (`share` of it lit) and a speed of
 * `laps` outlines per second.
 */
export function orbitingComet(
  box: TBox,
  look: { width: number; color: string; share: number; laps: number },
  range?: TConnectionEffectScaleRange
): TScenePrimitive {
  const path = roundedRectPath(box);
  return {
    kind: "path",
    part: "comet",
    segments: path.segments,
    stroke: { color: look.color, width: look.width },
    effect: dashFlow.use(
      {
        pattern: [path.length * look.share, path.length * (1 - look.share)],
        speed: path.length * look.laps,
        fade: true,
      },
      range
    ),
  };
}

/** The whole outline pulses in place: `pulse` without a wavelength. */
export function pulsingOutline(
  box: TBox,
  look: { width: number; color: string; period: number },
  range?: TConnectionEffectScaleRange
): TScenePrimitive {
  return {
    kind: "path",
    part: "pulse",
    segments: roundedRectPath(box).segments,
    stroke: { color: look.color, width: look.width },
    effect: pulse.use({ period: look.period }, range),
  };
}

/** Round particles along a straight line: the `particles` shader of the WebGL connections story. */
export function throughputParticles(
  x0: number,
  x1: number,
  y: number,
  look: { width: number; color: string; spacing: number; speed: number },
  range?: TConnectionEffectScaleRange
): TScenePrimitive {
  return {
    kind: "path",
    part: "particles",
    segments: linePath(x0, y, x1, y).segments,
    stroke: { color: look.color, width: look.width },
    effect: particles.use({ spacing: look.spacing, speed: look.speed }, range),
  };
}

/**
 * A spinner: a faint track circle and an arc of it running around once per `period` seconds (a circle as four cubics,
 * `dashFlow` with a pattern as long as the circle). Both are the "spinner" part, so the track hides with the arc.
 */
export function spinner(
  cx: number,
  cy: number,
  r: number,
  look: { width: number; color: string; track: string; period: number },
  range?: TConnectionEffectScaleRange
): TScenePrimitive[] {
  const path = circlePath(cx, cy, r);
  return [
    { kind: "path", part: "spinner", segments: path.segments, stroke: { color: look.track, width: look.width } },
    {
      kind: "path",
      part: "spinner",
      segments: path.segments,
      stroke: { color: look.color, width: look.width },
      effect: dashFlow.use(
        { pattern: [path.length * 0.3, path.length * 0.7], speed: path.length / look.period },
        range
      ),
    },
  ];
}

/** A soft halo around the box: the `glow` shader; its intensity is the effect's global `u_intensity` uniform. */
export function glowOutline(
  box: TBox,
  look: { width: number; color: string },
  range?: TConnectionEffectScaleRange
): TScenePrimitive {
  return {
    kind: "path",
    part: "glow",
    segments: roundedRectPath(box).segments,
    stroke: { color: look.color, width: look.width },
    effect: glow.use([], range),
  };
}

/** A blue-to-orange outline with a bright band running around: the `gradient` shader. */
export function gradientOutline(box: TBox, look: { width: number; laps: number }): TScenePrimitive {
  return {
    kind: "path",
    part: "gradient",
    segments: roundedRectPath(box).segments,
    stroke: { color: "#7a8aa6", width: look.width },
    effect: gradient.use({ from: [0.18, 0.49, 0.96], to: [0.95, 0.56, 0.17], laps: look.laps }),
  };
}

/** A smoothed polyline with a wave of `pulse` travelling along x (`wavelength` world units). */
export function sparkline(
  points: readonly (readonly [number, number])[],
  look: { width: number; color: string; period: number; wavelength: number }
): TScenePrimitive {
  return {
    kind: "path",
    part: "spark",
    segments: smoothPolylinePath(points).segments,
    stroke: { color: look.color, width: look.width },
    effect: pulse.use({ period: look.period, wavelength: look.wavelength }),
  };
}

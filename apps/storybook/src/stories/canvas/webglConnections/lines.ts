import { BlockConnection, Path2DLine, WebGLLine, dashFlow, defineConnectionEffect, pulse } from "@gravity-ui/graph";
import type {
  TBaseConnectionState,
  TConnection,
  TConnectionEffectUse,
  TLineStroke,
  TWebGLStroke,
} from "@gravity-ui/graph";

type TConnectionClass = typeof BlockConnection<TConnection>;

/** The look of one connection; each renderer draws what it can of it. */
export type TLook = {
  color: string;
  width: number;
  /** A still dash in world units: what Path2D draws, and WebGL when there is no effect. */
  pattern?: readonly number[];
  /** WebGL only. */
  effect?: TConnectionEffectUse;
};

/**
 * The resting look of a connection; `withInteraction()` makes a hovered or selected line 2 units wider and a selected
 * one the selection color. A WebGL line with an effect gets its own color back and the effect shows the selection.
 */
export type TDescribe = (id: string | number | undefined, state: TBaseConnectionState) => TLook;

/** The two connection classes of one option: the same look, drawn by WebGL and by Path2D. */
export type TConnectionPair = { webgl: TConnectionClass; canvas: TConnectionClass };

const palette = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];
const flowColors = ["#2f7cf6", "#00a3a3", "#7a5af8"];

export function hashId(id: string | number | undefined): number {
  let hash = 0;
  for (const char of String(id)) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }
  return hash;
}

function toWebGLStroke({ color, width, pattern, effect }: TLook): TWebGLStroke {
  if (effect) return { color, width, effect };
  return pattern ? { color, width, dash: { pattern } } : { color, width };
}

function toCanvasStroke({ color, width, pattern }: TLook): TLineStroke {
  return pattern ? { color, width, dash: { pattern } } : { color, width };
}

export function createConnections(describe: TDescribe): TConnectionPair {
  // The dash and the effect stay on hover and selection; an effect decides how the selection looks.
  class GLLine extends WebGLLine {
    public override getStroke(state: TBaseConnectionState): TWebGLStroke {
      return this.withInteraction(toWebGLStroke(describe(this.connection.props.id, state)), state);
    }
  }
  class GLConnection extends BlockConnection<TConnection> {
    public static override line = GLLine;
  }
  class CanvasLine extends Path2DLine {
    public override getStroke(state: TBaseConnectionState): TLineStroke {
      return this.withInteraction(toCanvasStroke(describe(this.connection.props.id, state)), state);
    }
  }
  class CanvasConnection extends BlockConnection<TConnection> {
    public static override line = CanvasLine;
  }
  return { webgl: GLConnection, canvas: CanvasConnection };
}

/** Custom effects, defined once at module scope: `use()` carries the per-connection values. */

/**
 * Round particles over a faint trace. params: spacing and speed (world units, units per second); `u_speed` scales the
 * speed. Selected, the trace takes the selection color and the particles keep theirs, a little brighter.
 */
export const particles = defineConnectionEffect({
  animated: true,
  uniforms: { speed: { type: "float", value: 1 } },
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      float spacing = f.params0.x;
      float offset = mod(f.along - f.time * f.params0.y * u_speed, spacing) - spacing * 0.5;
      float dist = length(vec2(offset * f.scale, f.across));
      float particle = 1.0 - smoothstep(f.halfWidth - 1.0, f.halfWidth, dist);
      vec4 trace = f.selected > 0.5
        ? vec4(f.selectionColor.rgb, f.selectionColor.a * 0.6)
        : vec4(color.rgb, color.a * 0.12);
      vec3 dotColor = mix(color.rgb, vec3(1.0), 0.2 * f.selected);
      // The particles over the trace.
      return mix(trace, vec4(dotColor, 1.0), color.a * particle);
    }`,
  encode: ({ spacing, speed }: { spacing: number; speed: number }) => [spacing, speed],
});

/**
 * Source color to target color, and a band running along. params: source rgb, laps per second, target rgb. Selected,
 * a border in the selection color runs along both edges and the gradient keeps running inside.
 */
export const gradient = defineConnectionEffect({
  animated: true,
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      vec3 rgb = mix(f.params0.rgb, f.params1.rgb, f.t);
      float band = smoothstep(0.8, 1.0, fract(f.t - f.time * f.params0.w));
      vec4 inside = vec4(rgb, color.a * mix(0.35, 1.0, band));
      // The border: the outer 1.5 CSS pixels of each side, at most half of a thin line.
      float edge = f.halfWidth - min(1.5, f.halfWidth * 0.5);
      float border = f.selected * smoothstep(edge - 0.5, edge, abs(f.across));
      return mix(inside, f.selectionColor, border);
    }`,
  encode: ({ from, to, laps }: { from: readonly number[]; to: readonly number[]; laps: number }) => [
    ...from,
    laps,
    ...to,
  ],
  fallback: (stroke) => stroke,
});

/**
 * A soft halo outside the line; `u_intensity` scales it. The inner edge is composed here. Selected, the halo takes the
 * selection color at a stronger intensity and the line keeps its color.
 */
export const glow = defineConnectionEffect({
  extraWidth: 6,
  uniforms: { intensity: { type: "float", value: 0.6 } },
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      float outside = max(abs(f.across) - f.halfWidth, 0.0) / f.extraWidth;
      float falloff = pow(1.0 - clamp(outside, 0.0, 1.0), 2.0);
      vec4 halo = f.selected > 0.5
        ? vec4(f.selectionColor.rgb, f.selectionColor.a * min(u_intensity + 0.4, 1.0) * falloff)
        : vec4(color.rgb, color.a * u_intensity * falloff);
      return mix(halo, color, f.coverage);
    }`,
  fallback: (stroke) => stroke,
});

/** The default lines of each renderer: the connection's colors, its `dashed` data, hover and selection. */
class PlainWebGLConnection extends BlockConnection<TConnection> {
  public static override line = WebGLLine;
}

export const plain: TConnectionPair = { webgl: PlainWebGLConnection, canvas: BlockConnection };

export const stillDash = createConnections(() => ({ color: "#4e79a7", width: 2, pattern: [12, 8] }));

export const runningDash = createConnections(() => ({
  color: "#4e79a7",
  width: 2,
  pattern: [12, 8],
  effect: dashFlow.use({ pattern: [12, 8], speed: 40 }),
}));

export const dataStyled = createConnections((id) => {
  const hash = hashId(id);
  return { color: palette[hash % palette.length], width: 1 + (hash % 4) };
});

/**
 * A pipeline at work, picked per connection from a hash of its id: comets carry data forward at their own speed,
 * orange comets run back, green lines pass a signal wave across the graph, grey dashed lines wait.
 */
export const pipeline = createConnections((id) => {
  const hash = hashId(id);
  const kind = hash % 10;
  if (kind < 4) {
    const pattern = [90, 160];
    return {
      color: flowColors[hash % 3],
      width: 6,
      pattern,
      effect: dashFlow.use({ pattern, speed: 120 + (hash % 160), fade: true }),
    };
  }
  if (kind < 6) {
    const pattern = [60, 140];
    return {
      color: "#f28e2b",
      width: 5,
      pattern,
      effect: dashFlow.use({ pattern, speed: -(90 + (hash % 90)), fade: true }),
    };
  }
  if (kind < 8) return { color: "#2bb24c", width: 5, effect: pulse.use({ period: 3, wavelength: 24000 }) };
  return { color: "rgba(110, 110, 110, 0.6)", width: 2, pattern: [12, 12] };
});

/** Every connection carries comets forward; speed and color vary per connection. */
export const comets = createConnections((id) => {
  const hash = hashId(id);
  const pattern = [80, 180];
  return {
    color: flowColors[hash % 3],
    width: 5,
    pattern,
    effect: dashFlow.use({ pattern, speed: 100 + (hash % 220), fade: true }),
  };
});

/** One signal runs across the whole graph from the first layer to the last. */
export const signalWave = createConnections(() => ({
  color: "#7a5af8",
  width: 6,
  effect: pulse.use({ period: 4, wavelength: 30000 }),
}));

/** Particles at their own spacing and speed: a stroke wide enough for round dots. */
export const particleLines = createConnections((id) => {
  const hash = hashId(id);
  return {
    color: flowColors[hash % 3],
    width: 14,
    effect: particles.use({ spacing: 120 + (hash % 80), speed: 80 + (hash % 140) }),
  };
});

/** Blue at the source, orange at the target, and a band that runs along at its own pace. */
export const gradientLines = createConnections((id) => {
  const laps = 0.2 + (hashId(id) % 5) * 0.1;
  return {
    color: "#7a8aa6",
    width: 6,
    effect: gradient.use({ from: [0.18, 0.49, 0.96], to: [0.95, 0.56, 0.17], laps }),
  };
});

export const glowLines = createConnections(() => ({ color: "#2f7cf6", width: 3, effect: glow.use([]) }));

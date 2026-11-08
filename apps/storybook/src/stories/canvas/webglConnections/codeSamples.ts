/** Code samples shown in the stories; each compiles on its own against the public API. */

const imports = (names: string): string =>
  `import { ${names} } from "@gravity-ui/graph";\nimport type { TBaseConnectionState, TWebGLStroke } from "@gravity-ui/graph";\n`;

const hashHelper = `function hashId(id: string | number | undefined): number {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  return hash;
}
`;

export const runningDashCode = `${imports("BlockConnection, WebGLLine, dashFlow")}
class RunningDashLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    // dashFlow draws the dash itself: the base stroke has no \`dash\`
    return { ...super.getStroke(state), dash: undefined, effect: dashFlow.use({ pattern: [12, 8], speed: 40 }) };
  }
}
class RunningDashConnection extends BlockConnection {
  public static override line = RunningDashLine;
}
// Canvas twin: a Path2DLine subclass whose getStroke() returns { ...super.getStroke(state), dash: { pattern: [12, 8] } }
// graph.setSettings({ connection: RunningDashConnection });`;

export const perConnectionCode = `${imports("BlockConnection, WebGLLine")}
const palette = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];

${hashHelper}
class DataStyledLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.connection.props.id);
    return { ...stroke, color: palette[hash % palette.length], width: 1 + (hash % 4) };
  }
}
class DataStyledConnection extends BlockConnection {
  public static override line = DataStyledLine;
}
// graph.setSettings({ connection: DataStyledConnection });`;

export const stressCode = `${imports("BlockConnection, WebGLLine, dashFlow")}
// GraphEditor/GraphStressTest: generatePrettyBlocks({ layersCount: 110, connectionsPerLayer: 1000 }), straight lines
class StressLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return { ...super.getStroke(state), dash: undefined, effect: dashFlow.use({ pattern: [12, 8], speed: 40 }) };
  }
}
class StressConnection extends BlockConnection {
  public static override line = StressLine;
}
// graph.setSettings({ connection: StressConnection, useBezierConnections: false });
// The renderer switch picks the WebGL or the Path2D twin (Path2DLine, still dash) of the same look.`;

export const pipelineCode = `${imports("BlockConnection, WebGLLine, dashFlow, pulse")}
${hashHelper}
class PipelineLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const hash = hashId(this.connection.props.id);
    // forward comets, return comets, a signal wave or a waiting dashed line, from a hash of the id
    if (hash % 10 < 4) {
      const speed = 120 + (hash % 160);
      return { color: "#2f7cf6", width: 6, effect: dashFlow.use({ pattern: [90, 160], speed, fade: true }) };
    }
    if (hash % 10 < 6) {
      const speed = -(90 + (hash % 90));
      return { color: "#f28e2b", width: 5, effect: dashFlow.use({ pattern: [60, 140], speed, fade: true }) };
    }
    if (hash % 10 < 8) {
      return { color: "#2bb24c", width: 5, effect: pulse.use({ period: 3, wavelength: 24000 }) };
    }
    return { color: "rgba(110, 110, 110, 0.6)", width: 2, dash: { pattern: [12, 12] } };
  }
}
class PipelineConnection extends BlockConnection {
  public static override line = PipelineLine;
}
// Effects are WebGL only: the Path2D twin draws the still dashes and steady lines.`;

export const cometsCode = `${imports("BlockConnection, WebGLLine, dashFlow")}
${hashHelper}
class CometsLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const speed = 100 + (hashId(this.connection.props.id) % 220);
    return { color: "#2f7cf6", width: 5, effect: dashFlow.use({ pattern: [80, 180], speed, fade: true }) };
  }
}
class CometsConnection extends BlockConnection {
  public static override line = CometsLine;
}`;

export const signalWaveCode = `${imports("BlockConnection, WebGLLine, pulse")}
class SignalWaveLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    // the crest travels along the x axis: neighbouring connections pulse in step
    return { color: "#7a5af8", width: 6, effect: pulse.use({ period: 4, wavelength: 30000 }) };
  }
}
class SignalWaveConnection extends BlockConnection {
  public static override line = SignalWaveLine;
}`;

export const stillDashCode = `${imports("BlockConnection, WebGLLine")}
class StillDashLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return { ...super.getStroke(state), color: "#4e79a7", dash: { pattern: [12, 8] } };
  }
}
class StillDashConnection extends BlockConnection {
  public static override line = StillDashLine;
}`;

export const particlesCode = `${imports("BlockConnection, WebGLLine, defineConnectionEffect")}
const particles = defineConnectionEffect({
  animated: true,
  uniforms: { speed: { type: "float", value: 1 } },
  fragment: \`vec4 effect(ConnectionFragment f, vec4 color) {
    float offset = mod(f.along - f.time * f.params0.y * u_speed, f.params0.x) - f.params0.x * 0.5;
    float dist = length(vec2(offset * f.scale, f.across));
    float particle = 1.0 - smoothstep(f.halfWidth - 1.0, f.halfWidth, dist);
    return vec4(color.rgb, color.a * max(particle, 0.12));
  }\`,
  encode: ({ spacing, speed }: { spacing: number; speed: number }) => [spacing, speed],
});

class ParticlesLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    return { color: "#2f7cf6", width: 14, effect: particles.use({ spacing: 120, speed: 100 }) };
  }
}
class ParticlesConnection extends BlockConnection {
  public static override line = ParticlesLine;
}
// particles.uniforms.speed.value = 2; // all connections at once
// The phase is time * speed, so the dots jump while the speed changes.`;

export const gradientCode = `${imports("BlockConnection, WebGLLine, defineConnectionEffect")}
const gradient = defineConnectionEffect({
  animated: true,
  fragment: \`vec4 effect(ConnectionFragment f, vec4 color) {
    vec3 rgb = mix(f.params0.rgb, f.params1.rgb, f.t);
    float band = smoothstep(0.8, 1.0, fract(f.t - f.time * f.params0.w));
    return vec4(rgb, color.a * mix(0.35, 1.0, band));
  }\`,
  encode: ({ from, to, laps }: { from: readonly number[]; to: readonly number[]; laps: number }) => [
    ...from,
    laps,
    ...to,
    0,
  ],
  fallback: (stroke) => stroke, // Path2D draws the plain stroke while WebGL is unavailable
});

class GradientLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    return {
      color: "#7a8aa6",
      width: 6,
      effect: gradient.use({ from: [0.18, 0.49, 0.96], to: [0.95, 0.56, 0.17], laps: 0.3 }),
    };
  }
}
class GradientConnection extends BlockConnection {
  public static override line = GradientLine;
}`;

export const glowCode = `${imports("BlockConnection, WebGLLine, defineConnectionEffect")}
const glow = defineConnectionEffect({
  extraWidth: 6, // CSS pixels drawn outside each side of the stroke
  uniforms: { intensity: { type: "float", value: 0.6 } },
  fragment: \`vec4 effect(ConnectionFragment f, vec4 color) {
    float outside = max(abs(f.across) - f.halfWidth, 0.0) / f.extraWidth;
    float glowAlpha = u_intensity * pow(1.0 - clamp(outside, 0.0, 1.0), 2.0);
    return mix(vec4(color.rgb, color.a * glowAlpha), color, f.coverage);
  }\`,
  fallback: (stroke) => stroke,
});

class GlowLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return { ...super.getStroke(state), color: "#2f7cf6", width: 3, effect: glow.use([]) };
  }
}
class GlowConnection extends BlockConnection {
  public static override line = GlowLine;
}
// glow.uniforms.intensity.value = 1; // the slider does this`;

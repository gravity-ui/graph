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
    // dashFlow draws the dash itself, so the stroke has no \`dash\`;
    // selected, it fills the gaps with the selection color
    const effect = dashFlow.use({ pattern: [12, 8], speed: 40 });
    return this.withInteraction({ color: "#4e79a7", width: 2, effect }, state);
  }
}
class RunningDashConnection extends BlockConnection {
  public static override line = RunningDashLine;
}
// Canvas twin: a Path2DLine subclass returning this.withInteraction({ color, width: 2, dash: { pattern: [12, 8] } }, state)
// graph.setSettings({ connection: RunningDashConnection });`;

export const perConnectionCode = `${imports("BlockConnection, WebGLLine")}
const palette = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];

${hashHelper}
class DataStyledLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const hash = hashId(this.connection.props.id);
    // without an effect: the selection color and 2 units more width on hover and selection, as for the default stroke
    return this.withInteraction({ color: palette[hash % palette.length], width: 1 + (hash % 4) }, state);
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
    const effect = dashFlow.use({ pattern: [12, 8], speed: 40 });
    return this.withInteraction({ color: "#4e79a7", width: 2, effect }, state);
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
    // the comets, the wave and the dash stay on hover and selection; dashFlow and pulse show the selection color
    return this.withInteraction(this.look(), state);
  }

  private look(): TWebGLStroke {
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
    const speed = 100 + (hashId(this.connection.props.id) % 220);
    const effect = dashFlow.use({ pattern: [80, 180], speed, fade: true });
    return this.withInteraction({ color: "#2f7cf6", width: 5, effect }, state);
  }
}
class CometsConnection extends BlockConnection {
  public static override line = CometsLine;
}`;

export const signalWaveCode = `${imports("BlockConnection, WebGLLine, pulse")}
class SignalWaveLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    // the crest travels along the x axis: neighbouring connections pulse in step
    return this.withInteraction({ color: "#7a5af8", width: 6, effect: pulse.use({ period: 4, wavelength: 30000 }) }, state);
  }
}
class SignalWaveConnection extends BlockConnection {
  public static override line = SignalWaveLine;
}`;

export const stillDashCode = `${imports("BlockConnection, WebGLLine")}
class StillDashLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return this.withInteraction({ color: "#4e79a7", width: 2, dash: { pattern: [12, 8] } }, state);
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
    // the trace: faint in the line's color; selected, the selection color
    vec4 trace = f.selected > 0.5
      ? vec4(f.selectionColor.rgb, f.selectionColor.a * 0.6)
      : vec4(color.rgb, color.a * 0.12);
    vec3 dotColor = mix(color.rgb, vec3(1.0), 0.2 * f.selected); // a little brighter while selected
    return mix(trace, vec4(dotColor, 1.0), color.a * particle);
  }\`,
  encode: ({ spacing, speed }: { spacing: number; speed: number }) => [spacing, speed],
});

class ParticlesLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return this.withInteraction({ color: "#2f7cf6", width: 14, effect: particles.use({ spacing: 120, speed: 100 }) }, state);
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
    vec4 inside = vec4(rgb, color.a * mix(0.35, 1.0, band));
    // selected: a border in the selection color, the outer 1.5 CSS pixels of each side
    float edge = f.halfWidth - min(1.5, f.halfWidth * 0.5);
    float border = f.selected * smoothstep(edge - 0.5, edge, abs(f.across));
    return mix(inside, f.selectionColor, border);
  }\`,
  encode: ({ from, to, laps }: { from: readonly number[]; to: readonly number[]; laps: number }) => [
    ...from,
    laps,
    ...to,
  ],
  fallback: (stroke) => stroke, // Path2D draws the plain stroke while WebGL is unavailable
});

class GradientLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const effect = gradient.use({ from: [0.18, 0.49, 0.96], to: [0.95, 0.56, 0.17], laps: 0.3 });
    return this.withInteraction({ color: "#7a8aa6", width: 6, effect }, state);
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
    float falloff = pow(1.0 - clamp(outside, 0.0, 1.0), 2.0);
    // selected: the halo takes the selection color, stronger; the line keeps its color
    vec4 halo = f.selected > 0.5
      ? vec4(f.selectionColor.rgb, f.selectionColor.a * min(u_intensity + 0.4, 1.0) * falloff)
      : vec4(color.rgb, color.a * u_intensity * falloff);
    return mix(halo, color, f.coverage);
  }\`,
  fallback: (stroke) => stroke,
});

class GlowLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return this.withInteraction({ color: "#2f7cf6", width: 3, effect: glow.use([]) }, state);
  }
}
class GlowConnection extends BlockConnection {
  public static override line = GlowLine;
}
// glow.uniforms.intensity.value = 1; // the slider does this`;

export const etlCode = `import { BlockConnection, ECanDrag, WebGLLine, dashFlow, pulse } from "@gravity-ui/graph";
import type { Graph, TBaseConnectionState, TBlock, TBlockId, TConnection, TWebGLStroke } from "@gravity-ui/graph";

type TStageStatus = "running" | "succeeded" | "idle" | "paused" | "failed";
type TStage = TBlock & { status: TStageStatus };
type TFlow = TConnection & { volume: number; status: "running" | "idle" | "failed" };

// The look depends on data outside the connection's store: the selected effect
let flowEffect: "comets" | "pulse" | "plain" = "comets";

class FlowLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const { status, volume = 1 } = state as TBaseConnectionState & Partial<TFlow>;
    // failed and idle flows keep their own look, whatever the effect
    if (status === "failed") {
      return this.withInteraction({ color: "#e5484d", width: 3, dash: { pattern: [10, 8] } }, state);
    }
    if (status === "idle") return this.withInteraction({ color: "#888888", width: 1 }, state);
    const width = 2 + volume * 0.4;
    if (flowEffect === "comets") {
      const effect = dashFlow.use({ pattern: [40, 50], speed: 40 + volume * 20, fade: true });
      return this.withInteraction({ color: "#2f7cf6", width, effect }, state);
    }
    if (flowEffect === "pulse") {
      const effect = pulse.use({ period: 4.5 - volume * 0.3, wavelength: 3000 });
      return this.withInteraction({ color: "#2f7cf6", width, effect }, state);
    }
    return this.withInteraction({ color: "#2f7cf6", width }, state);
  }
}
class FlowConnection extends BlockConnection {
  public static override line = FlowLine;
}

function setupGraph(graph: Graph): void {
  // the stages can be dragged; the flows follow them
  graph.updateSettings({ connection: FlowConnection, canDrag: ECanDrag.ALL });
}

// On change, every connection reads its line again:
function setFlowEffect(graph: Graph, next: typeof flowEffect): void {
  flowEffect = next;
  for (const state of graph.rootStore.connectionsList.$connections.value) {
    const view = state.getViewComponent();
    if (view instanceof BlockConnection) view.invalidateLine();
  }
}

// A flow takes its status from its stages
function flowStatus(source: TStageStatus, target: TStageStatus): TFlow["status"] {
  if (target === "failed") return "failed";
  if (source === "failed" || source === "paused" || source === "idle") return "idle";
  return "running";
}

function stageStatus(graph: Graph, id: TBlockId | undefined): TStageStatus {
  const stage = id === undefined ? undefined : (graph.api.getBlockById(id) as TStage | undefined);
  return stage?.status ?? "idle";
}

// Run, Pause, Retry: the stage and the flows touching it; the lines follow the connection state
function setStageStatus(graph: Graph, id: TBlockId, status: TStageStatus): void {
  const stage: Pick<TStage, "id" | "status"> = { id, status };
  graph.api.updateBlock(stage);
  for (const flow of graph.rootStore.blocksList.getBlockConnections(id)) {
    const source = stageStatus(graph, flow.sourceBlockId);
    const update: Partial<TFlow> = { status: flowStatus(source, stageStatus(graph, flow.targetBlockId)) };
    graph.api.updateConnection(flow.id, update);
  }
}`;

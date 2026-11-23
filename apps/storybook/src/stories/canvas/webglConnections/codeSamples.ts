/** Code samples shown in the stories; each compiles on its own against the public API. */

const imports = (names: string): string =>
  `import { ${names} } from "@gravity-ui/graph";\nimport type { TBaseConnectionState, TSceneLineStroke } from "@gravity-ui/graph";\n`;

const hashHelper = `function hashId(id: string | number | undefined): number {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  return hash;
}
`;

export const runningDashCode = `${imports("BlockConnection, SceneLine, dashFlow")}
class RunningDashLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    // dashFlow draws the dash itself, so the stroke has no \`dash\`;
    // selected, it fills the gaps with the selection color
    const effect = dashFlow.use({ pattern: [12, 8], speed: 40 });
    return this.withInteraction({ color: "#4e79a7", width: 2, effect }, state);
  }
}
class RunningDashConnection extends BlockConnection {
  public static override line = RunningDashLine;
}
// Register the connection once.
// graph.updateSettings({ connection: RunningDashConnection });
// Switch the same graph at runtime. Canvas draws the base stroke.
// graph.scene.setRenderer("canvas");
// graph.scene.setRenderer("webgl");`;

export const perConnectionCode = `${imports("BlockConnection, SceneLine")}
const palette = ["#e15759", "#4e79a7", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2"];

${hashHelper}
class DataStyledLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    const hash = hashId(this.connection.props.id);
    // without an effect: the selection color and 2 units more width on hover and selection, as for the default stroke
    return this.withInteraction({ color: palette[hash % palette.length], width: 1 + (hash % 4) }, state);
  }
}
class DataStyledConnection extends BlockConnection {
  public static override line = DataStyledLine;
}
// graph.updateSettings({ connection: DataStyledConnection });`;

export const stressCode = `import { BlockConnection } from "@gravity-ui/graph";
import type { Graph } from "@gravity-ui/graph";

function showSolidConnections(graph: Graph): void {
  graph.updateSettings({ connection: BlockConnection });
}`;

export const gradientCode = `${imports("BlockConnection, SceneLine, pathGradient")}
const effect = pathGradient.use({ from: "#2f7cf6", to: "#f28e2b" });

class GradientLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    // Canvas draws the base colour.
    return this.withInteraction({ color: "#4e79a7", width: 6, effect }, state);
  }
}
class GradientConnection extends BlockConnection {
  public static override line = GradientLine;
}
// graph.updateSettings({ connection: GradientConnection });`;

export const etlCode = (
  gradientSpeed: number
) => `import { BlockConnection, ECanDrag, SceneLine, dashFlow, pathGradient } from "@gravity-ui/graph";
import type { Graph, TBaseConnectionState, TBlock, TBlockId, TConnection, TSceneLineStroke } from "@gravity-ui/graph";

type TStageStatus = "running" | "succeeded" | "idle" | "paused" | "failed";
type TStage = TBlock & { status: TStageStatus };
type TFlow = TConnection & { volume: number; status: "running" | "idle" | "failed" };

type FlowEffect = "plain" | "dash" | "gradient";
function installFlowEffect(graph: Graph, initial: FlowEffect) {
  let flowEffect = initial;

  class FlowLine extends SceneLine {
    public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
      const { status, volume = 1 } = state as TBaseConnectionState & Partial<TFlow>;
      // failed and idle flows keep their own look, whatever the effect
      if (status === "failed") {
        return this.withInteraction({ color: "#e5484d", width: 3, dash: { pattern: [10, 8] } }, state);
      }
      if (status === "idle") return this.withInteraction({ color: "#888888", width: 1 }, state);
      if (flowEffect === "dash") {
        const effect = dashFlow.use({ pattern: [16, 10], speed: 15 + volume * 10 });
        return this.withInteraction({ color: "#2f7cf6", width: 2 + volume * 0.3, effect }, state);
      }
      if (flowEffect === "gradient") {
        const effect = pathGradient.use({ from: "#2f7cf6", to: "#f28e2b", speed: ${gradientSpeed} });
        return this.withInteraction({ color: "#7a8aa6", width: 4 + volume * 0.4, effect }, state);
      }
      return this.withInteraction({ color: "#2f7cf6", width: 2 + volume * 0.4 }, state);
    }
  }
  class FlowConnection extends BlockConnection {
    public static override line = FlowLine;
  }

  graph.updateSettings({ renderer: "webgl", connection: FlowConnection, canDrag: ECanDrag.ALL });

  return (next: FlowEffect) => {
    flowEffect = next;
    for (const state of graph.rootStore.connectionsList.$connections.value) {
      const view = state.getViewComponent();
      if (view instanceof BlockConnection) view.invalidateLine();
    }
  };
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

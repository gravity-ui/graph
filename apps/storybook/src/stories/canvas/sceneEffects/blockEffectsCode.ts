import type { TSceneRenderer } from "@gravity-ui/graph";

import type { TEffectPart } from "./effectPaths";

export function blockEffectsCode(renderer: TSceneRenderer, effects: readonly TEffectPart[]): string {
  return `import { CanvasBlock, Graph, dashFlow, defineTag, lineSegment } from "@gravity-ui/graph";
import type { TScenePrimitive, TSceneStyles, TStyleParts } from "@gravity-ui/graph";

const runningTag = defineTag("running");
const color = "#2f7cf6";
const flow = dashFlow.use({ pattern: [14, 10], speed: 40 });

class RunningBlock extends CanvasBlock {
  public declare readonly __styleParts?: TStyleParts<"body" | "border" | "title" | "halo" | "badge" | "march">;

  public static override getSceneStyles(): TSceneStyles<typeof this> {
    return [
      { style: { parts: { march: { visible: false } } } },
      {
        tags: [runningTag],
        style: { parts: { march: { visible: true, effect: flow }, title: { color } } },
      },
    ];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    const { width, height } = this.state;
    const topLeft = { x: 2, y: 2 };
    const topRight = { x: width - 2, y: 2 };
    const bottomRight = { x: width - 2, y: height - 2 };
    const bottomLeft = { x: 2, y: height - 2 };
    return [
      ...super.schematic(),
      {
        kind: "path",
        part: "march",
        closed: true,
        segments: new Float32Array([
          ...lineSegment(topLeft, topRight),
          ...lineSegment(topRight, bottomRight),
          ...lineSegment(bottomRight, bottomLeft),
          ...lineSegment(bottomLeft, topLeft),
        ]),
        stroke: { color, width: 4 },
      },
    ];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return this.schematic();
  }
}

export function mountGraph(root: HTMLDivElement) {
  const graph = new Graph(
    {
      settings: { renderer: "${renderer}", blockComponents: { job: RunningBlock } },
      blocks: [{ id: "job-1", is: "job", name: "Import", x: 24, y: 24, width: 220, height: 100 }],
    },
    root
  );
  graph.start();
  setRunning(graph, ${effects.includes("march")});
  return graph;
}

export function setRunning(graph: Graph, running: boolean) {
  const members = { block: ["job-1"] };
  if (running) graph.scene.tags.add(runningTag, members);
  else graph.scene.tags.delete(runningTag, members);
}`;
}

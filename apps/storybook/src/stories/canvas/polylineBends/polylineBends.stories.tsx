import React, { useEffect } from "react";

import { BlockConnection, MultipointConnection, defineTag } from "@gravity-ui/graph";
import type { TBlock, TMultipointConnection, TSceneRenderer } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

const blocks: TBlock[] = [
  { id: "source", is: "Block", name: "", x: -10000, y: 40, width: 20, height: 20 },
  { id: "target", is: "Block", name: "", x: -10000, y: 100, width: 20, height: 20 },
];
const patterns = { dashed: [19, 13], long: [24, 8], solid: [] };
const strokeWidthTag = defineTag("stroke-width");
const viewConfiguration = {
  colors: { canvas: { belowLayerBackground: "#fff", layerBackground: "#fff", border: "#fff", dots: "#fff" } },
};

interface Args {
  renderer: TSceneRenderer;
  bend: "acute" | "reversing";
  repeatVertex: boolean;
  width: number;
  pattern: keyof typeof patterns;
  view: "route" | "lowerBend";
}

function PolylineBends({ renderer, bend, repeatVertex, width, pattern, view }: Args) {
  const { graph, setEntities, start, updateEntities } = useGraph({
    settings: { renderer, connection: MultipointConnection, showConnectionArrows: false, showConnectionLabels: false },
    viewConfiguration,
  });
  const activeRenderer = useSignal(graph.scene.$renderer);

  useEffect(() => {
    setEntities({ blocks });
    graph.scene.tags.add(strokeWidthTag, { connection: ["edge"] });
    start();
  }, [graph, setEntities, start]);

  useEffect(() => {
    const corner = { x: 400, y: 100 };
    const points = [
      { x: 80, y: 100 },
      corner,
      { x: 140, y: bend === "acute" ? 145 : 100 },
      { x: 150, y: 220 },
      { x: 430, y: 220 },
    ];
    if (repeatVertex) points.splice(1, 0, corner);
    const edge: TMultipointConnection = {
      id: "edge",
      sourceBlockId: "source",
      targetBlockId: "target",
      points,
      dashed: pattern !== "solid",
      styles: { background: "rgba(255, 0, 0, 0.5)", dashes: patterns[pattern] },
    };
    updateEntities({ connections: [edge] });
  }, [bend, repeatVertex, pattern, updateEntities]);

  useEffect(
    () =>
      graph.scene.styles.add([
        { target: BlockConnection, tags: [strokeWidthTag], style: { parts: { line: { width } } } },
      ]),
    [graph, width]
  );

  useEffect(() => {
    graph.runAfterGraphReady(() => {
      const { width, height } = graph.cameraService.getCameraState();
      const detail = view === "lowerBend";
      const scale = detail ? 4 : Math.min(1, width / 400, height / 180);
      graph.cameraService.set({
        x: Math.round(width / 2 - (detail ? 155 : 255) * scale),
        y: Math.round(height / 2 - (detail ? 215 : 160) * scale),
        scale,
        scaleMax: 8,
      });
    });
  }, [graph, view]);

  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <GraphCanvas graph={graph} className="graph-canvas" />
      <output style={{ position: "absolute", bottom: 12, left: 16, pointerEvents: "none" }}>
        Scene renderer: {activeRenderer}
      </output>
    </div>
  );
}

const meta = {
  title: "Scene/Diagnostics/Polyline bends",
  component: PolylineBends,
  parameters: { layout: "fullscreen" },
  args: { renderer: "webgl", bend: "acute", repeatVertex: false, width: 16, pattern: "dashed", view: "route" },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["webgl", "canvas"] },
    bend: { name: "Bend", control: "inline-radio", options: ["acute", "reversing"] },
    repeatVertex: { name: "Repeat first corner", control: "boolean" },
    width: { name: "Stroke width", control: { type: "range", min: 1, max: 32, step: 1 } },
    pattern: {
      name: "Dash pattern",
      control: { type: "inline-radio", labels: { dashed: "19 / 13", long: "24 / 8", solid: "Solid" } },
      options: ["dashed", "long", "solid"],
    },
    view: {
      name: "Camera",
      control: { type: "inline-radio", labels: { route: "Whole route", lowerBend: "Lower bend ×4" } },
      options: ["route", "lowerBend"],
    },
  },
} satisfies Meta<Args>;

export default meta;

export const StrokeCoverage: StoryObj<typeof meta> = {};

import React, { useCallback, useEffect, useRef, useState } from "react";

import { dashFlow } from "@gravity-ui/graph";
import type { Graph, TScenePrimitive } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/uikit/styles/styles.css";

type TRenderer = "canvas" | "webgl";
type TBounds = { minX: number; minY: number; maxX: number; maxY: number };

const BLOCK_WIDTH = 200;
const BLOCK_HEIGHT = 100;
const ANCHORS = 8;

/** A block look: body, an inset border with a pixel clamp, a title and anchors along the bottom edge. */
function blockPrimitives(title: string, fill: string): TScenePrimitive[] {
  const anchors: TScenePrimitive[] = Array.from({ length: ANCHORS }, (_, index) => ({
    kind: "circle",
    cx: (BLOCK_WIDTH / (ANCHORS + 1)) * (index + 1),
    cy: BLOCK_HEIGHT,
    r: 5,
    fill: "#ff8800",
    part: "anchor",
  }));
  return [
    { kind: "rect", x: 0, y: 0, width: BLOCK_WIDTH, height: BLOCK_HEIGHT, radius: 8, fill, part: "body" },
    {
      kind: "rect",
      x: 0,
      y: 0,
      width: BLOCK_WIDTH,
      height: BLOCK_HEIGHT,
      radius: 8,
      border: { color: "#dfdfdf", width: { px: 3, minWorld: 3, maxWorld: 10 }, align: "inside" },
      part: "border",
    },
    {
      kind: "text",
      text: title,
      family: "sans-serif",
      size: 16,
      lineHeight: 20,
      color: "#ffffff",
      x: 12,
      y: 12,
      width: BLOCK_WIDTH - 24,
    },
    ...anchors,
  ];
}

const blockBounds: TBounds = { minX: -10, minY: -10, maxX: BLOCK_WIDTH + 10, maxY: BLOCK_HEIGHT + 10 };

/** A straight cubic from (x0, y0) to (x1, y1). */
function line(x0: number, y0: number, x1: number, y1: number): Float32Array {
  const dx = (x1 - x0) / 3;
  const dy = (y1 - y0) / 3;
  return new Float32Array([x0, y0, x0 + dx, y0 + dy, x1 - dx, y1 - dy, x1, y1]);
}

function fillScene(graph: Graph): void {
  const store = graph.scene.store;
  // React StrictMode runs effects twice in development; the scene lives on the same graph.
  if (store.get("A")) return;
  store.add({ id: "A", zIndex: 200, x: 0, y: 0, bounds: blockBounds, primitives: blockPrimitives("Alpha", "#204060") });
  store.add({
    id: "B",
    zIndex: 200,
    x: 150,
    y: 60,
    bounds: blockBounds,
    primitives: blockPrimitives("Beta", "#604020"),
  });
  store.add({
    id: "flow",
    zIndex: 100,
    x: 0,
    y: 0,
    bounds: { minX: -60, minY: 40, maxX: 460, maxY: 60 },
    primitives: [
      {
        kind: "path",
        segments: line(-50, 50, 450, 50),
        stroke: { color: "#00c853", width: 6 },
        effect: dashFlow.use({ pattern: [16, 10], speed: 60 }),
      },
    ],
  });
  store.add({
    id: "thin",
    zIndex: 100,
    x: 0,
    y: 0,
    bounds: { minX: -60, minY: 170, maxX: 460, maxY: 190 },
    primitives: [{ kind: "path", segments: line(-50, 180, 450, 180), stroke: { color: "#272727", width: 1 } }],
  });
  store.add({
    id: "glass",
    zIndex: 300,
    x: 40,
    y: 20,
    bounds: { minX: 0, minY: 0, maxX: 120, maxY: 70 },
    primitives: [{ kind: "rect", x: 0, y: 0, width: 120, height: 70, radius: 4, fill: "rgba(255, 0, 0, 0.5)" }],
  });
}

function addMany(graph: Graph, count: number): void {
  const store = graph.scene.store;
  const columns = Math.ceil(Math.sqrt(count));
  if (store.get("cell-0")) return;
  for (let index = 0; index < count; index++) {
    const x = 600 + (index % columns) * 14;
    const y = Math.floor(index / columns) * 14;
    store.add({
      id: `cell-${index}`,
      zIndex: 200,
      x,
      y,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: index % 2 ? "#3f51b5" : "#00bcd4" }],
    });
  }
}

type RuntimeArgs = { renderer: TRenderer };

const SceneRuntimeApp = ({ renderer }: RuntimeArgs): React.JSX.Element => {
  const { graph, start, zoomTo } = useGraph({});
  const [lowered, setLowered] = useState(false);
  const [tagged, setTagged] = useState(false);
  const [many, setMany] = useState(false);
  const selectedStyle = useRef<number | undefined>(undefined);
  const state = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);

  useEffect(() => {
    const debugWindow = window as Window & { sceneGraph?: Graph };
    debugWindow.sceneGraph = graph;
    fillScene(graph);
    start();
    zoomTo({ x: -80, y: -40, width: 620, height: 280 }, { padding: 40 });
    return () => {
      if (debugWindow.sceneGraph === graph) delete debugWindow.sceneGraph;
    };
  }, [graph, start, zoomTo]);

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  const toggleLowered = useCallback((): void => {
    graph.scene.store.update("A", { zIndex: lowered ? 200 : 50 });
    setLowered(!lowered);
  }, [graph, lowered]);

  const toggleTag = useCallback((): void => {
    const store = graph.scene.store;
    if (selectedStyle.current === undefined) {
      selectedStyle.current = store.defineStyle({
        parts: { border: { color: "#ffcc00" }, anchor: { color: "#ffffff" } },
      });
    }
    store.setStyle("A", tagged ? 0 : selectedStyle.current);
    setTagged(!tagged);
  }, [graph, tagged]);

  const addCells = useCallback((): void => {
    if (many) return;
    addMany(graph, 3000);
    setMany(true);
  }, [graph, many]);

  const loseContext = useCallback((): void => {
    const backend = graph.scene.layer.getBackend();
    const gl = backend?.canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return;
    extension.loseContext();
    window.setTimeout(() => extension.restoreContext(), 1500);
  }, [graph]);

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">Draw order and context recovery</Text>
          <Text variant="body-1">
            Lower Alpha to check draw order. Choose WebGL in Controls to test whether the scene recovers after context
            loss.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            <Button onClick={toggleLowered}>
              {lowered ? "Raise Alpha above the line" : "Lower Alpha under the line"}
            </Button>
            <Button onClick={toggleTag}>{tagged ? "Clear the style on Alpha" : "Style Alpha (border, anchors)"}</Button>
            <Button onClick={addCells} disabled={many}>
              Add 3000 elements
            </Button>
            <Button onClick={loseContext} disabled={state !== "webgl"}>
              Lose the WebGL context for 1.5 s
            </Button>
          </Flex>
          <Flex alignItems="center" gap={3} wrap>
            <Button size="s" onClick={() => zoomTo({ x: -80, y: -40, width: 620, height: 280 }, { padding: 40 })}>
              Fit the scene
            </Button>
            <Text variant="body-1">Zoom:</Text>
            {[1, 0.5, 0.2, 0.1, 0.05].map((scale) => (
              <Button key={scale} size="s" onClick={() => graph.zoom({ scale })}>
                {scale}
              </Button>
            ))}
          </Flex>
          <Text variant="body-1" color="secondary">
            graph.scene.$renderer: <b>{state}</b> · graph.scene.$level: <b>{level}</b>
          </Text>
        </Flex>
        <div style={{ flex: 1, minHeight: 400, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta<RuntimeArgs> = {
  id: "canvas-sceneruntime",
  title: "Scene/Diagnostics/Rendering",
  component: SceneRuntimeApp,
  args: { renderer: "canvas" },
  argTypes: { renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] } },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const SceneRuntime: StoryFn<RuntimeArgs> = (args) => <SceneRuntimeApp {...args} />;
SceneRuntime.storyName = "Draw order and context recovery";
SceneRuntime.parameters = {
  docs: {
    description: {
      story:
        "A demo of `graph.scene`: rects, text, anchors, a flowing `dashFlow` connection (animated on WebGL only), " +
        "a thin stroke and a translucent rect, ordered by `(zIndex, order)`. The buttons lower a block under the " +
        "connection, restyle it through the style table, add 3000 elements and simulate a WebGL context loss.",
    },
  },
};

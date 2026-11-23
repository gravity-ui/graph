import React, { useEffect, useState } from "react";

import { CanvasBlock, ECanDrag, defineTag } from "@gravity-ui/graph";
import type { TBlock, TConnection, TSceneLevel, TStyleRule } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/uikit/styles/styles.css";

type BlockArgs = {
  renderer: "canvas" | "webgl";
  titleMode: "world" | "camera-aware";
  cameraAwareText: boolean;
  running: boolean;
  failed: boolean;
  highlight: boolean;
  focus: boolean;
};

const runningTag = defineTag("running");
const failedTag = defineTag("failed");
const highlightTag = defineTag("highlight");
const focusTag = defineTag("focus");

/** Every state is a tag and a rule on the default Block's parts: no subclass (T1). */
const rules: TStyleRule<typeof CanvasBlock>[] = [
  { target: CanvasBlock, tags: [runningTag], style: { parts: { border: { color: "#2e7d32" } } } },
  {
    target: CanvasBlock,
    tags: [runningTag],
    scope: { levels: ["minimalistic"] },
    priority: 1,
    style: { parts: { body: { color: "#2e7d32" } } },
  },
  {
    target: CanvasBlock,
    tags: [failedTag],
    style: { parts: { border: { color: "#d32f2f" }, badge: { visible: true, color: "#d32f2f" } } },
  },
  { target: CanvasBlock, tags: [highlightTag], style: { parts: { halo: { visible: true, color: "#ffb300" } } } },
  { target: CanvasBlock, root: [focusTag], notTags: [highlightTag], style: { dim: 0.6 } },
];

/** The title keeps its 24 px on screen and re-fits the block as the camera zooms (`TScenePartStyle.cameraAware`). */
const cameraAwareTitle: TStyleRule<typeof CanvasBlock> = {
  target: CanvasBlock,
  style: { parts: { title: { cameraAware: true } } },
};

/**
 * A camera scale on each level of the default constants (`block.SCALES` [0.125, 0.225, 0.7]): anchors are drawn on the
 * schematic level only, the title from 0.125 on and not on the detailed level, and the running body on minimalistic.
 */
const LEVEL_SCALES: readonly { level: TSceneLevel; scale: number }[] = [
  { level: "minimalistic", scale: 0.18 },
  { level: "schematic", scale: 0.5 },
  { level: "detailed", scale: 1 },
];

const blocks: TBlock[] = Array.from({ length: 6 }, (_, i) => ({
  id: `b${i + 1}`,
  is: "Block",
  name: `Stage ${i + 1}`,
  x: (i % 3) * 320,
  y: Math.floor(i / 3) * 220,
  width: 220,
  height: 120,
  anchors: [
    { id: `b${i + 1}_in`, blockId: `b${i + 1}`, type: "IN" },
    { id: `b${i + 1}_out`, blockId: `b${i + 1}`, type: "OUT" },
  ],
}));

const connections: TConnection[] = [
  { id: "c1", sourceBlockId: "b1", sourceAnchorId: "b1_out", targetBlockId: "b2", targetAnchorId: "b2_in" },
  { id: "c2", sourceBlockId: "b2", sourceAnchorId: "b2_out", targetBlockId: "b3", targetAnchorId: "b3_in" },
  { id: "c3", sourceBlockId: "b4", sourceAnchorId: "b4_out", targetBlockId: "b5", targetAnchorId: "b5_in" },
];

/** Downloads a canvas as a PNG: Chromium blocks window.open of data URLs (review M9). */
function downloadPng(canvas: HTMLCanvasElement, name: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

const SceneBlocksApp = ({
  renderer,
  titleMode,
  cameraAwareText,
  running,
  failed,
  highlight,
  focus,
}: BlockArgs): React.JSX.Element => {
  const { graph, start, setEntities, zoomTo } = useGraph({});
  const rendererState = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);
  const generation = useSignal(graph.scene.$styleGeneration);
  // Selecting b2 writes selectedTag, which the explain panel shows.
  const selection = useSignal(graph.selectionService.$selection);

  useEffect(() => {
    setEntities({ blocks, connections });
    const remove = graph.scene.styles.add(rules);
    start();
    zoomTo("center", { padding: 40 });
    return remove;
  }, [graph, setEntities, start, zoomTo]);

  useEffect(() => {
    // Dragging is off by default: it is needed to drag one block onto another.
    graph.updateSettings({ renderer, canDrag: ECanDrag.ALL });
  }, [graph, renderer]);

  // "world": no rule, the title is world text; "camera-aware": a base rule turns the title part camera-aware.
  useEffect(
    () => (titleMode === "camera-aware" ? graph.scene.styles.add([cameraAwareTitle]) : undefined),
    [graph, titleMode]
  );

  // The graph-wide switch: off makes every scene text world-sized, whatever the rules say.
  useEffect(() => {
    graph.updateSettings({ cameraAwareText });
  }, [graph, cameraAwareText]);

  useEffect(() => {
    graph.scene.tags.set(runningTag, { block: running ? ["b1", "b2"] : [] });
    graph.scene.tags.set(failedTag, { block: failed ? ["b3"] : [] });
    graph.scene.tags.set(highlightTag, { block: highlight || focus ? ["b2", "b5"] : [] });
    graph.scene.tags.setRoot(focusTag, focus);
  }, [graph, running, failed, highlight, focus]);

  const [explanation, setExplanation] = useState("");
  // After the tag effect above (effects run in order): explain reads the tags without subscribing, so it must run
  // once they are written, not while rendering.
  useEffect(() => {
    setExplanation(JSON.stringify(graph.scene.explain("block", "b2"), null, 2));
  }, [graph, running, failed, highlight, focus, selection, level, generation, renderer, titleMode, cameraAwareText]);

  const exportImage = (): void => downloadPng(graph.scene.toImage({ background: "#ffffff" }), "scene-blocks.png");
  const zoomToScale = (scale: number): void => {
    const { width, height } = graph.cameraService.getCameraState();
    graph.cameraService.zoom(width / 2, height / 2, scale);
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="body-1">
            Change a tag in Controls to inspect the matching rules on b2. Drag one block over another to check drawing
            order.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            <Button onClick={exportImage}>Export PNG</Button>
            {LEVEL_SCALES.map(({ level: target, scale }) => (
              <Button key={target} view={level === target ? "action" : "normal"} onClick={() => zoomToScale(scale)}>
                Zoom to {target} ({scale})
              </Button>
            ))}
          </Flex>
          <Text variant="body-1" color="secondary">
            graph.scene.$renderer: <b>{rendererState}</b> · graph.scene.$level: <b>{level}</b>
          </Text>
        </Flex>
        <Flex style={{ flex: 1, minHeight: 400 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <GraphCanvas graph={graph} className="graph-canvas" />
          </div>
          <pre style={{ width: 360, margin: 0, padding: 12, overflow: "auto", fontSize: 12 }}>
            {`explain("block", "b2")\n${explanation}`}
          </pre>
        </Flex>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta<BlockArgs> = {
  id: "canvas-sceneblocks",
  title: "Scene/Diagnostics/Style inspector",
  component: SceneBlocksApp,
  args: {
    renderer: "canvas",
    titleMode: "world",
    cameraAwareText: true,
    running: false,
    failed: false,
    highlight: false,
    focus: false,
  },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] },
    titleMode: { name: "Title sizing", control: "inline-radio", options: ["world", "camera-aware"] },
    cameraAwareText: { name: "Enable camera-aware text", control: "boolean" },
    running: { name: "Running (b1, b2)", control: "boolean" },
    failed: { name: "Failed (b3)", control: "boolean" },
    highlight: { name: "Highlight (b2, b5)", control: "boolean" },
    focus: { name: "Focus (b2, b5)", control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;

export const SceneBlocks: StoryFn<BlockArgs> = (args) => <SceneBlocksApp {...args} />;
SceneBlocks.storyName = "Block parts and zoom levels";

SceneBlocks.parameters = {
  docs: {
    description: {
      story:
        "The default `Block` drawn by `graph.scene`, styled by tags and rules: `running` colours the " +
        "border of b1 and b2 (and their bodies on the minimalistic level), `failed` shows b3's red border and badge, " +
        "`highlight` shows the halo of b2 and b5, and a root `focus` tag dims every other block with its anchors. " +
        "Selecting a block raises it and its anchors over a neighbour it overlaps (drag one onto another). " +
        "`Export PNG` downloads `graph.scene.toImage()` of the current view, connections and grid included. The " +
        "panel shows `graph.scene.explain()` for b2. `Title` switches the title between world text and a " +
        "camera-aware one (a rule on the `title` part) that keeps 24 px on screen and re-fits the block as you zoom; " +
        "`cameraAwareText` is the graph setting that turns every camera-aware text off.",
    },
  },
};

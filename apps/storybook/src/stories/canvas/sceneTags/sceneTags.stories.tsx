import React, { useCallback, useEffect, useState } from "react";

import { CanvasBlock, ESelectionStrategy, defineTag } from "@gravity-ui/graph";
import type { Graph, TScenePrimitive } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/uikit/styles/styles.css";

type TagArgs = { renderer: "canvas" | "webgl"; running: boolean; presence: boolean; focus: boolean; ghost: boolean };

const runningTag = defineTag("running");
const presenceTag = defineTag<string>("presence");
const focusTag = defineTag("focus");
const highlightedTag = defineTag("highlighted");
const ghostTag = defineTag("ghost");

const IDS = ["a", "b", "c"] as const;
const WIDTH = 200;
const HEIGHT = 100;
const GAP = 40;

/** A block look that leaves the body fill and the border colour unset: the theme and the rules colour them. */
function blockPrimitives(title: string): TScenePrimitive[] {
  return [
    { kind: "rect", x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 8, part: "body" },
    {
      kind: "rect",
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
      radius: 8,
      border: { width: { px: 3, minWorld: 3, maxWorld: 10 }, align: "inside" },
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
      width: WIDTH - 24,
      part: "title",
    },
  ];
}

function fillScene(graph: Graph): void {
  const store = graph.scene.store;
  // React StrictMode runs effects twice in development; the scene lives on the same graph.
  if (store.get("a")) return;
  IDS.forEach((id, index) => {
    // The second block overlaps the first and the end of its title, so that the raise of a selected block shows, and a
    // ghosted b shows a's title and the grid through its body.
    const x = index === 1 ? 40 : index * (WIDTH + GAP);
    const y = index === 1 ? 20 : 0;
    store.add({
      id,
      zIndex: 200,
      x,
      y,
      bounds: { minX: -10, minY: -10, maxX: WIDTH + 10, maxY: HEIGHT + 10 },
      primitives: blockPrimitives(`Block ${id}`),
    });
    // Bind after adding: adding an element resets its style row.
    graph.scene.bindStyle(id, { type: "block", id }, CanvasBlock);
  });
}

const PRESENCE_COLORS = ["#ff4081", "#7c4dff"];

const SceneTagsApp = ({ renderer, running, presence, focus, ghost }: TagArgs): React.JSX.Element => {
  const { graph, start, zoomTo } = useGraph({});
  const [selectedId, setSelectedId] = useState<string>("a");
  const rendererState = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);
  const generation = useSignal(graph.scene.$styleGeneration);
  // The selection writes selectedTag; the first "Select a" changes nothing else the explain panel depends on.
  const selection = useSignal(graph.selectionService.$selection);

  useEffect(() => {
    const debugWindow = window as Window & { sceneGraph?: Graph };
    debugWindow.sceneGraph = graph;
    fillScene(graph);
    // The running rules: a green border on every level, a green body on the minimalistic level only.
    const remove = graph.scene.styles.add([
      { target: CanvasBlock, tags: [runningTag], style: { parts: { border: { color: "#00c853" } } } },
      {
        target: CanvasBlock,
        tags: [runningTag],
        scope: { levels: ["minimalistic"] },
        priority: 1,
        style: { parts: { body: { color: "#00c853" } } },
      },
      {
        target: CanvasBlock,
        tags: [presenceTag],
        style: (values) => ({ parts: { body: { color: values.get(presenceTag) } } }),
      },
      // Focus fades the blocks outside the highlight without recolouring them: a selected one keeps its selection
      // border, faded.
      { target: CanvasBlock, root: [focusTag], notTags: [highlightedTag], style: { dim: 0.6 } },
      // A ghost is really transparent: what lies under it (a's title, the grid) shows through.
      { target: CanvasBlock, tags: [ghostTag], style: { opacity: 0.4 } },
    ]);
    start();
    zoomTo({ x: -40, y: -40, width: 3 * WIDTH + 2 * GAP + 80, height: 240 }, { padding: 40 });
    return () => {
      remove();
      if (debugWindow.sceneGraph === graph) delete debugWindow.sceneGraph;
    };
  }, [graph, start, zoomTo]);

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  const select = useCallback(
    (id: string): void => {
      graph.selectionService.select("block", [id], ESelectionStrategy.REPLACE);
      setSelectedId(id);
    },
    [graph]
  );

  useEffect(() => {
    const { tags } = graph.scene;
    tags.set(runningTag, { block: running ? ["b", "c"] : [] });
    if (presence)
      tags.set(presenceTag, {
        block: new Map([
          ["a", PRESENCE_COLORS[0]],
          ["c", PRESENCE_COLORS[1]],
        ]),
      });
    else tags.clear(presenceTag);
    tags.set(highlightedTag, { block: focus ? ["a"] : [] });
    tags.setRoot(focusTag, focus);
    tags.set(ghostTag, { block: ghost ? ["b"] : [] });
  }, [graph, running, presence, focus, ghost]);

  const [explanation, setExplanation] = useState("");
  // Read after the tag updates have reached the scene.
  useEffect(() => {
    setExplanation(JSON.stringify(graph.scene.explain("block", selectedId), null, 2));
  }, [graph, selectedId, selection, running, presence, focus, ghost, level, generation, renderer]);

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="body-1">
            Select an element to inspect its rules. Enable presence, focus or opacity in Controls to see how they
            combine.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            {IDS.map((id) => (
              <Button key={id} view={selectedId === id ? "action" : "normal"} onClick={() => select(id)}>
                Select {id}
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
            {`explain("block", "${selectedId}")\n${explanation}`}
          </pre>
        </Flex>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta<TagArgs> = {
  id: "canvas-scenetags",
  title: "Scene/Diagnostics/Style inspector",
  component: SceneTagsApp,
  args: { renderer: "canvas", running: false, presence: false, focus: false, ghost: false },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] },
    running: { name: "Running (b, c)", control: "boolean" },
    presence: { name: "Presence colors (a, c)", control: "boolean" },
    focus: { name: "Focus on a", control: "boolean" },
    ghost: { name: "Apply 40% opacity to b", control: "boolean" },
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const SceneTags: StoryFn<TagArgs> = (args) => <SceneTagsApp {...args} />;
SceneTags.storyName = "Tag precedence and opacity";
SceneTags.parameters = {
  docs: {
    description: {
      story:
        "Tags and rules on `graph.scene`: selection raises a block and takes the theme's selected border, a custom " +
        "`running` tag adds a green border (and a green body on the minimalistic level), a `presence` tag carries a " +
        "colour value, and a root `focus` tag dims the blocks that are not `highlighted` (`style: { dim: 0.6 }`): " +
        "they fade towards the layer background and keep their colours, so a selected block keeps its selection " +
        "border. A `ghost` tag on b (`style: { opacity: 0.4 }`) makes it really transparent: a's title and the grid " +
        "show through b's body, and each primitive of b fades on its own, so its body shows through its border. " +
        "The panel shows `graph.scene.explain()` for the selected block.",
    },
  },
};

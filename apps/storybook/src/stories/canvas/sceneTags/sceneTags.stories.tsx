import React, { useCallback, useEffect, useMemo, useState } from "react";

import { CanvasBlock, ESelectionStrategy, defineTag } from "@gravity-ui/graph";
import type { Graph, TScenePrimitive } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, SegmentedRadioGroup, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/uikit/styles/styles.css";

type TRenderer = "canvas" | "webgl";

const renderers: { value: TRenderer; content: string }[] = [
  { value: "canvas", content: "Canvas" },
  { value: "webgl", content: "WebGL" },
];

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

const SceneTagsApp = (): React.JSX.Element => {
  const { graph, start, zoomTo } = useGraph({});
  const [renderer, setRenderer] = useState<TRenderer>("canvas");
  const [selectedId, setSelectedId] = useState<string>("a");
  const [running, setRunning] = useState(false);
  const [presence, setPresence] = useState(false);
  const [focus, setFocus] = useState(false);
  const [ghost, setGhost] = useState(false);
  const rendererState = useSignal(graph.scene.$renderer);
  const level = useSignal(graph.scene.$level);
  const generation = useSignal(graph.scene.$styleGeneration);
  // The selection writes selectedTag; the first "Select a" changes nothing else the explain panel depends on.
  const selection = useSignal(graph.selectionService.$selection);

  useEffect(() => {
    // For poking at the scene from the devtools console.
    (window as unknown as { sceneGraph?: Graph }).sceneGraph = graph;
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
    return remove;
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

  const toggleRunning = useCallback((): void => {
    if (running) graph.scene.tags.clear(runningTag);
    else graph.scene.tags.set(runningTag, { block: ["b", "c"] });
    setRunning(!running);
  }, [graph, running]);

  const togglePresence = useCallback((): void => {
    if (presence) graph.scene.tags.clear(presenceTag);
    else {
      graph.scene.tags.set(presenceTag, {
        block: new Map([
          ["a", PRESENCE_COLORS[0]],
          ["c", PRESENCE_COLORS[1]],
        ]),
      });
    }
    setPresence(!presence);
  }, [graph, presence]);

  const toggleFocus = useCallback((): void => {
    if (focus) graph.scene.tags.clear(highlightedTag);
    else graph.scene.tags.set(highlightedTag, { block: ["a"] });
    graph.scene.tags.setRoot(focusTag, !focus);
    setFocus(!focus);
  }, [graph, focus]);

  const toggleGhost = useCallback((): void => {
    if (ghost) graph.scene.tags.clear(ghostTag);
    else graph.scene.tags.set(ghostTag, { block: ["b"] });
    setGhost(!ghost);
  }, [graph, ghost]);

  const explanation = useMemo(
    () => JSON.stringify(graph.scene.explain("block", selectedId), null, 2),
    // explain reads no signal: recompute when anything it depends on changes.
    [graph, selectedId, selection, running, presence, focus, ghost, level, generation, renderer]
  );

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">Scene tags and styles</Text>
          <Text variant="body-1">
            Three scene elements leave the body fill and border colour unset; the theme and the rules colour them. Zoom
            out to the minimalistic level to see the second running rule.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            <SegmentedRadioGroup options={renderers} value={renderer} onUpdate={setRenderer} />
            {IDS.map((id) => (
              <Button key={id} view={selectedId === id ? "action" : "normal"} onClick={() => select(id)}>
                Select {id}
              </Button>
            ))}
            <Button onClick={toggleRunning}>{running ? "Stop running (b, c)" : "Run b and c"}</Button>
            <Button onClick={togglePresence}>{presence ? "Clear presence" : "Presence on a and c"}</Button>
            <Button onClick={toggleFocus}>{focus ? "Clear focus" : "Focus a (dim the others)"}</Button>
            <Button onClick={toggleGhost}>{ghost ? "Unghost b" : "Ghost b (opacity 0.4)"}</Button>
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

const meta: Meta = {
  title: "Canvas/SceneTags",
  component: SceneTagsApp,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const SceneTags: StoryFn = () => <SceneTagsApp />;
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

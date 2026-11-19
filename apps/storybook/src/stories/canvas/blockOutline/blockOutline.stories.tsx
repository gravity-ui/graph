import React, { useEffect } from "react";

import { CanvasBlock, ESelectionStrategy, selectedTag } from "@gravity-ui/graph";
import type { Graph, TBlock, TConnection, TSceneRenderer } from "@gravity-ui/graph";
import { GraphBlock, GraphBlockAnchor, GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

const blocks: TBlock[] = [
  {
    id: "source",
    is: "Block",
    name: "Source",
    x: 0,
    y: 0,
    width: 200,
    height: 144,
    anchors: [
      { id: "in", blockId: "source", type: "IN" },
      { id: "out1", blockId: "source", type: "OUT" },
      { id: "out2", blockId: "source", type: "OUT" },
    ],
  },
  {
    id: "target",
    is: "Block",
    name: "Target",
    x: 340,
    y: 0,
    width: 200,
    height: 144,
    anchors: [{ id: "in", blockId: "target", type: "IN" }],
  },
];
const connections: TConnection[] = [
  { id: "link", sourceBlockId: "source", sourceAnchorId: "out1", targetBlockId: "target", targetAnchorId: "in" },
];

function renderBlock(graph: Graph, block: TBlock) {
  return (
    <GraphBlock graph={graph} block={block}>
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>{block.name}</div>
      {block.anchors?.map((anchor) => (
        <GraphBlockAnchor key={anchor.id} graph={graph} anchor={anchor} position="absolute" />
      ))}
    </GraphBlock>
  );
}

type Args = { renderer: TSceneRenderer; html: boolean };

function BlockOutlineScene({ renderer, html }: Args) {
  const { graph, setEntities, start } = useGraph({ settings: { renderer, useBlocksAnchors: true } });
  useEffect(() => {
    setEntities({ blocks, connections });
    const remove = graph.scene.styles.add([
      { target: CanvasBlock, tags: [selectedTag], style: { outline: { color: "#2860ba", width: 3 } } },
    ]);
    graph.selectionService.select("block", ["source"], ESelectionStrategy.REPLACE);
    start();
    return remove;
  }, [graph, setEntities, start]);
  useEffect(() => {
    graph.runAfterGraphReady(() => {
      graph.zoomTo(["source", "target"], { padding: 32 });
      const { width, height, scale } = graph.cameraService.getCameraState();
      const targetScale = html ? 1 : 0.65;
      if (scale < targetScale) graph.zoomTo(["source"], { padding: 32 });
      graph.cameraService.zoom(width / 2, height / 2, targetScale);
    });
  }, [graph, html]);
  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderBlock : undefined} />
    </div>
  );
}

const meta: Meta<Args> = {
  title: "Canvas/Block outline",
  component: BlockOutlineScene,
  args: { renderer: "webgl", html: false },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] },
    html: { name: "HTML at detailed zoom", control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
};
export default meta;
export const Selected: StoryFn<Args> = (args) => <BlockOutlineScene {...args} />;

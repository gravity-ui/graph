import React, { useEffect } from "react";

import { CanvasBlock, defineTag, hoveredTag } from "@gravity-ui/graph";
import type { Graph, TBlock, TConnection, TSceneRenderer } from "@gravity-ui/graph";
import { GraphBlock, GraphBlockAnchor, GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "./blockHover.css";

const shakeTag = defineTag("shake");

const blocks: TBlock[] = [
  {
    id: "bounce",
    is: "Block",
    name: "Bounce",
    x: 0,
    y: 0,
    width: 180,
    height: 88,
    anchors: [{ id: "out", blockId: "bounce", type: "OUT" }],
  },
  {
    id: "shake",
    is: "Block",
    name: "Shake",
    x: 320,
    y: 0,
    width: 180,
    height: 88,
    anchors: [{ id: "in", blockId: "shake", type: "IN" }],
  },
];

const connections: TConnection[] = [
  { id: "link", sourceBlockId: "bounce", sourceAnchorId: "out", targetBlockId: "shake", targetAnchorId: "in" },
];

function renderBlock(graph: Graph, block: TBlock) {
  return (
    <GraphBlock graph={graph} block={block} className="hover-motion-block">
      <span className="hover-motion-face">{block.name}</span>
      {block.anchors?.map((anchor) => (
        <GraphBlockAnchor key={anchor.id} graph={graph} anchor={anchor} position="absolute" />
      ))}
    </GraphBlock>
  );
}

type MotionArgs = { renderer: TSceneRenderer; html: boolean };

function BlockHoverScene({ renderer, html }: MotionArgs) {
  const { graph, setEntities, start } = useGraph({ settings: { renderer, useBlocksAnchors: true } });

  useEffect(() => {
    setEntities({ blocks, connections });
    graph.scene.tags.add(shakeTag, { block: ["shake"] });
    const removeRules = graph.scene.styles.add([
      { target: CanvasBlock, tags: [hoveredTag], style: { motion: "bounce" } },
      { target: CanvasBlock, tags: [hoveredTag, shakeTag], priority: 1, style: { motion: "shake" } },
    ]);
    start();
    return removeRules;
  }, [graph, setEntities, start]);

  useEffect(() => {
    graph.runAfterGraphReady(() => {
      graph.zoomTo(
        blocks.map((block) => block.id),
        { padding: 32 }
      );
      const { width, height, scale } = graph.cameraService.getCameraState();
      // The stock block shows its title at schematic zoom. Switch to detailed to preview the HTML view.
      graph.cameraService.zoom(width / 2, height / 2, Math.min(scale, html ? 1 : 0.65));
    });
  }, [graph, html]);

  return (
    <div style={{ height: "100vh", position: "relative" }}>
      <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html ? renderBlock : undefined} />
    </div>
  );
}

const meta: Meta<MotionArgs> = {
  title: "Canvas/Block hover",
  component: BlockHoverScene,
  args: { renderer: "webgl", html: false },
  argTypes: {
    renderer: { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] },
    html: { name: "HTML at detailed zoom", control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
};

export default meta;

export const BounceAndShake: StoryFn<MotionArgs> = (args) => <BlockHoverScene {...args} />;

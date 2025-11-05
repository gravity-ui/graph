import React, { useCallback, useLayoutEffect, useState } from "react";

import { Graph, GraphState, TBlock } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useGraphEvent } from "@gravity-ui/graph-react";
import { Button, Flex, Switch, Text } from "@gravity-ui/uikit";
import type { Meta, StoryObj } from "@storybook/react-webpack5";

import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

const storyConfig = generatePrettyBlocks({ layersCount: 3, connectionsPerLayer: 20 });

const Toolbar = ({ graph }: { graph: Graph }) => {
  const [constrainEnabled, setConstrainEnabled] = useState(false);
  const [cameraInfo, setCameraInfo] = useState<string>("");

  useGraphEvent(graph, "camera-change", () => {
    const state = graph.cameraService.getCameraState();
    const bounds = state.cameraBounds;
    setCameraInfo(
      `Scale: ${state.scale.toFixed(3)} | Pos: (${Math.round(state.relativeX * -1)}, ${Math.round(state.relativeY * -1)})${
        bounds
          ? ` | Bounds: scale[${bounds.minScale.toFixed(2)}, ${bounds.maxScale.toFixed(2)}] pos[(${Math.round(
              bounds.minX
            )}, ${Math.round(bounds.minY)}), (${Math.round(bounds.maxX)}, ${Math.round(bounds.maxY)})]`
          : ""
      }`
    );
  });

  const handleConstrainToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const enabled = e.target.checked;
      setConstrainEnabled(enabled);
      graph.updateSettings({ constrainCameraToGraph: enabled });
    },
    [graph]
  );

  const zoomToViewport = useCallback(() => {
    graph.zoomTo("center", { transition: 250, padding: 100 });
  }, [graph]);

  const addBlock = useCallback(() => {
    const usableRect = graph.api.getUsableRect();
    const randomX = usableRect.x + Math.random() * usableRect.width;
    const randomY = usableRect.y + Math.random() * usableRect.height;

    graph.api.addBlock({
      name: `Block ${graph.blocks.$blocks.value.length + 1}`,
      x: randomX,
      y: randomY,
      width: 200,
      height: 160,
    });
  }, [graph]);

  const deleteAllBlocks = useCallback(() => {
    const allBlocks = graph.blocks.$blocks.value.map((b) => b.id);
    allBlocks.forEach((id) => {
      graph.blocks.removeBlock(id);
    });
  }, [graph]);

  return (
    <Flex
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        flexDirection: "column",
        gap: 8,
        zIndex: 10,
        background: "var(--g-color-base-background)",
        padding: 8,
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <Flex gap={2} alignItems="center">
        <Switch checked={constrainEnabled} onChange={handleConstrainToggle}>
          Constrain Camera to Graph
        </Switch>
        <Button onClick={zoomToViewport}>Zoom to Viewport</Button>
        <Button onClick={addBlock}>Add Random Block</Button>
        <Button onClick={deleteAllBlocks} view="flat-danger">
          Delete All Blocks
        </Button>
      </Flex>
      <Text variant="caption-1" color="secondary">
        {cameraInfo}
      </Text>
      <Text variant="caption-2" color="secondary">
        Try zooming out and panning with constraints enabled/disabled. Empty graph allows zoom to 0.5 and pan within 50%
        of viewport.
      </Text>
    </Flex>
  );
};

const CameraConstraintsDemo = () => {
  const { graph, setEntities, start } = useGraph({ settings: storyConfig.settings, layers: storyConfig.layers });

  useLayoutEffect(() => {
    setEntities({ blocks: storyConfig.blocks, connections: storyConfig.connections });
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 200, transition: 250 });
    }
  });

  const renderBlock = useCallback(
    (graphObject: Graph, block: TBlock) => <BlockStory graph={graphObject} block={block} />,
    []
  );

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <GraphCanvas graph={graph} renderBlock={renderBlock}></GraphCanvas>
      <Toolbar graph={graph} />
    </div>
  );
};

const meta: Meta<typeof CameraConstraintsDemo> = {
  title: "Examples/CameraConstraints",
  component: CameraConstraintsDemo,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof CameraConstraintsDemo>;

export const CameraConstraintsPlayground: Story = {
  render: () => <CameraConstraintsDemo />,
};

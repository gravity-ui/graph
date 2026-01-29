import React, { useCallback, useEffect } from "react";

import { GraphCanvas, TBlock, useGraph } from "../../../index";
import { StoryFn } from "../../main/GraphEditor.stories";
import { GraphState } from "../../types";

export default {
  title: "API/Batch Block Rendering",
  component: GraphCanvas,
};

const GRID_SIZE = 50;
const BLOCKS_COUNT = 2500; // 50x50 grid

// Generate a large grid of blocks
function generateBlocks(): TBlock[] {
  const blocks: TBlock[] = [];

  for (let i = 0; i < BLOCKS_COUNT; i++) {
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;

    blocks.push({
      id: `block-${i}`,
      is: "block",
      x: col * 250,
      y: row * 200,
      width: 200,
      height: 160,
      name: `Block ${i}`,
      selected: false,
    });
  }

  return blocks;
}

const state: GraphState = {
  blocks: generateBlocks(),
  connections: [],
  cameraScale: 0.05, // Start at minimalistic scale to show batch rendering
};

function GraphEditor() {
  const graph = useGraph({
    settings: {
      canChangeBlockGeometry: false,
    },
  });

  useEffect(() => {
    if (graph) {
      graph.start();
      graph.zoomTo("center");
    }

    return () => {
      graph?.dispose();
    };
  }, [graph]);

  useEffect(() => {
    if (graph) {
      graph.api.setEntities({
        blocks: state.blocks,
        connections: state.connections,
      });

      // Set initial camera scale to show minimalistic view
      if (state.cameraScale) {
        graph.rootStore.settings.updateCameraScale(state.cameraScale);
      }
    }
  }, [graph]);

  const handleZoomIn = useCallback(() => {
    graph?.zoomIn();
  }, [graph]);

  const handleZoomOut = useCallback(() => {
    graph?.zoomOut();
  }, [graph]);

  const handleZoomToFit = useCallback(() => {
    graph?.zoomTo("center");
  }, [graph]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          background: "white",
          padding: "10px",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ marginBottom: "10px", fontSize: "14px", fontWeight: "bold" }}>
          Performance Test: {BLOCKS_COUNT} blocks
        </div>
        <div style={{ marginBottom: "10px", fontSize: "12px", color: "#666" }}>
          Batch rendering is active at minimalistic scale (&lt; 0.125)
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleZoomOut}>Zoom Out (-)</button>
          <button onClick={handleZoomIn}>Zoom In (+)</button>
          <button onClick={handleZoomToFit}>Fit to Screen</button>
        </div>
      </div>
      <GraphCanvas graph={graph} />
    </div>
  );
}

export const BatchBlockRenderingStory: StoryFn = () => <GraphEditor />;

BatchBlockRenderingStory.storyName = "Batch Block Rendering Performance";

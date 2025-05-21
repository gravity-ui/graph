import React, { useCallback, useEffect, useState } from "react";

import { Meta, StoryFn } from "@storybook/react";
import groupBy from "lodash/groupBy";

import type { TBlock, TConnection } from "../../../src";
import { BlockGroups, Group } from "../../../src/components/canvas/groups";
import { GraphBlock, GraphCanvas, useGraph } from "../../../src/react-component";

const NUM_BLOCKS = 2000;
const SUBGRAPH_SIZE = 100;
const GROUP_SIZE = 50;

function generateBlocks(count: number): TBlock[] {
  const blocks: TBlock[] = [];
  for (let i = 0; i < count; i++) {
    blocks.push({
      id: "block-" + i,
      name: "Block " + i,
      x: (i % 20) * 150,
      y: Math.floor(i / 20) * 100,
      width: 100,
      height: 50,
      selected: false,
      anchors: [],
      is: "Block",
      group: "group-" + Math.floor(i / GROUP_SIZE),
    });
  }
  return blocks;
}

function generateConnections(blocks: TBlock[]): TConnection[] {
  const connections: TConnection[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    if (i % 2 !== 0) {
      connections.push({
        id: "conn-" + i,
        sourceBlockId: blocks[i].id,
        targetBlockId: blocks[i + 1].id,
      });
    }
  }
  return connections;
}

const allBlocks = generateBlocks(NUM_BLOCKS);
const allConnections = generateConnections(allBlocks);
const subGraphBlocks = allBlocks.slice(0, SUBGRAPH_SIZE);

const MyGroup = Group.define({
  style: {
    background: "rgba(100, 100, 100, 0.1)",
    border: "rgba(100, 100, 100, 0.3)",
    borderWidth: 2,
    selectedBackground: "rgba(100, 100, 100, 1)",
    selectedBorder: "rgba(100, 100, 100, 1)",
  },
});

const GroupsLayer = BlockGroups.withBlockGrouping({
  groupingFn: (blocks) => groupBy(blocks, (block) => block.$state.value.group),
  mapToGroups: (groupId, { rect }) => ({
    id: groupId,
    rect,
    component: MyGroup,
  }),
});

const meta: Meta = {
  title: "Issues/Issue 86 Performance Drop",
  component: GraphCanvas,
};
export default meta;

const Template: StoryFn = () => {
  const { graph } = useGraph({});
  const [renderTime, setRenderTime] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<"full" | "sub">("full");

  useEffect(() => {
    if (graph) {
      const layer = graph.addLayer(GroupsLayer, {
        draggable: true,
        updateBlocksOnDrag: true,
      });
      return () => {
        layer.detachLayer();
      };
    }
  }, [graph]);

  const showFullGraph = useCallback(() => {
    if (graph) {
      const startTime = performance.now();
      graph.setEntities({ blocks: allBlocks, connections: allConnections });
      const endTime = performance.now();
      setRenderTime(endTime - startTime);
      setCurrentView("full");
    }
  }, [graph]);

  const showSubGraph = useCallback(() => {
    if (graph) {
      const validSubGraphConnections = generateConnections(subGraphBlocks);
      const startTime = performance.now();
      graph.setEntities({ blocks: subGraphBlocks, connections: validSubGraphConnections });
      const endTime = performance.now();
      setRenderTime(endTime - startTime);
      setCurrentView("sub");
    }
  }, [graph]);

  useEffect(() => {
    if (graph) {
      graph.start();
      showSubGraph();
    }
  }, [graph]);

  const renderBlock = useCallback(
    (g, block) => (
      <GraphBlock graph={g} block={block}>
        {block.name}
      </GraphBlock>
    ),
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ padding: "10px", borderBottom: "1px solid #ccc" }}>
        <button onClick={showFullGraph} style={{ marginRight: "10px" }} disabled={currentView === "full"}>
          {`Show Full Graph (~${NUM_BLOCKS} blocks)`}
        </button>
        <button onClick={showSubGraph} style={{ marginRight: "10px" }} disabled={currentView === "sub"}>
          {`Show Sub-Graph (~${SUBGRAPH_SIZE} blocks)`}
        </button>
        {renderTime !== null && (
          <span style={{ marginLeft: "20px" }}>{`Last setEntities took: ${renderTime.toFixed(2)} ms`}</span>
        )}
        <p>Current view: {currentView}</p>
        <p>
          <strong>Instructions:</strong>
          <ol>
            <li>Initially, the sub-graph is shown. Note the time.</li>
            <li>Click "Show Full Graph". Note the time. This is expected to be slow.</li>
            <li>Click "Show Sub-Graph" again.</li>
          </ol>
        </p>
      </div>
      <div style={{ flexGrow: 1, border: "1px solid black", overflow: "hidden" }}>
        <GraphCanvas graph={graph} renderBlock={renderBlock} />
      </div>
    </div>
  );
};

export const PerformanceIssueReproduction = Template.bind({});
PerformanceIssueReproduction.args = {};

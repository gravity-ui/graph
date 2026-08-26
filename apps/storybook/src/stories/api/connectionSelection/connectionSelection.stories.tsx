import React, { useLayoutEffect, useState } from "react";

import { ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { TBlock } from "../../../components/canvas/blocks/Block";
import { Graph, GraphState, TGraphConfig } from "../../../graph";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { ESelectionStrategy } from "../../../services/selection/types";
import { TConnection } from "../../../store/connection/ConnectionState";
import { storiesSettings } from "../../configurations/definitions";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const blocks: TBlock[] = [
  {
    x: 100,
    y: 200,
    width: 200,
    height: 100,
    id: "block-A",
    is: "Block",
    selected: false,
    name: "Block A",
    anchors: [],
  },
  {
    x: 450,
    y: 100,
    width: 200,
    height: 100,
    id: "block-B",
    is: "Block",
    selected: false,
    name: "Block B",
    anchors: [],
  },
  {
    x: 450,
    y: 300,
    width: 200,
    height: 100,
    id: "block-C",
    is: "Block",
    selected: false,
    name: "Block C",
    anchors: [],
  },
  {
    x: 800,
    y: 200,
    width: 200,
    height: 100,
    id: "block-D",
    is: "Block",
    selected: false,
    name: "Block D",
    anchors: [],
  },
];

const connections: TConnection[] = [
  { sourceBlockId: "block-A", targetBlockId: "block-B" },
  { sourceBlockId: "block-A", targetBlockId: "block-C" },
  { sourceBlockId: "block-B", targetBlockId: "block-D" },
  { sourceBlockId: "block-C", targetBlockId: "block-D" },
];

const graphSettings: TGraphConfig["settings"] = {
  ...storiesSettings,
  useBezierConnections: true,
};

/**
 * Demonstrates connection selection controlled via the selection bucket API.
 * When a block is selected, its adjacent connections get highlighted.
 * When the block is deselected, connections deselect properly without needing
 * to pass `selected: false` explicitly in the connection data.
 */
const ConnectionSelectionDemo = () => {
  const { graph, setEntities, start } = useGraph({
    settings: graphSettings,
  });

  useLayoutEffect(() => {
    setEntities({ blocks, connections });
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  useGraphEvent(graph, "blocks-selection-change", ({ list }) => {
    const selectedBlockIds = new Set(list);

    if (selectedBlockIds.size === 0) {
      graph.rootStore.connectionsList.connectionSelectionBucket.updateSelection([], true, ESelectionStrategy.REPLACE);
      return;
    }

    const connectionIds = graph.rootStore.connectionsList.$connections.value
      .filter((c) => selectedBlockIds.has(c.sourceBlockId) || selectedBlockIds.has(c.targetBlockId))
      .map((c) => c.id);

    graph.rootStore.connectionsList.connectionSelectionBucket.updateSelection(
      connectionIds,
      true,
      ESelectionStrategy.REPLACE
    );
  });

  const renderBlock = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  return (
    <ThemeProvider theme="dark">
      <div style={{ padding: "16px 16px 8px", fontFamily: "sans-serif", fontSize: "14px" }}>
        <strong>Connection Selection via Selection Bucket API</strong>
        <p style={{ margin: "4px 0 12px", opacity: 0.7 }}>
          Click a block to select it — adjacent connections will highlight. Click on empty canvas to deselect —
          connections deselect properly.
        </p>
      </div>
      <div style={{ height: "500px" }}>
        <GraphCanvas className="graph" graph={graph} renderBlock={renderBlock} />
      </div>
    </ThemeProvider>
  );
};

/**
 * Demonstrates the OLD approach (setEntities with `selected` field on connections).
 * Previously this approach had a bug where omitting `selected` didn't reset selection.
 * Now it works because ConnectionState derives `selected` from the selection bucket,
 * so the `selected` field in connection data is effectively managed by the bucket.
 */
const ConnectionSelectionViaSetEntitiesDemo = () => {
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);

  const { graph, setEntities, start } = useGraph({
    settings: graphSettings,
  });

  useLayoutEffect(() => {
    setEntities({ blocks, connections });
  }, [setEntities]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
      graph.zoomTo("center", { padding: 300 });
    }
  });

  useGraphEvent(graph, "blocks-selection-change", ({ list }) => {
    setSelectedBlocks(list as string[]);
  });

  useLayoutEffect(() => {
    if (!graph) return;
    const selectionIds = new Set(selectedBlocks);

    if (selectedBlocks.length === 0) {
      graph.rootStore.connectionsList.connectionSelectionBucket.updateSelection([], true, ESelectionStrategy.REPLACE);
    } else {
      const connectionIds = graph.rootStore.connectionsList.$connections.value
        .filter((c) => selectionIds.has(c.sourceBlockId as string) || selectionIds.has(c.targetBlockId as string))
        .map((c) => c.id);

      graph.rootStore.connectionsList.connectionSelectionBucket.updateSelection(
        connectionIds,
        true,
        ESelectionStrategy.REPLACE
      );
    }
  }, [selectedBlocks, graph]);

  const renderBlock = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  return (
    <ThemeProvider theme="dark">
      <div style={{ padding: "16px 16px 8px", fontFamily: "sans-serif", fontSize: "14px" }}>
        <strong>Connection Selection via React State + Selection API</strong>
        <p style={{ margin: "4px 0 12px", opacity: 0.7 }}>
          Click a block — connections linked to it highlight. Click empty canvas to deselect all. Selected blocks: [
          {selectedBlocks.join(", ") || "none"}]
        </p>
      </div>
      <div style={{ height: "500px" }}>
        <GraphCanvas className="graph" graph={graph} renderBlock={renderBlock} />
      </div>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/Connection Selection",
  component: ConnectionSelectionDemo,
};

export default meta;

export const ViaSelectionBucket: StoryFn = () => <ConnectionSelectionDemo />;
ViaSelectionBucket.storyName = "Selection Bucket API";

export const ViaReactState: StoryFn = () => <ConnectionSelectionViaSetEntitiesDemo />;
ViaReactState.storyName = "React State + Selection API";

import React, { useMemo, useState } from "react";

import { Button, Flex, Text, TextInput, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import { Graph, GraphComponent, GraphState, TBlock, THighlightSelection } from "../../../index";
import { GraphCanvas, useGraph, useGraphEvent } from "../../../react-components";
import { useFn } from "../../../react-components/utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import "@gravity-ui/uikit/styles/styles.css";

const prettyConfig = generatePrettyBlocks({
  layersCount: 7,
  connectionsPerLayer: 12,
  dashedLine: true,
});

const blocks = (prettyConfig.blocks ?? []) as TBlock[];
const connections = prettyConfig.connections ?? [];
const blockList = blocks.slice(0, 40);

const HighlightServiceStoryApp = () => {
  const { graph, setEntities, start } = useGraph({});
  const [currentMode, setCurrentMode] = useState<string>("none");
  const [depth, setDepth] = useState<string>("1");

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      setEntities({ blocks, connections });
      start();
      graph.zoomTo("center", { padding: 180 });
    }
  });

  useGraphEvent(graph, "highlight-changed", ({ mode }) => {
    setCurrentMode(mode ?? "none");
  });

  useGraphEvent(graph, "click", ({ target }) => {
    if (!(target instanceof GraphComponent)) {
      return;
    }

    const parsedDepth = Math.max(1, Number.parseInt(depth, 10) || 1);
    const relatedSelection = graph.getRelatedEntitiesByPorts(target, { depth: parsedDepth });

    const sourceType = target.getEntityType();
    const sourceId = target.getEntityId();
    const sourceIds = relatedSelection[sourceType] || [];

    const selection: THighlightSelection = {
      ...relatedSelection,
      [sourceType]: Array.from(new Set([...sourceIds, sourceId])),
    };
    console.log("selection", selection);

    graph.focus(selection);
  });

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  const actions = useMemo(
    () => [
      {
        title: "clearHighlight()",
        run: () => graph.clearHighlight(),
      },
    ],
    [graph]
  );

  return (
    <ThemeProvider theme="light">
      <div
        style={{
          display: "flex",
          height: "78vh",
          minHeight: 560,
          maxHeight: 820,
          gap: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, height: "100%" }}>
          <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />
        </div>
        <div
          style={{
            width: 320,
            height: "100%",
            padding: 0,
            border: "1px solid #d9d9d9",
            borderRadius: 8,
            background: "#fff",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "#fff",
              padding: 12,
              borderBottom: "1px solid #ececec",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <Text variant="subheader-2">HighlightService live controls</Text>
            <Text color="secondary">Current mode: {currentMode}</Text>
            <TextInput
              type="number"
              value={depth}
              onUpdate={setDepth}
              label="Related highlight depth (click on graph)"
            />
            <Text color="secondary">Click graph entity to run highlight (target-only accent).</Text>
          </div>
          <div
            style={{
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflow: "auto",
              minHeight: 0,
            }}
          >
            <Text variant="subheader-2">Focus by block list hover</Text>
            <Text color="secondary">Showing first {blockList.length} blocks from generated layout.</Text>
            <div
              style={{
                border: "1px solid #ececec",
                borderRadius: 6,
                padding: 8,
                background: "#fafafa",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 230,
                overflow: "auto",
              }}
            >
              {blockList.map((block) => {
                return (
                  <button
                    key={String(block.id)}
                    type="button"
                    style={{
                      textAlign: "left",
                      border: "1px solid #d9d9d9",
                      borderRadius: 6,
                      padding: "6px 8px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => {
                      graph.highlight({ block: [block.id] });
                      // graph.zoomTo([block.id], {
                      //   padding: 220,
                      //   transition: 180,
                      // });
                    }}
                    onMouseLeave={() => {
                      graph.clearHighlight();
                    }}
                  >
                    {block.name} ({block.id})
                  </button>
                );
              })}
            </div>
            <Flex direction="column" gap={2}>
              {actions.map((item) => {
                return (
                  <Button key={item.title} view="action" onClick={item.run}>
                    {item.title}
                  </Button>
                );
              })}
            </Flex>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Api/highlightService",
  component: HighlightServiceStoryApp,
};

export default meta;

export const Default: StoryFn = () => <HighlightServiceStoryApp />;

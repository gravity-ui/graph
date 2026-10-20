import React, { useCallback, useEffect, useState } from "react";

import { ECameraScaleLevel } from "@gravity-ui/graph";
import type { Graph, TBlock, TConnection, TRect } from "@gravity-ui/graph";
import {
  GraphContextMenu,
  GraphTooltip,
  UikitBlock,
  UikitGraphBlock,
  UikitGraphCanvas,
  renderUikitText,
  useUikitGraph,
} from "@gravity-ui/graph-uikit";
import type { TUikitBlock, TUikitGraphMode } from "@gravity-ui/graph-uikit";
import { Flex, Label, SegmentedRadioGroup, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
import "@gravity-ui/graph-uikit/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

type TMetricBlock = TUikitBlock & { meta: { value: string } };

const BLOCKS: TUikitBlock[] = [
  {
    id: "source",
    is: "Block",
    name: "Source",
    x: 0,
    y: 0,
    width: 220,
    height: 96,
    anchors: [],
    meta: { description: "Kafka topic" },
  },
  {
    id: "parse",
    is: "Block",
    name: "Parse",
    x: 320,
    y: 0,
    width: 220,
    height: 96,
    anchors: [],
    meta: { description: "JSON → rows", theme: "info" },
  },
  {
    id: "validate",
    is: "Block",
    name: "Validate",
    x: 640,
    y: -120,
    width: 220,
    height: 96,
    anchors: [],
    meta: { description: "Schema v3", theme: "success" },
  },
  {
    id: "enrich",
    is: "Block",
    name: "Enrich",
    x: 640,
    y: 120,
    width: 220,
    height: 96,
    anchors: [],
    meta: { description: "Join with users", theme: "warning" },
  },
  {
    id: "sink",
    is: "Block",
    name: "Sink",
    x: 960,
    y: 0,
    width: 220,
    height: 96,
    anchors: [],
    meta: { description: "Retries exhausted", theme: "danger" },
  },
];

const CONNECTIONS: TConnection[] = [
  { id: "source:parse", sourceBlockId: "source", targetBlockId: "parse" },
  { id: "parse:validate", sourceBlockId: "parse", targetBlockId: "validate", label: "valid" },
  { id: "parse:enrich", sourceBlockId: "parse", targetBlockId: "enrich" },
  { id: "validate:sink", sourceBlockId: "validate", targetBlockId: "sink" },
  { id: "enrich:sink", sourceBlockId: "enrich", targetBlockId: "sink" },
];

class MetricBlock extends UikitBlock<TMetricBlock> {
  protected override renderContent(ctx: CanvasRenderingContext2D, rect: TRect, level: ECameraScaleLevel): void {
    super.renderContent(ctx, rect, level);
    renderUikitText(
      ctx,
      this.context.graph,
      this.state.meta.value,
      { ...rect, y: rect.y + rect.height - 24, height: 24 },
      {
        variant: "header-1",
        color: "brand",
        align: "right",
      }
    );
  }
}

const METRIC_COMPONENTS = { Metric: MetricBlock };

function isMetricBlock(block: TBlock): block is TMetricBlock {
  return block.is === "Metric";
}

const METRIC_BLOCKS: Array<TUikitBlock | TMetricBlock> = [
  ...BLOCKS,
  {
    id: "rps",
    is: "Metric",
    name: "Throughput",
    x: 320,
    y: 220,
    width: 220,
    height: 120,
    anchors: [],
    meta: { description: "rows/s", value: "12.4k" },
  },
];

type TStoryProps = { mode: TUikitGraphMode; custom?: boolean };

function UikitGraphStory({ mode, custom = false }: TStoryProps): React.ReactElement {
  const { graph, setEntities, start, zoomTo } = useUikitGraph({
    mode,
    blockComponents: custom ? METRIC_COMPONENTS : undefined,
  });

  useEffect(() => {
    setEntities({ blocks: custom ? METRIC_BLOCKS : BLOCKS, connections: CONNECTIONS });
    start();
    zoomTo("center", { padding: 100 });
  }, [custom, setEntities, start, zoomTo]);

  const renderBlock = useCallback((g: Graph, block: TBlock) => {
    if (isMetricBlock(block)) {
      const metric = block;
      return (
        <UikitGraphBlock graph={g} block={metric}>
          <Flex direction="column" justifyContent="space-between" height="100%">
            <Text variant="subheader-1">{metric.name}</Text>
            <Flex justifyContent="space-between" alignItems="center">
              <Label theme="info">{metric.meta.description}</Label>
              <Text variant="header-1" color="brand">
                {metric.meta.value}
              </Text>
            </Flex>
          </Flex>
        </UikitGraphBlock>
      );
    }
    return <UikitGraphBlock graph={g} block={block} />;
  }, []);

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <UikitGraphCanvas graph={graph} renderBlock={renderBlock}>
        <GraphTooltip content={(entity) => (entity.kind === "block" ? `Block ${String(entity.id)}` : null)} />
        <GraphContextMenu
          items={(entity) => [
            { text: `Inspect ${entity.kind}`, action: () => console.log("inspect", entity) },
            { text: "Delete", theme: "danger", action: () => console.log("delete", entity) },
          ]}
        />
      </UikitGraphCanvas>
    </div>
  );
}

const THEMES = ["light", "dark", "light-hc", "dark-hc"];

function ThemedStory(props: TStoryProps): React.ReactElement {
  const [theme, setTheme] = useState("light");
  return (
    <ThemeProvider theme={theme}>
      <Flex direction="column" gap={2}>
        <SegmentedRadioGroup
          value={theme}
          onUpdate={setTheme}
          options={THEMES.map((value) => ({ value, content: value }))}
        />
        <UikitGraphStory {...props} />
      </Flex>
    </ThemeProvider>
  );
}

const meta: Meta = {
  title: "Plugins/Uikit",
  component: ThemedStory,
  parameters: { layout: "fullscreen" },
};

export default meta;

export const View: StoryFn = () => <ThemedStory mode="view" />;
export const Edit: StoryFn = () => <ThemedStory mode="edit" />;
export const CustomBlock: StoryFn = () => <ThemedStory mode="view" custom />;

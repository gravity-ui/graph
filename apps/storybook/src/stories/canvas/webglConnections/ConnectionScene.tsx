import React, { useEffect, useMemo } from "react";

import type { Graph, TBlock, TGraphConfig, TRect, TSceneRenderer } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useSignal } from "@gravity-ui/graph-react";
import { Flex, Text, ThemeProvider } from "@gravity-ui/uikit";

import { coloredConnections } from "../../configurations/coloredConnections";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import type { TConnectionClass } from "./lines";

import "@gravity-ui/uikit/styles/styles.css";

export type ConnectionArgs = { renderer: TSceneRenderer };
export const rendererControl = { name: "Renderer", control: "inline-radio", options: ["canvas", "webgl"] } as const;

type PreviewProps = {
  graph: Graph;
  code: string;
  instruction: string;
  renderBlock?: (graph: Graph, block: TBlock) => React.JSX.Element;
};

function renderStoryBlock(graph: Graph, block: TBlock): React.JSX.Element {
  return <BlockStory graph={graph} block={block} />;
}

export function ConnectionPreview({ graph, code, instruction, renderBlock = renderStoryBlock }: PreviewProps) {
  const actual = useSignal(graph.scene.$renderer);
  const blocks = useSignal(graph.rootStore.blocksList.$blocks);
  const connections = useSignal(graph.rootStore.connectionsList.$connections);
  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={1} style={{ padding: "8px 16px" }}>
          <Text variant="body-1">{instruction}</Text>
          <Text variant="body-1" color="secondary">
            {actual} · {blocks.length.toLocaleString()} {blocks.length === 1 ? "block" : "blocks"} ·{" "}
            {connections.length.toLocaleString()} {connections.length === 1 ? "connection" : "connections"}
          </Text>
          <details>
            <summary>Connection code</summary>
            <pre style={{ margin: 0, maxHeight: 180, overflow: "auto" }}>{code}</pre>
          </details>
        </Flex>
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={renderBlock} />
        </div>
      </Flex>
    </ThemeProvider>
  );
}

type GeneratedProps = ConnectionArgs & {
  connection: TConnectionClass;
  code: string;
  instruction: string;
  layersCount: number;
  connectionsPerLayer: number | "example";
  useBezierConnections?: boolean;
  initialView?: TRect;
  variant: string;
};

function GeneratedView({
  renderer,
  connection,
  code,
  instruction,
  useBezierConnections = true,
  initialView,
  config,
}: Omit<GeneratedProps, "layersCount" | "connectionsPerLayer" | "variant"> & { config: TGraphConfig }) {
  const { graph, setEntities, setSettings, start, zoomTo } = useGraph({});
  useEffect(() => {
    setSettings({ renderer });
  }, [setSettings, renderer]);
  useEffect(() => {
    setSettings({ connection, showConnectionLabels: false, useBezierConnections });
    setEntities({ blocks: config.blocks, connections: config.connections });
    start();
    zoomTo(initialView ?? "center", { padding: 100 });
  }, [setSettings, connection, useBezierConnections, setEntities, config, start, zoomTo, initialView]);
  return <ConnectionPreview graph={graph} code={code} instruction={instruction} />;
}

export function GeneratedConnections({ layersCount, connectionsPerLayer, variant, ...view }: GeneratedProps) {
  const config = useMemo(
    () =>
      connectionsPerLayer === "example"
        ? coloredConnections
        : generatePrettyBlocks({ layersCount, connectionsPerLayer, seed: 7 }),
    [layersCount, connectionsPerLayer]
  );
  // A connection class belongs to its mounted graph. A new effect reuses the same generated topology.
  return <GeneratedView key={variant} {...view} config={config} />;
}

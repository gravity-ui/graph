import React, { useEffect, useMemo, useState } from "react";

import { Select, SelectOption, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";

import { Graph, GraphCanvas, GraphState, TBlock, TConnection, useGraph, useGraphEvent } from "../../../index";
import { MultipointConnection } from "../../../plugins/elk/components/MultipointConnection";
import { useElk } from "../../../plugins/elk/hooks/useElk";
import { TMultipointConnection } from "../../../plugins/elk/types";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";

import { getElkConfig } from "./getElkConfig";

import "@gravity-ui/uikit/styles/styles.css";

const config = generatePrettyBlocks(10, 30, true);

const GraphApp = () => {
  const [algorithm, setAlgorithm] = useState("layered");
  const { graph, setEntities, start } = useGraph({
    settings: {
      connection: MultipointConnection,
    },
  });

  const elkConfig = useMemo(() => {
    return getElkConfig(config, algorithm);
  }, [algorithm]);

  const { isLoading, elk, result } = useElk(elkConfig);

  useEffect(() => {
    if (isLoading || !result) return;

    const connections = config.connections.reduce<(TConnection & Pick<TMultipointConnection, "points" | "labels">)[]>(
      (acc, connection) => {
        if (connection.id in result.edges) {
          acc.push({
            ...connection,
            ...result.edges[connection.id],
          });
        }
        return acc;
      },
      []
    );

    const blocks = config.blocks.map((block) => {
      return {
        ...block,
        ...result.blocks[block.id],
      };
    });

    setEntities({
      blocks,
      connections,
    });

    graph.zoomTo("center", { padding: 300 });
  }, [isLoading, result]);

  const [algorithms, setAlgorithms] = useState<SelectOption[]>([]);

  useEffect(() => {
    elk.knownLayoutAlgorithms().then((knownLayoutAlgorithms) => {
      setAlgorithms(
        knownLayoutAlgorithms.map((knownLayoutAlgorithm) => {
          const { id, name } = knownLayoutAlgorithm;
          const algId = id.split(".").at(-1);
          return { value: algId, content: name };
        })
      );
    });
  }, [elk]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.ATTACHED) {
      start();
    }
  });

  const renderBlockFn = useFn((graphObject: Graph, block: TBlock) => {
    return <BlockStory graph={graphObject} block={block} />;
  });

  return (
    <ThemeProvider theme={"light"}>
      <Select value={[algorithm]} options={algorithms} onUpdate={(v) => setAlgorithm(v[0])}></Select>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Plugins/ELK",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;

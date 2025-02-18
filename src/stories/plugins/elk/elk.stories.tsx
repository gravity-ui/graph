import React, { useEffect, useMemo, useState } from "react";

import { Select, SelectOption, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";
import ELK from "elkjs";

import { Graph, GraphCanvas, GraphState, TBlock, TConnection, useGraph, useGraphEvent } from "../../../index";
import { MultipointConnection, useElk } from "../../../plugins";
import { TMultipointConnection } from "../../../plugins/elk/types";
import { useFn } from "../../../utils/hooks/useFn";
import { BlockStory } from "../../main/Block";

import { getExampleConfig } from "./getExampleConfig";

export enum Algorithm {
  Box = "box",
  Layered = "layered",
  Disco = "disco",
  Radial = "radial",
  MrTree = "mrtree",
  Force = "force",
  Stress = "stress",
  Random = "random",
  SporeOverlap = "sporeOverlap",
  SporeCompaction = "sporeCompaction",
}

import "@gravity-ui/uikit/styles/styles.css";

const GraphApp = () => {
  const [algorithm, setAlgorithm] = useState(Algorithm.Layered);
  const [algorithms, setAlgorithms] = useState<SelectOption[]>([]);

  const elk = useMemo(() => new ELK(), []);

  const { graph, setEntities, start } = useGraph({
    settings: {
      connection: MultipointConnection,
    },
  });

  const { elkConfig, graphConfig } = useMemo(() => {
    return getExampleConfig(algorithm);
  }, [algorithm]);

  const { isLoading, result } = useElk(elkConfig, elk);

  useEffect(() => {
    if (isLoading || !result) return;

    const connections = graphConfig.connections.reduce<
      (TConnection & Pick<TMultipointConnection, "points" | "labels">)[]
    >((acc, connection) => {
      if (connection.id in result.edges) {
        acc.push({
          ...connection,
          ...result.edges[connection.id],
        });
      }
      return acc;
    }, []);

    const blocks = graphConfig.blocks.map((block) => {
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
      <Select value={[algorithm]} options={algorithms} onUpdate={(v) => setAlgorithm(v[0] as Algorithm)}></Select>
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

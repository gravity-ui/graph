import React, { useEffect, useMemo, useState } from "react";

import { Select, SelectOption, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";
import ELK, { ElkNode } from 'elkjs';

import { Graph, GraphCanvas, GraphState, TBlock, useGraph, useGraphEvent } from "../../../index";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";


import { ELKConnection } from "./ELKConnection";

import "@gravity-ui/uikit/styles/styles.css";

export type TElkBlock = TBlock & {
    elk: ElkNode,
}

const config = generatePrettyBlocks(10, 100, true);

const GraphApp = () => {

  const { graph, setEntities, start } = useGraph({
    settings: {
        connection: ELKConnection
    },
  });

    const elk = useMemo(() => new ELK({}), [])

  const [algoritm, setAlgortm] = useState('layered');

  useEffect(() => {
    const {blocks, connections} = config;
    const blocksMap = new Map(blocks.map((b) => [b.id, b]));
    const conMap = new Map(connections.map((b) => [b.id, b]));

    const graphDefinition = {
        id: "root",
        layoutOptions: { 'elk.algorithm': algoritm },
        children: blocks.map((b) => {
            return {
                id: b.id as string,
                width: b.width,
                height: b.height,
            }
        }),
        edges: connections.map((c) => {
            return {
                id: c.id as string,
                sources: [ c.sourceBlockId as string ],
                targets: [ c.targetBlockId as string ]
            }
        }),
      }
      
      elk.layout(graphDefinition)
         .then((result) => {
            console.log(result);

            const {children, edges} = result;
            
            const con = edges.map((edge) => {
                const c = conMap.get(edge.id);
                return {
                    ...c,
                    elk: edge,
                }
            });
            const layoutedBlocks = children.map((child) => {
                const b = blocksMap.get(child.id);

                return {
                    ...b,
                    x: child.x,
                    y: child.y,
                    elk: child,
                }
            });

            setEntities({
                blocks: layoutedBlocks,
                connections: con,
            });

            graph.zoomTo("center", { padding: 300 });
            
        })
        .catch(console.error)

  }, [algoritm, elk]);

  const [algorithms, setAlgortms] = useState<SelectOption[]>([]);

  useEffect(() => {
    elk.knownLayoutAlgorithms().then((knownLayoutAlgorithms) => {
        
        setAlgortms(knownLayoutAlgorithms.map((knownLayoutAlgorithm) => {
            const {id, name} = knownLayoutAlgorithm;
            const algId = id.split('.').at(-1);
            return {value: algId, content: name}
        }));
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
        <Select value={[algoritm]} options={algorithms} onUpdate={(v) => setAlgortm(v[0])}></Select>
      <GraphCanvas className="graph" graph={graph} renderBlock={renderBlockFn} />;
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Examples/ELK Layout",
  component: GraphApp,
};

export default meta;

export const Default: StoryFn = () => <GraphApp />;

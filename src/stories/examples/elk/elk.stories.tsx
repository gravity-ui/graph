// const ELK = require('elkjs')

import React, { useEffect, useMemo, useState } from "react";

import { Flex, Select, SelectOption, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react";
import ELK, { ElkExtendedEdge, ElkNode } from 'elkjs';

import { BlockConnection } from "../../../components/canvas/connections/BlockConnection";
import { Graph, GraphCanvas, GraphState, TBlock, TConnection, useGraph, useGraphEvent } from "../../../index";
import { useFn } from "../../../utils/hooks/useFn";
import { generatePrettyBlocks } from "../../configurations/generatePretty";
import { BlockStory } from "../../main/Block";


import "@gravity-ui/uikit/styles/styles.css";



export type TElkTConnection = TConnection & {
    elk: ElkExtendedEdge
}

export type TElkBlock = TBlock & {
    elk: ElkNode,
}

function curve(path: Path2D, points: {x: number, y: number}[], radius) {
    path.moveTo(points[0].x, points[0].y); // Начинаем с первой точки
 
    for (let i = 1; i < points.length - 1; i++) {
      const prevPoint = points[i - 1];
      const currPoint = points[i];
      const nextPoint = points[i + 1];
 
      // Вычисляем векторы направлений
      const vectorPrev = {
        x: currPoint.x - prevPoint.x,
        y: currPoint.y - prevPoint.y
      };
      const vectorNext = {
        x: nextPoint.x - currPoint.x,
        y: nextPoint.y - currPoint.y
      };
 
      // Нормализуем векторы
      const lenPrev = Math.hypot(vectorPrev.x, vectorPrev.y);
      const lenNext = Math.hypot(vectorNext.x, vectorNext.y);
 
      const unitVecPrev = {
        x: vectorPrev.x / lenPrev,
        y: vectorPrev.y / lenPrev
      };
      const unitVecNext = {
        x: vectorNext.x / lenNext,
        y: vectorNext.y / lenNext
      };
 
      // Точки начала и конца скругления
      const startArcX = currPoint.x - unitVecPrev.x * radius;
      const startArcY = currPoint.y - unitVecPrev.y * radius;
 
      const endArcX = currPoint.x + unitVecNext.x * radius;
      const endArcY = currPoint.y + unitVecNext.y * radius;
 
      // Линия до начала скругления
      path.lineTo(startArcX, startArcY);
 
      // Скругление угла
      path.arcTo(currPoint.x, currPoint.y, endArcX, endArcY, radius);
    }
 
    // Последний сегмент линии
    path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    
}

class ELKConnection extends BlockConnection<TElkTConnection> {
    public createPath() {
        const elk = this.connectedState.$state.value.elk;
        if(!elk || !elk.sections) {
            return super.createPath();
        }
        const path = new Path2D();
        elk.sections.forEach((c) => {
            path.moveTo(c.startPoint.x, c.startPoint.y)
            const points = [
                {x: c.startPoint.x, y: c.startPoint.y},
                ...c.bendPoints?.map((point) => ({x: point.x, y: point.y})) || [],
                {x: c.endPoint.x, y: c.endPoint.y},
            ];
            curve(path, points, 50);
        });
        this.path2d = path;
        return path;
    }

    public style(ctx: CanvasRenderingContext2D): { type: "stroke"; } | { type: "fill"; fillRule?: CanvasFillRule; } | undefined {
        ctx.lineCap = "round";
        return super.style(ctx);
    }

    public getBBox() {
        const elk = this.connectedState.$state.value.elk;
        if(!elk || !elk.sections) {
            return super.getBBox();
        }
        const x = [];
        const y = [];
        elk.sections.forEach((c) => {
            x.push(c.startPoint.x);
            y.push(c.startPoint.y);
            c.bendPoints?.forEach((point) => {
                x.push(point.x);
                y.push(point.y);
            });
            x.push(c.endPoint.x);
            y.push(c.endPoint.y);
        });
        return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)] as const; 
    }
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

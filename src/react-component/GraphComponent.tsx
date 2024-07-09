import React, { PropsWithChildren, memo, useEffect, useMemo, useRef, useState } from "react";
import { Graph, TGraphConfig } from "../graph";
import { TBlock } from "../components/canvas/blocks/Block";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { BlocksList, TBlockListProps } from "./BlocksList";
import { createPortal } from "react-dom";
import { TGraphEventCallbacks, GraphCallbacksMap } from "./events";

export interface TRenderBlockFn<T extends TBlock = TBlock> {
  (graphObject: Graph, block: T): React.JSX.Element;
}

export type TGraphComponentProps = Partial<TGraphEventCallbacks> & {
  config: TGraphConfig;
  graphRef: React.MutableRefObject<Graph | undefined>;
  renderBlockFn: TRenderBlockFn;
  rootElementId?: string;
  width?: string;
  height?: string;
  colors?: TGraphColors;
  constants?: TGraphConstants;
};

const randomId = "id" + Math.random().toString(16).slice(2);

type TGraphBodyProps = {
  id: string;
  width?: string;
  height?: string;
};

const GraphBody: React.FC<PropsWithChildren<TGraphBodyProps>> = (props) => {
  return (
    <div
      id={props.id}
      style={{
        overflow: "hidden",
        width: props.width ? props.width : "100vw",
        height: props.height ? props.height : "100vh",
      }}
    >
      {props.children}
    </div>
  );
};

/**
 * @deprecated use GraphCanvas and useGraph hook
 * ```tsx
 *   const { graph, setEntities, start } = useGraph({...});
 *   return <GraphCanvas className="graph" graph={graph} />;
 * ```
 * */
export const GraphComponent = memo(function GraphComponent(props: TGraphComponentProps) {
  const { config, graphRef, rootElementId, colors, constants, ...events } = props;
  const [graph, setGraph] = useState<Graph>(undefined);

  // init graphEditor
  useEffect(() => {
    const elementId = rootElementId ? rootElementId : randomId;
    const graphRoot = document.getElementById(elementId) as HTMLDivElement;

    if (!graphRoot || !config) return;
    if (graphRef.current) return;

    graphRef.current = new Graph(config, graphRoot, colors, constants);
    setGraph(graphRef.current);
    graphRef.current.start();
    return () => {
      setGraph(undefined);
      graphRef.current?.unmount();
      graphRef.current = undefined;
    };
  }, [setGraph, colors, config, constants, graphRef, rootElementId]);

  useEffect(() => {
    if (!graph) return;

    const unsubscribe = [];
    const fn = (cb: TGraphEventCallbacks[keyof TGraphEventCallbacks]) => (event: CustomEvent) => {
      cb(event.detail, event);
    };
    Array.from(Object.entries(events)).reduce((acc, [key, cb]) => {
      if (GraphCallbacksMap[key as keyof TGraphEventCallbacks]) {
        unsubscribe.push(
          graph.on(
            GraphCallbacksMap[key as keyof TGraphEventCallbacks],
            fn(cb as TGraphEventCallbacks[keyof TGraphEventCallbacks])
          )
        );
      }
      return acc;
    }, {} as Partial<TGraphEventCallbacks>);
    return () => {
      unsubscribe.forEach((unsubscribe) => unsubscribe());
    };
  }, [graph, events]);

  const renderFnRef = useRef(props.renderBlockFn);
  renderFnRef.current = props.renderBlockFn;

  const blocksList = useMemo(() => {
    if (graph) {
      return renderBlocksList(graph.getGraphHTML() as HTMLDivElement, {
        graphObject: graph,
        renderBlock: renderFnRef.current,
      });
    }
    return null;
  }, [graph, renderFnRef]);

  if (rootElementId) {
    return blocksList;
  }

  return (
    <GraphBody id={randomId} width={props.width} height={props.height}>
      {blocksList}
    </GraphBody>
  );
});

function renderBlocksList(portalTarget: HTMLDivElement, props: TBlockListProps) {
  return createPortal(<BlocksList {...props} />, portalTarget);
}

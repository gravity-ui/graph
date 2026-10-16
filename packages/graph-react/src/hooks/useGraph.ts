import { useEffect, useLayoutEffect, useMemo } from "react";

import type {
  GraphClassConstructor,
  Layer,
  LayerPublicProps,
  TBlock,
  TConnection,
  TGraphColorsPatch,
  TGraphConstantsPatch,
  TGraphZoomTarget,
} from "@gravity-ui/graph";
import { Graph, GraphState, TGraphConfig, TGraphSettingsPatch, ZoomConfig } from "@gravity-ui/graph";

import { useFn } from "../utils/hooks/useFn";

export type HookGraphParams = Pick<TGraphConfig, "settings" | "layers"> & {
  graph?: Graph;
  name?: string;
  viewConfiguration?: {
    colors?: TGraphColorsPatch;
    constants?: TGraphConstantsPatch;
  };
};

/** Public hook result expressed through Graph's published API. */
export type UseGraphResult = {
  graph: Graph;
  api: Graph["api"];
  setSettings: Graph["updateSettings"];
  start: () => void;
  stop: () => void;
  setViewConfiguration: (config: NonNullable<HookGraphParams["viewConfiguration"]>) => void;
  addLayer: Graph["addLayer"];
  setEntities: Graph["setEntities"];
  updateEntities: Graph["updateEntities"];
  zoomTo: Graph["zoomTo"];
};

/**
 * Owned graphs whose disposal is scheduled but has not run yet.
 * Keyed by graph so that re-running the effect for one graph never cancels another graph's disposal.
 */
const pendingDisposals = new WeakMap<Graph, ReturnType<typeof setTimeout>>();

export function useGraph(config: HookGraphParams): UseGraphResult {
  const { graph, owned } = useMemo(() => {
    if (config.graph) {
      return { graph: config.graph, owned: false };
    }
    return {
      graph: new Graph({
        configurationName: config.name || "",
        blocks: [],
        connections: [],
        settings: {},
        layers: config.layers, // layers init only once
      }),
      owned: true,
    };
  }, [config.graph]);

  // Dispose the owned graph on unmount. Disposal is deferred by one macrotask because StrictMode runs
  // effect cleanup and setup back to back for the same graph: the setup cancels the pending disposal,
  // so the graph returned by this hook stays alive. A real unmount or a switch to another graph never
  // re-runs setup for this graph, so the timer fires and unmounts it. Fast Refresh recomputes useMemo,
  // so it creates a new graph and the old one is disposed.
  // A passive effect is used on purpose: in React 18 a Suspense boundary that hides already shown
  // content runs layout-effect cleanups but keeps passive effects, and the graph must survive that.
  // (React 19 <Activity> also disconnects passive effects; the peer range is React 18 only.)
  // External graphs (`config.graph`) are owned by the caller and are never disposed here.
  // Known limitation: a Graph built by a render that never commits never reaches this effect and is
  // not disposed. In development React 18 StrictMode renders twice on mount, so one such Graph is
  // created per mount; suspended first mounts and interrupted renders can create more.
  useEffect(() => {
    if (!owned) {
      return undefined;
    }
    clearTimeout(pendingDisposals.get(graph));
    pendingDisposals.delete(graph);
    return () => {
      pendingDisposals.set(
        graph,
        setTimeout(() => {
          pendingDisposals.delete(graph);
          graph.unmount();
        }, 0)
      );
    };
  }, [graph, owned]);

  const setViewConfiguration = useFn((viewConfig: NonNullable<HookGraphParams["viewConfiguration"]>) => {
    if (viewConfig.colors) {
      graph.setColors(viewConfig.colors);
    }
    if (viewConfig.constants) {
      graph.setConstants(viewConfig.constants);
    }
  });

  useLayoutEffect(() => {
    graph.updateSettings(config.settings);
  }, [graph, config.settings]);

  useLayoutEffect(() => {
    if (config.viewConfiguration) {
      setViewConfiguration(config.viewConfiguration);
    }
  }, [graph, setViewConfiguration, config.viewConfiguration]);

  return {
    graph,
    api: graph.api,
    setSettings: useFn((settings: TGraphSettingsPatch) => graph.updateSettings(settings)),
    start: useFn(() => {
      if (graph.state !== GraphState.READY) {
        graph.start();
      }
    }),
    stop: useFn(() => {
      graph.stop();
    }),
    setViewConfiguration,
    addLayer: useFn(
      <T extends GraphClassConstructor<Layer> = GraphClassConstructor<Layer>>(
        layerCtor: T,
        props: LayerPublicProps<T>
      ): InstanceType<T> => {
        return graph.addLayer(layerCtor, props);
      }
    ),
    setEntities: useFn(<B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => {
      graph.setEntities(entities);
    }),
    updateEntities: useFn(<B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => {
      graph.updateEntities(entities);
    }),
    zoomTo: useFn((target: TGraphZoomTarget, config?: ZoomConfig) => {
      return graph.zoomTo(target, config);
    }),
  };
}

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

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

/** Deferred disposals of owned graphs, keyed by graph so one graph never cancels another's. */
const pendingDisposals = new WeakMap<Graph, ReturnType<typeof setTimeout>>();

/** Owned graphs first set up in the current synchronous pass, where StrictMode replays effects. */
const justMountedGraphs = new WeakSet<Graph>();

export function useGraph(config: HookGraphParams): UseGraphResult {
  // The graph this instance created stays owned even if the caller passes it back as `config.graph`.
  // Written while rendering on purpose: ownership must be known in the same useMemo call.
  const createdGraphRef = useRef<Graph | null>(null);
  const { graph, owned } = useMemo(() => {
    if (config.graph) {
      return { graph: config.graph, owned: config.graph === createdGraphRef.current };
    }
    const created = new Graph({
      configurationName: config.name || "",
      blocks: [],
      connections: [],
      settings: {},
      layers: config.layers, // layers init only once
    });
    createdGraphRef.current = created;
    return { graph: created, owned: true };
  }, [config.graph]);

  // Dispose the owned graph when its effect is cleaned up. StrictMode replays cleanup and setup in
  // the same synchronous pass as the first setup, so a cleanup in that pass is deferred by one
  // macrotask and the replayed setup cancels it. A passive effect keeps the graph alive while a
  // Suspense boundary hides it. External graphs are never disposed here.
  // A real unmount in that pass also disposes on the timer, where an error thrown by unmount() is
  // uncaught. Verified on React 18 (the peer range); React 19 <Activity> also disconnects passive
  // effects and is not supported here.
  useEffect(() => {
    if (!owned) {
      return undefined;
    }
    const pending = pendingDisposals.get(graph);
    if (pending === undefined) {
      justMountedGraphs.add(graph);
      queueMicrotask(() => justMountedGraphs.delete(graph));
    }
    clearTimeout(pending);
    pendingDisposals.delete(graph);
    return () => {
      const dispose = (): void => {
        pendingDisposals.delete(graph);
        if (createdGraphRef.current === graph) {
          createdGraphRef.current = null;
        }
        graph.unmount();
      };
      if (justMountedGraphs.delete(graph)) {
        pendingDisposals.set(graph, setTimeout(dispose, 0));
      } else {
        dispose();
      }
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

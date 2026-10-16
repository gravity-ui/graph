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

/**
 * Owned graphs whose effect setup ran in the current synchronous pass. React 18 StrictMode replays
 * effect cleanup and setup in that same pass, so a cleanup inside it may be a replay.
 */
const justMountedGraphs = new WeakSet<Graph>();

/**
 * Owned graphs whose disposal is deferred because their cleanup may be a StrictMode replay.
 * Keyed by graph so that re-running the effect for one graph never cancels another graph's disposal.
 */
const pendingDisposals = new WeakMap<Graph, ReturnType<typeof setTimeout>>();

/**
 * Graphs returned by mounted useGraph instances, owned or external, with the number of instances.
 * Entries are removed by effect cleanup, so a React root dropped without unmounting keeps them.
 */
const liveGraphs = new Map<Graph, number>();

/**
 * `graph.unmount()` stops the global scheduler shared by every graph. Restart it while any graph
 * held by a mounted useGraph instance is still running. Restarting is idempotent.
 */
function restartSchedulerForLiveGraphs(): void {
  for (const liveGraph of liveGraphs.keys()) {
    if (liveGraph.state === GraphState.READY) {
      liveGraph.scheduler.start();
    }
  }
}

function disposeGraph(graph: Graph): void {
  try {
    graph.unmount();
  } finally {
    restartSchedulerForLiveGraphs();
  }
}

export function useGraph(config: HookGraphParams): UseGraphResult {
  // The graph this hook instance created. It stays owned even if the caller passes it back as
  // `config.graph`, so that switch neither disposes it nor makes the hook forget to dispose it.
  // It is written while rendering on purpose: ownership must be known in the same useMemo call.
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

  // Dispose the owned graph when it is unmounted or replaced, synchronously in the passive cleanup
  // of that commit. `graph.unmount()` stops the global scheduler shared by every graph, and a
  // passive cleanup can run after a replacement started in the layout phase, so every disposal and
  // every setup restarts the scheduler while a graph held by a mounted useGraph is running.
  // The exception is a cleanup in the same synchronous pass as the graph's first setup, which is how
  // React 18 StrictMode replays effects on mount. Such a disposal is deferred by one macrotask and
  // cancelled by the replayed setup, so the graph returned by this hook stays alive. A real unmount
  // in that pass is deferred too and runs on the timer, where an error from `graph.unmount()` is
  // uncaught instead of reaching an error boundary.
  // A passive effect is used on purpose: in React 18 a Suspense boundary that hides already shown
  // content runs layout-effect cleanups but keeps passive effects, and the graph must survive that.
  // (React 19 <Activity> also disconnects passive effects; the peer range is React 18 only.)
  // External graphs (`config.graph`) are owned by the caller and are never disposed here.
  // A graph no useGraph holds that is started in the layout phase of the commit that disposes an
  // owned graph is stopped by that disposal; it used to run in a layout cleanup, before such starts.
  // Known limitation: a Graph built by a render that never commits never reaches this effect and is
  // not disposed. In development React 18 StrictMode renders twice on mount, so one such Graph is
  // created per mount; suspended first mounts and interrupted renders can create more.
  useEffect(() => {
    const pending = owned ? pendingDisposals.get(graph) : undefined;
    if (pending !== undefined) {
      clearTimeout(pending);
      pendingDisposals.delete(graph);
    } else if (owned) {
      justMountedGraphs.add(graph);
      queueMicrotask(() => justMountedGraphs.delete(graph));
    }
    // An old graph's disposal runs in passive cleanup, after this commit's layout effects (which may
    // have started this graph) but before this graph is registered here, so its restart missed it.
    liveGraphs.set(graph, (liveGraphs.get(graph) ?? 0) + 1);
    restartSchedulerForLiveGraphs();
    const release = (): void => {
      const count = liveGraphs.get(graph) ?? 0;
      if (count > 1) {
        liveGraphs.set(graph, count - 1);
      } else {
        liveGraphs.delete(graph);
      }
    };
    if (!owned) {
      return release;
    }
    const dispose = (): void => {
      // A disposed graph is no longer this hook's to own, even if the caller passes it back.
      if (createdGraphRef.current === graph) {
        createdGraphRef.current = null;
      }
      disposeGraph(graph);
    };
    return () => {
      release();
      if (!justMountedGraphs.has(graph)) {
        dispose();
        return;
      }
      justMountedGraphs.delete(graph);
      pendingDisposals.set(
        graph,
        setTimeout(() => {
          pendingDisposals.delete(graph);
          dispose();
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

import { useLayoutEffect, useMemo } from "react";

import type {
  Constructor,
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

export function useGraph(config: HookGraphParams): UseGraphResult {
  const graph = useMemo(() => {
    if (config.graph) {
      return config.graph;
    }
    return new Graph({
      configurationName: config.name || "",
      blocks: [],
      connections: [],
      settings: {},
      layers: config.layers, // layers init only once
    });
  }, [config.graph]);

  // Cleanup graph on unmount to prevent memory leaks in strict mode
  useLayoutEffect(() => {
    return () => {
      if (!config.graph && graph) {
        graph.unmount();
      }
    };
  }, [graph]);

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
      <T extends Constructor<Layer> = Constructor<Layer>>(
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

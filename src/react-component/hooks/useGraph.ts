import { useLayoutEffect, useMemo } from "react";

import { batch } from "@preact/signals-core";

import { ZoomConfig } from "../../api/PublicGraphApi";
import type { TBlock } from "../../components/canvas/blocks/Block";
import { Graph, GraphState, TGraphConfig } from "../../graph";
import type { TGraphZoomTarget } from "../../graph";
import type { TGraphColors, TGraphConstants } from "../../graphConfig";
import type { Layer } from "../../services/Layer";
import type { TConnection } from "../../store/connection/ConnectionState";
import { useFn } from "../../utils/hooks/useFn";
import { RecursivePartial } from "../../utils/types/helpers";

export type HookGraphParams = Pick<TGraphConfig, "settings" | "layers"> & {
  graph?: Graph;
  name?: string;
  viewConfiguration?: {
    colors?: RecursivePartial<TGraphColors>;
    constants?: RecursivePartial<TGraphConstants>;
  };
};

export function useGraph(config: HookGraphParams) {
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

  const setViewConfiguration = useFn((viewConfig: HookGraphParams["viewConfiguration"]) => {
    if (viewConfig.colors) {
      graph.setColors(config.viewConfiguration.colors);
    }
    if (viewConfig.constants) {
      graph.setConstants(config.viewConfiguration.constants);
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
    setSettings: useFn((settings) => graph.updateSettings(settings)),
    start: useFn(() => {
      if (graph.state !== GraphState.READY) {
        graph.start();
      }
    }),
    stop: useFn(() => {
      graph.stop();
    }),
    setViewConfiguration,
    addLayer: <T extends Constructor<Layer> = Constructor<Layer>>(
      layerCtor: T,
      props: T extends Constructor<Layer<infer Props>>
        ? Omit<Props, "root" | "camera" | "graph" | "emitter"> & { root?: Props["root"] }
        : never
    ): InstanceType<T> => {
      return graph.addLayer(layerCtor, props);
    },
    setEntities: useFn(<B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => {
      batch(() => {
        graph.rootStore.blocksList.setBlocks(entities.blocks || []);
        graph.rootStore.connectionsList.setConnections(entities.connections || []);
      });
    }),
    updateEntities: useFn(<B extends TBlock, C extends TConnection>(entities: { blocks?: B[]; connections?: C[] }) => {
      batch(() => {
        if (entities.blocks) {
          graph.rootStore.blocksList.updateBlocks(entities.blocks);
        }
        if (entities.connections) {
          graph.rootStore.connectionsList.updateConnections(entities.connections);
        }
      });
    }),
    zoomTo: useFn((target: TGraphZoomTarget, config?: ZoomConfig) => {
      graph.zoomTo(target, config);
    }),
  };
}

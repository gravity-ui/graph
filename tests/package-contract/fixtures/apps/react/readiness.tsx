import React from "react";
import { Graph, Layer } from "@gravity-ui/graph";
import { GraphLayer, GraphPortal, useLayer, useSignal, useSyncBlockState } from "@gravity-ui/graph-react";
import type { ReadonlySignal } from "@preact/signals-core";

// Strict-only negative nullability assertions.
export function ReadinessContracts({ graph, signal }: { graph: Graph; signal?: ReadonlySignal<number> }) {
  const block = useSyncBlockState<{ label: string }>(graph, "missing");
  // @ts-expect-error an explicit Meta does not establish block existence
  block.$state.value.meta;
  const layer = useLayer(graph, Layer, {});
  // @ts-expect-error layer is absent before attachment and after detach
  layer.show();
  const value = useSignal(signal);
  // @ts-expect-error an absent signal has no value
  value.toFixed();
  const canvas = (
    <GraphLayer
      layer={Layer}
      ref={(instance) => {
        // @ts-expect-error callback refs receive null during cleanup
        instance.show();
      }}
    />
  );
  const portal = (
    <GraphPortal
      ref={(instance) => {
        // @ts-expect-error a portal ref may be absent
        instance.getPortalTarget();
      }}
    >
      content
    </GraphPortal>
  );
  void canvas;
  void portal;
  return null;
}

import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import {
  Graph,
  GraphState,
  Layer,
  layerConfig,
  type GraphEventMap,
  type LayerProps,
  type TBlock,
} from "@gravity-ui/graph";
import {
  GraphBlock,
  GraphCanvas,
  GraphLayer,
  useLayer,
  GraphPortal,
  useBlockState,
  useSyncBlockState,
  useBlockViewState,
  useBlockAnchorState,
  useGraph,
  useGraphEvent,
  useGraphEvents,
} from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

import "../../../../scripts/package-contract/shared/base.css";
import "./app.css";

const blocks = [
  {
    id: "react-source",
    is: "Block",
    x: 180,
    y: 160,
    width: 220,
    height: 120,
    name: "React source",
    anchors: [],
  },
] satisfies TBlock[];

class ReactFixtureLabelLayer extends Layer<LayerProps & { label: string }> {}

function useConfiguredLayerGraph() {
  return useGraph({ layers: [layerConfig(ReactFixtureLabelLayer, { label: "ok" })] });
}
void useConfiguredLayerGraph;

function ReactGraph() {
  const { graph, setEntities, start } = useGraph({ settings: {} });
  if (!(graph instanceof Graph)) throw new Error("useGraph created a duplicate core runtime.");

  useLayoutEffect(() => {
    setEntities({ blocks, connections: [] });
    start();
  }, [setEntities, start]);

  useGraphEvent(graph, "state-change", ({ state }) => {
    if (state === GraphState.READY) {
      graph.zoomTo("center");
      const root = document.querySelector<HTMLDivElement>("#react-root");
      if (root) {
        root.dataset.state = "ready";
      }
    }
  });

  useGraphEvent(graph, "press", ({ event, preventDefault }) => {
    if (event.button === 1) preventDefault();
  });

  const renderBlock = (graphObject: Graph, block: TBlock) => (
    <GraphBlock graph={graphObject} block={block} className="react-block">
      <div data-testid={`react-block-${block.id}`}>{block.name}</div>
    </GraphBlock>
  );

  return (
    <GraphCanvas graph={graph} renderBlock={renderBlock}>
      <GraphPortal>
        {(layer, portalGraph) => {
          if (!(layer instanceof Layer) || portalGraph !== graph) {
            throw new Error("The React portal does not share the application's core runtime.");
          }
          return <div data-testid="react-portal">Shared core layer</div>;
        }}
      </GraphPortal>
    </GraphCanvas>
  );
}

const root = document.querySelector<HTMLDivElement>("#react-root");
if (!root) {
  throw new Error("React root was not found.");
}

createRoot(root).render(<ReactGraph />);

// Compile-only hook checks; never mounted. Unguarded reads must fail so hook declarations preserve missing entities.
function LookupContracts({ graph }: { graph: Graph }) {
  const state = useBlockState(graph, "missing");
  const sync = useSyncBlockState(graph, "missing");
  const view = useBlockViewState(graph, "missing");
  const anchor = useBlockAnchorState(graph, { id: "missing", blockId: "missing", type: "IN" });
  // @ts-expect-error a block may be absent
  state.id;
  // @ts-expect-error synchronous lookup preserves absence in emitted declarations
  sync.id;
  // @ts-expect-error a view may be absent
  view.getEntityId();
  // @ts-expect-error an anchor may be absent
  anchor.id;
  // @ts-expect-error ID lookup cannot promise custom metadata
  useSyncBlockState<TBlock<{ custom: string }>>(graph, "missing");
  if (sync) {
    const id: string | number = sync.id;
    void id;
  }
  return null;
}
void LookupContracts;

// Type-only checks; this component is never mounted. Compile against source APIs and packed declarations.
// Deliberately invalid payloads/listeners must be rejected: if inference becomes any, the unused
// expect-error directives below fail compilation instead of silently accepting the regression.
function ReactEventTypeContracts({ graph }: { graph: Graph }) {
  useGraphEvent(
    graph,
    "click",
    (event) => {
      const pointer: PointerEvent = event.event;
      const worldX: number = event.point.world.x;
      void [pointer, worldX];
    },
    { capture: true }
  );
  useGraphEvent(graph, "pinch", (event) => {
    const fingers: readonly [PointerEvent, PointerEvent] = event.pointers;
    if (event.phase === "start" && event.distance < 20) event.preventDefault();
    // @ts-expect-error The proposed camera scale belongs to camera-change.
    event.scale;
    void fingers;
  });
  useGraphEvents(graph, { onDragStart: (event) => event.claim({ owner: "panel" }) });
  // @ts-expect-error Only dragstart offers ownership.
  useGraphEvent(graph, "release", (event) => event.claim({ owner: "panel" }));
  const onStateChange = (event: GraphEventMap["state-change"]) => {
    const state: GraphState = event.state;
    void state;
    // @ts-expect-error state-change has no colors field.
    event.colors;
    // @ts-expect-error Payload fields live directly on the event.
    event.detail;
  };
  graph.on("state-change", onStateChange);
  useGraphEvent(graph, "state-change", onStateChange);
  useGraphEvents(graph, { onStateChange });
  // @ts-expect-error The state callback receives one event, with the payload on that event.
  useGraphEvent(graph, "state-change", (_state: GraphEventMap["state-change"], _second: Event) => {});
  useGraphEvents(graph, {
    // @ts-expect-error Named callbacks require the same event as the core listener.
    onStateChange: (data: { colors: unknown }) => {
      void data;
    },
  });
  return (
    <GraphCanvas
      graph={graph}
      onPress={(event) => event.preventDefault()}
      onStateChange={onStateChange}
      onClick={(event) => {
        const pointer: PointerEvent = event.event;
        void pointer;
      }}
      onCameraChange={(event) => {
        const scale: number = event.scale;
        void scale;
      }}
    />
  );
}
void ReactEventTypeContracts;

// Compile-only contracts: JSX and useLayer preserve custom required props and the concrete ref instance.
class RequiredReactLayer extends Layer<LayerProps & { label: string }> {
  public getLabel() {
    return this.props.label;
  }
}
function LayerConstructionContracts({ graph }: { graph: Graph }) {
  const layer = useLayer(graph, RequiredReactLayer, { label: "custom" });
  layer?.getLabel();
  // @ts-expect-error useLayer is null before initialization, even with a non-null Graph.
  layer.getLabel();
  // @ts-expect-error useLayer requires the custom label after Graph injects its internal props.
  useLayer(graph, RequiredReactLayer, {});
  const valid = (
    <GraphLayer
      layer={RequiredReactLayer}
      props={{ label: "custom" }}
      ref={(instance) => {
        if (instance) {
          const label: string = instance.getLabel();
          // @ts-expect-error The ref is the concrete layer, not an untyped instance.
          instance.missingMethod();
          void label;
        }
      }}
    />
  );
  // @ts-expect-error Required custom props cannot be omitted through the React wrapper.
  const missing = <GraphLayer layer={RequiredReactLayer} />;
  // @ts-expect-error The supplied props must satisfy the concrete layer class.
  const wrong = <GraphLayer layer={RequiredReactLayer} props={{}} />;
  const optional = <GraphLayer layer={Layer} />;
  void valid;
  void missing;
  void wrong;
  return optional;
}
void LayerConstructionContracts;

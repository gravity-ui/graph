import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import { Graph, GraphState, Layer, type LayerProps, type TBlock } from "@gravity-ui/graph";
import { GraphBlock, GraphCanvas, GraphLayer, useLayer, GraphPortal, useBlockState, useSyncBlockState, useBlockViewState, useBlockAnchorState, useGraph, useGraphEvent, useGraphEvents, type GraphEvent, type GraphEventDetail } from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

import "../../shared/base.css";
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
  // @ts-expect-error an ID does not establish a custom metadata shape
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
  useGraphEvent(graph, "state-change", (data, event) => {
    const state: GraphState = data.state;
    const payload: typeof data = event.detail;
    void state; void payload;
    // colors belongs to colors-changed. Reading it here must fail to prove state-change inferred its own payload.
    // @ts-expect-error state-change exposes { state: GraphState }, so data.colors is invalid.
    data.colors;
  });
  // Positive check: the named callback must infer detail and event separately; GraphEvent denotes the second argument.
  useGraphEvents(graph, { onStateChanged: (data, event) => {
    const detail: GraphEventDetail<"onStateChanged"> = data;
    const typedEvent: GraphEvent<"onStateChanged"> = event;
    void detail; void typedEvent;
  } });
  // @ts-expect-error state-change must reject a callback expecting the colors-changed payload.
  useGraphEvent(graph, "state-change", (data: { colors: unknown }) => { void data; });
  // @ts-expect-error onStateChanged must reject a callback expecting colors instead of state.
  useGraphEvents(graph, { onStateChanged: (data: { colors: unknown }) => { void data; } });
  return null;
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

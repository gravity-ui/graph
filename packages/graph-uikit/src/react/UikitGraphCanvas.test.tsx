import React from "react";

import type { Graph } from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";
import { ThemeProvider } from "@gravity-ui/uikit";
import { act, render } from "@testing-library/react";

import { UikitInteractionLayer } from "../interactions/UikitInteractionLayer";
import type { TUikitGraphMode } from "../store/UikitGraphStore";
import { flushFrames } from "../test-utils/graphFixture";

import { UikitGraphCanvas } from "./UikitGraphCanvas";
import { useUikitGraph } from "./useUikitGraph";

let currentGraph: Graph | undefined;

function App({ mode }: { mode: TUikitGraphMode }): React.ReactElement {
  const { graph } = useUikitGraph({ mode });
  currentGraph = graph;
  return (
    <ThemeProvider theme="light">
      <UikitGraphCanvas graph={graph} />
    </ThemeProvider>
  );
}

function getEditingLayer(graph: Graph): ConnectionEditingLayer {
  const layer = graph.layers.getLayers().find((item) => item instanceof ConnectionEditingLayer);
  if (!(layer instanceof ConnectionEditingLayer)) throw new Error("Expected ConnectionEditingLayer");
  return layer;
}

describe("UikitGraphCanvas", () => {
  beforeEach(() => jest.spyOn(console, "warn").mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it("mounts the interaction layer and toggles connection editing with the mode", () => {
    const { rerender } = render(<App mode="view" />);
    const graph = currentGraph;
    if (!graph) throw new Error("Expected a graph");
    // Layer props set by `useLayer` are applied by the scheduler frame, which runs only on a started graph.
    act(() => {
      graph.start();
      flushFrames(graph);
    });

    expect(graph.layers.getLayers().some((layer) => layer instanceof UikitInteractionLayer)).toBe(true);
    const layer = getEditingLayer(graph);
    expect(layer.props.enabled).toBe(false);

    rerender(<App mode="edit" />);
    act(() => flushFrames(graph));
    expect(getEditingLayer(graph)).toBe(layer);
    expect(layer.props.enabled).toBe(true);
  });
});

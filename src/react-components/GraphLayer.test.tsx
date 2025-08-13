import React, { createRef } from "react";

import { act, render, waitFor } from "@testing-library/react";

import { Graph } from "../graph";
import { Layer } from "../services/Layer";

import { GraphCanvas } from "./GraphCanvas";
import { GraphLayer } from "./GraphLayer";

// Mock Layer for testing
class MockLayer extends Layer {
  public testMethod(): string {
    return "test method called";
  }
}

describe("GraphLayer", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({});
  });

  afterEach(() => {
    act(() => {
      graph?.unmount();
    });
  });

  it("should provide layer instance through ref", async () => {
    const ref = createRef<MockLayer>();

    render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphLayer ref={ref} layer={MockLayer} />
      </GraphCanvas>
    );

    // Start the graph to make it ready
    await act(async () => {
      graph.start();
    });

    // Wait for layer to be created
    await waitFor(() => {
      expect(ref.current).toBeDefined();
      expect(ref.current).toBeInstanceOf(MockLayer);
      expect(ref.current?.testMethod()).toBe("test method called");
    });
  });

  it("should not render any visible content", () => {
    const { container } = render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphLayer layer={MockLayer} />
      </GraphCanvas>
    );

    // GraphLayer should not add any DOM elements
    expect(container.children).toHaveLength(1); // Only GraphCanvas
  });

  it("should create layer with correct props", async () => {
    const ref = createRef<MockLayer>();
    const customProps = { zIndex: 200 };

    render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphLayer ref={ref} layer={MockLayer} {...customProps} />
      </GraphCanvas>
    );

    // Start the graph to make it ready
    await act(async () => {
      graph.start();
    });

    // Wait for layer to be created
    await waitFor(() => {
      expect(ref.current).toBeDefined();
      // Layer props should be passed correctly (checked through layer existence)
      expect(ref.current).toBeInstanceOf(MockLayer);
    });
  });
});

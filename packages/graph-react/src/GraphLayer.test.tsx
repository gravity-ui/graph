import React, { createRef } from "react";

import { Graph, Layer, LayerProps } from "@gravity-ui/graph";
import { act, render, waitFor } from "@testing-library/react";

import { GraphCanvas } from "./GraphCanvas";
import { GraphLayer } from "./GraphLayer";

// Mock Layer for testing
class MockLayer extends Layer<LayerProps & { label?: string }> {
  public getLabel() {
    return this.props.label;
  }
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
    const customProps = { label: "custom" };

    render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphLayer ref={ref} layer={MockLayer} props={customProps} />
      </GraphCanvas>
    );

    // Start the graph to make it ready
    await act(async () => {
      graph.start();
    });

    // Wait for layer to be created
    await waitFor(() => {
      expect(ref.current).toBeDefined();
      expect(ref.current?.getLabel()).toBe("custom");
    });
  });
});

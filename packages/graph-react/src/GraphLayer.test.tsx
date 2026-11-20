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

  it("exposes the mounted layer and its props through the ref without rendering a DOM child", async () => {
    const ref = createRef<MockLayer>();
    const { getByTestId } = render(
      <GraphCanvas graph={graph}>
        <div data-testid="layer-mount">
          <GraphLayer ref={ref} layer={MockLayer} props={{ label: "custom" }} />
        </div>
      </GraphCanvas>
    );

    const mount = getByTestId("layer-mount");
    expect(mount.childNodes).toHaveLength(0);
    await act(async () => {
      graph.start();
    });
    await waitFor(() => expect(ref.current).toBeInstanceOf(MockLayer));
    expect(graph.layers.getLayers()).toContain(ref.current);
    expect(ref.current?.getLabel()).toBe("custom");
    expect(mount.childNodes).toHaveLength(0);
  });
});

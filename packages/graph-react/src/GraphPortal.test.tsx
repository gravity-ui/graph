import React, { createRef } from "react";

import { Graph } from "@gravity-ui/graph";
import { act, render, waitFor } from "@testing-library/react";

import { GraphCanvas } from "./GraphCanvas";
import { GraphPortal } from "./GraphPortal";

describe("GraphPortal", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({});
  });

  afterEach(() => {
    act(() => {
      graph.stop();
      graph?.unmount();
    });
  });

  it("should render portal content when graph is ready", async () => {
    const { container } = render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphPortal>
          <div data-testid="portal-content">Portal Content</div>
        </GraphPortal>
      </GraphCanvas>
    );

    // Start the graph to make it ready
    await act(async () => {
      graph.start();
    });

    // Wait for portal content to appear
    await waitFor(() => {
      expect(container.querySelector('[data-testid="portal-content"]')).not.toBeNull();
    });
  });

  it("should provide layer instance through ref", async () => {
    const ref = createRef<any>();

    render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphPortal ref={ref}>
          <div>Portal Content</div>
        </GraphPortal>
      </GraphCanvas>
    );

    // Start the graph to make it ready
    await act(async () => {
      graph.start();
    });

    // Wait for layer to be created
    await waitFor(() => {
      expect(ref.current).toBeDefined();
      expect(ref.current.getPortalTarget).toBeDefined();
      expect(typeof ref.current.getPortalTarget).toBe("function");
    });
  });

  it("should render children as function with layer parameter", async () => {
    const childrenFn = jest.fn().mockReturnValue(<div>Function Content</div>);

    render(
      <GraphCanvas graph={graph} renderBlock={() => <div>Block</div>}>
        <GraphPortal>{childrenFn}</GraphPortal>
      </GraphCanvas>
    );

    // Start the graph to make it ready
    await act(async () => {
      graph.start();
    });

    // Wait for function to be called
    await waitFor(() => {
      expect(childrenFn).toHaveBeenCalled();
      expect(childrenFn.mock.calls[0][0]).toBeDefined(); // layer
      expect(childrenFn.mock.calls[0][1]).toBeDefined(); // graph
      expect(childrenFn.mock.calls[0][0].getPortalTarget).toBeDefined();
    });
  });
});

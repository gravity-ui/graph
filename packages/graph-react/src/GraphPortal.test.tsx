import React, { createRef } from "react";

import { Graph } from "@gravity-ui/graph";
import { act, render } from "@testing-library/react";

import { GraphCanvas } from "./GraphCanvas";
import { GraphPortal, GraphPortalLayer } from "./GraphPortal";

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

  it("renders its children inside the layer's portal target", async () => {
    const ref = createRef<GraphPortalLayer>();
    const { findByText } = render(
      <GraphCanvas graph={graph}>
        <GraphPortal ref={ref}>
          <div>Portal content</div>
        </GraphPortal>
      </GraphCanvas>
    );

    await act(async () => {
      graph.start();
    });
    expect((await findByText("Portal content")).parentElement).toBe(ref.current?.getPortalTarget());
  });

  it("passes the mounted layer and graph to a render function", async () => {
    const ref = createRef<GraphPortalLayer>();
    const children = jest.fn(() => <div>Function content</div>);
    const { findByText } = render(
      <GraphCanvas graph={graph}>
        <GraphPortal ref={ref}>{children}</GraphPortal>
      </GraphCanvas>
    );

    await act(async () => {
      graph.start();
    });
    await findByText("Function content");
    expect(ref.current).toBeInstanceOf(GraphPortalLayer);
    expect(children).toHaveBeenCalledWith(ref.current, graph);
  });
});

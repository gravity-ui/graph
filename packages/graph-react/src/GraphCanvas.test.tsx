import React from "react";

import { Graph } from "@gravity-ui/graph";
import { act, render } from "@testing-library/react";

import { GraphCanvas } from "./GraphCanvas";
import { ReactLayer } from "./layer";

describe("GraphCanvas", () => {
  it("destroys its ReactLayer on unmount while the external graph stays alive", () => {
    const graph = new Graph({});
    const { unmount } = render(<GraphCanvas graph={graph} renderBlock={() => <div>Block</div>} />);
    const reactLayer = graph.layers.getLayers().find((layer) => layer instanceof ReactLayer);
    if (!reactLayer) throw new Error("Expected a ReactLayer");
    // unmount is a protected lifecycle hook; the spy only observes it through the instance.
    const unmounted = jest.spyOn(reactLayer as unknown as { unmount(): void }, "unmount");

    act(() => unmount());

    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(graph.layers.getLayers()).not.toContain(reactLayer);
    act(() => graph.unmount());
    expect(unmounted).toHaveBeenCalledTimes(1);
  });
});

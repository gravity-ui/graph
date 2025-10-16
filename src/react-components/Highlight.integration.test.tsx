import React from "react";

import { act, render } from "@testing-library/react";

import { Graph } from "../graph";
import { HighlightVisualMode } from "../services/highlight/HighlightService";

import { GraphCanvas } from "./GraphCanvas";

describe("Highlight Integration", () => {
  it("Block receives highlightMode in highlight and focus", async () => {
    const graph = new Graph({
      blocks: [
        { id: "A", is: "Block", x: 0, y: 0, width: 100, height: 50, selected: false, name: "A", anchors: [] },
        { id: "B", is: "Block", x: 200, y: 0, width: 100, height: 50, selected: false, name: "B", anchors: [] },
      ],
      connections: [],
    });

    const { unmount } = render(<GraphCanvas graph={graph} renderBlock={() => <div>Block</div>} />);

    await act(async () => {
      graph.start();
    });

    await act(async () => {
      graph.highlight({ block: ["A"] });
    });
    expect(graph.highlightService.getEntityHighlightMode("block:A")).toBe(HighlightVisualMode.Highlight);
    expect(graph.highlightService.getEntityHighlightMode("block:B")).toBeUndefined();

    await act(async () => {
      graph.focus({ block: ["A"] });
    });
    expect(graph.highlightService.getEntityHighlightMode("block:A")).toBe(HighlightVisualMode.Highlight);
    expect(graph.highlightService.getEntityHighlightMode("block:B")).toBe(HighlightVisualMode.Lowlight);

    unmount();
    graph.unmount();
  });
});

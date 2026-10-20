import React from "react";

import { Graph } from "@gravity-ui/graph";
import { ThemeProvider } from "@gravity-ui/uikit";
import { fireEvent, render, screen } from "@testing-library/react";

import { GraphUikitToolbar } from "./GraphUikitToolbar";
import { group } from "./group";
import { zoomGroup } from "./zoom";

function renderToolbar(graph: Graph, extra = {}): ReturnType<typeof render> {
  return render(
    <ThemeProvider theme="light">
      <GraphUikitToolbar
        graph={graph}
        zoomStep={0.1}
        actions={[group(...zoomGroup({ reset: true, viewport: true, selection: true }))]}
        {...extra}
      />
    </ThemeProvider>
  );
}

describe("GraphUikitToolbar", () => {
  it("zooms in by the multiplicative step around the viewport center", () => {
    const graph = new Graph({});
    jest.spyOn(graph.cameraService, "getCameraScale").mockReturnValue(0.5);
    const zoom = jest.spyOn(graph, "zoom").mockImplementation(() => undefined);
    renderToolbar(graph);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(zoom).toHaveBeenCalledTimes(1);
    expect(zoom.mock.calls[0][0].scale).toBeCloseTo(0.55);
    graph.unmount();
  });

  it("disables zoom in at the max scale, 1:1 at scale 1, and fit selection with no selection", () => {
    const graph = new Graph({});
    jest.spyOn(graph.cameraService, "getCameraScale").mockReturnValue(1);
    renderToolbar(graph);

    expect(screen.getByRole("button", { name: "Zoom in" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Actual size" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Fit selection" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Zoom out" }).hasAttribute("disabled")).toBe(false);
    graph.unmount();
  });

  it("fits the viewport", () => {
    const graph = new Graph({});
    const zoomTo = jest.spyOn(graph, "zoomTo").mockReturnValue(true);
    renderToolbar(graph);

    fireEvent.click(screen.getByRole("button", { name: "Fit to viewport" }));

    expect(zoomTo).toHaveBeenCalledWith("center");
    graph.unmount();
  });

  it("runs custom actions with the graph and toolbar context and renders groups per layout", () => {
    const graph = new Graph({});
    const action = jest.fn();
    const { container } = render(
      <ThemeProvider theme="light">
        <GraphUikitToolbar
          graph={graph}
          zoomStep={0.25}
          layout="horizontal"
          actions={[group({ id: "custom", title: "Custom", label: "C", action }), group(...zoomGroup())]}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));

    expect(action).toHaveBeenCalledWith(graph, { zoomStep: 0.25 });
    expect(container.querySelector(".graph-uikit-toolbar_layout_horizontal")).not.toBeNull();
    expect(container.querySelectorAll(".graph-uikit-toolbar__group")).toHaveLength(2);
    graph.unmount();
  });
});

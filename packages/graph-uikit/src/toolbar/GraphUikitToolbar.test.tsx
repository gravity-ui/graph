import React from "react";

import { Graph } from "@gravity-ui/graph";
import { ThemeProvider } from "@gravity-ui/uikit";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { createUikitGraph, disposeUikitGraph, getBlockView } from "../test-utils/graphFixture";

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
    expect(screen.getByRole("button", { name: "Actual size (1:1)" }).hasAttribute("disabled")).toBe(true);
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

  it("re-renders disabled predicates when the camera changes", () => {
    const graph = new Graph({});
    renderToolbar(graph);
    const isDisabled = (name: string): boolean => screen.getByRole("button", { name }).hasAttribute("disabled");

    expect(isDisabled("Zoom in")).toBe(false);
    expect(isDisabled("Actual size (1:1)")).toBe(false);

    act(() => {
      graph.cameraService.set({ scale: 1 });
    });

    expect(isDisabled("Zoom in")).toBe(true);
    expect(isDisabled("Actual size (1:1)")).toBe(true);

    act(() => {
      graph.cameraService.set({ scale: graph.cameraService.getCameraState().scaleMin });
    });

    expect(isDisabled("Zoom in")).toBe(false);
    expect(isDisabled("Zoom out")).toBe(true);
    graph.unmount();
  });

  it("enables fit selection after the block or connection selection changes", () => {
    const fixture = createUikitGraph();
    const { graph } = fixture;
    const zoomTo = jest.spyOn(graph, "zoomTo").mockReturnValue(true);
    const { unmount } = renderToolbar(graph);
    const fitSelection = (): HTMLElement => screen.getByRole("button", { name: "Fit selection" });

    expect(fitSelection().hasAttribute("disabled")).toBe(true);

    act(() => {
      graph.blocks.blockSelectionBucket.select(["a"]);
    });

    expect(fitSelection().hasAttribute("disabled")).toBe(false);
    fireEvent.click(fitSelection());
    expect(zoomTo).toHaveBeenCalledWith([getBlockView(graph, "a")]);

    act(() => {
      graph.blocks.blockSelectionBucket.deselect(["a"]);
    });

    expect(fitSelection().hasAttribute("disabled")).toBe(true);

    act(() => {
      graph.connections.connectionSelectionBucket.select(["a:b"]);
    });

    expect(fitSelection().hasAttribute("disabled")).toBe(false);
    // Unmount the toolbar first: disposing the graph resets its stores and would re-render it outside `act`.
    unmount();
    disposeUikitGraph(fixture);
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

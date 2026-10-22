import React from "react";

import { Graph } from "@gravity-ui/graph";
import { GraphContextProvider } from "@gravity-ui/graph-react";
import { ThemeProvider } from "@gravity-ui/uikit";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { GraphContextMenu } from "./GraphContextMenu";
import type { TGraphContextMenuProps, TGraphMenuItem } from "./GraphContextMenu";

function setup(items: TGraphContextMenuProps["items"]): { graph: Graph; unmount: () => void } {
  const graph = new Graph({});
  const { unmount } = render(
    <ThemeProvider theme="light">
      <GraphContextProvider graph={graph}>
        <GraphContextMenu items={items} />
      </GraphContextProvider>
    </ThemeProvider>
  );
  return { graph, unmount };
}

function openOnCanvas(graph: Graph): void {
  const store = getUikitGraphStore(graph);
  act(() => {
    store.$contextMenu.value = {
      entity: { kind: "canvas", worldPoint: { x: 0, y: 0 } },
      clientPoint: { x: 10, y: 10 },
      cameraVersion: store.$cameraVersion.value,
    };
  });
}

describe("GraphContextMenu", () => {
  it("registers itself as a consumer while mounted", () => {
    const { graph, unmount } = setup(() => null);
    expect(getUikitGraphStore(graph).$contextMenuConsumers.value).toBe(1);
    unmount();
    expect(getUikitGraphStore(graph).$contextMenuConsumers.value).toBe(0);
    graph.unmount();
  });

  it("shows items for the entity and runs the action on click", () => {
    const action = jest.fn();
    const { graph } = setup((entity) => [{ text: `Add on ${entity.kind}`, action }]);

    openOnCanvas(graph);
    fireEvent.click(screen.getByText("Add on canvas"));

    expect(action).toHaveBeenCalledTimes(1);
    expect(getUikitGraphStore(graph).$contextMenu.value).toBeNull();
    graph.unmount();
  });

  it("closes when the camera moves", () => {
    const { graph } = setup(() => [{ text: "Item", action: jest.fn() }]);

    openOnCanvas(graph);
    expect(screen.getByText("Item")).toBeTruthy();
    act(() => {
      getUikitGraphStore(graph).$cameraVersion.value += 1;
    });

    expect(screen.queryByText("Item")).toBeNull();
    graph.unmount();
  });

  it("closes on Escape", () => {
    const { graph } = setup(() => [{ text: "Item", action: jest.fn() }]);

    openOnCanvas(graph);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(getUikitGraphStore(graph).$contextMenu.value).toBeNull();
    graph.unmount();
  });

  const EMPTY_LISTS: Array<[string, TGraphMenuItem[] | null]> = [
    ["empty", []],
    ["null", null],
  ];

  it.each(EMPTY_LISTS)("renders nothing and closes the menu state when items are %s", (_name, list) => {
    const { graph } = setup(() => list);
    openOnCanvas(graph);
    expect(document.querySelector('[data-qa="graph-uikit-context-menu"]')).toBeNull();
    // Otherwise the stale state reopens the menu when `items` starts returning entries.
    expect(getUikitGraphStore(graph).$contextMenu.value).toBeNull();
    graph.unmount();
  });

  it("closes the menu state when the last consumer unmounts", () => {
    const { graph, unmount } = setup(() => [{ text: "Item", action: jest.fn() }]);
    openOnCanvas(graph);
    expect(screen.getByText("Item")).toBeTruthy();

    unmount();

    expect(getUikitGraphStore(graph).$contextMenu.value).toBeNull();
    graph.unmount();
  });
});

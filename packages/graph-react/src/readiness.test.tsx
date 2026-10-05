import React, { createRef } from "react";

import { Graph, Layer, TBlock } from "@gravity-ui/graph";
import { act, render, waitFor } from "@testing-library/react";

import { GraphBlockAnchor } from "./Anchor";
import { GraphBlock } from "./Block";
import { GraphCanvas } from "./GraphCanvas";
import { GraphContextProvider } from "./GraphContext";
import { GraphLayer } from "./GraphLayer";
import { GraphPortal } from "./GraphPortal";
import { ReactLayer } from "./layer";

test("layer refs follow attachment, detachment and component cleanup", () => {
  const graph = new Graph({});
  const ref = createRef<Layer>();
  const { unmount } = render(
    <GraphContextProvider graph={graph}>
      <GraphLayer layer={Layer} ref={ref} />
    </GraphContextProvider>
  );
  expect(ref.current).toBeNull();
  act(() => graph.attach(document.createElement("div")));
  expect(ref.current).toBeInstanceOf(Layer);
  act(() => graph.detach());
  expect(ref.current).toBeNull();
  act(() => graph.attach(document.createElement("div")));
  expect(ref.current).toBeInstanceOf(Layer);
  unmount();
  expect(ref.current).toBeNull();
  graph.unmount();
});

test("GraphCanvas clears its React layer ref on cleanup and permits an omitted renderer", () => {
  const graph = new Graph({});
  const ref = { current: null as ReactLayer | null };
  const { unmount, getByText } = render(
    <GraphCanvas graph={graph} reactLayerRef={ref}>
      <GraphPortal>
        <span>portal</span>
      </GraphPortal>
    </GraphCanvas>
  );
  expect(ref.current).toBeInstanceOf(ReactLayer);
  expect(getByText("portal")).toBeInstanceOf(HTMLSpanElement);
  unmount();
  expect(ref.current).toBeNull();
  graph.unmount();
});

test("block DOM refs and anchor hooks follow missing, ready and removed entities", async () => {
  const graph = new Graph({});
  const block = {
    id: "block",
    is: "Block",
    name: "Block",
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    anchors: [{ id: "anchor", blockId: "block", type: "IN" }],
  } satisfies TBlock;
  const ref = createRef<HTMLDivElement>();
  const { unmount, container } = render(
    <>
      <GraphBlock graph={graph} block={block} ref={ref}>
        <span>block</span>
      </GraphBlock>
      <GraphBlockAnchor graph={graph} anchor={block.anchors[0]} position="fixed" />
    </>
  );
  expect(ref.current).toBeNull();
  expect(container.querySelector(".graph-block-anchor")).toBeNull();
  act(() => {
    graph.attach(document.createElement("div"));
    graph.setEntities({ blocks: [block] });
    graph.start();
    graph.getGraphLayer().iterate();
  });
  await waitFor(() => expect(ref.current).toBeInstanceOf(HTMLDivElement));
  const anchor = container.querySelector<HTMLDivElement>(".graph-block-anchor");
  expect(anchor).toBeInstanceOf(HTMLDivElement);
  expect(anchor?.style.getPropertyValue("--graph-block-anchor-x")).not.toBe("");
  act(() => graph.setEntities({ blocks: [] }));
  expect(ref.current).toBeNull();
  expect(container.querySelector(".graph-block-anchor")).toBeNull();
  unmount();
  graph.unmount();
});

test("anchor subscribes when its canvas view mounts after the React anchor", async () => {
  const block = {
    id: "late",
    is: "Block",
    name: "Late",
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    anchors: [{ id: "anchor", blockId: "late", type: "IN" }],
  } satisfies TBlock;
  const graph = new Graph({ blocks: [block] });
  const { getByText, queryByText, unmount } = render(
    <GraphBlockAnchor graph={graph} anchor={block.anchors[0]} position="fixed">
      anchor
    </GraphBlockAnchor>
  );
  const element = getByText("anchor");
  expect(element.style.getPropertyValue("--graph-block-anchor-hover-scale")).toBe("");
  act(() => {
    graph.attach(document.createElement("div"));
    graph.start();
  });
  await waitFor(() => expect(element.style.getPropertyValue("--graph-block-anchor-hover-scale")).not.toBe(""));
  const state = graph.rootStore.blocksList.getBlockState(block.id)?.getAnchorById("anchor");
  const view = state?.getViewComponent();
  if (!view || !state) throw new Error("Expected a ready anchor view");
  act(() => {
    view.handleEvent(new MouseEvent("mouseenter"));
    graph.getGraphLayer().iterate();
  });
  await waitFor(() => expect(element.classList.contains("graph-block-anchor-raised")).toBe(true));
  act(() => state.setSelection(true));
  expect(element.classList.contains("graph-block-anchor-selected")).toBe(true);
  act(() => state.unsetViewComponent());
  expect(element.classList.contains("graph-block-anchor-raised")).toBe(false);
  expect(element.style.getPropertyValue("--graph-block-anchor-hover-scale")).toBe("");
  act(() => graph.setEntities({ blocks: [] }));
  expect(queryByText("anchor")).toBeNull();
  unmount();
  graph.unmount();
});

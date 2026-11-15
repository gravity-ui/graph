import React from "react";

import { Graph, TBlock } from "@gravity-ui/graph";
import { act, render, waitFor } from "@testing-library/react";

import { GraphBlockAnchor } from "../Anchor";

import { useBlockAnchorPosition, useBlockAnchorState } from "./useBlockAnchorState";

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

test("anchor position initializes when a nullable DOM ref mounts after anchor readiness", async () => {
  const graph = new Graph({ blocks: [block] });
  function AnchorContainer({ visible }: { visible: boolean }) {
    const ref = React.useRef<HTMLDivElement>(null);
    const anchor = useBlockAnchorState(graph, block.anchors[0]);
    useBlockAnchorPosition(anchor, ref);
    return visible ? <div ref={ref} data-testid="anchor" /> : null;
  }
  const { rerender, getByTestId, unmount } = render(<AnchorContainer visible={false} />);
  act(() => {
    graph.attach(document.createElement("div"));
    graph.start();
  });
  await waitFor(() =>
    expect(graph.rootStore.blocksList.getBlockState(block.id)?.getAnchorById("anchor")?.$viewComponentReady.value).toBe(
      true
    )
  );
  rerender(<AnchorContainer visible />);
  expect(getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-x")).not.toBe("");
  const initialY = getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-y");
  const view = graph.rootStore.blocksList.getBlockState(block.id)?.getAnchorById("anchor")?.getViewComponent();
  if (!view) throw new Error("Expected a ready anchor view");
  const port = view.getPorts()[0];
  act(() => port.setPoint(port.x, port.y + 10));
  await waitFor(() =>
    expect(getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-y")).not.toBe(initialY)
  );
  act(() => graph.api.updateBlock({ id: block.id, anchors: [] }));
  expect(getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-y")).toBe("");
  unmount();
  graph.unmount();
});

test("anchor position follows the anchor's port while the block has no canvas anchor component", async () => {
  // At the minimalistic level a block creates no anchor components (lazy anchors): the port, which the block
  // positions, places the anchor.
  const graph = new Graph({ blocks: [block] });
  graph.cameraService.set({ scale: 0.1 });
  function AnchorContainer() {
    const ref = React.useRef<HTMLDivElement>(null);
    const anchor = useBlockAnchorState(graph, block.anchors[0]);
    useBlockAnchorPosition(anchor, ref);
    return <div ref={ref} data-testid="anchor" />;
  }
  const { getByTestId, unmount } = render(<AnchorContainer />);
  act(() => {
    graph.attach(document.createElement("div"));
    graph.start();
  });
  await waitFor(() => expect(graph.rootStore.blocksList.getBlockState(block.id)?.getViewComponent()).toBeDefined());
  const state = graph.rootStore.blocksList.getBlockState(block.id)?.getAnchorById("anchor");
  expect(state?.getViewComponent()).toBeUndefined();
  // IN anchor: the block's left edge, HEAD_HEIGHT + BODY_PADDING below its top.
  await waitFor(() => expect(getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-x")).toBe("0px"));
  expect(getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-y")).toBe("88px");
  act(() => graph.api.updateBlock({ id: block.id, x: 50 }));
  expect(getByTestId("anchor").style.getPropertyValue("--graph-block-anchor-x")).toBe("0px");
  expect(state?.getViewComponent()).toBeUndefined();
  unmount();
  graph.unmount();
});

test("an export's temporary anchor components come and go without moving a React anchor", async () => {
  // toImage() at the schematic level from a minimalistic camera creates the block's anchor components for the draw
  // and drops them again (Task 17g): GraphBlockAnchor sees the component appear and go, and keeps its position.
  const graph = new Graph({ blocks: [block] });
  graph.cameraService.set({ scale: 0.1 });
  const { getByTestId, unmount } = render(
    <GraphBlockAnchor graph={graph} anchor={block.anchors[0]} position="fixed">
      <div data-testid="anchor-content" />
    </GraphBlockAnchor>
  );
  act(() => {
    graph.attach(document.createElement("div"));
    graph.start();
  });
  await waitFor(() => expect(graph.rootStore.blocksList.getBlockState(block.id)?.getViewComponent()).toBeDefined());
  const state = graph.rootStore.blocksList.getBlockState(block.id)?.getAnchorById("anchor");
  if (!state) throw new Error("Expected the anchor state");
  const container = getByTestId("anchor-content").parentElement;
  if (!container) throw new Error("Expected the anchor container");
  await waitFor(() => expect(container.style.getPropertyValue("--graph-block-anchor-y")).toBe("88px"));
  const ready: boolean[] = [];
  const stop = state.$viewComponentReady.subscribe((value) => ready.push(value));
  act(() => {
    graph.scene.toImage({ rect: { x: 0, y: 0, width: 200, height: 200 }, scale: 0.5, level: "schematic" });
  });
  stop();
  expect(ready).toEqual([false, true, false]);
  expect(state.getViewComponent()).toBeUndefined();
  expect(container.style.getPropertyValue("--graph-block-anchor-x")).toBe("0px");
  expect(container.style.getPropertyValue("--graph-block-anchor-y")).toBe("88px");
  expect(container.style.getPropertyValue("--graph-block-anchor-hover-scale")).toBe("");
  unmount();
  graph.unmount();
});

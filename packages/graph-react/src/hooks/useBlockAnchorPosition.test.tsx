import React from "react";

import { Graph, TBlock } from "@gravity-ui/graph";
import { act, render, waitFor } from "@testing-library/react";

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

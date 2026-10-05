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
  const { unmount } = render(
    <GraphCanvas graph={graph} reactLayerRef={ref}>
      <GraphPortal>
        <span>portal</span>
      </GraphPortal>
    </GraphCanvas>
  );
  expect(ref.current).toBeInstanceOf(ReactLayer);
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
  const { unmount } = render(
    <>
      <GraphBlock graph={graph} block={block} ref={ref}>
        <span>block</span>
      </GraphBlock>
      <GraphBlockAnchor graph={graph} anchor={block.anchors[0]} position="fixed" />
    </>
  );
  expect(ref.current).toBeNull();
  act(() => {
    graph.attach(document.createElement("div"));
    graph.setEntities({ blocks: [block] });
    graph.start();
    graph.getGraphLayer().iterate();
  });
  await waitFor(() => expect(ref.current).toBeInstanceOf(HTMLDivElement));
  act(() => graph.setEntities({ blocks: [] }));
  expect(ref.current).toBeNull();
  unmount();
  graph.unmount();
});

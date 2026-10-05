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

test("layer refs follow stop and direct layer detachment without a graph state change", () => {
  const graph = new Graph({});
  const ref = createRef<Layer>();
  const { unmount } = render(
    <GraphContextProvider graph={graph}>
      <GraphLayer layer={Layer} ref={ref} />
    </GraphContextProvider>
  );
  const root = document.createElement("div");
  act(() => graph.attach(root));
  const layer = ref.current;
  if (!layer) throw new Error("Expected attached layer");
  act(() => graph.stop());
  expect(ref.current).toBeNull();
  act(() => graph.attach(root));
  expect(ref.current).toBe(layer);
  act(() => graph.start());
  act(() => graph.stop());
  expect(ref.current).toBeNull();
  act(() => graph.start());
  expect(ref.current).toBe(layer);
  act(() => graph.detachLayer(layer));
  expect(ref.current).toBeNull();
  unmount();
  graph.unmount();
});

test("layer readiness preserves custom lifecycle arguments, returns and methods after cleanup", () => {
  const calls: (string | undefined)[] = [];
  class CustomLayer extends Layer {
    public close = this.detachLayer.bind(this);

    public attachLayer(root: HTMLElement, mode?: string): this {
      calls.push(mode);
      super.attachLayer(root);
      return this;
    }
    public detachLayer(reason?: string): string {
      calls.push(reason);
      super.detachLayer();
      return reason ?? "detached";
    }
  }
  const graph = new Graph({});
  const root = document.createElement("div");
  graph.attach(root);
  graph.start();
  const ref = createRef<CustomLayer>();
  const { unmount } = render(
    <GraphContextProvider graph={graph}>
      <GraphLayer layer={CustomLayer} ref={ref} />
    </GraphContextProvider>
  );
  const layer = ref.current;
  if (!layer) throw new Error("Expected attached custom layer");
  act(() => expect(layer.detachLayer("manual detach")).toBe("manual detach"));
  expect(ref.current).toBeNull();
  act(() => expect(layer.attachLayer(root, "manual attach")).toBe(layer));
  expect(ref.current).toBe(layer);
  expect(calls).toContain("manual detach");
  expect(calls).toContain("manual attach");
  act(() => expect(layer.close("bound detach")).toBe("bound detach"));
  expect(ref.current).toBeNull();
  act(() => layer.attachLayer(root));
  expect(ref.current).toBe(layer);
  unmount();
  expect(layer.attachLayer).toBe(CustomLayer.prototype.attachLayer);
  expect(layer.detachLayer).toBe(CustomLayer.prototype.detachLayer);
  expect(layer.setContext).toBe(CustomLayer.prototype.setContext);
  graph.unmount();
});

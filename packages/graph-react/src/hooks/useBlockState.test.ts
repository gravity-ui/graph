import { Graph } from "@gravity-ui/graph";
import type { TBlock } from "@gravity-ui/graph";
import { act, renderHook } from "@testing-library/react";

import { useBlockAnchorState } from "./useBlockAnchorState";
import { useBlockState, useBlockViewState, useSyncBlockState } from "./useBlockState";

const block: TBlock = {
  id: "block",
  is: "Block",
  name: "Block",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  anchors: [{ id: "anchor", blockId: "block", type: "IN" }],
};

test("block and anchor hooks follow missing, added, removed and recreated IDs", () => {
  const graph = new Graph({});
  const anchor = block.anchors[0];
  const { result, unmount } = renderHook(() => ({
    state: useBlockState(graph, "block"),
    sync: useSyncBlockState(graph, "block"),
    view: useBlockViewState(graph, "block"),
    anchor: useBlockAnchorState(graph, anchor),
  }));
  expect(result.current.state).toBeUndefined();
  expect(result.current.sync).toBeUndefined();
  expect(result.current.anchor).toBeUndefined();
  act(() => graph.setEntities({ blocks: [block] }));
  expect(result.current.state?.id).toBe("block");
  expect(result.current.sync).toBe(result.current.state);
  expect(result.current.anchor?.asTAnchor()).toEqual(block.anchors[0]);
  expect(result.current.state?.$anchors.value[0]).toEqual(block.anchors[0]);
  act(() => graph.api.updateBlock({ id: "block", anchors: [] }));
  expect(result.current.anchor).toBeUndefined();
  expect(result.current.state?.$anchors.value).toEqual([]);
  act(() => graph.setEntities({ blocks: [] }));
  expect(result.current.state).toBeUndefined();
  expect(result.current.sync).toBeUndefined();
  expect(result.current.view).toBeUndefined();
  act(() => graph.setEntities({ blocks: [block] }));
  expect(result.current.anchor?.asTAnchor()).toEqual(block.anchors[0]);
  expect(result.current.state?.$anchors.value[0]).toEqual(block.anchors[0]);
  unmount();
  graph.unmount();
});

import { Graph } from "@gravity-ui/graph";
import type { TConnection } from "@gravity-ui/graph";

import { UikitBlock } from "../canvas/UikitBlock";
import { UikitConnection } from "../canvas/UikitConnection";
import type { TUikitBlock } from "../canvas/types";

export const FIXTURE_BLOCKS: TUikitBlock[] = [
  {
    id: "a",
    is: "Block",
    name: "Block A",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    anchors: [],
    meta: { description: "First", theme: "info" },
  },
  { id: "b", is: "Block", name: "Block B", x: 400, y: 0, width: 200, height: 100, anchors: [] },
];

export const FIXTURE_CONNECTIONS: TConnection[] = [{ id: "a:b", sourceBlockId: "a", targetBlockId: "b" }];

export type TUikitGraphFixture = { graph: Graph; root: HTMLDivElement };

export function flushFrames(graph: Graph, count = 5): void {
  for (let index = 0; index < count; index++) {
    graph.scheduler.performUpdate();
  }
}

export function createUikitGraph(): TUikitGraphFixture {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const graph = new Graph(
    {
      blocks: FIXTURE_BLOCKS,
      connections: FIXTURE_CONNECTIONS,
      settings: { blockComponents: { Block: UikitBlock }, connection: UikitConnection },
    },
    root
  );
  graph.start();
  flushFrames(graph);
  return { graph, root };
}

export function getBlockView(graph: Graph, id: string): UikitBlock {
  const view = graph.blocks.getBlockState(id)?.getViewComponent();
  if (!(view instanceof UikitBlock)) {
    throw new Error(`Block ${id} is not rendered as UikitBlock`);
  }
  return view;
}

export function getConnectionView(graph: Graph, id: string): UikitConnection {
  const view = graph.connections.getConnectionState(id)?.getViewComponent();
  if (!(view instanceof UikitConnection)) {
    throw new Error(`Connection ${id} is not rendered as UikitConnection`);
  }
  return view;
}

export function disposeUikitGraph({ graph, root }: TUikitGraphFixture): void {
  graph.unmount();
  root.remove();
}

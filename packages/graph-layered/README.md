# @gravity-ui/graph-layered

Layered (hierarchical) layout for `@gravity-ui/graph`. Given blocks with sizes and the connections between them,
it places blocks in left-to-right columns by level, reduces edge crossings, and returns block positions and
connection points. It only computes coordinates: you apply them to the graph yourself.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```sh
npm install @gravity-ui/graph @gravity-ui/graph-layered
```

## Usage

```ts
import { Graph, MultipointConnection, type TBlock } from "@gravity-ui/graph";
import { computeLevels, layeredConverter, layoutGraph } from "@gravity-ui/graph-layered";

const blocks = [
  { id: "a", width: 200, height: 100 },
  { id: "b", width: 200, height: 100 },
];
const connections = [{ id: "a-b", sourceBlockId: "a", targetBlockId: "b" }];

const levels = computeLevels(blocks.map((b) => b.id), connections);
const layout = await layoutGraph({
  nodes: blocks.map((b) => ({ ...b, id: String(b.id), level: levels.get(b.id) ?? 0 })),
  edges: connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
});
const result = layeredConverter({
  layoutResult: layout,
  connections,
  blockSizes: new Map(blocks.map((b) => [String(b.id), b])),
});

const root = document.getElementById("graph") as HTMLDivElement;
const graph = new Graph({ settings: { connection: MultipointConnection } }, root);
graph.setEntities({
  blocks: blocks.map(
    (b): TBlock => ({ ...b, ...result.blocks[b.id], is: "Block", name: b.id, selected: false, anchors: [] })
  ),
  connections: connections.map((c) => ({ ...c, ...result.edges[c.id] })),
});
```

When `connections` may contain port-only connections, pass only those with both block ids to `layoutGraph` edges;
`computeLevels` and `layeredConverter` skip the others themselves.

Edge `points` are drawn only by a multipoint connection class such as `MultipointConnection` or
`BezierMultipointConnection`.

## React

`useLayeredLayout` runs all three steps and returns `{ result, isLoading }`. Install `react` to use it.
The layout reruns only when block sizes, levels, connection endpoints or option values change.

```ts
import { useEffect } from "react";
import type { Graph, TBlock, TConnection } from "@gravity-ui/graph";
import { useLayeredLayout } from "@gravity-ui/graph-layered/react";

const LAYOUT_OPTIONS = { nodeVerticalGap: 120 };

function useLayeredGraph(graph: Graph, blocks: TBlock[], connections: TConnection[]): void {
  const { result, isLoading } = useLayeredLayout({ blocks, connections, layoutOptions: LAYOUT_OPTIONS });

  useEffect(() => {
    if (isLoading || !result) return;
    graph.setEntities({
      blocks: blocks.map((b) => ({ ...b, ...result.blocks[b.id] })),
      connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
    });
  }, [graph, blocks, connections, isLoading, result]);
}
```

## Limitations

- Only block endpoints are laid out. A connection without both `sourceBlockId` and `targetBlockId` (for example a
  port-only `sourcePortId`/`targetPortId` connection) is skipped: it gets no entry in `result.edges` and keeps its
  current state.
- Anchors are ignored: points start at the right middle of the source block and end at the left middle of the target
  block, even when `sourceAnchorId`/`targetAnchorId` are set.
- Give connections ids. One without an id is reported under `"sourceBlockId/targetBlockId"`.

`@gravity-ui/graph` is a required peer dependency (for types only). `react` is an optional peer, needed only for
`@gravity-ui/graph-layered/react`. Before v2, these APIs were exported by `@gravity-ui/graph` and
`@gravity-ui/graph-react`; see the [migration guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/migration-guides/v1-to-v2.md).

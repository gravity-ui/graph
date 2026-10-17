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
import { Graph, MultipointConnection } from "@gravity-ui/graph";
import { computeLevels, layeredConverter, layoutGraph } from "@gravity-ui/graph-layered";

const blocks = [
  { id: "a", width: 200, height: 100 },
  { id: "b", width: 200, height: 100 },
];
const connections = [{ id: "a/b", sourceBlockId: "a", targetBlockId: "b" }];

const levels = computeLevels(blocks.map((b) => b.id), connections);
const layout = await layoutGraph({
  nodes: blocks.map((b) => ({ ...b, id: String(b.id), level: levels.get(b.id) ?? 0 })),
  edges: connections.map((c) => ({ from: String(c.sourceBlockId), to: String(c.targetBlockId) })),
});
const result = layeredConverter({
  layoutResult: layout,
  connectionIdBySourceTarget: new Map([["a/b", ["a/b"]]]),
  blockSizes: new Map(blocks.map((b) => [b.id, b])),
});

const graph = new Graph({ settings: { connection: MultipointConnection } }, root);
graph.setEntities({
  blocks: blocks.map((b) => ({ ...b, ...result.blocks[b.id], is: "Block", name: b.id, anchors: [] })),
  connections: connections.map((c) => ({ ...c, ...result.edges[c.id] })),
});
```

Edge `points` are drawn only by a multipoint connection class such as `MultipointConnection` or
`BezierMultipointConnection`.

## React

`useLayeredLayout` runs all three steps and returns `{ result, isLoading }`. Install `react` to use it.

```tsx
import { useLayeredLayout } from "@gravity-ui/graph-layered/react";

const { result, isLoading } = useLayeredLayout({ blocks, connections, layoutOptions: { nodeVerticalGap: 120 } });

useEffect(() => {
  if (!isLoading && result) {
    graph.setEntities({
      blocks: blocks.map((b) => ({ ...b, ...result.blocks[b.id] })),
      connections: connections.map((c) => ({ ...c, ...result.edges[c.id] })),
    });
  }
}, [isLoading, result]);
```

`@gravity-ui/graph` is a required peer dependency (for types only). `react` is an optional peer, needed only for
`@gravity-ui/graph-layered/react`. Before v2, these APIs were exported by `@gravity-ui/graph` and
`@gravity-ui/graph-react`; see the [migration guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/migration-guides/v1-to-v2.md).

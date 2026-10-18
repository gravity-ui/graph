# @gravity-ui/graph-elk

Automatic layout for `@gravity-ui/graph` with [ELK](https://github.com/kieler/elkjs). You describe the graph as an ELK
`ElkNode` and run the layout with your own `ELK` instance. The package turns the result into block positions and
connection points that you merge into your blocks and connections.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```sh
npm install @gravity-ui/graph @gravity-ui/graph-elk elkjs
```

`@gravity-ui/graph` and `elkjs` are required peers. `react` is an optional peer, used only by the `/react` entry.

## React

```tsx
import { useEffect } from "react";
import ELK from "elkjs";
import { MultipointConnection } from "@gravity-ui/graph";
import { GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import { useElk } from "@gravity-ui/graph-elk/react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

// blocks, connections and renderBlock come from your application.
const elk = new ELK();
const elkGraph = {
  id: "root",
  layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
  children: blocks.map(({ id, width, height }) => ({ id: String(id), width, height })),
  // ELK edges connect blocks: skip connections without an id or without both block ids.
  edges: connections.flatMap(({ id, sourceBlockId, targetBlockId }) =>
    id === undefined || sourceBlockId === undefined || targetBlockId === undefined
      ? []
      : [{ id: String(id), sources: [String(sourceBlockId)], targets: [String(targetBlockId)] }]
  ),
};

function App() {
  const { graph, setEntities, start } = useGraph({ settings: { connection: MultipointConnection } });
  const { result, isLoading } = useElk(elkGraph, elk, { onError: console.error });

  useEffect(() => {
    if (isLoading || !result) return;
    setEntities({
      blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
      // Connections that were not laid out keep their own state.
      connections: connections.map((c) => (c.id === undefined ? c : { ...c, ...result.edges[c.id] })),
    });
    start();
  }, [isLoading, result, setEntities, start]);

  return <GraphCanvas graph={graph} renderBlock={renderBlock} />;
}
```

`useElk` runs a new layout when the `ELK` instance, the `ElkNode` or `layoutOptions` change, so keep them stable (for
example with `useMemo`). `onError` may be an inline function: changing it does not restart the layout. If you create a
worker-based `ELK` instance per component, call `elk.terminateWorker()` when it unmounts.

## Connections

ELK lays out blocks, so each edge needs a connection `id` and both `sourceBlockId` and `targetBlockId`:

- Connections addressed only by ports (`sourcePortId` / `targetPortId`) cannot be passed to ELK. Skip them, as above;
  they stay as they are and are drawn between their ports.
- Anchors (`sourceAnchorId` / `targetAnchorId`) are not modelled as ELK ports. Such connections are laid out between
  their blocks, and their routes start and end on the block border rather than at the anchor.

## Without React

```ts
import ELK from "elkjs";
import { elkConverter } from "@gravity-ui/graph-elk";

const { blocks: positions, edges: routes } = elkConverter(await new ELK().layout(elkGraph));
```

`elkConverter` returns `{ blocks, edges }`. `blocks[id]` is the `{ x, y }` position of a laid-out block.
`edges[id]` holds the `points` and `labels` of the first routed section, ready for `MultipointConnection`.
Children without coordinates and edges without sections are skipped.

See the [ELK layout options](https://eclipse.dev/elk/reference.html) for algorithms and spacing settings.

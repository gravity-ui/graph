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
  edges: connections.map((c) => ({
    id: String(c.id),
    sources: [String(c.sourceBlockId)],
    targets: [String(c.targetBlockId)],
  })),
};

function App() {
  const { graph, setEntities, start } = useGraph({ settings: { connection: MultipointConnection } });
  const { result, isLoading } = useElk(elkGraph, elk);

  useEffect(() => {
    if (isLoading || !result) return;
    setEntities({
      blocks: blocks.map((block) => ({ ...block, ...result.blocks[block.id] })),
      connections: connections.map((c) => ({ ...c, ...(c.id === undefined ? {} : result.edges[c.id]) })),
    });
    start();
  }, [isLoading, result]);

  return <GraphCanvas graph={graph} renderBlock={renderBlock} />;
}
```

Keep the `ElkNode` and options objects stable (for example with `useMemo`): `useElk` runs a new layout when they change.
Pass `{ onError }` as the third argument to handle failed layouts.

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

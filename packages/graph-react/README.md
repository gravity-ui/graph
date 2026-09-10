# @gravity-ui/graph-react

React components and hooks for [Gravity UI Graph](https://github.com/gravity-ui/graph).
This package is part of the v2 monorepo and has not been published yet.

## Installation

Use matching builds of `@gravity-ui/graph` and `@gravity-ui/graph-react`, with React 18 and React DOM 18.
The React package declares the core library and React as peer dependencies so the application owns their instances.

## Usage

Import graph data types, canvas layers and plugins from `@gravity-ui/graph`; import React components and hooks from
`@gravity-ui/graph-react`. Load both stylesheets once in the application entrypoint.

```tsx
import React, { useLayoutEffect } from "react";
import type { TBlock } from "@gravity-ui/graph";
import { GraphBlock, GraphCanvas, useGraph } from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

const blocks: TBlock[] = [
  { id: "example", is: "Block", name: "Example", x: 0, y: 0, width: 200, height: 100, anchors: [] },
];

export function Editor() {
  const { graph, setEntities, start } = useGraph({ settings: {} });
  useLayoutEffect(() => {
    setEntities({ blocks, connections: [] });
    start();
  }, [setEntities, start]);

  return (
    <GraphCanvas
      graph={graph}
      renderBlock={(graphObject, block) => (
        <GraphBlock graph={graphObject} block={block}>{block.name}</GraphBlock>
      )}
    />
  );
}
```

Give the editor container a nonzero width and height.

The public entrypoint includes `GraphCanvas`, `GraphBlock`, `GraphBlockAnchor`, `GraphLayer`, `GraphPortal`, context
helpers, graph/signal/scheduler hooks, `useElk`, and `useLayeredLayout`. The old `@gravity-ui/graph/react` subpath is removed
in v2; replace its imports with `@gravity-ui/graph-react` and add the React stylesheet. Core and Playwright consumers
continue to use `@gravity-ui/graph` and `@gravity-ui/graph/playwright` without installing React.

See the [React guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/react/usage.md) and
[hooks reference](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/react/hooks.md).

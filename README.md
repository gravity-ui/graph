# @gravity-ui/graph &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/graph)](https://www.npmjs.com/package/@gravity-ui/graph) [![Release](https://img.shields.io/github/actions/workflow/status/gravity-ui/graph/release.yml?branch=main&label=Release)](https://github.com/gravity-ui/graph/actions/workflows/release.yml?query=branch:main) [![storybook](https://img.shields.io/badge/Storybook-deployed-ff4685)](https://preview.gravity-ui.com/graph/)

High performance graph renderer with scale-aware detalization

[Storybook](https://preview.gravity-ui.com/graph/)

## Install and setup

```bash
npm install @gravity-ui/graph
```

```jsx
import { GraphCanvas, GraphState, TRenderBlockFn, useGraph } from "@gravity-ui/graph";
import React from "react";

const config = {};

export function GraphEditor() {

  const { graph, setEntities, start } = useGraph(config);

  useEffect(() => {
    setEntities({
      blocks: [
        {
          is: "block-action",
          id: "action_1",
          x: -100,
          y: -450,
          width: 126,
          height: 126,
          selected: true,
          name: "Block #1",
          anchors: [],
        },
        {
          id: "action_2",
          is: "block-action",
          x: 253,
          y: 176,
          width: 126,
          height: 126,
          selected: false,
          name: "Block #2",
          anchors: [],
        }
      ],
      connections: [
        {
          sourceBlockId: "action_1",
          targetBlockId: "action_2",
        }
      ]
    })
  })

  const renderBlock = (graph, block) => {
    return <HTMLBlockView graph={graph} block={block} />;
  };

  return (
    <GraphCanvas
      graph={graph}
      renderBlock={renderBlockFn}
      onStateChanged={({ state }) => {
        if (state === GraphState.ATTACHED) {
          start();
          graph.zoomTo("center", { padding: 300 });
        }
      }}
    />
  );
}
```

### Docs

- [Pulic API](docs/public_api.md)
- [Graph Events](docs/events.md)
- [Editing](docs/editing.md)


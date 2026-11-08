# @gravity-ui/graph-duplicate-block

Alt+drag block duplication for `@gravity-ui/graph`. Hold Alt and drag a block to drop a copy of it; dragging a selected block copies the whole selection with the connections between the copied blocks.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```ts
import { Graph } from "@gravity-ui/graph";
import { DuplicateBlockLayer } from "@gravity-ui/graph-duplicate-block";

const graph = new Graph({}, document.getElementById("graph")!);
graph.addLayer(DuplicateBlockLayer, {
  isDuplicateAllowed: (block) => block.connectedState.$state.value.is !== "restricted-block",
});
graph.on("blocks-duplicate", (event) => {
  console.log("Copied", event.detail.items.length, "blocks by", event.detail.delta);
});
graph.start();
```

In React, attach the layer with `useLayer` from `@gravity-ui/graph-react`:

```tsx
const { graph } = useGraph({});
const duplicateLayer = useLayer(graph, DuplicateBlockLayer, { ghostBackground: "rgba(0, 0, 255, 0.3)" });
// duplicateLayer?.disable();

return <GraphCanvas graph={graph} renderBlock={renderBlock} />;
```

`@gravity-ui/graph` is a required peer dependency. The package has no stylesheet and does not require React.

Props, methods, the `blocks-duplicate-start` / `blocks-duplicate` events and the rules for copying connections are described in the [full documentation](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/plugins/duplicate-block.md).

For v2, replace `NewBlockLayer` from `@gravity-ui/graph` with `DuplicateBlockLayer` from this package.

# @gravity-ui/graph-css-variables

Drive `@gravity-ui/graph` colors and constants from CSS variables. `CSSVariablesLayer` reads `--graph-*`
variables from a hidden element with your theme class and applies them through `graph.setColors()` and
`graph.setConstants()`. Later changes to these variables, such as theme switches, reach the canvas automatically.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```sh
pnpm add @gravity-ui/graph @gravity-ui/graph-css-variables
```

```css
.graph-theme {
  --graph-canvas-background: #ffffff;
  --graph-block-background: #f5f5f5;
  --graph-block-border: #e0e0e0;
}
```

```ts
import { Graph } from "@gravity-ui/graph";
import { CSSVariablesLayer } from "@gravity-ui/graph-css-variables";
import "@gravity-ui/graph/styles.css";

const root = document.getElementById("graph");
if (!root) throw new Error("Graph container is missing.");

const graph = new Graph({ blocks: [] }, root);
graph.addLayer(CSSVariablesLayer, { containerClass: "graph-theme" });
graph.start();
```

The variables can also be inherited from an ancestor of the graph root, for example a theme wrapper.
With `@gravity-ui/graph-react`, pass the layer to `useLayer(graph, CSSVariablesLayer, { containerClass })`.

`@gravity-ui/graph` is a required peer dependency; React is not required. The package ships no stylesheet.
Sync is one-way: the layer never writes CSS variables. Use `mapGraphColorsToCSSVariables` and
`mapGraphConstantsToCSSVariables` to export the current graph state as CSS variables yourself.

The supported variables and all options are listed in the repository's
[CSS variables guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/plugins/cssVariables.md).

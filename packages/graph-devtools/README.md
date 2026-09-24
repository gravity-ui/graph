# @gravity-ui/graph-devtools

Optional rulers and cursor crosshair for measuring and debugging `@gravity-ui/graph` canvases.
Ruler ticks and cursor coordinates follow the graph camera's position and zoom.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

Give the graph container a nonzero width and height and `position: relative` so the layer is positioned inside it.

```ts
import { Graph } from "@gravity-ui/graph";
import { DevToolsLayer } from "@gravity-ui/graph-devtools";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-devtools/styles.css";

const root = document.getElementById("graph");
if (!root) throw new Error("Graph container is missing.");

const graph = new Graph({ blocks: [] }, root);
const devtools = graph.addLayer(DevToolsLayer, {
  showRuler: true,
  showCrosshair: true,
  rulerSize: 25,
});
graph.start();

// Update appearance or detach the layer when it is no longer needed.
devtools.setProps({ rulerBackgroundColor: "rgba(46, 46, 46, 0.4)" });
// graph.detachLayer(devtools);
```

`@gravity-ui/graph` is a required peer dependency. This package uses its public `Layer` API and shares
the consumer's core runtime. React is not required. With `@gravity-ui/graph-react`, pass `DevToolsLayer`
to `useLayer` or `GraphLayer` and also import `@gravity-ui/graph-react/styles.css`.

Import both the core and DevTools stylesheets: core owns layer positioning, while DevTools owns ruler
backgrounds and their size, visibility, and blur. The JavaScript entrypoint does not load CSS automatically.

## API

- `DevToolsLayer`: pass it to `graph.addLayer()` or a graph layer configuration.
- `TDevToolsLayerProps`: ruler and crosshair visibility, sizes, colors, fonts, tick spacing, and blur.
- `DEFAULT_DEVTOOLS_LAYER_PROPS`: the default values for those options.

For v2, import these symbols from `@gravity-ui/graph-devtools` instead of `@gravity-ui/graph`.
Core no longer includes or re-exports DevTools or its styles. The detailed options are documented in
the repository's [DevTools guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/plugins/devtools.md).

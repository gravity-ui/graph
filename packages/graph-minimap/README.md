# @gravity-ui/graph-minimap

Optional Canvas minimap for `@gravity-ui/graph`. Click or drag inside the minimap to navigate the graph; its viewport follows camera and block geometry changes.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```ts
import { Graph } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import "@gravity-ui/graph/styles.css";

const graph = new Graph({ blocks: [] }, document.getElementById("graph")!);
graph.addLayer(MiniMapLayer, {
  location: "bottomRight",
  width: 200,
  height: 200,
  cameraBorderSize: 2,
  cameraBorderColor: "rgba(255, 119, 0, 0.9)",
});
graph.start();
```

`@gravity-ui/graph` is a required peer dependency. This package uses its public `Layer` API and shares the consumer's core runtime. React is not required.

The layer installs its own position and appearance rules when attached. Only the core stylesheet is needed; this package has no separate stylesheet export.

## API

- `MiniMapLayer`: pass it to `graph.addLayer()` or a graph layer configuration.
- `MiniMapLayerProps`: layer options, including dimensions, CSS classes, camera border, and location.
- `TMiniMapLocation`: `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, or CSS values for `top`, `right`, `bottom`, and `left`.
- `MiniMapLayerContext`: context type for extensions of the minimap layer.

For v2, import the layer and its types from `@gravity-ui/graph-minimap` instead of `@gravity-ui/graph`. The core no longer re-exports the minimap.

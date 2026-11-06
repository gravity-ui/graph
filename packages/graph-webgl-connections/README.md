# @gravity-ui/graph-webgl-connections

Experimental WebGL2 renderer for `@gravity-ui/graph` connections. One layer draws every connection with instancing instead of keeping a canvas component per connection. Not released yet: the API may change.

```ts
import { Graph } from "@gravity-ui/graph";
import { WebGLConnectionsLayer } from "@gravity-ui/graph-webgl-connections";

const graph = new Graph(config, document.getElementById("graph")!);
graph.addLayer(WebGLConnectionsLayer, {
  lod: { stubsBelowScale: 0.2, hideBelowScale: 0.04 },
});
graph.start();
```

In React, attach it with `useLayer(graph, WebGLConnectionsLayer, props)` from `@gravity-ui/graph-react`.

## How it works

- While attached, the layer sets `useCanvasConnections: false`, so the core creates no connection components, hitboxes or Path2D batches. The previous value is restored when the layer is detached or removed. Without WebGL2 the layer does nothing and canvas connections stay on.
- Geometry, visibility and selection come from the store (`ConnectionState.$geometry`, `$hidden`, `$selected`), so ports, anchors and collapsed groups work as with canvas connections. Only changed connections are re-uploaded to the GPU.
- Every connection is one cubic segment instance (multipoint connections: one straight segment per pair of points). The vertex shader tessellates the curve; antialiasing and dashes are done in the fragment shader. Pan and zoom only change uniforms.
- The canvas sits on the background/groups z-index (1), above layers attached before it, and below the blocks canvas (2).
- Hit testing uses one `WebGLConnectionsHitTarget` registered in the graph hit test, with an R-tree of segment bounds and an exact distance check. Blocks stay above connections, connections stay above groups; hover and click selection work like canvas connections.

## Props

| Prop | Default | Description |
|------|---------|-------------|
| `style(connection, { selected, hovered }, graph)` | `defaultWebGLConnectionStyle` | Pure function returning `{ color, width, dash?, arrow? }`. Results are interned into a table of up to 64 distinct styles. |
| `curve` | follows `useBezierConnections` | `"bezier"` or `"straight"`. |
| `widthUnits` | `"world"` | `"world"` scales widths with the camera like canvas connections; `"screen"` keeps them in CSS pixels. Widths below one device pixel are drawn as faded hairlines. |
| `lod.hideArrowsBelowScale` | `MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL` | Arrows are not drawn below this scale. |
| `lod.stubsBelowScale` | off | Below this scale connections are drawn as two stubs at their ends. |
| `lod.stubLengthPx` | `14` | Stub length in CSS pixels. |
| `lod.hideBelowScale` | off | Below this scale only focused connections are drawn. |
| `hitThresholdPx` | `6` | Extra hit distance around a connection. |

Selected and hovered connections, and connections of selected blocks, are always drawn whole and with arrows; selected and hovered ones are drawn on top.

## Not supported yet

- Connection labels.
- Custom connection classes (`settings.connection`); they keep the canvas renderer.
- Rounded corners of multipoint connections and their end arrows.
- Group backgrounds of a groups layer attached after this layer are drawn above connections (the core layers need z-index gaps to fix this).

# @gravity-ui/graph-minimap

Optional Canvas minimap for `@gravity-ui/graph`. Click or drag inside the minimap to navigate the graph; its viewport follows camera and block geometry changes.

This package is being developed on the unpublished v2 branch. Use it with the matching v2 core build.

```ts
import { Graph } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-minimap/styles.css";

const graph = new Graph({ blocks: [] }, document.querySelector<HTMLDivElement>("#graph")!);
graph.addLayer(MiniMapLayer, {
  location: "bottomRight",
  width: 200,
  height: 200,
  cameraBorderSize: 2,
  cameraBorderColor: "rgba(255, 119, 0, 0.9)",
});
graph.start();
```

## What it draws

The minimap draws the scene's block elements at the minimalistic level, without text, through the Canvas 2D
interpreter (`drawInterpreted()`) using the scene's live rows, whatever the main view's renderer and level, in the order
of the blocks list. Blocks handed to HTML and blocks in collapsed groups stay on it; anchors and other scene elements
do not. Tags and style rules show on it. A `LegacyCanvasBlock` draws itself with
`renderMinimalisticBlock(ctx, { text: false })`, in its place in the list.

It caches its picture and redraws it only when what it shows changes:

- Changes of what it shows are throttled: pointer drags, block moves such as `api.updateBlock()`, tag and style
  changes, changes of the blocks list and of the usable rect. After a quiet period the minimap draws a pointer drag in
  the same frame as the main view, and the other changes one frame after it. During continuous changes it draws them
  together at most about once per 100 ms, and always draws the last state, at most about 100 ms after the change. The
  click and drag navigation and the camera frame use the mapping of the picture shown, so they match what it shows
  while a picture waits.
- Block subclasses that declare their own `entityType` are drawn and followed like `Block`: the blocks list decides
  what is drawn.
- Colour changes and changes of the minimap's size redraw it in the next frame.
- A camera move only redraws the camera frame, unless a `LegacyCanvasBlock` is on the minimap: then every camera move
  redraws the picture.

`@gravity-ui/graph` is a required peer dependency. This package uses its public `Layer` API and shares the consumer's core runtime. React is not required.

The layer sets its per-instance position and dimensions inline on the canvas when attached. Configure them through the layer props; overriding them with CSS requires `!important`. Import core styles before `@gravity-ui/graph-minimap/styles.css` for the default border and background. The default selector `canvas.layer:where(.graph-minimap)` has specificity `(0,1,1)`. Custom rules with two classes, such as `.graph-minimap.my-minimap`, override these visual defaults regardless of their load order. A single-class selector such as `.my-minimap` or `.graph-minimap` has lower specificity and does not override them.

## API

- `MiniMapLayer`: pass it to `graph.addLayer()` or a graph layer configuration.
- `MiniMapLayerProps`: layer options, including dimensions, CSS classes, camera border, and location.
- `TMiniMapLocation`: `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, or CSS values for `top`, `right`, `bottom`, and `left`.
- `MiniMapLayerContext`: context type for extensions of the minimap layer.

For v2, import the layer and its types from `@gravity-ui/graph-minimap` instead of `@gravity-ui/graph`. The core no longer re-exports the minimap.

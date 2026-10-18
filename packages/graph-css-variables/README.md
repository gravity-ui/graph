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

const root = document.querySelector<HTMLDivElement>("#graph");
if (!root) throw new Error("Graph container is missing.");

const graph = new Graph({ blocks: [] }, root);
graph.addLayer(CSSVariablesLayer, { containerClass: "graph-theme" });
graph.start();
```

The layer can also be part of the graph configuration:

```ts
import { Graph, layerConfig } from "@gravity-ui/graph";
import { CSSVariablesLayer } from "@gravity-ui/graph-css-variables";

const graph = new Graph({ layers: [layerConfig(CSSVariablesLayer, { containerClass: "graph-theme" })] }, root);
graph.start();
```

With React, install `@gravity-ui/graph-react` as well and add the layer with `useLayer`:

```tsx
import { useLayoutEffect } from "react";
import { GraphCanvas, useGraph, useLayer } from "@gravity-ui/graph-react";
import { CSSVariablesLayer } from "@gravity-ui/graph-css-variables";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";

export function ThemedGraph() {
  const { graph, start } = useGraph({});
  useLayer(graph, CSSVariablesLayer, { containerClass: "graph-theme" });
  useLayoutEffect(() => start(), [start]);
  return <GraphCanvas graph={graph} />;
}
```

The variables can also be inherited from an ancestor of the graph root, for example a theme wrapper.

`@gravity-ui/graph` is a required peer dependency; React is not required. The package ships no stylesheet.
Sync is one-way: the layer never writes CSS variables. Use `mapGraphColorsToCSSVariables` and
`mapGraphConstantsToCSSVariables` to export the current graph state as CSS variables yourself.

## Variable map

Each variable writes one field of `graph.graphColors` (through `setColors`) or `graph.graphConstants` (through
`setConstants`). Variables you do not define keep the graph's current value. Removing a variable keeps the value it
applied last.

How values are read:

- **color**: the computed value, trimmed, is passed to the canvas as is: any CSS color (`#fff`, `rgb()`,
  `rgba()`, a named color). A `var()` reference is resolved by the browser first.
- **number**: `parseFloat`. Units are dropped, not converted: `240px` and `240` both give `240`, `15em` gives
  `15`. A value that is not a number gives `0`, and `0` is applied.
- **integer**: `parseInt`: `16.7` gives `16`; a value that is not a number gives `0`, and `0` is applied.

### Colors

| CSS variable                                   | Graph setting (`graphColors`)        | Default                | What it paints                    |
| ---------------------------------------------- | ------------------------------------ | ---------------------- | --------------------------------- |
| `--graph-canvas-background`                    | `canvas.layerBackground`             | `#f9f9f9`              | Background of the usable area     |
| `--graph-canvas-below-background`              | `canvas.belowLayerBackground`        | `#eaeaea`              | Background around the usable area |
| `--graph-canvas-dots`                          | `canvas.dots`                        | `#d0d2ce`              | Background grid dots              |
| `--graph-canvas-border`                        | `canvas.border`                      | `#EAEAEAFF`            | Border of the usable area         |
| `--graph-block-background`                     | `block.background`                   | `#e0e0e0`              | Block fill                        |
| `--graph-block-border`                         | `block.border`                       | `#dfdfdf`              | Block border                      |
| `--graph-block-text`                           | `block.text`                         | `#272727`              | Block name                        |
| `--graph-block-selected-border`                | `block.selectedBorder`               | `#FFCC00`              | Border of a selected block        |
| `--graph-anchor-background`                    | `anchor.background`                  | `#4a4a4a`              | Anchor fill                       |
| `--graph-anchor-selected-border`               | `anchor.selectedBorder`              | `#FFCC00`              | Border of a selected anchor       |
| `--graph-connection-background`                | `connection.background`              | `#272727`              | Connection line                   |
| `--graph-connection-selected-background`       | `connection.selectedBackground`      | `#ecc113`              | Selected connection line          |
| `--graph-connection-label-background`          | `connectionLabel.background`         | `#EAEAEA`              | Connection label background       |
| `--graph-connection-label-hover-background`    | `connectionLabel.hoverBackground`    | `#FFCC00`              | Hovered label background          |
| `--graph-connection-label-selected-background` | `connectionLabel.selectedBackground` | `#FFCC00`              | Selected label background         |
| `--graph-connection-label-text`                | `connectionLabel.text`               | `#777677`              | Label text                        |
| `--graph-connection-label-hover-text`          | `connectionLabel.hoverText`          | `#777677`              | Hovered label text                |
| `--graph-connection-label-selected-text`       | `connectionLabel.selectedText`       | `#777677`              | Selected label text               |
| `--graph-selection-background`                 | `selection.background`               | `rgba(0, 0, 0, 0.051)` | Selection rectangle fill          |
| `--graph-selection-border`                     | `selection.border`                   | `#ecc113`              | Selection rectangle border        |

### Constants

| CSS variable                  | Graph setting (`graphConstants`) | Type    | Default | What it changes                                                                                             |
| ----------------------------- | -------------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `--graph-block-width`         | `block.WIDTH`                    | number  | `200`   | Stored for custom blocks; core rendering does not read it                                                   |
| `--graph-block-height`        | `block.HEIGHT`                   | number  | `160`   | Stored for custom blocks; core rendering does not read it                                                   |
| `--graph-block-width-min`     | `block.WIDTH_MIN`                | number  | `160`   | Stored for custom blocks; core rendering does not read it                                                   |
| `--graph-block-head-height`   | `block.HEAD_HEIGHT`              | number  | `64`    | Top offset of canvas block anchors, together with body padding                                              |
| `--graph-block-body-padding`  | `block.BODY_PADDING`             | number  | `24`    | Added to the head height for that anchor offset                                                             |
| `--graph-grid-size`           | `system.GRID_SIZE`               | integer | `16`    | Grid unit: background dot spacing; anchors are spaced `2 ×` this value; limits connection label offsets     |
| `--graph-usable-rect-gap`     | `system.USABLE_RECT_GAP`         | number  | `400`   | Margin around the content for the usable area (background and border); also used by the minimap             |
| `--graph-camera-speed`        | `camera.SPEED`                   | number  | `1`     | Zoom speed multiplier                                                                                       |
| `--graph-camera-step`         | `camera.STEP`                    | number  | `0.008` | Zoom step per wheel delta                                                                                   |
| `--graph-camera-pan-speed`    | `camera.PAN_SPEED`               | number  | `1`     | Pan speed for trackpad swipe and wheel scrolling; pointer drag is not affected                              |
| `--graph-text-base-font-size` | `text.BASE_FONT_SIZE`            | number  | `24`    | Base font size of block names, multiplied by the `scaleFontSize` setting; read once when blocks are created |
| `--graph-text-padding`        | `text.PADDING`                   | number  | `10`    | Inset of block text from the block border                                                                   |

The full guide, with theme examples, is the repository's
[CSS variables guide](https://github.com/gravity-ui/graph/blob/v2/packages/graph/docs/plugins/cssVariables.md).

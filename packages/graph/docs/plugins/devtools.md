# DevTools Plugin

## Overview

The `DevToolsLayer` plugin provides visual development tools for the `@gravity-ui/graph` library, aiding developers in precise positioning, measurement, and debugging of graph elements. It adds rulers along the edges of the graph viewport and a crosshair that follows the mouse cursor, displaying real-time world coordinates.

This layer is intended purely for development and debugging purposes and typically should not be included in production builds.

## Features

1.  **Rulers (Horizontal & Vertical):**
    *   Displays rulers along the top and left edges of the graph viewport.
    *   Shows dynamic ticks (major and minor) with labels representing the current **world coordinates** based on the camera's position and scale.
    *   The tick spacing adapts automatically to the zoom level using a "nice number" algorithm (1, 2, 5, 10...) for readability.
    *   Includes a corner square where the rulers intersect.
    *   Rulers remain fixed to the viewport edges; the graph content scrolls underneath them.

2.  **Crosshair:**
    *   Displays horizontal and vertical dashed lines that follow the mouse cursor.
    *   Shows the current **world coordinates** of the cursor in the top-left corner (below the rulers).
    *   The crosshair is only visible when the mouse cursor is within the main graph area (not over the rulers).

## Usage

The `DevToolsLayer` can be added to the graph like any other layer.

### 1. Via Graph Configuration

```typescript
import { Graph, DevToolsLayer } from "@gravity-ui/graph";

const graph = new Graph({
  // ... other graph settings
  layers: [
    // Other layers...
    [DevToolsLayer, {
      showRuler: true, // Default
      showCrosshair: true, // Default
      // Add other custom options here if needed
    }]
  ]
});
```

### 2. Dynamic Addition

```typescript
import { DevToolsLayer } from "@gravity-ui/graph";

// Assuming 'graph' is an existing Graph instance
graph.addLayer(DevToolsLayer, {
  showRuler: true,
  showCrosshair: true,
});
```

### 3. With React (`useLayer` Hook)

This is the recommended way when using the React bindings.

```tsx
import React from 'react';
import { useGraph, GraphCanvas, useLayer, DevToolsLayer, TDevToolsLayerProps } from '@gravity-ui/graph';

function MyGraphComponent() {
  const { graph } = useGraph({ /* ... initial config ... */ });

  // Add the DevTools layer using the hook
  useLayer(graph, DevToolsLayer, {
    showRuler: true, // Control via props or Storybook args
    showCrosshair: true,
    // ... other DevToolsLayer props
  });

  // ... useEffect to load data and start graph ...

  return <GraphCanvas graph={graph} renderBlock={/* ... */} />;
}
```

## Configuration Options (`TDevToolsLayerProps`)

The layer accepts the following options (extending base `LayerProps`), with defaults defined in `DEFAULT_DEVTOOLS_LAYER_PROPS`:

| Prop                       | Type      | Default                        | Description                                                                 |
| :------------------------- | :-------- | :----------------------------- | :-------------------------------------------------------------------------- |
| `showRuler`                | `boolean` | `true`                         | Toggles the visibility of the rulers.                                       |
| `showCrosshair`            | `boolean` | `true`                         | Toggles the visibility of the crosshair and coordinate display.             |
| `rulerSize`                | `number`  | `25`                           | Width/height of the ruler area in logical pixels.                           |
| `minMajorTickDistance`     | `number`  | `50`                           | Minimum desired screen distance (logical pixels) between major ruler ticks. |
| `rulerBackgroundColor`     | `string`  | `"rgba(46, 46, 46, .4)"`       | Background color of the ruler areas.                                        |
| `rulerTickColor`           | `string`  | `"rgb(93, 93, 93)"`            | Color of the major and minor tick marks on the rulers.                      |
| `rulerTextColor`           | `string`  | `"rgba(245, 245, 245, 0.8)"`   | Color of the text labels on the rulers.                                     |
| `rulerTextFont`            | `string`  | `"11px Helvetica"`             | CSS font string for the ruler text labels.                                  |
| `crosshairColor`           | `string`  | `"rgba(255, 0, 0, 0.7)"`       | Color of the dashed crosshair lines.                                        |
| `crosshairTextColor`       | `string`  | `"rgba(255, 255, 255, 1)"`     | Color of the coordinate text display.                                       |
| `crosshairTextFont`        | `string`  | `"11px Helvetica"`             | CSS font string for the coordinate text display.                            |
| `crosshairTextBackgroundColor` | `string`  | `"rgba(0, 0, 0, 0.7)"`       | Background color for the coordinate text display box.                       |
| `rulerBackdropBlur`        | `number`  | `5`                            | Blur strength (in px) for the backdrop filter under the ruler backgrounds.  |

*Note: Base `LayerProps` like `graph`, `camera`, `root`, `emitter` are provided automatically when using `graph.addLayer` or `useLayer`.* 
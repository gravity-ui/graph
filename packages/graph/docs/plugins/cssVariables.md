# CSS Variables Plugin

## Overview

The `CSSVariablesLayer` plugin enables seamless synchronization between CSS variables and graph appearance settings (colors and constants). Instead of using JavaScript API methods like `graph.setColors()` or `graph.setConstants()`, you can control the graph's visual styling through standard CSS variables.

This layer creates an invisible HTML div element with a specified CSS class and monitors CSS variable changes using the `style-observer` package. When CSS variables change (e.g., through theme switching, media queries, or dynamic style updates), the layer automatically maps these changes to the corresponding `TGraphColors` and `TGraphConstants` properties and applies them to the graph.

## Features

1.  **CSS-based Styling:**
    *   Control graph appearance using CSS variables instead of JavaScript API.
    *   Enables integration with CSS frameworks, design systems, and theme providers.
    *   Supports dynamic theme switching without JavaScript code changes.

2.  **Real-time Synchronization:**
    *   Automatically detects CSS variable changes using `style-observer`.
    *   Instantly applies changes to graph colors and constants.
    *   No manual update calls required.

3.  **Comprehensive Variable Support:**
    *   Colors: canvas, blocks, anchors, connections, connection labels, selection.
    *   Constants: block dimensions, grid size, camera settings, text properties.
    *   See [Supported CSS Variables](#supported-css-variables) section for the complete list.

4.  **Type Safety:**
    *   Automatic type conversion (color strings, floats, integers).
    *   Validates and converts CSS values to appropriate graph property types.

5.  **Developer-friendly:**
    *   Optional debug mode for logging changes.
    *   Change callback for custom handling.
    *   Lightweight invisible container with no visual impact.

## Usage

The `CSSVariablesLayer` can be added to the graph like any other layer.

### 1. Via Graph Configuration

```typescript
import { Graph, CSSVariablesLayer } from "@gravity-ui/graph";

const graph = new Graph({
  // ... other graph settings
  layers: [
    // Other layers...
    [CSSVariablesLayer, {
      containerClass: "graph-theme", // CSS class for the container
      debug: false, // Enable debug logging
      onChange: (changes) => {
        console.log("CSS variables changed:", changes);
      }
    }]
  ]
});
```

### 2. Dynamic Addition

```typescript
import { CSSVariablesLayer } from "@gravity-ui/graph";

// Assuming 'graph' is an existing Graph instance
graph.addLayer(CSSVariablesLayer, {
  containerClass: "graph-theme",
  debug: true,
});
```

### 3. With React (`useLayer` Hook)

This is the recommended way when using the React bindings.

```tsx
import React from 'react';
import { useGraph, GraphCanvas, useLayer, CSSVariablesLayer } from '@gravity-ui/graph';

function MyGraphComponent() {
  const { graph } = useGraph({ /* ... initial config ... */ });

  // Add the CSS Variables layer using the hook
  useLayer(graph, CSSVariablesLayer, {
    containerClass: "graph-theme", // Match your theme container class
    debug: false,
    onChange: (changes) => {
      // Optional: handle changes
      console.log("CSS variables updated:", changes);
    },
  });

  // ... useEffect to load data and start graph ...

  return (
    <div className="graph-theme graph-theme-light">
      <GraphCanvas graph={graph} renderBlock={/* ... */} />
    </div>
  );
}
```

## Configuration Options (`CSSVariablesLayerProps`)

The layer accepts the following options (extending base `LayerProps`), with defaults defined in `DEFAULT_CSS_VARIABLES_LAYER_PROPS`:

| Prop                       | Type                                          | Default                        | Description                                                                 |
| :------------------------- | :-------------------------------------------- | :----------------------------- | :-------------------------------------------------------------------------- |
| `containerClass`           | `string`                                      | **(required)**                 | CSS class name applied to the invisible container div. Used to observe CSS variables. |
| `onChange`                 | `(changes: CSSVariableChange[]) => void`      | `undefined`                    | Optional callback invoked when CSS variables change. Receives array of changes. |
| `debug`                    | `boolean`                                     | `false`                        | Enables debug logging to console for CSS variable changes and layer operations. |

*Note: Base `LayerProps` like `graph`, `camera`, `root`, `emitter` are provided automatically when using `graph.addLayer` or `useLayer`.*

## Supported CSS Variables

The layer supports the following CSS variables, automatically mapped to graph properties:

### Canvas Colors

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-canvas-background`           | `canvas.layerBackground`        | Color   |
| `--graph-canvas-below-background`     | `canvas.belowLayerBackground`   | Color   |
| `--graph-canvas-dots`                 | `canvas.dots`                   | Color   |
| `--graph-canvas-border`               | `canvas.border`                 | Color   |

### Block Colors

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-block-background`            | `block.background`              | Color   |
| `--graph-block-border`                | `block.border`                  | Color   |
| `--graph-block-text`                  | `block.text`                    | Color   |
| `--graph-block-selected-border`       | `block.selectedBorder`          | Color   |

### Anchor Colors

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-anchor-background`           | `anchor.background`             | Color   |
| `--graph-anchor-selected-border`      | `anchor.selectedBorder`         | Color   |

### Connection Colors

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-connection-background`       | `connection.background`         | Color   |
| `--graph-connection-selected-background` | `connection.selectedBackground` | Color   |

### Connection Label Colors

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-connection-label-background` | `connectionLabel.background`    | Color   |
| `--graph-connection-label-hover-background` | `connectionLabel.hoverBackground` | Color |
| `--graph-connection-label-selected-background` | `connectionLabel.selectedBackground` | Color |
| `--graph-connection-label-text`       | `connectionLabel.text`          | Color   |
| `--graph-connection-label-hover-text` | `connectionLabel.hoverText`     | Color   |
| `--graph-connection-label-selected-text` | `connectionLabel.selectedText` | Color   |

### Selection Colors

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-selection-background`        | `selection.background`          | Color   |
| `--graph-selection-border`            | `selection.border`              | Color   |

### Block Constants

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-block-width`                 | `block.WIDTH`                   | Float   |
| `--graph-block-height`                | `block.HEIGHT`                  | Float   |
| `--graph-block-width-min`             | `block.WIDTH_MIN`               | Float   |
| `--graph-block-head-height`           | `block.HEAD_HEIGHT`             | Float   |
| `--graph-block-body-padding`          | `block.BODY_PADDING`            | Float   |

### System Constants

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-grid-size`                   | `system.GRID_SIZE`              | Int     |
| `--graph-usable-rect-gap`             | `system.USABLE_RECT_GAP`        | Float   |

### Camera Constants

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-camera-speed`                | `camera.SPEED`                  | Float   |
| `--graph-camera-step`                 | `camera.STEP`                   | Float   |

### Text Constants

| CSS Variable                          | Graph Property                  | Type    |
| :------------------------------------ | :------------------------------ | :------ |
| `--graph-text-base-font-size`         | `text.BASE_FONT_SIZE`           | Float   |
| `--graph-text-padding`                | `text.PADDING`                  | Float   |

## CSS Example

Here's an example of defining graph styles using CSS variables:

```css
/* Light theme */
.graph-theme-light {
  --graph-canvas-background: #ffffff;
  --graph-block-background: #f5f5f5;
  --graph-block-border: #e0e0e0;
  --graph-block-selected-border: #ffbe5c;
  --graph-connection-background: rgba(0, 0, 0, 0.3);
  --graph-connection-selected-background: #eac94a;
}

/* Dark theme */
.graph-theme-dark {
  --graph-canvas-background: #1a1a1a;
  --graph-block-background: #2d2d2d;
  --graph-block-border: #404040;
  --graph-block-selected-border: #ffbe5c;
  --graph-connection-background: rgba(255, 255, 255, 0.5);
  --graph-connection-selected-background: #eac94a;
}

/* Custom block sizes */
.graph-theme {
  --graph-block-width: 240px;
  --graph-block-height: 120px;
  --graph-block-head-height: 32px;
  --graph-grid-size: 20;
}
```

## Best Practices

1.  **Container Class Naming:** Use a consistent CSS class name that matches your theme structure (e.g., `graph-theme`).
2.  **Theme Organization:** Group related variables together in your CSS files for better maintainability.
3.  **Debug Mode:** Enable `debug: true` during development to track variable changes in the console.
4.  **Performance:** The layer is optimized and uses efficient observers, but avoid excessive CSS variable changes in tight loops.
5.  **Fallbacks:** Define default values in your CSS to ensure proper rendering if variables are not set.
6.  **Type Consistency:** Use appropriate CSS value formats:
    *   Colors: `#hex`, `rgb()`, `rgba()`, or named colors
    *   Numbers: Include units for dimensions (`px`, `em`, etc.) or use unitless values
    *   Integers: Whole numbers for properties like `GRID_SIZE`

## Integration with Design Systems

The CSS Variables Layer integrates seamlessly with design system tokens and theme providers:

```tsx
// Example with a design system
import { ThemeProvider } from '@my-design-system/react';

function App() {
  const { graph } = useGraph();
  
  useLayer(graph, CSSVariablesLayer, {
    containerClass: 'my-design-system-theme',
  });

  return (
    <ThemeProvider theme="light">
      <div className="my-design-system-theme">
        <GraphCanvas graph={graph} />
      </div>
    </ThemeProvider>
  );
}
```

## Troubleshooting

**Variables not updating:**
- Ensure the `containerClass` matches an actual CSS class in your DOM.
- Check that CSS variables are properly defined with the `--graph-` prefix.
- Enable `debug: true` to see which variables are being detected.

**Wrong colors/values:**
- Verify CSS variable values use correct formats (valid colors, numbers with units).
- Check the browser DevTools to inspect computed CSS variable values.
- Ensure variable names exactly match the supported list.

**Performance issues:**
- Avoid changing too many variables simultaneously.
- Consider debouncing rapid theme changes.
- Use the `onChange` callback to batch updates if needed.


# Graph Settings

The Graph Visualization Library provides a comprehensive set of configuration options for customizing the appearance and behavior of your graph visualizations. This document describes the available settings and how to use them.

## Overview

Graph settings are organized into three main categories:

1. **Graph Settings** - Control interactive behaviors, visual styles, and component registrations
2. **Graph Colors** - Define the color scheme for all graph elements
3. **Graph Constants** - Control sizes, spacings, and other numerical values

## Applying Settings

Settings can be applied when creating a new graph instance:

```typescript
import { Graph } from '@gravity-ui/graph';

// Create a graph instance with custom settings
const graph = new Graph(
  {
    settings: {
      canDragCamera: true,
      canZoomCamera: true,
      useBezierConnections: true,
      // other settings...
    },
  },
  document.getElementById("graph-container")
);
```

You can also update settings after graph creation:

```typescript
// Update specific settings
graph.updateSettings({
  showConnectionArrows: true,
  canChangeBlockGeometry: 'onlySelected',
});

// Change color scheme
graph.setColors({
  block: {
    background: '#f5f5f5',
    border: '#cccccc',
  },
});

// Update constants
graph.setConstants({
  block: {
    WIDTH: 300,
    HEIGHT: 200,
  },
});
```

## Graph Settings Configuration

These settings control the interactive behaviors and visual styles of the graph.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `canDragCamera` | boolean | `true` | Controls whether the camera can be dragged (panned) |
| `canZoomCamera` | boolean | `true` | Controls whether the camera can be zoomed in/out |
| `canChangeBlockGeometry` | ECanChangeBlockGeometry | `'none'` | Determines which blocks can be resized or moved. Options: `'all'`, `'onlySelected'`, `'none'` |
| `canCreateNewConnections` | boolean | `false` | Controls whether users can create new connections |
| `scaleFontSize` | number | `1` | Scale factor for font sizes throughout the graph |
| `showConnectionArrows` | boolean | `true` | Controls visibility of arrows at the end of connections |
| `useBezierConnections` | boolean | `true` | Use bezier curves for connections instead of straight lines |
| `bezierConnectionDirection` | 'vertical' \| 'horizontal' | `'horizontal'` | Direction of bezier connections |
| `useBlocksAnchors` | boolean | `true` | Controls whether blocks should display anchors for connections |
| `showConnectionLabels` | boolean | `false` | Controls visibility of connection labels |
| `blockComponents` | Record<string, typeof Block> | `{}` | Registry of custom block components |
| `connection` | typeof BlockConnection | `undefined` | Custom connection component |
| `background` | typeof Component | `undefined` | Custom background component |

## Graph Colors

Colors control the visual appearance of all graph elements.

### Canvas Colors

| Property | Default | Description |
|----------|---------|-------------|
| `belowLayerBackground` | `'#eaeaea'` | Background color for the layer below the main graph |
| `layerBackground` | `'#f9f9f9'` | Background color for the main graph layer |
| `dots` | `'#d0d2ce'` | Color of the background dots |
| `border` | `'#EAEAEAFF'` | Color of the canvas border |

### Block Colors

| Property | Default | Description |
|----------|---------|-------------|
| `background` | `'#e0e0e0'` | Background color of blocks |
| `border` | `'#dfdfdf'` | Border color of blocks |
| `text` | `'#272727'` | Text color within blocks |
| `selectedBorder` | `'#FFCC00'` | Border color of selected blocks |

### Anchor Colors

| Property | Default | Description |
|----------|---------|-------------|
| `background` | `'#4a4a4a'` | Background color of anchors |
| `selectedBorder` | `'#FFCC00'` | Border color of selected anchors |

### Connection Colors

| Property | Default | Description |
|----------|---------|-------------|
| `background` | `'#272727'` | Color of connections |
| `selectedBackground` | `'#ecc113'` | Color of selected connections |

### Connection Label Colors

| Property | Default | Description |
|----------|---------|-------------|
| `background` | `'#EAEAEA'` | Background color of connection labels |
| `hoverBackground` | `'#FFCC00'` | Background color of connection labels on hover |
| `selectedBackground` | `'#FFCC00'` | Background color of selected connection labels |
| `text` | `'#777677'` | Text color of connection labels |
| `hoverText` | `'#777677'` | Text color of connection labels on hover |
| `selectedText` | `'#777677'` | Text color of selected connection labels |

### Selection Colors

| Property | Default | Description |
|----------|---------|-------------|
| `background` | `'rgba(0, 0, 0, 0.051)'` | Background color of selection rectangle |
| `border` | `'#ecc113'` | Border color of selection rectangle |

## Graph Constants

Constants control the sizing, spacing, and other numerical values used throughout the graph.

### System Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `GRID_SIZE` | `16` | Base grid size for layout calculations |
| `USABLE_RECT_GAP` | `400` | Gap around the usable rect area |
| `CAMERA_VIEWPORT_TRESHOLD` | `0.5` | Threshold for camera viewport |

### Camera Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `SPEED` | `1` | Camera movement speed |
| `STEP` | `0.008` | Step size for camera zoom |

### Block Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `SCALES` | `[0.125, 0.225, 0.7]` | Scale thresholds for different levels of detail. These values determine when the block switches between rendering modes:\n- First value (0.125): Below this zoom level, blocks are rendered in minimalistic mode showing just basic shapes\n- Second value (0.225): Between first and second value, blocks are rendered in schematic mode with basic details\n- Third value (0.7): Above this zoom level, blocks are rendered in detailed mode with full information |
| `DEFAULT_Z_INDEX` | `1` | Default z-index for blocks |
| `HEAD_HEIGHT` | `64` | Height of the block header section |
| `BODY_PADDING` | `24` | Padding inside block body |
| `WIDTH` | `200` | Default block width |
| `HEIGHT` | `160` | Default block height |
| `SNAPPING_GRID_SIZE` | `1` | Grid size for snapping during move/resize |

### Connection Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `DEFAULT_Z_INDEX` | `0` | Default z-index for connections |
| `THRESHOLD_LINE_HIT` | `8` | Hit detection threshold for connections |
| `MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL` | `0.25` | Minimum zoom level to display arrows and labels |
| `LABEL.INNER_PADDINGS` | `[0, 0, 0, 0]` | Inner padding for connection labels |

### Text Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `BASE_FONT_SIZE` | `24` | Base font size before scaling |
| `PADDING` | `10` | Text padding |

## Example Configurations

### Vertical Flow Layout

```typescript
graph.updateSettings({
  bezierConnectionDirection: 'vertical',
  showConnectionArrows: true,
});
```

### Read-Only View

```typescript
graph.updateSettings({
  canDragCamera: true,
  canZoomCamera: true,
  canChangeBlockGeometry: 'none',
  canCreateNewConnections: false,
});
```

### Interactive Editor

```typescript
graph.updateSettings({
  canDragCamera: true,
  canZoomCamera: true,
  canChangeBlockGeometry: 'all',
  canCreateNewConnections: true,
  showConnectionArrows: true,
  showConnectionLabels: true,
  useBlocksAnchors: true,
});
```

### Dark Theme

```typescript
graph.setColors({
  canvas: {
    belowLayerBackground: '#2d2d2d',
    layerBackground: '#3d3d3d',
    dots: '#4d4d4d',
    border: '#2d2d2d',
  },
  block: {
    background: '#4d4d4d',
    border: '#5d5d5d',
    text: '#f5f5f5',
    selectedBorder: '#ffcc00',
  },
  connection: {
    background: '#a0a0a0',
    selectedBackground: '#ffcc00',
  },
});
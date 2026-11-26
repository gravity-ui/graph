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
import { Graph, ECanDrag } from '@gravity-ui/graph';

const container = document.getElementById("graph-container") as HTMLDivElement | null;
if (!container) throw new Error("No #graph-container element");

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
  container
);
```

You can also update settings after graph creation:

```typescript
// Update specific settings
graph.updateSettings({
  showConnectionArrows: true,
  canDrag: ECanDrag.ONLY_SELECTED,
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
| `dragThreshold` | number | `5` | Movement from the press in CSS pixels that starts drag arbitration |
| `clickTolerance` | number | `3` | Maximum excursion in CSS pixels for an activation on the press target |
| `clickPolicy` | `"immediate" \| "exclusive"` | `"immediate"` | Deliver each click at release, or distinguish singles from doubles before dispatch and selection. [Activation](./event-model.md#activation) |
| `doubleClickInterval` | number | `350` | Maximum interval between activations in milliseconds |
| `doubleClickDistance` | number | `12` | Maximum distance between two activation points in CSS pixels |
| `touchPolicy` | `"editor"` \| `"page"` | `"editor"` | Enables one-finger dragging and two-finger camera navigation. Choose `"page"` before contact for native scrolling and zoom in an embedded graph. |
| `longPressDuration` | number | `500` | Hold duration in milliseconds for touch and pen |
| `retargetHoverOnCameraChange` | boolean | `false` | Recheck the hover target after the camera moves beneath a stationary mouse or pen. A target change emits hover events with `cause: "scene"`. |
| `canDragCamera` | boolean | `true` | Controls whether the camera can be dragged (panned) |
| `canZoomCamera` | boolean | `true` | Controls whether the camera can be zoomed in/out |
| `canDrag` | ECanDrag | `'none'` | Determines which blocks can be resized or moved. Options: `'all'`, `'onlySelected'`, `'none'` |
| `scaleFontSize` | number | `1` | Scale factor for font sizes throughout the graph |
| `showConnectionArrows` | boolean | `true` | Controls visibility of arrows at the end of connections |
| `useBezierConnections` | boolean | `true` | Use bezier curves for connections instead of straight lines |
| `bezierConnectionDirection` | 'vertical' \| 'horizontal' | `'horizontal'` | Direction of bezier connections |
| `EXP_USE_TIGHT_BEZIER_BOUNDS` | boolean | `true` | Experimental: use tight bounds of the rendered Bezier curve; set to `false` to use the legacy control-point bounds |
| `viewportCulling` | boolean | `true` | Enables viewport culling in the component tree. With `false`, the layer walks every immediate component and the Canvas compatibility batch draws every chunk. The scene separately culls retained elements, including built-in connections. |
| `useBlocksAnchors` | boolean | `true` | Controls whether blocks should display anchors for connections |
| `showConnectionLabels` | boolean | `false` | Controls visibility of connection labels |
| `blockComponents` | Record<string, typeof Block> | `{}` | Registry of custom block components. The built-in renderer constructs them with `id`, `initialIndex` and `font` only: put custom data into the block's `meta`, or give extra props defaults in the constructor. |
| `connection` | typeof BlockConnection | `undefined` | Connection component class (defaults to `BlockConnection`). Its `static geometry` defines the route and `static line` defines the stroke. The `renderer` setting selects the backend for built-in connections. See [Connection Lines, Geometry and WebGL](../connections/webgl-connections.md) |
| `background` | typeof Component | `undefined` | Custom background component |
| `renderer` | 'canvas' \| 'webgl' | `'canvas'` | Scene renderer: `'canvas'` draws the scene with the Canvas 2D interpreter, `'webgl'` with the lazily loaded WebGL backend, see [Scene](./scene.md) |
| `yieldBeforeSceneLoad` | boolean | `false` | Give the browser a paint for a loading overlay before scene startup, a full replacement or a renderer switch. See [Scene readiness](./scene.md#scene-readiness-and-loading-overlays). |
| `webglBackend` | () => Promise<ISceneBackendModule> | built-in dynamic import | Loader of the WebGL backend module, used when `renderer` is `'webgl'` |
| `cameraAwareText` | boolean | `true` | Whether scene texts may follow the camera. `cameraAware` texts keep a fixed screen size and re-fit their box as the camera zooms; `false` makes every scene text world-sized, whatever its primitive and the styles say. It is the switch for weak devices, which an app may hand to its users. A change redraws the scene (WebGL lays its camera-aware texts out again); no block rebuilds its look. `graph.scene.$cameraAwareText` is the setting as a signal, and `graph.scene.explain()` reports `cameraAwareText: "forced-off"` while it is off. See [Text primitives](./scene.md#text-primitives) |

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
| `VISIBILITY_TILE_SIZE` | `1024` | Edge of a visibility tile in world units (see `viewportCulling`); read when a layer applies culling: at construction, when `viewportCulling` is turned back on, and on `updateCulling()`; connection batches also read it (with `PATH2D_CHUNK_TILES`) when the connections component is constructed |

### Camera Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `SPEED` | `1` | Multiplier for the relative camera zoom speed |
| `STEP` | `0.008` | Base log-scale step for camera zoom; equal zoom-in and zoom-out steps are reciprocal |

### Block Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `SCALES` | `[0.125, 0.225, 0.7]` | Scale thresholds of the levels of detail (`graph.scene.$level`) with the default strategy: the scene level is minimalistic below the second value, schematic from it and detailed from the third. The default block title shows from the first value. |
| `DEFAULT_Z_INDEX` | `200` | Scene bucket of block elements; the theme raises a selected or dragged block by 1. Also the tree z-index of a `LegacyCanvasBlock` |
| `HEAD_HEIGHT` | `64` | Height of the block header section |
| `BODY_PADDING` | `24` | Padding inside block body |
| `WIDTH` | `200` | Default block width |
| `HEIGHT` | `160` | Default block height |
| `SNAPPING_GRID_SIZE` | `1` | Grid size for snapping during move/resize |

### Connection Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `DEFAULT_Z_INDEX` | `0` | Default z-index for connections |
| `THRESHOLD_LINE_HIT` | `8` | Hit detection threshold for connections: a point hits within half the stroke width plus this many world units of the line |
| `MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL` | `0.25` | Minimum zoom level to display arrows and labels |
| `PATH2D_CHUNK_SIZE` | `200` | Most connections in one batch chunk (one `stroke()`) |
| `PATH2D_CHUNK_TILES` | `8` | Edge of a batch chunk's grid cell in visibility tiles (`VISIBILITY_TILE_SIZE`); read when the connections component is constructed |
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
  canDrag: ECanDrag.NONE,
});
// Connection creation is off unless ConnectionEditingLayer from @gravity-ui/graph-connection-editing is mounted.
```

### Interactive Editor

```typescript
graph.updateSettings({
  canDragCamera: true,
  canZoomCamera: true,
  canDrag: ECanDrag.ALL,
  showConnectionArrows: true,
  showConnectionLabels: true,
  useBlocksAnchors: true,
});
graph.addLayer(ConnectionEditingLayer, {}); // from @gravity-ui/graph-connection-editing
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

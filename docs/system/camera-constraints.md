# Camera Constraints

This document describes the camera constraints feature that prevents users from losing track of the graph by limiting pan and zoom operations.

## Overview

Camera constraints ensure that users cannot zoom out too far or pan away from the graph content, maintaining visual context at all times. This feature is controlled by the `constrainCameraToGraph` setting and uses the `usableRect` calculated from the graph's hit test system.

## Configuration

### Settings

To enable camera constraints, set the `constrainCameraToGraph` flag in the graph settings:

```typescript
const graph = new Graph({
  settings: {
    constrainCameraToGraph: true, // Default: false
  },
});

// Or enable dynamically:
graph.api.setSetting("constrainCameraToGraph", true);
```

### Constants

The padding around the graph content can be configured via the `CAMERA_BOUNDS_PADDING` constant:

```typescript
const graph = new Graph(
  {
    // ... config
  },
  rootElement,
  colors,
  {
    camera: {
      CAMERA_BOUNDS_PADDING: 200, // Default: 200 (in camera space)
    },
  }
);
```

## Behavior

### Non-empty Graph

When the graph contains blocks or connections:

- **Minimum Scale**: Automatically calculated to ensure the entire graph fits in the viewport with padding
- **Maximum Scale**: Uses the configured `scaleMax` value (default: 1)
- **Position Bounds**: Camera center is constrained to the graph area plus padding

### Empty Graph

When the graph is empty (no blocks or connections):

- **Minimum Scale**: Uses the configured `scaleMin` value (default: 0.01)
- **Maximum Scale**: Limited to 0.5
- **Position Bounds**: Camera can pan within 50% of the viewport from center

## Implementation Details

### Core Components

1. **TCameraBounds** type: Defines the bounds structure
   ```typescript
   type TCameraBounds = {
     minX: number;
     maxX: number;
     minY: number;
     maxY: number;
     minScale: number;
     maxScale: number;
   };
   ```

2. **updateCameraBounds()**: Calculates bounds based on usableRect
3. **applyCameraBounds()**: Applies constraints to camera state changes
4. **Automatic updates**: Bounds are recalculated when:
   - usableRect changes (blocks added/removed/moved)
   - Viewport size changes (resize)
   - Viewport insets change
   - constrainCameraToGraph setting is enabled

### Edge Cases Handled

- **Viewport larger than graph**: Camera is centered when viewport is larger than the constrained area
- **Dynamic enable/disable**: Constraints can be toggled at runtime
- **Viewport insets**: Constraints account for visible viewport area with insets
- **Empty to non-empty transition**: Bounds are recalculated when first block is added

## API

### CameraService Methods

```typescript
// Update bounds based on usable rect
cameraService.updateCameraBounds(usableRect: TRect): void

// Apply constraints to a state change (internal use)
cameraService.applyCameraBounds(state: Partial<TCameraState>): Partial<TCameraState>
```

### Types

```typescript
import type { TCameraBounds, TCameraState } from "@gravity-ui/graph";
```

## Example Usage

See the [Camera Constraints story](/packages/stories/src/examples/cameraConstraints/cameraConstraints.stories.tsx) for a complete interactive example demonstrating:

- Enabling/disabling constraints
- Behavior with and without blocks
- Adding and removing blocks
- Real-time bounds visualization

## Notes

- Constraints are applied at the camera service level, affecting all camera operations (zoom, pan, drag)
- The feature respects viewport insets for proper constraint calculation
- Constraints do not prevent programmatic camera changes via API, but the resulting position will be constrained


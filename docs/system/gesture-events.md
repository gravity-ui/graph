# Gesture Events

This document describes the gesture event system that has been integrated into the graph visualization library using Hammer.js.

## Overview

The gesture system provides touch and gesture support for the graph, including:
- **Tap**: Single tap/click gestures
- **Hover**: Mouse hover events
- **Pan**: Drag/pan gestures for moving the camera (panstart, panmove, panend)
- **Pinch**: Pinch gestures for zooming (pinchstart, pinchmove, pinchend)

## Integration with Existing Event System

The gesture events are fully integrated with the existing event system and follow the same patterns:

```typescript
import { Graph } from "@gravity-ui/graph";

const graph = new Graph(config);

// Subscribe to gesture events
graph.on("tap", (event) => {
  console.log("Tap event:", event.detail);
});

graph.on("panstart", (event) => {
  console.log("Pan start:", event.detail);
});

graph.on("panmove", (event) => {
  console.log("Pan move:", event.detail);
});

graph.on("panend", (event) => {
  console.log("Pan end:", event.detail);
});

graph.on("pinchstart", (event) => {
  console.log("Pinch start:", event.detail);
});

graph.on("pinchmove", (event) => {
  console.log("Pinch move:", event.detail);
});

graph.on("pinchend", (event) => {
  console.log("Pinch end:", event.detail);
});

graph.on("hover", (event) => {
  console.log("Hover event:", event.detail);
});
```

## Event Types

### Tap Event

Fired when a user taps/clicks on the graph.

```typescript
interface TapEventDetail {
  target?: EventedComponent;      // The component under the tap
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the tap
}
```

### Hover Event

Fired when the mouse enters or leaves a component.

```typescript
interface HoverEventDetail {
  target?: EventedComponent;      // The component being hovered
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
}
```

### Pan Events

Fired during pan/drag gestures. The pan gesture is split into three events:

#### Pan Start
```typescript
interface PanStartEventDetail {
  target?: EventedComponent;      // The component under the pan
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the pan
  deltaX?: number;                // X delta from start
  deltaY?: number;                // Y delta from start
}
```

#### Pan Move
```typescript
interface PanMoveEventDetail {
  target?: EventedComponent;      // The component under the pan
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the pan
  deltaX?: number;                // X delta from start
  deltaY?: number;                // Y delta from start
}
```

#### Pan End
```typescript
interface PanEndEventDetail {
  target?: EventedComponent;      // The component under the pan
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the pan
  deltaX?: number;                // X delta from start
  deltaY?: number;                // Y delta from start
}
```

### Pinch Events

Fired during pinch gestures for zooming. The pinch gesture is split into three events:

#### Pinch Start
```typescript
interface PinchStartEventDetail {
  target?: EventedComponent;      // The component under the pinch
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the pinch
  scale?: number;                 // Scale factor (1.0 = no change)
  rotation?: number;              // Rotation in degrees
}
```

#### Pinch Move
```typescript
interface PinchMoveEventDetail {
  target?: EventedComponent;      // The component under the pinch
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the pinch
  scale?: number;                 // Scale factor (1.0 = no change)
  rotation?: number;              // Rotation in degrees
}
```

#### Pinch End
```typescript
interface PinchEndEventDetail {
  target?: EventedComponent;      // The component under the pinch
  sourceEvent: HammerInput;       // Original Hammer.js event
  pointerPressed?: boolean;       // Whether pointer is pressed
  center?: TPoint;                // Center point of the pinch
  scale?: number;                 // Scale factor (1.0 = no change)
  rotation?: number;              // Rotation in degrees
}
```

## React Component Usage

When using the React components, you can listen to gesture events using props:

```typescript
import { GraphCanvas } from "@gravity-ui/graph/react";

const MyGraph = () => {
  const onTap = useCallback((data, event) => {
    console.log("Tap on:", data.target);
  }, []);

  const onPanStart = useCallback((data, event) => {
    console.log("Pan started:", data);
  }, []);

  const onPanMove = useCallback((data, event) => {
    console.log("Pan delta:", { x: data.deltaX, y: data.deltaY });
  }, []);

  const onPanEnd = useCallback((data, event) => {
    console.log("Pan ended:", data);
  }, []);

  const onPinchStart = useCallback((data, event) => {
    console.log("Pinch started:", data);
  }, []);

  const onPinchMove = useCallback((data, event) => {
    console.log("Pinch scale:", data.scale);
  }, []);

  const onPinchEnd = useCallback((data, event) => {
    console.log("Pinch ended:", data);
  }, []);

  return (
    <GraphCanvas
      config={config}
      onTap={onTap}
      onPanStart={onPanStart}
      onPanMove={onPanMove}
      onPanEnd={onPanEnd}
      onPinchStart={onPinchStart}
      onPinchMove={onPinchMove}
      onPinchEnd={onPinchEnd}
    />
  );
};
```

## Camera Integration

The Camera component now automatically responds to gesture events:

### Pan Gestures
- **panstart**: Initiates camera panning when gesture starts on empty space
- **panmove**: Moves camera based on gesture delta
- **panend**: Stops camera panning

### Pinch Gestures
- **pinchstart**: Initiates camera zooming when gesture starts on empty space
- **pinchmove**: Zooms camera based on scale delta using the same zoom speed logic as wheel events
- **pinchend**: Stops camera zooming

### Fallback Support
The Camera component maintains backward compatibility by:
- Still supporting traditional mouse drag events
- Using the old dragListener system as a fallback
- Automatically detecting which input method to use
- **Consistent zoom behavior** between wheel events and pinch gestures

## Architecture

The gesture system consists of:

1. **GestureService**: A service that wraps Hammer.js and handles gesture recognition
2. **Event Integration**: Gesture events are emitted through the same Graph event system
3. **Camera Integration**: Camera component automatically responds to gesture events
4. **Backward Compatibility**: Existing mouse events continue to work alongside gesture events

### GestureService

Located at `src/services/GestureService.ts`, this service:
- Initializes Hammer.js on the root element
- Configures gesture recognition (pan, pinch, tap)
- Emits events through the Graph's event system
- Manages target component tracking

### Camera Component

Located at `src/services/camera/Camera.ts`, the Camera component:
- Listens to gesture events from the Graph
- Automatically handles pan gestures for camera movement
- Automatically handles pinch gestures for camera zooming
- Maintains backward compatibility with mouse events
- **Uses consistent zoom speed logic** for both wheel events and pinch gestures

### Zoom Speed Consistency

The Camera component ensures that zoom behavior is consistent across different input methods:

```typescript
// Wheel event zoom logic
const pinchSpeed = Math.sign(event.deltaY) * clamp(Math.abs(event.deltaY), 1, 20);
const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed;

// Pinch gesture zoom logic (same formula)
const pinchSpeed = Math.sign(scaleDelta) * clamp(Math.abs(scaleDelta * 10), 1, 20);
const dScale = this.context.constants.camera.STEP * this.context.constants.camera.SPEED * pinchSpeed;
```

This ensures that:
- Pinch gestures feel natural and responsive
- Zoom speed is predictable regardless of input method
- Users get consistent experience across devices
- Camera constants (STEP, SPEED) apply uniformly

### Event Flow

1. User performs a gesture on the graph
2. Hammer.js recognizes the gesture
3. GestureService processes the gesture and creates an event
4. Event is emitted through `graph.emit()`
5. Camera component receives the event and responds accordingly
6. Event listeners receive the event with component context

## Configuration

The gesture system is automatically enabled when creating a Graph instance. No additional configuration is required.

### Hammer.js Options

The GestureService configures Hammer.js with sensible defaults:
- Pan: Enabled in all directions
- Pinch: Enabled for zoom gestures
- Tap: Enabled for click detection

### Camera Settings

Camera gesture behavior can be controlled through existing settings:
- `canDragCamera`: Controls whether pan gestures are allowed
- `canZoomCamera`: Controls whether pinch gestures are allowed

## Migration from Mouse Events

If you're currently using mouse events, you can gradually migrate to gesture events:

```typescript
// Old way (still works)
graph.on("click", (event) => {
  // Handle click
});

// New way
graph.on("tap", (event) => {
  // Handle tap (works on both touch and mouse)
});

// Both can coexist
graph.on("click", (event) => {
  // Handle legacy click events
});

graph.on("tap", (event) => {
  // Handle new tap events
});
```

## Performance Considerations

- Gesture events are optimized for touch devices
- Events include target component information for efficient handling
- The system automatically manages event listener cleanup
- Gesture recognition is debounced to prevent excessive event firing
- Camera gestures are optimized for smooth movement and zooming

## Browser Support

The gesture system requires:
- Modern browsers with touch event support
- Hammer.js 2.0+ (automatically included)
- Touch devices or devices with mouse support

## Examples

See the following files for complete working examples:
- `src/stories/examples/cameraGestures/cameraGestures.stories.tsx` - Camera gesture integration
- `src/stories/examples/gestureEvents/gestureEvents.stories.tsx` - General gesture events

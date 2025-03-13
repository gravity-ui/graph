# Canvas Ruler Layer

The Canvas Ruler Layer adds horizontal and vertical rulers to the graph canvas, displaying the X and Y coordinates of the visible area.

## Features

- Horizontal ruler at the top of the canvas showing X coordinates
- Vertical ruler on the left side of the canvas showing Y coordinates
- Dynamic tick spacing based on camera scale (10, 100, 200, 400, 1000)
- Customizable colors for ruler text, ticks, and background

## Usage

```typescript
// Add when creating a graph
const graph = new Graph({
  layers: [
    [CanvasRulerLayer, {
      rulerTextColor: '#333333',      // Optional: Custom text color
      rulerTickColor: '#666666',      // Optional: Custom tick color
      rulerBackgroundColor: '#f0f0f0' // Optional: Custom background color
    }]
  ]
});

// Or add dynamically
const rulerLayer = graph.addLayer(CanvasRulerLayer, {
  rulerTextColor: '#333333',
  rulerTickColor: '#666666',
  rulerBackgroundColor: '#f0f0f0'
});
```

## Customization

The Canvas Ruler Layer supports the following customization options:

| Property | Type | Description |
|----------|------|-------------|
| `rulerTextColor` | string | Color of the coordinate text labels |
| `rulerTickColor` | string | Color of the ruler ticks and borders |
| `rulerBackgroundColor` | string | Background color of the rulers |

If not specified, these properties will use default colors from the graph's color scheme:
- Text color: `colors.text.primary`
- Tick color: `colors.canvas.border`
- Background color: `colors.canvas.belowLayerBackground`

## Scale Behavior

The ruler automatically adjusts the tick spacing based on the camera scale:

| Scale Range | Tick Spacing |
|-------------|--------------|
| > 0.75      | 10           |
| 0.5 - 0.75  | 100          |
| 0.25 - 0.5  | 200          |
| 0.1 - 0.25  | 400          |
| < 0.1       | 1000         |

This ensures that the rulers remain readable and useful at different zoom levels. 
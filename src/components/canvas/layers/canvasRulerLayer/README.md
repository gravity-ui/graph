# Canvas Ruler Layer

The Canvas Ruler Layer adds horizontal and vertical rulers to the graph canvas, displaying the X and Y coordinates of the visible area.

## Features

- Horizontal ruler at the top of the canvas showing X coordinates
- Vertical ruler on the left side of the canvas showing Y coordinates
- Dynamic tick spacing with automatic adjustment to prevent label overlap
- Non-overlapping rulers with special handling for the top-left intersection
- Origin indicator in the top-left corner showing the direction to (0,0)
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

The ruler automatically adjusts the tick spacing using a dynamic algorithm that prevents label overlap:

1. The algorithm calculates the minimum world distance needed between ticks based on the current scale
2. For normal zoom levels, it selects the smallest appropriate step from a predefined set: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
3. For very small scales (extreme zoom out), it uses a logarithmic approach that calculates steps based on powers of 10 (1x, 2x, or 5x the appropriate power of 10)
4. This ensures that ruler labels remain readable and don't overlap at any zoom level, from extreme close-up to extreme far-out views

This approach provides a more flexible and responsive ruler that adapts to different zoom levels and viewport sizes. 
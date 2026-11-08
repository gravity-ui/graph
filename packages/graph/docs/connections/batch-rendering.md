# Batch Rendering System in BlockConnection

BlockConnection uses a batch rendering system to optimize performance when displaying many connections. Instead of
drawing each connection individually, the system groups connections with similar visual properties and renders them
together, significantly reducing canvas API calls.

Connection components do not draw their lines. Each connection's line object (`static line`, see
[Connection Lines, Geometry and WebGL](webgl-connections.md)) registers two items with the batch of
`BlockConnections`: the line and its arrow. One batch draws every connection of a graph: a `BatchScene` with a Path2D
backend for a `Path2DLine` class, or with a WebGL2 backend for a `WebGLLine` class.

## How Batching Works

Every item has a z-level and a group. The z-level is `connection.DEFAULT_Z_INDEX`, plus 10 while the connection is
hovered or selected; an arrow is one level below its line. The line item's group is `Path2DLine.getGroup()`, by default
built from the stroke `getStroke()` returns. The arrow item's group adds whether the arrow is closed and the arrow's
own stroke: a closed triangle is filled and stroked, a chevron only stroked, so the two never share a style on a graph
with both shapes.

```typescript
// Default groups:
"line/#272727/2/";                        // a plain line
"line/#ecc113/4/";                        // a selected line
"line/#272727/2/6,4";                     // a dashed line
"arrow/open/#272727/2//line/#272727/2/";  // its chevron
"arrow/closed/#272727/2//line/#272727/2/"; // a closed triangle (multipoint connections)
```

Items with identical groups are batched together: they share the same canvas context state (color, line width, dash
pattern) and are drawn in a single operation. The line moves its items to their new group and z-level whenever the
connection's state, props or geometry change.

Each group is split by the grid cell of an item's top-left corner (`connection.PATH2D_CHUNK_TILES` visibility tiles
per edge, 8 × 1024 world units by default) into chunks of up to `connection.PATH2D_CHUNK_SIZE` items, each drawn with
one `fill`/`stroke`. A new item joins the last chunk of its cell, else the first one with room, else a new chunk;
empty chunks are dropped. Chunks are drawn by z-level, then by group in first-registration order, then by cell
(items without valid bounds first, in chunks that are never culled), so the picture does not depend on registration
order across cells. A chunk's path is rebuilt only when an item is added, removed, moved to another cell or marked
dirty; camera moves never rebuild it. A chunk is skipped when the union of its items' bounds is outside the viewport:
an item spanning many cells stays in its corner cell, and its chunk's bounds contain it, so it is drawn whenever any
part of its bounds is in the viewport. The viewport is the owner layer's culling viewport; without culling every
chunk is drawn.

Where two items of one group overlap, the overlap is composited once when they share a chunk and twice when they do
not. With translucent colors, or at anti-aliased crossings, those pixels can differ from a version that grouped
items by registration order; everywhere else the picture is the same.

The batch is a `BatchScene` (`lib/batch`) with a `Path2D` or a WebGL2 backend: the scene owns items, chunks, order
and culling, the backend builds and draws a chunk. The WebGL batch chunks items by z-level and grid cell only, since
each instance carries its own style; its draw calls and order are described in
[Draw calls and order](webgl-connections.md#draw-calls-and-order).

`afterRender` hooks of a drawn Path2D chunk run in chunk order, only for items in the viewport: an item's
`isInViewport()` decides (a detached connection compares its bounds with the layer's culling viewport while
`BlockConnections` walks its children; without culling, its hit box against the camera), otherwise its bounds do.
Items without bounds always run. The WebGL batch runs no `afterRender` hooks.

Connection labels are not batch items: `BlockConnections` draws them in a label pass right after the batch, and
none while it does not walk its children.

The batch belongs to the component that renders it, usually `BlockConnections`. A child-traversal veto
pauses the children's lifecycle but does not hide their batched paths; a parent that wants to hide them
does not draw its batch, or its items hide themselves through `isRenderAllowed()`.

## Batch Management Methods

The batch (`context.batch` of the connections, an `IConnectionBatch`) has these methods:

- **`add(item, params)`** registers an item with `{ zIndex, group }`.
- **`update(item, params)`** changes the item's z-level or group, or adds it when it is not registered.
- **`delete(item)`** removes the item.
- **`has(item)`**, **`markDirty(item)`**, **`markBoundsDirty(item)`** and **`forEachItem(visit)`**.

Connections do not call them. The line registers its items in the connection's constructor, calls `update()` from
`line.update()`, which the component runs after every change of its state, props or geometry, and deletes them on
unmount. This ensures that:

- Connections are automatically re-batched when their appearance changes
- Z-index ordering is maintained (selected/hovered connections appear on top)
- Arrows are managed separately from their lines (`showConnectionArrows` adds or removes them)
- Memory is cleaned up when connections are destroyed

Items that are not connections can be added to a Path2D batch: they implement `getPath()` and `style(ctx)` (and
optionally `getPathBounds()`, `isPathVisible()` and `afterRender()`). The WebGL batch draws only connection lines.

## Performance Benefits

The batch rendering system provides significant performance improvements:
- **Reduced Draw Calls**: Hundreds of similar connections are drawn in single operations
- **Efficient State Changes**: Canvas context (colors, line styles) is set once per group
- **Automatic Optimization**: No manual performance tuning required
- **Scalability**: Handles thousands of connections smoothly

## Integration in Custom Connections

When extending BlockConnection, the batch system works automatically. However, if you need to customize batching behavior:

A line builds its path once per geometry change (`Path2DLine.createPath(geometry)`) and returns it from `getPath()`
when a chunk is rebuilt. State, props, endpoint and data changes recompute the geometry and the strokes
automatically. When data that changed elsewhere is read:

- by the geometry or `createPath()`: call `connection.updateGeometry()`. It recomputes the geometry, the paths, the
  bounds, the hit box and the culling bounds and redraws them.
- by the look only (`getStroke()`, `style()`, `getGroup()` or an `isRenderAllowed()` override): call
  `connection.invalidateLine()`. It reads the strokes and the group again.

`batch.markDirty(item)` only rebuilds the chunk from the item's current `getPath()`, which is what custom
non-component items need; `batch.markBoundsDirty(item)` refreshes a chunk's bounds only.

Items should provide `getPathBounds(): readonly [left, top, right, bottom] | undefined` in world
coordinates, covering everything they paint. For connections these bounds come from the line's
`getBounds(geometry)` (the geometry's segments by default), the arrow points and `getAfterRenderBounds()`; a line
whose `createPath()` draws outside the segments overrides `getBounds()`. A chunk with an item without valid bounds is
never culled.

`isPathVisible()` is semantic only; viewport culling is the renderer's job. For connections it is
`isRenderAllowed()`, so one override hides the component's hooks, its line, its arrow and its label. State and props
changes re-evaluate it; other changes call `invalidateLine()`.

### Custom Group Names

The chunk takes its style from its first visible line, so a `style()` that reads more than `getStroke()` puts that
in the group by overriding `getGroup()`:

```typescript
import { BlockConnection, Path2DLine } from "@gravity-ui/graph";
import type { Path2DRenderStyleResult, TConnection } from "@gravity-ui/graph";

type TPriorityConnection = TConnection & { priority?: "high" | "normal" };

class PriorityLine extends Path2DLine {
  public override style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    const result = super.style(ctx);
    if (this.isHigh()) {
      ctx.shadowColor = "rgba(229, 72, 77, 0.6)";
      ctx.shadowBlur = 6;
    }
    return result;
  }

  // style() reads `priority`, which getStroke() does not: it must be part of the group.
  public override getGroup(): string {
    return `${super.getGroup()}/${this.isHigh() ? "high" : "normal"}`;
  }

  private isHigh(): boolean {
    return (this.connection.state as Partial<TPriorityConnection>).priority === "high";
  }
}

class PriorityConnection extends BlockConnection<TPriorityConnection> {
  public static override line = PriorityLine;
}
```

A look that only changes the color, width or dash needs no group override: return it from `getStroke()`.

### Best Practices

1. **Minimize Group Variations**: Too many unique groups reduce batching efficiency; per-connection styles on large
   graphs are cheaper with `WebGLLine`, which keeps the style in each instance
2. **Describe the look with `getStroke()`**: its default group follows the stroke; override `style()` and
   `getGroup()` together only for what a stroke cannot say
3. **Prefer geometries to paths**: a custom `static geometry` is drawn, bounded and hit-tested by both renderers

## Troubleshooting

### Performance Issues

If you notice performance problems with custom connections:

1. Check group name uniqueness - too many unique groups prevent batching
2. Check for dashes on large canvas graphs: a still dash is rasterized along the whole curve; WebGL draws it per pixel
3. Check `graph.getGraphLayer().$connectionsRenderer`: `"webgl-fallback"` means a WebGL line class is drawn by Path2D

### Visual Artifacts

If connections render incorrectly:

1. Verify that `style()` sets the canvas context from `getStroke()` and that `getGroup()` covers all else it reads
2. Check that `createPath()` returns a valid Path2D and that `getBounds()` covers it
3. Ensure Z-index values are appropriate for layering

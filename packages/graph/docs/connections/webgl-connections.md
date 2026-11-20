# Connection lines, geometry and effects

## Choosing a renderer

A graph uses Canvas2D by default. Switch the running graph to WebGL2 with one call. Blocks, anchors and built-in
connections switch together. The same connection objects keep their geometry, arrows, labels and hit targets.

```typescript
graph.scene.setRenderer("webgl");

// Later, switch the same graph back to Canvas2D.
graph.scene.setRenderer("canvas");
```

To start in WebGL, set `settings.renderer` to `"webgl"` when creating the graph. The stock straight, Bézier and
multipoint routes use the graph's renderer automatically. Tag rules can change their appearance and apply a shader
effect to the shaft. Canvas draws the static stroke.

A custom connection has two independent extension points:

- Override `static geometry` for a different route. Both scene renderers use its world-space segments and arrow
  for drawing, bounds and hit testing.
- Override `static line` **only when supplying your own line class**. A `SceneLine` subclass can compute the shaft
  and arrow strokes from connection data once for both renderers. For a status, selection or hover style, a
  [scene rule](#scene-styles) can usually style the stock line directly.

If a line overrides [imperative Canvas hooks](#imperative-canvas-hooks), its connection draws in the GraphLayer
Canvas2D batch even when the scene is in WebGL. The same applies to an immediate-mode connection and to custom
Canvas decorations in `afterRender()`, `renderLabel()` or `renderLabelText()`.

## Scene styles

Built-in connections declare the parts `line`, `arrow`, `labelBackground` and `label`. Write a tag on the
`connection` entity and use a scene rule to style a part. A matching tag rule overrides a color from
`styles.background` in the connection data.

```ts
import { BlockConnection, defineTag } from "@gravity-ui/graph";

const running = defineTag("running");
graph.scene.styles.add([
  { target: BlockConnection, tags: [running], style: { parts: { line: { color: "#39a96b" } } } },
]);
graph.scene.tags.add(running, { connection: [connectionId] });
```

Use `width: { px: 3, maxWorld: 20 }` for a stroke sized in screen pixels with a world-unit cap. Both renderers
and the hit test resolve that width at the current zoom. A rule can also hide a part or set `opacity` or `dim`.
Color and dim changes can use the WebGL style table without rebuilding the route. The default selection and hover
rules raise the connection one bucket.

A rule can set `parts.line.effect` to an effect use such as `flow.use(params)`, or set it to `null` to disable an
effect. `SceneLine.getStroke()` can also supply one. Canvas draws the base stroke with the matching paint rules.
For a built-in moving dash, see [Show a running ETL step](../system/tags-and-styles.md#show-a-running-etl-step).
For a custom pattern on a stock connection, see [Writing a tagged shader effect](#writing-a-tagged-shader-effect).

## Lines

Both renderers draw a base stroke with lengths in world units:

```typescript
type TLineStroke = { color: string; width: number; dash?: { pattern: readonly number[] } };
```

`SceneLine` extends `ConnectionLine`. Its `this.connection` is the connection component, typed by the line's type
parameter (`class MyLine extends SceneLine<MyConnection>`), so a line can call your connection's own methods.

| Method | Default |
|---|---|
| `getStroke(state)` | The connection color (`styles.background` first), width 2, dash from `dashed` and `styles.dashes` (`[6, 4]` without them), with hover and selection applied by `withInteraction()` |
| `withInteraction(stroke, state)` | Protected helper: a hovered or selected line is 2 units wider and a selected one takes the selection color (`styles.selectedBackground` first); the dash and the effect stay. On a `SceneLine`, an effect gets the line's own color back and shows the selection |
| `getArrowStroke(state)` | The line's color and width without the dash; a closed arrow is filled with the color |
| `getBounds(geometry)` | Bounds of the geometry's segments (the control-point hull with `EXP_USE_TIGHT_BEZIER_BOUNDS = false`); the component adds the arrow, the label and `getAfterRenderBounds()`, and pads them by half the stroke width for culling (the arrow by half its width times the canvas miter limit) |
| `hitTest(x, y, threshold)` | See [Hit testing](#hit-testing) |

**Hover and selection** preserve the default dash pattern and effect. `withInteraction()`, and the default stroke built on it, makes a hovered or selected line 2 units wider
and gives a selected one the selection color; whatever stroke `getStroke()` returns is drawn as it is, its arrow and
by both scene renderers. One exception: on a `SceneLine`, an effect whose stroke still has
the selection color `withInteraction()` applied gets the line's own color back and shows the selection itself through
`f.hovered`, `f.selected` and `f.selectionColor` (see
[Hover and selection in effects](#hover-and-selection-in-effects)), so `{ ...super.getStroke(state), effect }` runs
the effect over the connection's color. Build a custom look with `withInteraction()` and it follows the same rule as
the default stroke — `return this.withInteraction({ color: "#2f7cf6", width: 6, effect: flow.use(input) }, state)`.
Returning `super.getStroke(state)` for hovered or selected connections would replace the look with the default line.

**Update protocol.** When a connection changes, it reads `getStroke()` and `getArrowStroke()` and updates its
scene primitives or Canvas batch items. The state carries the connection's data,
custom fields included, so a stroke computed from the state follows the store with no extra work:

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TLineStroke } from "@gravity-ui/graph";

type TStatusConnection = TConnection & { status?: "ok" | "failed" };

class StatusLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const { status } = state as Partial<TStatusConnection>;
    if (status !== "failed") return super.getStroke(state);
    // The status sets the style; hover and selection still change only the color and the width.
    return this.withInteraction({ color: "#e5484d", width: 2, dash: { pattern: [6, 4] } }, state);
  }
}

class StatusConnection extends BlockConnection<TStatusConnection> {
  public static override line = StatusLine;
}

graph.updateSettings({ connection: StatusConnection });

// The scene updates the stroke from the new state.
const patch: Partial<TStatusConnection> = { status: "failed" };
graph.api.updateConnection("connection-1", patch);
```

A look that depends on data outside the connection's store (an external signal or map) calls
`connection.invalidateLine()` when that data changes. It reads the strokes again and re-evaluates an
`isRenderAllowed()` override, for the line, its arrow and the label; when a stroke width changes, the bounds and the
hit box follow:

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TLineStroke } from "@gravity-ui/graph";

/** Colors by connection id, kept outside the graph's store. */
const highlights = new Map<string, string>();

class HighlightLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const highlight = highlights.get(String(state.id));
    if (!highlight) return super.getStroke(state);
    const { dash } = super.getStroke(state);
    return this.withInteraction({ color: highlight, width: 2, dash }, state);
  }
}

class HighlightConnection extends BlockConnection {
  public static override line = HighlightLine;
}

function highlight(id: string, color: string): void {
  highlights.set(id, color);
  const view = graph.rootStore.connectionsList.getConnectionState(id)?.getViewComponent();
  if (view instanceof BlockConnection) view.invalidateLine();
}
```

### Scene strokes

A `SceneLine` supplies the geometry and stroke to the scene. Its WebGL path and analytic hit test use the
segment array directly. Its stroke type extends `TLineStroke` with an optional effect:

```typescript
type TSceneLineStroke = TLineStroke & { effect?: TSceneEffectUse<"path"> };
```

- The arrow is drawn with `getArrowStroke()`, never with the effect.
- Dash patterns of up to 4 numbers are drawn as canvas `setLineDash` draws them; an odd-length list is repeated, so
  `[a, b, c]` counts as 6 numbers. A longer pattern draws its first 4 numbers in WebGL, with one development-build
  warning. Canvas2D draws the full base dash pattern.
- Hit tests are computed from the geometry (see [Hit testing](#hit-testing)).

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TSceneLineStroke } from "@gravity-ui/graph";

type TWeightedConnection = TConnection & { weight?: number };

/** A width from the data, the color from `styles.background` (the default) and a still dash. */
class WeightedLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    const stroke = super.getStroke(state);
    const { weight = 1 } = state as Partial<TWeightedConnection>;
    return { ...stroke, width: stroke.width * weight, dash: { pattern: [12, 8] } };
  }
}

class WeightedConnection extends BlockConnection<TWeightedConnection> {
  public static override line = WeightedLine;
}
```

### Imperative Canvas hooks

For a gradient, shadow, fill or arbitrary `Path2D`, override a Canvas drawing hook on `SceneLine`.
The [Canvas compatibility batch](batch-rendering.md) then draws that connection using your hook.

| Member | Use |
|---|---|
| `createPath(geometry)`, `createArrowPath(geometry)` (protected) | Default: a `Path2D` of the geometry's segments and of its arrow. Override for any Canvas2D shape. The result is kept until the geometry changes |
| `style(ctx)`, `styleArrow(ctx)` | Default: apply `getStroke()` / `getArrowStroke()` and return `{ type: "stroke" }` (`"both"` for a closed arrow). Override for gradients, shadows or fills |
| `getGroup()` | The batch group: lines of one group share one `style()` call. Default: from `getStroke()`. A `style()` that reads more than `getStroke()` must override `getGroup()` too |
| `getBounds(geometry)` | Override when `createPath()` draws outside the geometry's segments |

A custom path keeps the geometry for everything else: the arrow comes from the geometry, and hit testing runs
`isPointInStroke` on your path. Override `getBounds()` when the path reaches outside the geometry's segments:

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { TConnectionGeometry, TPathBounds } from "@gravity-ui/graph";

const RING_RADIUS = 4;

/** The line and a ring around its source: a Canvas2D shape on top of the geometry. */
class SourceRingLine extends SceneLine {
  protected override createPath(geometry: TConnectionGeometry): Path2D {
    const path = super.createPath(geometry);
    const x = geometry.segments[0];
    const y = geometry.segments[1];
    path.moveTo(x + RING_RADIUS, y);
    path.arc(x, y, RING_RADIUS, 0, 2 * Math.PI);
    return path;
  }

  /** The ring reaches outside the segments: the bounds cover it for culling and the hit box. */
  public override getBounds(geometry: TConnectionGeometry): TPathBounds | undefined {
    const bounds = super.getBounds(geometry);
    if (!bounds) return undefined;
    const x = geometry.segments[0];
    const y = geometry.segments[1];
    return [
      Math.min(bounds[0], x - RING_RADIUS),
      Math.min(bounds[1], y - RING_RADIUS),
      Math.max(bounds[2], x + RING_RADIUS),
      Math.max(bounds[3], y + RING_RADIUS),
    ];
  }
}

class SourceRingConnection extends BlockConnection {
  public static override line = SourceRingLine;
}
```

Lines of one group are drawn with one `stroke()` per chunk, styled by the chunk's first visible line. A `style()` that
depends on more than the stroke puts that in the group, here at the price of one `stroke()` per connection:

```typescript
import { BlockConnection, SceneLine } from "@gravity-ui/graph";
import type { Path2DRenderStyleResult } from "@gravity-ui/graph";

/** A gradient from the source to the target: style() reads the geometry. */
class GradientCanvasLine extends SceneLine {
  public override style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    const result = super.style(ctx); // width and dash from getStroke()
    const segments = this.connection.getGeometry()?.segments;
    if (segments && segments.length >= 8) {
      const end = segments.length - 2;
      const gradient = ctx.createLinearGradient(segments[0], segments[1], segments[end], segments[end + 1]);
      gradient.addColorStop(0, "#2f7cf6");
      gradient.addColorStop(1, "#f28e2b");
      ctx.strokeStyle = gradient;
    }
    return result;
  }

  /** Every connection has its own gradient, so every connection is a group of its own. */
  public override getGroup(): string {
    return `gradient/${this.connection.props.id}`;
  }
}

class GradientCanvasConnection extends BlockConnection {
  public static override line = GradientCanvasLine;
}
```

The WebGL example passes both colors as effect parameters. Choose the gradient effect in
[Nirvana effects](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--nirvana-effects) to see the scene batch connections that share it.

## Geometry

```typescript
/** What a geometry reads: plain data, so a geometry is testable without a component. */
type TConnectionGeometryInput = {
  source: TPoint; // connectionPoints[0]
  target: TPoint; // connectionPoints[1]
  sourceDelegated?: boolean;
  targetDelegated?: boolean;
  points: readonly TPoint[]; // stored route, including its endpoints when supplied
  useBezier: boolean;
  bezierDirection: "horizontal" | "vertical";
  connection: Readonly<TConnection>; // raw data, for custom geometries
};

type TConnectionGeometry = {
  /** Cubic Bézier segments, 8 numbers each (p0, c1, c2, p3), world units; a dash runs on across them. */
  segments: Float32Array;
  /** Open: stroked like the line (a chevron). Closed: filled and stroked (a triangle). */
  arrow?: { points: Float32Array; closed: boolean };
};

type TConnectionGeometryFn = (input: TConnectionGeometryInput) => TConnectionGeometry | undefined;
```

- The component runs the geometry when its input changes: a moved port, changed props (the Bézier settings) or any
  change of the connection's data in the store. It keeps the result until then; a geometry must be pure.
- `undefined` means no geometry: the connection is neither drawn nor hit. A connection whose ports are not resolved
  has no endpoints and so no geometry.
- `arrow.points` are x, y pairs in world units. The arrow is optional: without it, none is drawn. The points of a
  closed arrow must form a convex polygon: WebGL fills it as a triangle fan.
- `connection.getGeometry()` returns the current result.

Library geometries:

| Geometry | Shape |
|---|---|
| `blockGeometry` (default) | `bezierGeometry` or `straightGeometry` by `useBezierConnections` |
| `straightGeometry` | A straight line between the ports with a chevron in the middle, whatever `useBezierConnections` says |
| `bezierGeometry` | A Bézier curve between the ports along `bezierDirection`, with a chevron in the middle, whatever `useBezierConnections` says |
| `multipointGeometry` | A polyline through `points` with rounded corners (maximum radius 10) and a closed triangle at the end; `blockGeometry` without `points`, no shape when all supplied points coincide |
| `bezierMultipointGeometry` | The same with Bézier pieces; pieces along the direction stay straight |

Builders for custom geometries return plain arrays of 8 numbers per segment; concatenate them into a `Float32Array`:
`lineSegment(from, to)`, `bezierSegment(p0, c1, c2, p3)` and `roundedPolyline(points, radius)` (corners rounded with
cubic arcs of at most `radius`). `SEGMENT_FLOATS` is 8; `isLineSegment(segments, offset)` tells whether a segment is a
straight line built like `lineSegment`; `getSegmentsBounds(segments, tight)`, `createSegmentsPath(segments)` and
`createArrowPath(arrow)` are what the lines use.

```typescript
import { BlockConnection, getTriangleArrowPoints, roundedPolyline } from "@gravity-ui/graph";
import type { TConnectionGeometryFn } from "@gravity-ui/graph";

/** Right angles through the middle, rounded corners and a closed arrow at the target. */
const elbowGeometry: TConnectionGeometryFn = ({ source, target }) => {
  const midX = (source.x + target.x) / 2;
  const points = [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
  // The last piece is horizontal unless the ports are above each other.
  const [tip, left, right] = getTriangleArrowPoints(midX === target.x ? source : points[2], target, 12, 8);
  return {
    segments: new Float32Array(roundedPolyline(points, 8)),
    arrow: { points: new Float32Array([tip.x, tip.y, left.x, left.y, right.x, right.y]), closed: true },
  };
};

// Path2D or WebGL: both draw, bound and hit-test the same shape.
class ElbowConnection extends BlockConnection {
  public static override geometry = elbowGeometry;
}
```

### Per-connection shapes

A graph has one connection class and so one geometry function, but the function sees each connection's data and can
pick a shape per connection. Both scene renderers use the returned segments:

```typescript
import { BlockConnection, bezierGeometry, multipointGeometry } from "@gravity-ui/graph";
import type { TConnection, TConnectionGeometryFn, TMultipointConnection } from "@gravity-ui/graph";

type TMyConnection = TMultipointConnection & { kind?: "polyline" | "bezier" };

function isPolyline(connection: Readonly<TConnection>): connection is Readonly<TMyConnection> {
  return (connection as Partial<TMyConnection>).kind === "polyline";
}

const mixedGeometry: TConnectionGeometryFn = (input) =>
  isPolyline(input.connection) ? multipointGeometry(input) : bezierGeometry(input);

class MyConnection extends BlockConnection<TMyConnection> {
  public static override geometry = mixedGeometry;
}
```

Branches use the fixed `straightGeometry` / `bezierGeometry`, not `blockGeometry`, so a branch keeps its shape when
`useBezierConnections` is off. `input.connection` is typed as `TConnection`: a geometry generic in the connection's
data cannot be assigned to `static geometry` under strict function types, so a geometry narrows the data with a type
guard. A change of `kind` in the store recomputes the geometry.

### Multipoint connections

`MultipointConnection` and `BezierMultipointConnection` are `BlockConnection` subclasses with
`static geometry = multipointGeometry` / `bezierMultipointGeometry`. Any connection class can use these geometries,
and the ready classes take any line. When a port delegates, the stock geometries use its resolved position
for that end of the route and preserve the stored points. On expansion the original route is available again.
For a stock rounded polyline, the arrow follows the final nonzero segment even if the endpoint is repeated.

Use the stock class in the graph settings and supply the full route, including its two endpoints, in
`connections[].points`. The coordinates are in graph space. A layout that moves a block can publish the
updated route through `graph.updateEntities()`.

```typescript
import { Graph, MultipointConnection } from "@gravity-ui/graph";

const graph = new Graph({
  settings: { renderer: "webgl", connection: MultipointConnection },
});
```

Open [Multipoint route in Storybook](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--multipoint-route)
to compare a solid stroke, a static dash and a running dash on the same route. A `parts.line` rule styles its
entire shaft. Use `parts.arrow` for the arrow. On WebGL, `dashFlow` uses the accumulated distance from the
source, so the pattern continues around bends. Canvas and image export show the base stroke. Click any segment
to select the connection, including in a gap between dashes. To vary color along a single route, a
[custom effect](#writing-a-tagged-shader-effect) can use `f.t` (0 at the source, 1 at the target).

## Effects

Define a path effect once at module scope with `defineSceneEffect({ kind: "path", ... })`. Assign
`effect.use(input)` to a scene rule's `parts.line.effect` or to the stroke returned by a custom line's `getStroke()`.
The [WebGL scene effect types](../system/scene-effects.md#path-effect-types) describe definitions, uniforms and scale
bounds. See [Per-path parameters](../system/scene-effects.md#per-path-parameters) for how `.use()` maps values to
`f.params0` and `f.params1`.

The shader source and its uniform declarations identify the program. Clones share the program and have independent
uniform signals. Custom path effects batch uses of the same effect instance with matching scale bounds, so distinct
per-connection bounds can increase draw calls.

An idle WebGL renderer stays idle when a uniform changes and every use of that effect in the graph is outside
its scale range. The effect draws with the latest values when the camera re-enters an active range.

### Writing a tagged shader effect

To show the direction of a transfer, draw a bright band that travels from source to target. This example uses a
stock connection. `graph` is your graph instance and `connectionId` identifies the transfer's existing connection.

```ts
import { BlockConnection, defineSceneEffect, defineTag } from "@gravity-ui/graph";

const transferring = defineTag("transferring");
const movingBand = defineSceneEffect({
  kind: "path",
  animated: true,
  encode: ({ spacing, speed }: { spacing: number; speed: number }) => [spacing, speed],
  uniforms: { strength: { type: "float", value: 0.75 } },
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      float spacing = max(f.params0.x, 1.0);
      float phase = fract((f.along - f.time * f.params0.y) / spacing);
      float band = 1.0 - smoothstep(0.0, 0.2, abs(phase - 0.5));
      vec4 base = f.selected > 0.5 ? f.selectionColor : color;
      return vec4(mix(base.rgb, vec3(1.0), band * u_strength), base.a);
    }`,
});

// Install the rule once for this graph.
const removeStyle = graph.scene.styles.add([{
  target: BlockConnection,
  tags: [transferring],
  style: {
    parts: {
      line: {
        color: "#257a52",
        width: 4,
        effect: movingBand.use({ spacing: 80, speed: 40 }, { minScale: 0.25 }),
      },
    },
  },
}]);

// When the transfer starts:
graph.scene.tags.add(transferring, { connection: [connectionId] });
```

`encode` puts the parameters in the order the shader reads them. Here the bands are 80 world units apart and move
40 world units per second. WebGL supplies the elapsed time in `f.time` on each animation frame. Canvas and WebGL
below scale 0.25 draw the static stroke. The rule styles only the shaft, so the arrow and label keep their own styles.

Set `movingBand.uniforms.strength.value = 0.3` to soften the band on every connection using this effect instance.
When the transfer ends, call `graph.scene.tags.delete(transferring, { connection: [connectionId] })` to restore
the styles that apply without the tag. Call `removeStyle()` when the graph no longer needs the rule.

### Three levels of control

1. **Whether** a connection has the effect: match a tag in a scene style rule, or check the connection state in a custom line's `getStroke()`.
2. **Per-connection values:** `params`, up to 8 numbers from `use()`, read as `f.params0` and `f.params1`. A change
   updates the affected connection's scene records.
3. **Values shared by every connection with the effect:** uniforms. Writing one schedules one redraw and touches no
   buffer.

The levels combine. Here running jobs have the effect, critical ones breathe (a flag in `params`, the breathing from
`f.time`), and a slider sets the brightness of all of them (a uniform):

```typescript
import { BlockConnection, SceneLine, defineSceneEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TSceneLineStroke } from "@gravity-ui/graph";

type TJobConnection = TConnection & { running?: boolean; critical?: boolean };

// Ignores f.selected: a selected job shows the selection by its width only.
const activity = defineSceneEffect({
  kind: "path",
  animated: true, // reads f.time
  uniforms: { brightness: { type: "float", value: 1 } },
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      float breath = 0.6 + 0.4 * sin(f.time * 3.0);
      // params0.x is 1 for critical connections: only they breathe.
      float alpha = color.a * mix(1.0, breath, f.params0.x);
      return vec4(min(color.rgb * u_brightness, vec3(1.0)), alpha);
    }`,
  encode: ({ critical }: { critical: boolean }) => [critical ? 1 : 0],
});

class JobLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    const stroke = super.getStroke(state);
    const job = state as Partial<TJobConnection>;
    // 1. Whether: only running jobs have the effect.
    if (!job.running) return stroke;
    // 2. Per connection: params from use().
    return { ...stroke, effect: activity.use({ critical: job.critical === true }) };
  }
}

class JobConnection extends BlockConnection<TJobConnection> {
  public static override line = JobLine;
}

graph.updateSettings({ connection: JobConnection });

// 3. Shared: one redraw, no buffer is re-encoded.
activity.uniforms.brightness.value = 0.7;
```

A vector uniform takes a new array (`effect.uniforms.tint.value = [1, 0.6, 0.6]`): the signal compares by identity,
so changing the array in place redraws nothing. The scene subscribes to the effect's uniforms and supplies their current values to the shader.

**`clone()`** gives the same source its own uniform values: one program, separate values, for another graph. Effects with independent uniforms can require separate draws. Reuse the instance across connections
or clone it once for each independent set of uniforms. A development build warns when more than 64 instances
share a source.

```typescript
import { BlockConnection, SceneLine, defineSceneEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TSceneEffect, TSceneLineStroke } from "@gravity-ui/graph";

// Ignores f.selected: a selected line shows the selection by its width only.
const tint = defineSceneEffect({
  kind: "path",
  uniforms: { tint: { type: "vec3", value: [1, 1, 1] } },
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      return vec4(color.rgb * u_tint, color.a);
    }`,
});

/** A connection class drawn with the given effect object. */
function createTintedConnection(effect: TSceneEffect<"path", { tint: "vec3" }>): typeof BlockConnection<TConnection> {
  class TintedLine extends SceneLine {
    public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
      return { ...super.getStroke(state), effect: effect.use([]) };
    }
  }
  return class TintedConnection extends BlockConnection {
    public static override line = TintedLine;
  };
}

// The other graph gets a clone: one shared program, its own tint.
const otherTint = tint.clone();
otherTint.uniforms.tint.value = [1, 0.6, 0.6];
graph.updateSettings({ connection: createTintedConnection(tint) });
otherGraph.updateSettings({ connection: createTintedConnection(otherTint) });
```

### Glows: `extraWidth`

Without `extraWidth` the library multiplies the effect's alpha by `f.coverage`, the anti-aliased coverage of the
stroke: an effect only recolors the stroke's own pixels. With `extraWidth` the drawn quad is wider by that many CSS
pixels on each side, only its outer edge is anti-aliased, and the effect composes the stroke's edge itself with
`f.coverage`:

```typescript
import { BlockConnection, SceneLine, defineSceneEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TSceneLineStroke } from "@gravity-ui/graph";

const glow = defineSceneEffect({
  kind: "path",
  extraWidth: 6, // CSS pixels drawn outside each side of the stroke
  uniforms: { intensity: { type: "float", value: 0.6 } },
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      float outside = max(abs(f.across) - f.halfWidth, 0.0) / f.extraWidth;
      float falloff = pow(1.0 - clamp(outside, 0.0, 1.0), 2.0);
      // Selected, the halo takes the selection color at a stronger intensity; the line keeps its color.
      vec4 halo = f.selected > 0.5
        ? vec4(f.selectionColor.rgb, f.selectionColor.a * min(u_intensity + 0.4, 1.0) * falloff)
        : vec4(color.rgb, color.a * u_intensity * falloff);
      return mix(halo, color, f.coverage);
    }`,
});

class GlowLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    return this.withInteraction({ color: "#2f7cf6", width: 3, effect: glow.use([]) }, state);
  }
}

class GlowConnection extends BlockConnection {
  public static override line = GlowLine;
}
```

- `extraWidth` is a constant of the effect; a glow size per connection goes through `params`, within `extraWidth`.
- Culling includes the halo while the effect is active. Hit testing uses the shaft width.
- It costs fragments: at DPR 2, a line 2 CSS pixels wide with `extraWidth: 6` shades a band 15 CSS pixels wide
  instead of 3.

### Hover and selection in effects

`PathFragment` carries the connection's interaction: `f.hovered` and `f.selected` are 1.0 or 0.0 (usable as
`mix()` weights), and `f.selectionColor` is the straight RGBA of its selection color (`styles.selectedBackground` or
the theme's `colors.connection.selectedBackground`), whatever the state. A selected line built with
`withInteraction()` comes in with its own stroke color, so the effect decides how the selection looks: the library's
`dashFlow` fills its gaps with the selection color and `pulse` dims to it. Here the faint trace of particles turns
into the selection color and the particles keep theirs. The scene paints the base stroke on Canvas. The optional
callback supplies a dotted stroke for the [Canvas compatibility batch](#fallback-strokes).

```typescript
import { BlockConnection, SceneLine, defineSceneEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TSceneLineStroke } from "@gravity-ui/graph";

export const particles = defineSceneEffect({
  kind: "path",
  animated: true,
  uniforms: { speed: { type: "float", value: 1 } },
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      float spacing = f.params0.x;
      float offset = mod(f.along - f.time * f.params0.y * u_speed, spacing) - spacing * 0.5;
      float dist = length(vec2(offset * f.scale, f.across));
      float particle = 1.0 - smoothstep(f.halfWidth - 1.0, f.halfWidth, dist);
      // The trace: faint in the line's color; selected, the selection color.
      vec4 trace = f.selected > 0.5
        ? vec4(f.selectionColor.rgb, f.selectionColor.a * 0.6)
        : vec4(color.rgb, color.a * 0.12);
      // The particles over the trace, in the line's color.
      return mix(trace, vec4(color.rgb, 1.0), color.a * particle);
    }`,
  encode: ({ spacing, speed }: { spacing: number; speed: number }) => [spacing, speed],
  // An imperative Canvas connection using this effect draws a thin dotted line.
  fallback: (stroke, params) => ({ ...stroke, width: 2, dash: { pattern: [2, Math.max(params[0] - 2, 2)] } }),
});

class ParticlesLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    const effect = particles.use({ spacing: 120, speed: 100 });
    // Selected, 2 units wider; the effect gets #2f7cf6 back and draws the selection.
    return this.withInteraction({ color: "#2f7cf6", width: 14, effect }, state);
  }
}

class ParticlesConnection extends BlockConnection {
  public static override line = ParticlesLine;
}
```

- The arrow and the Path2D fallback have no effect: they are drawn from the stroke, in the selection color of a
  selected line of `withInteraction()`.
- A stroke whose color is set after `withInteraction()`, or one built without it, is drawn as returned; its effect
  still reads `f.hovered`, `f.selected` and `f.selectionColor`.
- An effect that ignores them shows the selection by the width only.

### Fallback strokes

Canvas2D paints the base stroke returned by `getStroke()`. Put a static dash in that stroke if the Canvas version
should be dashed too. The compatibility Canvas batch uses an effect's fallback stroke inside its activity range and
the base stroke outside it.

## Shader contract

Path effects receive a [`PathFragment`](../system/scene-effects.md#pathfragment). That reference lists the GLSL
fields, units, color pipeline and version macro. See
[the shared example](../system/scene-effects.md#one-effect-on-a-connection-and-a-block-outline) for using the same
effect on a connection and a block contour.

## Library effects and helpers

Built with the public API above:

```typescript
import { BlockConnection, SceneLine, dashFlow, pulse } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TSceneLineStroke } from "@gravity-ui/graph";

type TFlowConnection = TConnection & { flow?: "data" | "signal" };

class PipelineLine extends SceneLine {
  public override getStroke(state: TBaseConnectionState): TSceneLineStroke {
    const { flow } = state as Partial<TFlowConnection>;
    if (!flow) return super.getStroke(state);
    // Hover and selection widen the line; selected, the comets run over the selection color and the wave dims to it.
    if (flow === "data") {
      // Comets from the source to the target; a negative speed runs them back.
      const effect = dashFlow.use({ pattern: [90, 160], speed: 120, fade: true });
      return this.withInteraction({ color: "#2f7cf6", width: 6, effect }, state);
    }
    // A brightness wave travelling along x: neighbouring connections pulse in step.
    return this.withInteraction({ color: "#2bb24c", width: 5, effect: pulse.use({ period: 3, wavelength: 24000 }) }, state);
  }
}

class PipelineConnection extends BlockConnection<TFlowConnection> {
  public static override line = PipelineLine;
}
```

- `dashFlow.use({ pattern, speed, fade? })`: a running dash. `pattern` holds the on and off lengths in world units
  (off defaults to on), `speed` is world units per second, negative from the target to the source, and `fade` makes
  each dash a comet with a transparent tail. The effect draws the dash itself, so the base stroke has no `dash`.
  Selected, the gaps take the selection color and the dashes keep the line's; a comet's tail fades into the selection
  color. The compatibility batch's fallback draws a still dash with the same pattern.
- `pulse.use({ period, wavelength? })`: the line dims to 15% and a crest passes every `period` seconds; with a
  `wavelength` (world units) the crest travels along the x axis, without it the whole line pulses in place. Selected,
  the dim part takes the selection color and the crest keeps the line's. Canvas draws the plain stroke.

GLSL helpers available in every effect program, versioned like `PathFragment`:

| Helper | Returns |
|---|---|
| `float graph_dashPhase(float along, float on, float off, float offset)` | The position in a repeating on/off pattern, `0..on+off`, shifted by `offset`; the dash is where it is below `on` |
| `float graph_comet(float phase, float on, float speed)` | Comet brightness inside a dash (`phase < on`): the head leads in the direction of `speed` |
| `float graph_wave(vec2 world, float time, float period, float wavelength)` | A travelling crest, `0.15..1`; `wavelength` 0 pulses in place |

They combine into new effects, for example comets that pulse:

```typescript
import { defineSceneEffect } from "@gravity-ui/graph";

/** params: dash length and speed; the gap is twice the dash. */
export const pulsingComets = defineSceneEffect({
  kind: "path",
  animated: true,
  fragment: /* glsl */ `
    vec4 effect(PathFragment f, vec4 color) {
      float on = f.params0.x;
      float speed = f.params0.y;
      float phase = graph_dashPhase(f.along, on, on * 2.0, f.time * speed);
      if (phase > on) return vec4(color.rgb, 0.0);
      color.a *= graph_comet(phase, on, speed) * graph_wave(f.world, f.time, 2.0, 0.0);
      return color;
    }`,
  encode: ({ length, speed }: { length: number; speed: number }) => [length, speed],
  fallback: (stroke, params) => ({ ...stroke, dash: { pattern: [params[0], params[0] * 2] } }),
});
```

## Renderer state and fallback

When WebGL2 is unavailable or the scene loses its context, the Canvas2D interpreter draws the scene using the same
geometry and the base strokes of effect lines. The scene manages context restoration.

Read [`graph.scene.$renderer`](../system/scene.md#renderer) to observe the active renderer, loading, fallback and restoration.

## Hit testing

In both renderers, a point hits a connection within `stroke.width / 2 + THRESHOLD_LINE_HIT` world units of
its drawn line (`THRESHOLD_LINE_HIT` is 8 by default: 9 for a 2-unit line, 10 hovered or selected). The arrow is part
of the hit area while arrows are shown, with its own stroke width; a point inside a closed arrow hits too.

- Scene connections use the same analytic hit test in both renderers. Curves flatten to half a CSS pixel.
- A line that overrides a Canvas path hook uses its custom path for hits, with a line width of `width + 2 · threshold`.
- `extraWidth` is not part of the hit area: a glow is decoration.
- Labels keep their own rule: a square of `THRESHOLD_LINE_HIT` screen pixels around the point meets the label.
- The broad phase uses the connection's hit box: the bounds of the line, the arrow (while shown) and the label,
  padded by `THRESHOLD_LINE_HIT` plus half the wider of the line and arrow strokes, so it never cuts the rule off.
  The culling bounds pad the line by half its stroke width as well, so wide strokes are not clipped at the viewport's
  edge.

A line class can override `hitTest(x, y, threshold)`. The point and threshold are in world units.
For a scene line, `super.hitTest(x, y, threshold)` respects the visible parts and their styled widths at the current zoom. A filled custom path, for example, adds `isPointInPath`.

## Draw calls and order

The scene orders connections by z-index and insertion order. The default connection bucket is 100, or 101
while hovered or selected. The shaft, arrow and labels share that element's depth and hit order. The WebGL
backend batches their primitives with the rest of the scene.

With a solid or dashed stroke and no shader effect, a translucent `MultipointConnection` paints each covered
sample once, including at sharp bends, self-crossings and reversals. If a dash ends on a bend tighter than half the
stroke width, WebGL preserves coverage from the incoming segment. Some Canvas 2D rasterizers leave a small gap
on the inside of that bend. Separate connections blend in scene order. Dashes keep their distance along
the entire route, and a gap remains part of the connection's hit area. WebGL uses the shared pass for
these strokes when the route turns.

Plain strokes, `dashFlow` and `pulse` can share a draw while retaining their individual parameters and scale
ranges. Their animation runs in the shader from the graph clock; mixing these effects does not require rebuilding
connection geometry. For scenes whose translucent paint consists only of these compatible paths, the backend
culls their resident ranges and caches their exact scene order without searching for spatial overlaps.
Custom shaders and other translucent primitives keep their ordering barriers in the shared pass.

When all visible connection roots are below the other visible roots, a large eligible path workload can use an
internal single-sample connection pass in the scene's WebGL context. It draws from the same resident records,
preserves the order of path pieces and joins, and uses the shader's analytic coverage with premultiplied
source-over blending, as the standalone connection renderer did. At overlaps, nominally opaque hairlines can
therefore accumulate coverage differently from the shared multisampled pass.

Frames with interleaved scene order, visible connection labels or filled arrowheads, wide opaque strokes, or
unsupported effect combinations use the shared multisampled pass. A hidden label can stay resident without
affecting eligibility. The backend chooses the pass automatically using the current view and submitted workload.

The Canvas compatibility batch uses the rules in [Batch Rendering](batch-rendering.md).

## Known limits

- Effects apply to the shaft. Arrows use `getArrowStroke()`.
- WebGL dash patterns use their first 4 numbers. Effect parameters are 8 numbers per connection, with `float` and
  `vec2`–`vec4` uniforms.
- Immediate Canvas drawing hooks use the GraphLayer canvas.

## Diagnostics

The scene benchmark measures both renderers using the same scene elements. Its WebGL counters report
draw calls, instances and uploaded bytes for the whole scene.

## See also

- [Connection System](canvas-connection-system.md): creating, styling and customizing connections.
- [Batch Rendering](batch-rendering.md): groups, chunks and culling of custom Canvas lines.
- [Migrating to v2: connection lines and geometry](../migration-guides/v1-to-v2.md#connection-lines-and-geometry).
- **Scene → Examples → Connections** includes [Running dash](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--running-dash),
  [Style from connection data](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--per-connection-style) and the editable ETL pipeline.
- [Scene diagnostics](../system/scene.md#explore-the-scene-in-storybook) covers load, stroke coverage, camera motion and HTML handover.

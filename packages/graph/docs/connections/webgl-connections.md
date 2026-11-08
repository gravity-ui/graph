# Connection Lines, Geometry and WebGL

How a `BlockConnection` draws its line: a geometry function describes the shape, a line class describes the look and
picks the renderer (Canvas2D `Path2D` or WebGL2), and WebGL lines can carry shader effects. This page covers choosing
a renderer, writing lines, geometries and effects, the shader contract, the fallback, hit testing and performance.

A `BlockConnection` is made of three parts, each with one job:

- **The component** (`BlockConnection` or your subclass): data and state, click, hover and selection, z-level and
  the label. It decides when the geometry is recomputed (a moved port, changed props such as the Bézier settings,
  any change of the connection's data in the store) and reports bounds for culling and hit testing.
- **The geometry** (`static geometry`): a pure function from the endpoints, `points` and the connection's data to
  cubic Bézier segments and an arrow, in world coordinates. Bounds, the arrow position and hit testing derive from it.
- **The line** (`static line`): one object per connection, created by the component in its constructor. It owns the
  look (`getStroke()`), the contract of its renderer and the connection's batch items: the line and its arrow.

```typescript
import { BlockConnection, Path2DLine, WebGLLine, blockGeometry } from "@gravity-ui/graph";

// The defaults spelled out: Path2D lines, a Bézier or straight shape by `useBezierConnections`.
class CanvasConnection extends BlockConnection {
  public static override line = Path2DLine;
  public static override geometry = blockGeometry;
}

// The same shape drawn with WebGL: the whole graph switches to WebGL.
class GLConnection extends BlockConnection {
  public static override line = WebGLLine;
}

graph.updateSettings({ connection: GLConnection });
```

Lines and geometries compose: a geometry is written once, and both line kinds draw, bound and hit-test it.

## Choosing a renderer

The kind of the connection class's line is the only source of the renderer:

| `static line` | Renderer | What it draws |
|---|---|---|
| `Path2DLine` (default) or a subclass | Canvas2D `Path2D` on the graph layer's canvas | Any Canvas2D shape and style; nothing animates |
| `WebGLLine` or a subclass | WebGL2 on its own canvas, right below the graph layer's canvas | The geometry only, with effects, animated ones included |

One renderer draws every connection of a graph; there is no per-connection or mixed mode. A graph has one connection
class (the `connection` setting), so `graph.updateSettings({ connection })` with a new class remounts every
connection and switches the renderer when the new line's kind differs. Labels are drawn with Canvas2D above every line
with either renderer.

### When WebGL pays off

Choose `WebGLLine` for effects, dashes and per-connection styles on large graphs, not for plain lines. Measured on
Apple M3 Pro, Chromium (ANGLE Metal), DPR 2, a 1600×1000 viewport:

- **Plain lines:** WebGL is not faster than Path2D; it costs 0.1–2 ms more main-thread time per frame.
- **Dashes:** a still dash on canvas costs 655–1611 ms a frame on the Nirvana graph (Storybook
  `NirvanaMaxGraphTest`: 13,916 blocks, Bézier connections) against 8.3 ms with WebGL. Canvas rasterizes the dash
  along the whole curve; WebGL decides per pixel.
- **Per-connection styles:** WebGL is 1.5–2.8× faster when zoomed in. Canvas strokes once per style group, and
  per-connection colors and widths make many groups; WebGL keeps the style in each instance.

## Lines

What both line kinds draw the same way, lengths in world units:

```typescript
type TLineStroke = { color: string; width: number; dash?: { pattern: readonly number[] } };
```

`ConnectionLine` is the base of both kinds. `this.connection` is the connection component, typed by the line's type
parameter (`class MyLine extends Path2DLine<MyConnection>`), so a line can call your connection's own methods.

| Method | Default |
|---|---|
| `getStroke(state)` | Connection colors by state (`styles.background` / `styles.selectedBackground` first), width 2 (4 hovered or selected), dash from `dashed` and `styles.dashes` (`[6, 4]` without them) |
| `getArrowStroke(state)` | The line's color and width without the dash; a closed arrow is filled with the color |
| `getBounds(geometry)` | Bounds of the geometry's segments (the control-point hull with `EXP_USE_TIGHT_BEZIER_BOUNDS = false`); the component adds the arrow, the label and `getAfterRenderBounds()`, and pads them by half the stroke width for culling (the arrow by half its width times the canvas miter limit) |
| `hitTest(x, y, threshold)` | See [Hit testing](#hit-testing) |

**Update protocol.** The component calls `line.update()` when its state, props or geometry change: the line reads
`getStroke()` (and `getArrowStroke()` while arrows are shown) again and tells the batch, which moves the line to its
new style group and z-level (Path2D) or re-encodes its chunk (WebGL). The state carries the connection's data,
custom fields included, so a stroke computed from the state follows the store with no extra work:

```typescript
import { BlockConnection, Path2DLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TLineStroke } from "@gravity-ui/graph";

type TStatusConnection = TConnection & { status?: "ok" | "failed" };

class StatusLine extends Path2DLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const stroke = super.getStroke(state);
    if (state.hovered || state.selected) return stroke;
    const { status } = state as Partial<TStatusConnection>;
    return status === "failed" ? { ...stroke, color: "#e5484d", dash: { pattern: [6, 4] } } : stroke;
  }
}

class StatusConnection extends BlockConnection<TStatusConnection> {
  public static override line = StatusLine;
}

graph.updateSettings({ connection: StatusConnection });

// The line reads getStroke() again and joins the group of its new stroke.
const patch: Partial<TStatusConnection> = { status: "failed" };
graph.api.updateConnection("connection-1", patch);
```

A look that depends on data outside the connection's store (an external signal or map) calls
`connection.invalidateLine()` when that data changes. It reads the strokes again and re-evaluates an
`isRenderAllowed()` override, for the line, its arrow and the label; when a stroke width changes, the bounds and the
hit box follow:

```typescript
import { BlockConnection, Path2DLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TLineStroke } from "@gravity-ui/graph";

/** Colors by connection id, kept outside the graph's store. */
const highlights = new Map<string, string>();

class HighlightLine extends Path2DLine {
  public override getStroke(state: TBaseConnectionState): TLineStroke {
    const stroke = super.getStroke(state);
    return { ...stroke, color: highlights.get(String(state.id)) ?? stroke.color };
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

### `Path2DLine`

`Path2DLine` draws any Canvas2D shape and nothing animates: it has no frame loop. A still dash is allowed, but it is
expensive on large graphs (see [When WebGL pays off](#when-webgl-pays-off)).

| Member | Use |
|---|---|
| `createPath(geometry)`, `createArrowPath(geometry)` (protected) | Default: a `Path2D` of the geometry's segments and of its arrow. Override for any Canvas2D shape. The result is kept until the geometry changes |
| `style(ctx)`, `styleArrow(ctx)` | Default: apply `getStroke()` / `getArrowStroke()` and return `{ type: "stroke" }` (`"both"` for a closed arrow). Override for gradients, shadows or fills |
| `getGroup()` | The batch group: lines of one group share one `style()` call. Default: from `getStroke()`. A `style()` that reads more than `getStroke()` must override `getGroup()` too |
| `getBounds(geometry)` | Override when `createPath()` draws outside the geometry's segments |

A custom path keeps the geometry for everything else: the arrow comes from the geometry, and hit testing runs
`isPointInStroke` on your path. Override `getBounds()` when the path reaches outside the geometry's segments:

```typescript
import { BlockConnection, Path2DLine } from "@gravity-ui/graph";
import type { TConnectionGeometry, TPathBounds } from "@gravity-ui/graph";

const RING_RADIUS = 4;

/** The line and a ring around its source: a Canvas2D shape on top of the geometry. */
class SourceRingLine extends Path2DLine {
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
import { BlockConnection, Path2DLine } from "@gravity-ui/graph";
import type { Path2DRenderStyleResult } from "@gravity-ui/graph";

/** A gradient from the source to the target: style() reads the geometry. */
class GradientCanvasLine extends Path2DLine {
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

The same look in WebGL is an effect with the colors in its parameters (the `Gradient (shader)` option of the Storybook
`Canvas/WebGLConnections` `NirvanaEffects` story), which keeps the draw calls per chunk.

### `WebGLLine`

`WebGLLine` draws the geometry only: no custom shapes, no `Path2D` and no Path2D memory per connection. Its stroke is a
`TWebGLStroke`, the `TLineStroke` plus at most one effect:

```typescript
type TWebGLStroke = TLineStroke & { effect?: TConnectionEffectUse };
```

- The arrow is drawn with `getArrowStroke()`, never with the effect.
- Dash patterns of up to 4 numbers are drawn as canvas `setLineDash` draws them; an odd-length list is repeated, so
  `[a, b, c]` counts as 6 numbers. A longer pattern draws its first 4 numbers in WebGL, with one development-build
  warning; Path2D, the fallback included, draws all of it.
- Hit tests are computed from the geometry (see [Hit testing](#hit-testing)).

```typescript
import { BlockConnection, WebGLLine } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TWebGLStroke } from "@gravity-ui/graph";

type TWeightedConnection = TConnection & { weight?: number };

/** A width from the data, the color from `styles.background` (the default) and a still dash. */
class WeightedLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    const { weight = 1 } = state as Partial<TWeightedConnection>;
    return { ...stroke, width: stroke.width * weight, dash: { pattern: [12, 8] } };
  }
}

class WeightedConnection extends BlockConnection<TWeightedConnection> {
  public static override line = WeightedLine;
}
```

## Geometry

```typescript
/** What a geometry reads: plain data, so a geometry is testable without a component. */
type TConnectionGeometryInput = {
  source: TPoint; // connectionPoints[0]
  target: TPoint; // connectionPoints[1]
  points: readonly TPoint[]; // the connection's `points`, [] without them
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
| `multipointGeometry` | A polyline through `points` with rounded corners (radius 10) and a closed triangle at the end; `blockGeometry` without `points`, none with one point |
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
pick a shape per connection. Connections of different shapes share the batch and its chunks with both renderers:

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
and the ready classes take any line:

```typescript
import { BlockConnection, MultipointConnection, WebGLLine, multipointGeometry } from "@gravity-ui/graph";
import type { TMultipointConnection } from "@gravity-ui/graph";

/** A polyline through `points` on your own connection class. */
class RouteConnection extends BlockConnection<TMultipointConnection> {
  public static override geometry = multipointGeometry;
}

/** The ready class drawn with WebGL; its `labels` need Path2D (see Known limits). */
class WebGLMultipointConnection extends MultipointConnection {
  public static override line = WebGLLine;
}
```

## Effects

An effect recolors the fragments of a WebGL stroke with a GLSL function. `defineConnectionEffect(definition)` returns
an effect object: define it once, at module scope, and refer to it from `getStroke()` with `effect.use(input)`. Effects
are values: nothing is registered or referred to by name.

| Definition field | Meaning |
|---|---|
| `fragment` | GLSL ES 3.00 defining `vec4 effect(ConnectionFragment f, vec4 color)` (see [Shader contract](#shader-contract)) |
| `animated` | Redraw every animation frame while a connection with the effect is drawn: for effects that read `f.time` |
| `uniforms` | `{ name: { type, value } }`, read in GLSL as `u_<name>`; types `"float"`, `"vec2"`, `"vec3"`, `"vec4"`. Values are signals on the effect |
| `extraWidth` | CSS pixels the effect may draw outside each side of the stroke, for glows (default 0) |
| `fallback` | `(stroke, params) => TLineStroke`: the Path2D stroke while WebGL is unavailable. Default: the stroke without the effect |
| `encode` | Typed parameters: packs `use(input)` into the numbers the shader reads. Without it, `use()` takes the numbers |

The effect object has `uniforms` (signals), `use(input)`, which returns `{ effect, params }` for `stroke.effect`, and
`clone()`. A program is compiled on the first draw of its effect and cached by source text (the uniform declarations
and the fragment); clones share it.

### Three levels of control

1. **Whether** a connection has the effect: a condition in the line's `getStroke()`.
2. **Per-connection values:** `params`, up to 8 numbers from `use()`, read as `f.params0` and `f.params1`. A change
   re-encodes only the chunk of that connection (up to `PATH2D_CHUNK_SIZE`, 200 connections).
3. **Values shared by every connection with the effect:** uniforms. Writing one schedules one redraw and touches no
   buffer.

The levels combine. Here running jobs have the effect, critical ones breathe (a flag in `params`, the breathing from
`f.time`), and a slider sets the brightness of all of them (a uniform):

```typescript
import { BlockConnection, WebGLLine, defineConnectionEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TWebGLStroke } from "@gravity-ui/graph";

type TJobConnection = TConnection & { running?: boolean; critical?: boolean };

const activity = defineConnectionEffect({
  animated: true, // reads f.time
  uniforms: { brightness: { type: "float", value: 1 } },
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      float breath = 0.6 + 0.4 * sin(f.time * 3.0);
      // params0.x is 1 for critical connections: only they breathe.
      float alpha = color.a * mix(1.0, breath, f.params0.x);
      return vec4(min(color.rgb * u_brightness, vec3(1.0)), alpha);
    }`,
  encode: ({ critical }: { critical: boolean }) => [critical ? 1 : 0],
});

class JobLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
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
so changing the array in place redraws nothing. The renderer subscribes to the uniforms of the effects in its chunks
and sets their values on the program right before it draws the effect's group.

**`clone()`** gives the same source its own uniform values: one program, separate values, for another graph. Every
effect object is a group of its own, with a draw call in every chunk it is in, so do not define effects or call
`clone()` inside `getStroke()`; past 64 effect objects with one source alive at once, a development build warns.

```typescript
import { BlockConnection, WebGLLine, defineConnectionEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TConnectionEffect, TWebGLStroke } from "@gravity-ui/graph";

const tint = defineConnectionEffect({
  uniforms: { tint: { type: "vec3", value: [1, 1, 1] } },
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      return vec4(color.rgb * u_tint, color.a);
    }`,
});

/** A connection class drawn with the given effect object. */
function createTintedConnection(effect: TConnectionEffect<{ tint: "vec3" }>): typeof BlockConnection<TConnection> {
  class TintedLine extends WebGLLine {
    public override getStroke(state: TBaseConnectionState): TWebGLStroke {
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
import { BlockConnection, WebGLLine, defineConnectionEffect } from "@gravity-ui/graph";
import type { TBaseConnectionState, TWebGLStroke } from "@gravity-ui/graph";

const glow = defineConnectionEffect({
  extraWidth: 6, // CSS pixels drawn outside each side of the stroke
  uniforms: { intensity: { type: "float", value: 0.6 } },
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      float outside = max(abs(f.across) - f.halfWidth, 0.0) / f.extraWidth;
      float glowAlpha = u_intensity * pow(1.0 - clamp(outside, 0.0, 1.0), 2.0);
      return mix(vec4(color.rgb, color.a * glowAlpha), color, f.coverage);
    }`,
});

class GlowLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return { ...super.getStroke(state), color: "#2f7cf6", width: 3, effect: glow.use([]) };
  }
}

class GlowConnection extends BlockConnection {
  public static override line = GlowLine;
}
```

- `extraWidth` is a constant of the effect; a glow size per connection goes through `params`, within `extraWidth`.
- It changes neither hit testing nor the geometry's bounds: the renderer widens its culling rectangle by the widest
  `extraWidth` of the effects it draws, so zooming rebuilds no bounds.
- It costs fragments: at DPR 2, a line 2 CSS pixels wide with `extraWidth: 6` shades a band 15 CSS pixels wide
  instead of 3.

### Fallback strokes

While WebGL is unavailable (see [Fallback](#fallback-and-connectionsrenderer)) Path2D draws each WebGL line with its
effect's `fallback(stroke, params)`, or the stroke without the effect. Nothing animates there. Give an effect a
fallback when its stroke alone looks wrong, such as round particles on a 14 px stroke, which would become a solid band:

```typescript
import { defineConnectionEffect } from "@gravity-ui/graph";

export const particles = defineConnectionEffect({
  animated: true,
  uniforms: { speed: { type: "float", value: 1 } },
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
      float spacing = f.params0.x;
      float offset = mod(f.along - f.time * f.params0.y * u_speed, spacing) - spacing * 0.5;
      float dist = length(vec2(offset * f.scale, f.across));
      float particle = 1.0 - smoothstep(f.halfWidth - 1.0, f.halfWidth, dist);
      return vec4(color.rgb, color.a * max(particle, 0.12));
    }`,
  encode: ({ spacing, speed }: { spacing: number; speed: number }) => [spacing, speed],
  // Path2D draws a thin dotted line instead of a 14 px band.
  fallback: (stroke, params) => ({ ...stroke, width: 2, dash: { pattern: [2, Math.max(params[0] - 2, 2)] } }),
});
```

### Errors and warnings

- A fragment that fails to compile or link reports one console error per source text, in every build, with the
  compiler log; line numbers count from the first line of the effect's own text. Its connections are drawn with the
  plain stroke in WebGL; the graph stays on WebGL.
- A uniform value of the wrong type or length reports one development-build error and is not applied.
- More than 8 `params` are dropped with one development-build warning.
- More than 64 effect objects with one source text alive at once report one development-build warning:
  `defineConnectionEffect()` or `clone()` is called per connection. Objects of unmounted graphs stop counting once
  they are garbage-collected.
- `defineConnectionEffect()` throws for a uniform name other than letters, digits and underscores (starting with a
  letter) and for an `extraWidth` that is negative or not finite. `stroke.effect` must come from `use()` of an object
  created by `defineConnectionEffect()`.

## Shader contract

An effect defines `vec4 effect(ConnectionFragment f, vec4 color)`. The library writes `#version 300 es` and
`precision highp float` (effects must not) and declares, before the effect's source, the contract below and the
helpers of [Library effects and helpers](#library-effects-and-helpers):

```glsl
#define GRAPH_CONNECTION_FRAGMENT 1
struct ConnectionFragment {
  float along;       // world units from the source, continuous across segments
  float length;      // the whole connection's length, world units
  float t;           // along / length: 0 at the source, 1 at the target
  float across;      // CSS pixels from the center line, signed
  float halfWidth;   // half the drawn stroke width, CSS pixels
  float extraWidth;  // the effect's extraWidth, CSS pixels (0 without)
  float coverage;    // 0..1: how much of the pixel the stroke itself covers, anti-aliased
  float scale;       // CSS pixels per world unit
  vec2 world;        // the fragment's world position
  float time;        // seconds since the renderer started
  vec4 params0;      // params[0..3]
  vec4 params1;      // params[4..7]
};
```

`along` is monotonic and continuous, not the exact arc length: within a curve piece it is linear in the curve
parameter, so dash steps can vary slightly on long bends.

**Color pipeline.**

1. The base stroke's still `dash` discards the pixels in its gaps: an effect never draws there.
2. `color = effect(f, color)`; `color` comes in as the stroke color. Both are straight (not premultiplied) RGBA; return
   alpha 0 to draw nothing.
3. The library applies the edge anti-aliasing (`f.coverage`, or the outer edge with `extraWidth`), fades hairlines
   thinner than one device pixel and premultiplies.

**Names.** An effect uses only `ConnectionFragment`, its own `u_<name>` uniforms and the library's `graph_*`
functions. Attributes, varyings and internal uniforms carry the `graph_` prefix and are private; every other name is
free for effects.

**Versions.** Within a major version, `ConnectionFragment` fields and the `graph_*` helpers are only added: never
renamed, removed or changed in meaning. Every addition increments `GRAPH_CONNECTION_FRAGMENT`, so an effect can
test for it:

```glsl
vec4 effect(ConnectionFragment f, vec4 color) {
#if GRAPH_CONNECTION_FRAGMENT >= 2
  // use a field added in version 2
#endif
  return color;
}
```

## Library effects and helpers

Built with the public API above:

```typescript
import { BlockConnection, WebGLLine, dashFlow, pulse } from "@gravity-ui/graph";
import type { TBaseConnectionState, TConnection, TWebGLStroke } from "@gravity-ui/graph";

type TFlowConnection = TConnection & { flow?: "data" | "signal" };

class PipelineLine extends WebGLLine {
  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    const stroke = super.getStroke(state);
    const { flow } = state as Partial<TFlowConnection>;
    if (state.hovered || state.selected || !flow) return stroke;
    if (flow === "data") {
      // Comets from the source to the target; a negative speed runs them back.
      return { color: "#2f7cf6", width: 6, effect: dashFlow.use({ pattern: [90, 160], speed: 120, fade: true }) };
    }
    // A brightness wave travelling along x: neighbouring connections pulse in step.
    return { color: "#2bb24c", width: 5, effect: pulse.use({ period: 3, wavelength: 24000 }) };
  }
}

class PipelineConnection extends BlockConnection<TFlowConnection> {
  public static override line = PipelineLine;
}
```

- `dashFlow.use({ pattern, speed, fade? })`: a running dash. `pattern` holds the on and off lengths in world units
  (off defaults to on), `speed` is world units per second, negative from the target to the source, and `fade` makes
  each dash a comet with a transparent tail. The effect draws the dash itself, so the base stroke has no `dash`.
  Fallback: the still dash with the same pattern.
- `pulse.use({ period, wavelength? })`: the line dims to 15% and a crest passes every `period` seconds; with a
  `wavelength` (world units) the crest travels along the x axis, without it the whole line pulses in place. Fallback:
  the plain stroke.

GLSL helpers available in every effect program, versioned like `ConnectionFragment`:

| Helper | Returns |
|---|---|
| `float graph_dashPhase(float along, float on, float off, float offset)` | The position in a repeating on/off pattern, `0..on+off`, shifted by `offset`; the dash is where it is below `on` |
| `float graph_comet(float phase, float on, float speed)` | Comet brightness inside a dash (`phase < on`): the head leads in the direction of `speed` |
| `float graph_wave(vec2 world, float time, float period, float wavelength)` | A travelling crest, `0.15..1`; `wavelength` 0 pulses in place |

They combine into new effects, for example comets that pulse:

```typescript
import { defineConnectionEffect } from "@gravity-ui/graph";

/** params: dash length and speed; the gap is twice the dash. */
export const pulsingComets = defineConnectionEffect({
  animated: true,
  fragment: /* glsl */ `
    vec4 effect(ConnectionFragment f, vec4 color) {
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

## Fallback and `$connectionsRenderer`

A graph of `WebGLLine` connections without WebGL draws its lines with Path2D built from the same geometry, using each
effect's fallback stroke, with no animation. This happens when WebGL2 is missing, when its setup fails (the library's
shaders do not compile or link, for example) and when the context is lost; each episode logs one console warning, in
every build, that names the reason. After `webglcontextrestored` the renderer creates WebGL again; without WebGL2 the
graph stays on Path2D until the connection class changes. Any change of the connection class tries WebGL again.

`graph.getGraphLayer().$connectionsRenderer` is a read-only signal of what draws the lines now:

| Value | Meaning |
|---|---|
| `"canvas"` | Path2D, for a `Path2DLine` class. Also for a `WebGLLine` class while the graph's root is not in the document yet (the WebGL renderer is created on the first frame with the graph's canvas in the document) and after the connections unmount |
| `"webgl"` | WebGL2 |
| `"webgl-fallback"` | Path2D for a `WebGLLine` class, with the effects' fallback strokes |

```typescript
const renderer = graph.getGraphLayer().$connectionsRenderer;
const unsubscribe = renderer.subscribe((value) => {
  console.info("connections are drawn by", value); // "canvas" | "webgl" | "webgl-fallback"
});
```

## Hit testing

One rule for both line kinds: a point hits a connection within `stroke.width / 2 + THRESHOLD_LINE_HIT` world units of
its drawn line (`THRESHOLD_LINE_HIT` is 8 by default: 9 for a 2-unit line, 10 hovered or selected). The arrow is part
of the hit area while arrows are shown, with its own stroke width; a point inside a closed arrow hits too.

- `Path2DLine` runs `isPointInStroke` on its own path with a line width of `width + 2 · threshold`, so a custom
  `createPath()` is hit where it is drawn.
- `WebGLLine` measures the distance to the geometry's segments, with curves flattened to half a CSS pixel.
- `extraWidth` is not part of the hit area: a glow is decoration.
- Labels keep their own rule: a square of `THRESHOLD_LINE_HIT` screen pixels around the point meets the label.
- The broad phase uses the connection's hit box: the bounds of the line, the arrow (while shown) and the label,
  padded by `THRESHOLD_LINE_HIT` plus half the wider of the line and arrow strokes, so it never cuts the rule off.
  The culling bounds pad the line by half its stroke width as well, so wide strokes are not clipped at the viewport's
  edge.

A line class can override `hitTest(x, y, threshold)`: the point is in world coordinates and `threshold` in world
units. A filled custom path, for example, adds `isPointInPath`.

## Draw calls and order

**Path2D** draws one `stroke()` (or `fill()`) per chunk of a style group: chunks by z-level, then group, then grid
cell (see [Batch Rendering](batch-rendering.md)).

**WebGL** chunks connections by z-level and grid cell only; the style is in each instance. Per drawn chunk and effect
group present it issues one instanced call for the straight segments and one for the curve pieces (each when there
are any), plus one fill call when the chunk has closed arrows. Without effects that is one or two calls per chunk;
the worst case is visible chunks × effects. Within a z-level the loop runs effects outside and chunks inside, so
programs switch once per effect and z-level, not per chunk.

Within one z-level WebGL draws the closed-arrow fills first, then the plain group, then each effect group in the order
of its first appearance; inside a group straight pieces draw before curve pieces. Overlapping translucent lines of
different effects on one z-level therefore blend in that order, not in insertion order. The order across z-levels is
the same as with Path2D: hovered and selected connections above the others, an arrow one level below its line.

**Curves** stay within 0.25 CSS pixels of the true curve at every zoom. When the zoom changes enough, visible chunks
are tessellated again over a few frames and drawn with the previous tessellation meanwhile. How curves are split is
internal.

## Known limits

- `MultipointConnection` draws its `labels` in `afterRender()`, which only the Path2D batch calls: with a WebGL line
  class they are drawn only in the fallback. The same holds for any `afterRender()`.
- Effects never apply to arrows: an arrow is drawn with `getArrowStroke()`.
- Custom closed arrows must be convex.
- WebGL dash patterns use their first 4 numbers; a longer pattern reports one warning in development builds only.
- Effect parameters are 8 numbers per connection; uniforms are `float` and `vec2`–`vec4`.
- Every graph with WebGL lines has its own WebGL context. Browsers keep a limited number of live contexts (about
  16), so a page with many WebGL graphs can run out; a graph whose context the browser drops falls back to Path2D.
- Labels, and anything a `static detached = false` connection draws in `render()`, are drawn on the graph layer's
  canvas, above every WebGL line.

## Diagnostics

`getWebGLConnectionsStats()` and `resetWebGLConnectionsStats()` are experimental diagnostics for benchmarks and may
change. They accumulate the main-thread work of every WebGL connections renderer on the page: `drawMs`, `draws`,
`drawCalls`, `instances` (`lineInstances` plus `curveInstances`), `items` and `vertices`.

```typescript
import { getWebGLConnectionsStats, resetWebGLConnectionsStats } from "@gravity-ui/graph";

resetWebGLConnectionsStats();
// … after some frames:
const { drawMs, draws, drawCalls } = getWebGLConnectionsStats();
console.info(`${(drawMs / draws).toFixed(2)} ms, ${drawCalls / draws} draw calls per frame`);
```

## See also

- [Connection System](canvas-connection-system.md): creating, styling and customizing connections.
- [Batch Rendering](batch-rendering.md): groups, chunks and culling of connection lines.
- [Migrating to v2: connection lines and geometry](../migration-guides/v1-to-v2.md#connection-lines-and-geometry).
- Storybook `Canvas/WebGLConnections`: `RunningDash`, `PerConnectionStyle`, `GraphStress` and `NirvanaEffects`, with
  the code of every option.

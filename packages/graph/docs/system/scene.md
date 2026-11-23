# Scene (`graph.scene`)

`graph.scene` is the scene runtime of a graph. It owns the element store (flat lists of drawing primitives with
bounds, a shared `zIndex` and a style id), the renderer that draws them, the scene level and a pausable clock.
The graph frame task updates it right after all layers (`layers.update()`, then `scene.update()`).

## What the scene draws

Blocks, anchors, child components and built-in connections draw in the scene. Each `CanvasBlock` owns a scene element
with its anchors and child components nested in it. Each built-in connection owns a scene element for its shaft,
arrow and label. `GraphLayer` keeps the component tree, events, hit-testing, drags and the camera. See
[Block component](../components/block-component.md), [Anchors](../components/anchors.md) and
[Connections](../connections/webgl-connections.md).

See [WebGL scene effect types](scene-effects.md) for the TypeScript and GLSL inputs of stroked paths and sprites.

Immediate components and connections with custom Canvas painters draw on `GraphLayer`. The scene canvas sits above
`GraphLayer` and below `ReactLayer`.

The built-in WebGL backend uses one WebGL2 context for the scene. It keeps path geometry and its instance metadata
in resident texture records. Draw commands refer to those records by compact IDs, so culling and changes in
draw order can change the submitted IDs without moving the path data.

For large eligible workloads, the backend draws the connections into a single-sample target in the same context,
then composites it below the rest of the scene. Blocks and their text retain the scene's multisampling. The target
is redrawn each frame that uses it. Eligibility is internal and respects the authored scene order. See
[connection draw calls and order](../connections/webgl-connections.md#draw-calls-and-order).

## Explore the scene in Storybook

Open **Scene → Examples** to try block styles, connection effects and custom elements on small graphs.
The [ETL pipeline](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--etl-pipeline) shows how changing one stage updates its flows.

Use **Scene → Diagnostics** to reproduce rendering and interaction issues. Copy the Storybook URL after setting
Controls to share the same input. For performance comparisons, keep the viewport, device pixel ratio and camera
motion fixed when switching renderers.

| Investigate | Story and starting conditions |
| --- | --- |
| Status updates and zoom | [ETL at scale](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-sceneeffects--etl-at-scale) opens with 10,000 blocks, 10,000 connections and the minimap off. Enable **Live** for status updates or choose **Camera motion → Zoom cycle** to exercise zoom. |
| Large graphs with Bézier connections | [Nirvana overview](https://preview.gravity-ui.com/graph/v2/?path=/story/stories-main-grapheditor--nirvana-max-graph-test) opens on the whole graph. [Nirvana effects](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--nirvana-effects) opens on the central layers. At their default sizes both use the same seeded layout. |
| A connection routed around bends | [Multipoint route](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-webglconnections--multipoint-route) shows a stock WebGL connection. Click a segment after a bend to select it. |
| Stroke coverage at a sharp turn | [Polyline bends](https://preview.gravity-ui.com/graph/v2/?path=/story/scene-diagnostics-polyline-bends--stroke-coverage) opens with a half-opacity stroke, width 16 and a 19/13 dash. Switch renderers, repeat the vertex or magnify the lower bend. |
| Click targets at the HTML handover | [HTML handover and picking](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-sceneinteraction--scene-interaction) reports the last clicked component. Click the blue button before and after switching to detailed zoom. |
| Draw order and context loss | [Draw order and context recovery](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-sceneruntime--scene-runtime) lets you lower a block below a line and trigger WebGL context loss and restoration. |

## Add an element to the scene

For an annotation, badge or character with its own position and pointer target, return a `SceneComponent` from a
layer's `updateChildren()`. The graph mounts it, draws it with the current renderer and removes it when its owner
unmounts. The layer can own components without creating a canvas or HTML overlay.

### Define the look and hit area

This square marker has a stable application ID, a fill colour and a world position. Its rectangle is in **local**
coordinates. The scene applies `getSceneOrigin()` and the camera when drawing. A standalone component supplies its
own hit rectangle in **world** coordinates. This makes the marker a pointer target wherever it moves. For a purely
decorative standalone component, omit `getHitRect()` so the pointer reaches the graph underneath.

```ts
import { Layer, SceneComponent, getEventTarget } from "@gravity-ui/graph";
import type { Graph, LayerProps, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";

type MarkerData = { id: string; x: number; y: number; color: string };
const side = 24;

class Marker extends SceneComponent<TGraphComponentProps & MarkerData> {
  public static override entityType = "marker";

  public override getEntityId() {
    return this.props.id;
  }

  protected override getSceneOrigin() {
    return { x: this.props.x, y: this.props.y };
  }

  protected override shouldUpdateScene(nextProps: TGraphComponentProps & MarkerData): boolean {
    return nextProps.color !== this.props.color;
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", x: 0, y: 0, width: side, height: side, fill: this.props.color }];
  }

  protected override getHitRect() {
    return { ...this.getSceneOrigin(), width: side, height: side };
  }
}

type MarkerLayerProps = LayerProps & { marker: MarkerData };

class MarkerLayer extends Layer<MarkerLayerProps> {
  protected override propsChanged(next: MarkerLayerProps) {
    super.propsChanged(next);
    this.shouldUpdateChildren = true;
  }

  protected override updateChildren() {
    const { marker } = this.props;
    return [Marker.create(marker, { key: marker.id })];
  }
}
```

### Mount, update and remove it

The layer below owns one marker. Its key stays the same when its props change, so the graph updates the same
component. Moving it changes its origin and hit area. The marker rebuilds its rectangle only when its colour
changes. A click on the marker recolours it.

```ts
function mountMarker(graph: Graph) {
  let marker: MarkerData = { id: "checkpoint", x: 100, y: 80, color: "#2563eb" };
  const layer = graph.addLayer(MarkerLayer, { marker });

  function update(patch: Partial<Omit<MarkerData, "id">>) {
    marker = { ...marker, ...patch };
    layer.setProps({ marker });
  }

  const offClick = graph.on("click", (event) => {
    const target = getEventTarget(event.detail.sourceEvent);
    if (target instanceof Marker && target.getEntityId() === marker.id) {
      update({ color: "#c25013" });
    }
  });

  return {
    update,
    dispose() {
      offClick();
      graph.removeLayer(layer);
    },
  };
}

const marker = mountMarker(graph);
```

Call `marker.update({ x: 180, y: 120 })` to move it. After the graph processes the update, a point inside the square,
such as `graph.getElementOverPoint({ x: 192, y: 132 })`, returns the topmost pointer target. To find painted markers
in an area, use `graph.scene.query({ x: 180, y: 120, width: 24, height: 24 }, { entityTypes: ["marker"] })`. Query
results are snapshots. Apply edits to the model that supplies the component's props. Individual primitives draw as
part of their component and share its pointer target. For a separately clickable part, return a child
[`SceneComponent`](../components/block-component.md#child-components).

Call `marker.dispose()` when its view closes. For a collection, one layer can return multiple keyed descriptors.
Omit a descriptor from the next `updateChildren()` result to remove just that component. If the entity is a graph
block with anchors and connections, register a [custom block](../components/block-component.md#registering-custom-blocks)
and use `graph.api.addBlock()` and `graph.api.updateBlock()` to manage its data.

In Storybook, open [Scene / Examples / Custom elements / Orbit Mascot](../../../../apps/storybook/src/stories/canvas/sceneRuntime/mascot.stories.tsx)
to see a component walk and wave in the WebGL scene. Orbit owns its body and returns keyed children for its limbs.
Each child adds its pose offset to `super.getSceneOrigin()`, so the hand can wave while the feet stand still.
All parts share one animation clock and keep their primitive geometry across frames. Moving them still redraws the
visible scene. Orbit pauses when its walking route is offscreen, its foot lift is smaller than one CSS pixel, the
page is hidden, or the user prefers reduced motion. Removing the mascot also cancels the loop.

## Draw a texture and animate it in WebGL

A `sprite` places a decoded image on a rectangle in the scene. Its `x`, `y`, `width` and `height` are local world
coordinates, just like a rect's. Load the asset before mounting the component and pass the same image object to
components that share it. To replace an image, decode a new object.

```ts
import type { TScenePrimitive, TSceneSpriteEffect } from "@gravity-ui/graph";

const image = new Image();
image.src = "/assets/robot.png";
await image.decode();

const shine: TSceneSpriteEffect = {
  animated: true,
  fragment: `
    vec4 spriteColor(sampler2D atlas, vec2 uv, float time, vec4 params) {
      vec4 pixel = texture(atlas, uv);
      float band = abs(uv.x + 0.2 * uv.y - (fract(time * 0.5) * 1.6 - 0.2));
      float light = 1.0 - smoothstep(0.0, 0.09, band);
      return vec4(mix(pixel.rgb, vec3(1.0), params.x * light), pixel.a);
    }
  `,
};

// Return this primitive from the component's schematic() method.
const sprite: TScenePrimitive = {
  kind: "sprite", image, x: 0, y: 0, width: 160, height: 120,
  effect: shine, params: [0.6, 0, 0, 0],
};
```

Without an effect the rectangle shows the whole image. The effect's **fragment shader** runs for each covered pixel.
See [Sprite fragment inputs](scene-effects.md#sprite-fragment-inputs) for UV coordinates, the clock, parameters and color.
For an asset on another origin, set `image.crossOrigin` before `src` and serve it with appropriate CORS headers.

[Textured Orbit in Storybook](../../../../apps/storybook/src/stories/canvas/sceneRuntime/mascot.stories.tsx) samples one
cell from an 8 × 8 PNG atlas. Changing the sampled coordinates selects a new pose or moves the character within the
rectangle. Changing the sampled colour adds a travelling highlight. Neither requires changing scene geometry or
resending the PNG for each frame. Set `animated: true` when the shader uses the clock. Canvas 2D, the minimap
and `scene.toImage()` skip sprites. For effects on a stroked path, see [`PathFragment`](scene-effects.md#pathfragment).

### Move a character in world coordinates

For a character that travels between blocks, put the position of its feet in your model. Return that world point
from `getSceneOrigin()`; offset the sprite's local rectangle so its bottom-centre is at `(0, 0)`. For artwork with
transparent padding, use the actual ground-contact point in the image. A stand-alone interactive sprite also needs
a `getHitRect()` in world coordinates. A pan or zoom changes the projection, so neither should advance the walk.

A single PNG provides one pose. Move it as a whole or apply a colour or UV effect. To animate articulated limbs,
supply a sheet of poses with the same foot pivot in every cell, or separate limb artwork and animate the joints.
For a walk cycle, derive the frame from distance along the path:

```ts
const phase = (distanceTravelled / distancePerCycle) % 1;
const frame = Math.floor(phase * framesPerCycle);
```

`distancePerCycle` is the world distance between two ground contacts of the same foot. This keeps the planted foot
from sliding as walking speed changes. A stationary action, such as waving, can use elapsed time independently.
Textured Orbit moves the sampled pixels inside a fixed rectangle as a decorative animation. Changing the
element's origin instead also moves its scene bounds and lets pointer interaction follow the character.

## Settings

```ts
graph.updateSettings({ renderer: "webgl" }); // default: "canvas"
graph.updateSettings({ webglBackend: () => import("./my-backend") }); // optional custom loader
graph.updateSettings({ cameraAwareText: false }); // default: true
```

- `renderer`: `"canvas"` interprets the elements with Canvas 2D; `"webgl"` draws them through the WebGL backend.
- `webglBackend`: loader of an `ISceneBackendModule`. By default the built-in backend is imported dynamically, so
  luma.gl is a separate chunk and is never loaded for `"canvas"`.
- `cameraAwareText`: `false` makes every scene text world-sized, whatever its primitive and the styles say (see
  [Text primitives](#text-primitives)). It is the switch for weak devices, and an app may hand it to its users.
  `graph.scene.$cameraAwareText` is the setting as a signal.
- `graph.scene.setRenderer(value)` writes the same `renderer` setting.

## `$level`

`graph.scene.$level` is a signal of `"minimalistic" | "schematic" | "detailed"`. It re-evaluates on zoom, on a change
of the camera scale-level strategy and on a change of graph constants. With the default strategy the level is
minimalistic below `block.SCALES[1]` (0.225), schematic from it, and detailed from `block.SCALES[2]` (0.7).

`$level` filters primitives. A primitive with a `levelMask` is drawn only on the levels in it (the sum of
minimalistic 1, schematic 2, detailed 4); a primitive without one is drawn on every level. A `SceneComponent` sets the
mask from the level method that returned the primitive. Both renderers filter when they draw (WebGL by a uniform), so a
level change needs no re-encode of its own (except the glyphs of camera-aware texts whose lines change, see
[Text primitives](#text-primitives)). (A rule scoped by `scope.levels` recomputes styles on a level change,
and if the result changes an element's encoding, for example a level-scoped `opacity`, that element is re-encoded.)
`minScale` / `maxScale` still apply on top of the mask.

## Scene readiness and loading overlays

`graph.scene.state` is the current loading state. Subscribe to `scene-state-change` for changes. Graph delivers the
notifications asynchronously, outside the operation that triggered them. Listeners cannot cancel the transition.

| State | When it applies |
| --- | --- |
| `init` | The graph has just been created or stopped. |
| `initialize` | The graph has started, or `setEntities` has replaced the contents of a running graph. |
| `switch` | A running scene is changing renderers or recovering its rendering context. |
| `ready` | The scene has drawn the current contents into a viewport with a positive size. A working Canvas fallback can also produce this frame. |

Ordinary edits, selection, pan and zoom keep an already ready scene ready. Enable `yieldBeforeSceneLoad` to give
the browser a paint for an overlay before the scene prepares a large frame. For application UI, read the current
snapshot on subscription and when notified. This also works when the overlay mounts after the first frame.

```ts
const graph = new Graph({ settings: { yieldBeforeSceneLoad: true } }, root);
const updateOverlay = () => {
  overlay.hidden = graph.scene.state === "ready";
};
const unsubscribe = graph.on("scene-state-change", updateOverlay);
updateOverlay();
graph.setEntities({ blocks, connections });
graph.start();

// When the view unmounts:
// unsubscribe();
```

In React, `useGraphEvent` and the `onSceneStateChanged` prop of `GraphCanvas` receive the same event.
The [ETL at scale example](https://preview.gravity-ui.com/graph/v2/?path=/story/canvas-sceneeffects--etl-at-scale)
shows an overlay during startup and renderer switches. The paint opportunity applies to scene preparation.
`setEntities` still updates the data synchronously. If your application computes a large layout before passing
it to Graph, schedule that computation separately. HTML card data and images loaded by the application have
their own readiness.

## `$renderer`

`graph.scene.$renderer` is the state of the renderer:

- `"canvas"`: Canvas 2D is drawing.
- `"loading"`: WebGL was requested and the backend is loading; Canvas 2D keeps drawing.
- `"webgl"`: the WebGL backend is drawing.
- `"lost"` / `"restoring"`: the GPU context was lost and is being restored.
- `"webgl-fallback"`: the backend failed to load or restore, or a scene [limit](#limits) was passed; the scene draws
  with Canvas 2D.

## `clock`

`graph.scene.clock.now()` returns scene time in seconds. It stops on `graph.stop()` and while the document is
hidden, and resumes on `graph.start()`, so animations do not jump after a pause.

## Child elements

An element can be nested in another one: an anchor's element is nested in its block's, and so is a child component's.
A scene component returned from another one's `updateChildren()` is a sub-component. By default:

- it is nested in its parent's element (an owner's, or another child's), ordered by its place among the parent's
  retained children;
- it draws at its parent's origin, so its primitives are in its parent's frame;
- its hit box is its element's bounds, in world units (`getHitRect()`; `Anchor` sets its own from its port);
- development builds report two children of one parent with one key: the second would get no component.

A child element:

- takes no rank of its own: it draws right above its scene parent and under the next owner element, in its owner's
  raised bucket, among its siblings by `childOrder`;
- is hidden while anything up its nesting is hidden, and rises with its owner (a selection, a drag start, a style
  `raise`);
- takes its scene parent's element `dim` when it sets none, and multiplies its own element `opacity` by the parent's;
  its parts are styled by its own rules;
- is deleted with its scene parent.

The store keeps the nesting, to any depth. `parent` is an element's owner, the root element of its nesting.
`nestedIn` is the child element it is nested in, and is unset for a direct child of its owner. The owner's draw list
(`childrenOf`) is the pre-order of the nesting: a child's subtree draws after it and before its next sibling, and a
reorder moves the whole subtree. Hidden, `dim` and `opacity` are derived down the chain by the store. An export
recomputes the inherited rows that exist live, down the whole chain. One limitation: when an element gains an element
`dim` or `opacity` only at the export's level or scale (it had none live, so its children have no inherited rows), the
export gives inherited rows to its direct children only; deeper descendants keep their live rows (see
[toImage](#toimage)).

In WebGL a child's depth is its owner's key plus a sub-order after the primitives drawn before it.

## Updates

Store changes reach the WebGL backend once per frame. The scene layer queues them and applies them in one batch before
it draws, one entry per element: an add followed by updates stays one add, updates merge their fields, and an add
followed by a delete cancels out. The depth keys are renumbered once per frame, so N element changes cost one
renumbering. The Canvas 2D interpreter reads the store when it draws.

## `compareOrder`

`graph.scene.compareOrder(a, b)` is the scene order of two components, shared by drawing and hit-testing: negative
when `a` draws below `b`. `HitTest` sorts its results with it, so the component drawn on top is hit first.

- Components with a scene key (see `getSceneKey()`) compare by their
  elements: the bucket (`zIndex` plus the style's `raise`), then the owner's `order` (a raise gives a new, larger
  one), then the pre-order of the owner's nesting: a child element right above its scene parent, siblings by
  `childOrder`.
- Other components (groups, immediate components, custom Canvas connections) compare by `(zIndex, renderOrder)`.
- A component without a scene key against a scene component compares its `zIndex` with the element's bucket; at an
  equal value it lies above.

The order decides among the components a point hits; the level decides which scene components are hit at all. A
scene component is hit on the levels where it is shown: an element owner on every level; a child on the levels its
look is drawn on, and wherever its block is shown outside the scene (an HTML view's hold at the detailed level,
`setRenderDelegated(true)` on every level); a child without a look only on the levels it declares. `static hitLevels`
overrides the rule (see [Event model](event-model.md#hit-levels)). `graph.getElementsOverRect()` leaves out what the
level does not hit, as point queries do.

## `query` and `drawInterpreted`

`query(rect, options)` takes a world rectangle as `TRect` (`{ x, y, width, height }`, like `zoomToRect`) and returns
read-only views of the elements whose bounds meet it, in draw order, bottom first: owner elements, each followed by
what is nested in it, in the pre-order of its nesting. By default it returns visible elements only, and a view's
`hidden` is `false`. A view's `bounds` is relative to the element's origin (`x`, `y`). The snapshot owns its bounds,
primitives and their data, including path buffers and effect uniforms. Editing a buffer or resource in a snapshot
cannot affect the live scene's drawing, picking or later queries. A sprite's `image` in the snapshot is a detached
canvas, with its decoded pixels ready for `drawImage()`. Each call copies the pixels once per distinct image in the
result. Sprites in components still take a decoded `HTMLImageElement`.
Apply scene changes through the component or graph data.
The options (`TSceneQueryOptions`):

- `level`: only elements with a primitive on that level. An owner left out still places its children that have one.
- `includeHidden`: hidden elements too: a block handed over to HTML, a block in a collapsed group, and what is nested
  in them. Their views say `hidden: true`.
- `entityTypes`: only elements of these types. An element's `entityType` (in its view too) is the `static entityType`
  of the component that wrote it.

`drawInterpreted(ctx, elements, scale, options)` draws views on any 2D context with the Canvas 2D interpreter,
whatever the active renderer. The caller owns the context transform, device pixel ratio included. Options:
`skipText` leaves text out, `level` skips primitives of other levels, `drawHidden` draws hidden elements too, and
`textPolicy` (`{ cameraAware: boolean }`) replaces the `cameraAwareText` setting for this draw. Texts are laid out at
`scale`. A layer can draw the scene's blocks this way, at the minimalistic level, without text and with blocks
handed over to HTML, as the minimap does. The minimap's `entityTypes` are `"block"` plus the `entityType` of the
block classes that declare their own; the example below takes `"block"` only:

```ts
const dpr = window.devicePixelRatio || 1;
const rect = { x: 0, y: 0, width: 4000, height: 3000 };
const elements = graph.scene.query(rect, { level: "minimalistic", includeHidden: true, entityTypes: ["block"] });
ctx.save();
ctx.setTransform(k * dpr, 0, 0, k * dpr, offsetX * dpr, offsetY * dpr); // world to minimap device pixels
graph.scene.drawInterpreted(ctx, elements, k, { level: "minimalistic", skipText: true, drawHidden: true });
ctx.restore();
```

`revisionOf(entityType)` is a signal of a counter. It steps once at the end of a graph frame in which elements of that
type changed: added, moved, restyled, hidden, reordered or removed, or nested in an element that was hidden, raised,
moved to another bucket or reordered. It also steps when style rows were rewritten (a rule, level or root-tag change)
or the dim colour changed. A row change to a row that looks the same steps nothing. A layer that draws from `query()`
redraws on it, one frame after the change; the minimap follows `"block"` and the types of the other block classes it
draws. Every call with one type returns the same signal.

`onFrameEnd(listener)` calls the listener at the end of every graph frame, after every layer and the scene updated.
It returns the function that removes the listener. A listener registered during notification starts on the next
frame. Removing a listener before its turn skips it in the current frame. GraphLayer finds the pointer's target again
there, and ReactLayer switches its HTML there, so the frame that hides the HTML draws the scene blocks that go with it.

`graph.scene.store` is `@internal`: it is the write side used by the library components and the benches.

## `toImage`

`graph.scene.toImage(options)` returns the scene's picture as a new canvas. The Canvas 2D interpreter draws it
whatever the renderer, because WebGL's drawing buffer is not preserved.

| Option | Default |
| --- | --- |
| `rect` | the camera's view, in world units |
| `scale` | the camera's scale (camera-aware sizes, world units to CSS pixels) |
| `pixelRatio` | the graph's device pixel ratio |
| `background` | transparent |
| `level` | `$level` |

```ts
const canvas = graph.scene.toImage({ background: "#ffffff" }); // the current view
const crop = graph.scene.toImage({ rect: { x: 0, y: 0, width: 2000, height: 1000 }, scale: 0.5, level: "schematic" });
```

- **What it draws.** For the current view (no `rect` and no `scale`) the visible layer canvases under the scene come
  first, such as the grid and the `GraphLayer` canvas with legacy Canvas content. Other rects draw the scene, including
  built-in connections, their arrows and labels. Both kinds of export draw the Canvas stroke for a connection with
  a WebGL effect. Standard connection labels use the live label layout, including the camera's visibility threshold.
- **`level` alone.** `toImage({ level })` without `rect` and `scale` is still the current view. The layer canvases
  under the scene come as drawn live, at the live level.
  Only the scene is drawn at the requested level. For a picture of the scene alone at another level, pass `rect` (for
  example the camera's view in world units) or `scale`.
- **Size.** `scale` and `pixelRatio` must be finite and positive, and the output at most 16,384 px per side and 2^26
  px in total. Otherwise `toImage` throws a `RangeError` before it prepares anything.
- **Anchors.** The picture does not depend on where the camera has been. Blocks create their anchor components lazily
  (see [Anchors](../components/anchors.md#drawing-and-lazy-creation)), so an export creates the missing ones its rect
  and level need, through their normal lifecycle (`getAnchorClass`, level methods, tags and styles), and drops them
  after the draw, also when the draw throws. Blocks hidden by a collapsed group or handed over to HTML get none, and
  no block does while `useBlocksAnchors` is off. The default `Anchor` draws nothing on the minimalistic and detailed
  levels, so exports there create none of them; an `Anchor` subclass counts as drawing on every level.
- **Styles** are computed at the export's level and scale: rules with `scope.levels` or `minScale` / `maxScale` apply
  as at the requested level and scale. An element `dim` or `opacity` reaches what is nested in the element. When the
  block had one live, the export recomputes the inherited rows down the whole nesting. When the block gains it only at
  the export's level or scale, it reaches the block's direct children (its anchors and child components), not what is
  nested deeper.
- **Texts** are laid out at the export's `scale` under the `cameraAwareText` setting: a camera-aware name re-fits its
  box as it would on screen at that scale.
- **Cost.** `toImage` is synchronous. A whole-graph export at a level that draws anchors creates and drops every
  missing anchor component in the call: about 0.75 s and +200 MB of peak JS heap for 10,000 blocks with 39,687 anchors
  (Apple M3 Pro). The next frame applies what the export queued: for each temporary anchor
  `AnchorState.$viewComponentReady` went `true` and back to `false`, `graph-component-unmounted` was dispatched, its
  hit box was added and destroyed (`hitTest.isUnstable` until the next hit-test run), and the connections at its port
  recompute their geometry.
- **`Anchor.LOOK_EXTENT`.** The export finds the blocks that need temporary anchors by their rect, widened by their
  anchor points and by the `LOOK_EXTENT` of their anchor classes: 11.5 world units for the default dot and ring
  (`SIZE` 18, `LINE_WIDTH` 2). An `Anchor` subclass whose look reaches farther, or one with a larger `SIZE` or
  `LINE_WIDTH`, declares its own (`public static override LOOK_EXTENT = 40;`). Otherwise an export can miss its anchors
  near the crop edge. Development builds warn, naming the class, when an anchor's initial look (the first check of
  that instance) reaches past its class's extent; a later growth of the same instance is not checked.
- **`getAnchorClass`.** The search reads a block's anchor classes from `getAnchorClass`, as cached by the block's last
  update, for blocks outside the rect too. A block whose classes are unknown (a pending update may change them) counts
  as a candidate. The export can call `getAnchorClass` again when it constructs the anchors: keep it a pure function
  of the anchor and the block's data. A throw from it there aborts the export.
- **Errors.** A call while another export prepares, draws or cleans up throws. So does a call from a block's own
  lifecycle hook (`stateChanged`, `willIterate`, ...) when that block has to create anchors for the export: "cannot
  create the anchors of block `<id>` from that block's own update". Running that update again would run its hooks
  twice. Calls from elsewhere work: an event handler, a layer's `render()`, another component's hook.
- **Timing.** The picture shows the updates applied so far. Inside `batch()` the store's subscribers have not run yet,
  so an export there shows the state before the batch. After `setContext()`, components that derive their look from
  the context show it after their next update. Call `toImage()` after the batch, or on the next frame.
- `toImage` reads no signal for its caller: an effect that exports does not re-run on what the export read.

`graph.getGraphCanvas()` returns the `GraphLayer` canvas. Use `toImage()` for screenshots that include scene
blocks and connections.

## Styles: `bindStyle`, `styleFor`, `explain`

Elements take their looks from [tags and styles](tags-and-styles.md). `graph.scene.bindStyle(elementId, { type, id },
target)` (`@internal`) keeps an element's style row on the tags of an entity; add the element to the store first.
`graph.scene.styleFor(target, tags)` computes a style, and `graph.scene.explain(entityType, id)` lists an entity's
tags, matched rules and computed style.

## Text primitives

A text primitive draws its `text` in a box: `x`, `y`, `width` and, optionally, `height`. Both renderers and exports lay
it out with one shared layout (`lib/scene/text/textLayout.ts`), the rules of v1's `layoutText`:

- **Size.** `size` is the font size in world units. With `cameraAware` (`true`, or `{ minWorld?, maxWorld? }`) it is
  in screen pixels at every camera scale: the world font size is `size / scale`, clamped by the bounds. Off
  (`false` or unset) means the authored world size. `lineHeight` is the line pitch at `size`, and the pitch scales
  with the resolved font size.
- **Fade on zoom.** Set `minScale: 0.225, fadeInUntil: 0.3` on a label to reveal it gradually as the user zooms in.
  At 0.225 the text is invisible. At 0.3 it reaches its styled opacity. Zooming out follows the same curve in reverse.
  Canvas, WebGL and scene exports use the current scale, including when the camera stops inside the interval.
  WebGL blends the label in scene order during the fade. Once it reaches full opacity, it uses ordinary text
  antialiasing. Both passes share the same glyph buffers. Labels with a translucent paint keep blending.
- **Wrapping.** Lines wrap by words (whitespace, newlines included, collapses to single spaces) to `width` at the
  resolved size, and a word wider than the box is split by characters; a line of one piece no wider than a space is
  dropped, as v1 dropped it. `wrap: false` keeps one line with its whitespace as written (each whitespace character
  drawn as a space), measured whole.
- **Height.** A line is kept while it fits `height` at the resolved pitch; then `maxLines` applies. A box that holds
  no line draws nothing. Without a `height`, lines are unbounded.
- **Ellipsis.** `overflow: "ellipsis"` ends the last kept line with "…" when content remains (or when one unwrapped
  line is wider than the box), reserving the ellipsis's measured width; `"clip"`, the default, cuts the text at the
  box. An unwrapped line is cut as `fitText` cut it: each candidate with its "…" measured whole. When not even "…"
  fits, that line draws nothing.
- **Placement.** `align` (left or start, center, right or end) places each line against `[x, x + width]`, and
  `verticalAlign` (`"top"`, the default, `"middle"` or `"bottom"`) places the block of lines in `[y, y + height]`
  (without a `height`, the block at `size`). Each line's top lies where v1 Canvas 2D drew it with
  `textBaseline = "top"`; WebGL puts the glyphs on the same baseline, from the distance between the "top" and the
  alphabetic baselines that `measureText` reports.
- **Clipping.** Lines never leave the box. A text whose layout overflows its box (a line wider than it, or, with a
  `height`, a line's em box past the box: a `lineHeight` under the font size) is clipped to it, by one rule in both
  renderers (`TTextLayout.overflows`; WebGL clips in the glyph fragment shader). A text whose lines fit is drawn without
  a clip, as v1 drew every text: its glyph ink may overhang the box by side bearings, accents and descenders.
- **Bounds.** A text with a `height` contributes its box to the element's culling bounds. A heightless one contributes
  its width and the lines it can have at any size up to its largest, with half that size around them: its wrap at the
  largest size without v1's filter of pieces narrower than a space (a larger size never wraps into fewer lines, and
  the filter only drops lines), capped by `maxLines`. A text that declares `cameraAware` is largest at the lowest scale
  it shows at (give it a `maxWorld`), or at its own `size` once the setting or a style turns it off, whichever is
  larger. A style cannot turn a heightless text camera-aware (see below), so its
  bounds stay right. After late web fonts, the bounds of elements with a heightless text grow to its lines in the
  loaded font.

```ts
// A name that keeps 9 screen pixels and re-fits its block as the camera zooms, at most 90 world units.
const name: TScenePrimitive = {
  kind: "text",
  part: "title",
  text: this.state.name,
  family: "sans-serif",
  weight: "500",
  size: 9,
  cameraAware: { maxWorld: 90 },
  lineHeight: 9,
  x: 10,
  y: 10,
  width: this.state.width - 20,
  height: this.state.height - 20,
  align: "center",
  verticalAlign: "middle",
};
// One line with an ellipsis, world-sized.
const status: TScenePrimitive = {
  kind: "text",
  text: label,
  family: "sans-serif",
  size: 21,
  lineHeight: 24,
  x: 46,
  y: 97,
  width: this.state.width - 62,
  wrap: false,
  maxLines: 1,
  overflow: "ellipsis",
};
```

**The mode at runtime.** A part style's `cameraAware` turns the mode of the part's texts on or off (see
[tags and styles](tags-and-styles.md)), and the `cameraAwareText` setting turns every text off. Precedence: the setting
`false` wins; otherwise the state (`parts`) value, then the `base` value, then the primitive's own, then off. A
style's `true` keeps the primitive's clamps, and applies only to texts with a `height` (their bounds are their box): a
heightless text that does not declare `cameraAware` itself keeps its world size, development builds warn once per
element type and part, and `explain()` lists the part in `cameraAwareNotApplied`. Give such a text a `height`, or
declare `cameraAware` on the primitive. `graph.scene.explain()` reports `cameraAwareText: "forced-off"` while the
setting is off.

**Metrics.** Words, the space, "…" and character prefixes are measured once per font family and weight at 100 px
(`measureText`) and scaled linearly (Chromium's widths are linear in the font size within 0.1 %); each width is rounded
as v1 rounded it (`Math.floor(width + 1)`), so line breaks match v1. Linearity is probed per font and character group
(Latin, punctuation, Greek, Cyrillic, CJK, symbols, emoji, and each other block of 256 code points), the first time a
text has a character of the group: a text with a character whose widths do not scale linearly in the font (optical
sizing, as macOS `system-ui` or a variable font with an `opsz` axis, or a fallback font, as emoji in Arial) is measured
at each resolved size instead, as v1 measured every text, and is laid out again at every size change. Latin and
Cyrillic in the usual sans-serif fonts stay on the scaled path. The widths are kept in two generations of 4 MB
and dropped when late web fonts load (`document.fonts` `loadingdone`), which lays every text out again.

**Zoom.** A layout records the range of sizes that give the same lines. Between line breaks nothing is laid out or
encoded again: Canvas 2D draws the cached lines at the new size, and the WebGL shader scales the glyphs continuously. On
WebGL a camera-aware text keeps a fixed number of glyph instances whatever its lines: one per character that can draw a
glyph and one for the ellipsis, the glyphs of its lines first and hidden ones after them (an empty scale range: the
vertex shader moves them out of the clip volume, so they draw no pixel and write no depth). When its lines change, the
frame that shows it rewrites its glyphs in place (the slots its lines use, before or now), and only they are uploaded:
not the element's rects, paths, other texts or glyph sub-orders. A text whose size leaves its range but whose lines and
clip stay (the range is conservative) writes nothing. A text in a font whose widths do not scale linearly is laid out
again at every size and its glyphs rewritten each time (their places follow its widths at that size, as Canvas 2D draws
them). Texts outside the view are checked, and laid out again if their lines changed, in the first frame that shows
them; a frame finds the texts in its view through a spatial index of the elements with camera-aware texts, and a frame
with the view, scale and level of the last one checks none. A change of the setting redraws, and WebGL rewrites the
glyphs of the camera-aware texts in view in place.

Primitives are values. `TScenePrimitive`, `TSceneStroke` and the object forms of `TSceneSize` are read-only: build new
primitives instead of changing them. The WebGL backend compares texts by identity and keeps the objects of its last
encode, so a text changed in place would draw stale glyphs. Development builds freeze the text primitives the store
receives (with their `cameraAware` objects), so changing one in place throws a `TypeError`.

## Bounds and styles

- A style row that scales circles or widens strokes (the theme's anchor hover ×1.8, a rule's border `width`) grows the
  element's indexed bounds, so the Canvas 2D viewport query finds what it draws, and so does `query()`. The element's
  `bounds` field in `query()` still reports the component's bounds. A scaled anchor keeps its original hit box.
  Built-in connections use the styled widths of their shaft and arrow for hit testing at the current zoom.
- The grown bounds cover what either renderer paints. A circle's border reaches at least half its width past its
  radius, whatever its alignment. An `inside` rect border wider than the rect's shorter side paints past the rect. The
  joins of a path or a polygon reach up to 5 stroke widths from a vertex (Canvas 2D's default miter limit).
- Limitation: `toImage()` resolves its own styles. Geometry grown only by an export's rules (a rule scoped to the
  export's level or scale) is not indexed, so such an export can crop it.
- A `{ px }` width without `maxWorld` in a rule grows the bounds to its width at the minimum camera scale,
  and so does a `{ world }` width with a `minPx`. Below the default minimum of `0.01`, Canvas and `query()`
  size the index for the current zoom range. They reuse it within that range and restore the default bounds when
  zoom returns to `0.01` or above. Development builds warn about unbounded widths because they keep more elements
  in the viewport query.

## Limits

With a development build, the scene reports each limit once before WebGL falls back to Canvas 2D.
Set `process.env.NODE_ENV` to `"production"` in the application build to omit these diagnostics.
Direct browser ESM also skips them when `process` is absent. In every build the scene switches
`$renderer` to `"webgl-fallback"` if the WebGL backend fails.

- **Parts:** at most 15 distinct part names in the scene, plus `"none"`, which is reserved for primitives without a
  part.
- **zIndex bands:** at most 16, raised buckets included: a block in bucket 200 that the theme raises while selected
  draws in band 201.
- **Depth:** every owner element takes one depth key with 2^b sub-orders, where b is at least 5 and fits the owner with
  the most primitives, its child elements' included. Keys × 2^b must stay within 2^23. With 10,000 owners an owner can
  have 512 primitives with its children; with 262,144 owners, 32. All bands share this capacity; there is no separate
  owner limit per band. The width follows the widest owner and re-encodes nothing when it changes.

## Renderer differences

The two renderers draw the same picture, with these known differences:

- WebGL draws fill-only triangle primitives, including the triangles used to fill connection arrowheads.
  WebGL also draws [textured sprites](#draw-a-texture-and-animate-it-in-webgl).
  Canvas 2D also draws arbitrary polygons, icons, and dashed rect and circle borders. Both renderers draw dashed paths.
- Line breaks and line placement are the same (one shared layout). Both renderers align a line by the measured width
  of the complete line (Canvas 2D by `textAlign`, as v1 drew it; WebGL by the shared metrics: its words and spaces
  plus the pair kerning across each space, the "x " and " y" pairs measured once per font), kerning around spaces
  included. WebGL starts each word at its measured place, scaled so that the line spans that width, and spreads the
  word's atlas advances over its share; Canvas 2D shapes the line itself, so a glyph inside a line can sit a fraction
  of a pixel apart (kerning pairs).
- WebGL draws glyphs one by one from its atlas, without shaping: no ligatures or contextual forms. In a font whose
  ligatures join characters (or whole words across a space), WebGL lines are as wide as their separate glyphs, while
  Canvas 2D draws the ligature. Line breaks still come from the shared layout, measured as Canvas 2D shapes the words.
- Element bounds of a heightless wrapping text assume that a piece of a split word is never narrower than a shorter
  piece of it. A font with contextual ligatures that break this can draw such a text's last lines past its bounds,
  so culling can hide them; give such a text a `height`.
- Canvas 2D strokes a circle's border centred on its radius, whatever its `align`; WebGL places it by its `align`
  (`inside`, `center` or `outside`).
- A style's `scale` or `width` grows the culling bounds of the live view (see [Bounds and styles](#bounds-and-styles));
  an export's own rules do not, so an export can crop what only they grow.

## Memory

On WebGL the backend keeps a cache of placed glyph runs, one per font, alignment, pitch and set of lines (so a
camera-aware text has one per set of line breaks it showed, not one per scale), a rotation budget of two generations of
16 MB each (an entry larger than the budget is still accepted, so a generation can exceed it; about 6–8 MB for the
10,000 block titles of the bench's guarantee scene). The shared text metrics hold two generations of 4 MB. It keeps
the depth sub-orders of glyphs in an instance buffer of their own, so a title whose sub-order changes (a primitive
inserted before it) uploads only that buffer.

A camera-aware text takes its glyph capacity in the glyph buffer (112 bytes per glyph and 4 for its sub-order) also
while it shows fewer glyphs: a 30-character name zoomed out to one short line keeps its 30 glyphs (a surrogate pair,
such as an emoji, takes two: a word split at a narrow box can draw it as two halves). World texts keep the glyphs of
their lines. The atlas holds every glyph a camera-aware text can show, packed with its first encode, so a break change
never uploads the atlas; it keeps the glyphs, not the texts. The atlas is one 2048 × 2048 single-channel texture
(4 MB, and as much for its copy in memory) of distance-field glyphs generated at 48 px, about 400 rows per font and
weight for Latin, digits and Cyrillic; a frame that packs new glyphs uploads only the rows they went to. A heightless
world text's layout is kept in the shared layout cache while its primitive lives (its bounds are its laid-out lines,
and both renderers draw that layout).

Instance lists upload their dirty spans, each with one `bufferSubData`, and never more than twice what changed in a
list in a frame. A dense change (every block restyled), whose dirty spans cover at least half of the span enclosing
them, goes up as that one span: many large writes into one buffer can stall a frame for tens of ms. Otherwise gaps
under 16 KB between spans are joined, the smallest first, while the gaps joined add up to no more than the bytes of
the spans themselves; past 64 spans larger gaps are joined too, within that budget. A sparse change (a few texts laid
out again) goes up as its spans.

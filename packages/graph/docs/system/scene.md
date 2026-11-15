# Scene (`graph.scene`)

`graph.scene` is the scene runtime of a graph. It owns the element store (flat lists of drawing primitives with
bounds, a shared `zIndex` and a style id), the renderer that draws them, the scene level and a pausable clock.
The graph frame task updates it right after all layers (`layers.update()`, then `scene.update()`).

## What the scene draws

Blocks and their anchors draw in the scene. Each `CanvasBlock` owns one scene element, and each of its anchors owns a
child element of it (see [Block component](../components/block-component.md) and [Anchors](../components/anchors.md)).
`GraphLayer` stays the parent of these components: it keeps the component tree, events, hit-testing, drags and the
camera.

> Interim (until step 2): connections and immediate components (a `LegacyCanvasBlock`, any component with
> `static override readonly mode = "immediate"`) still draw on the `GraphLayer` canvas. The scene canvas sits above the `GraphLayer`
> canvas and below `ReactLayer`, so scene blocks cover connections, as blocks did before.

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

An element can name a `parent` element: an anchor's element names its block's. A child element:

- takes no rank of its own: it draws right above its parent's primitives and under the next owner element, in its
  parent's raised bucket, among its siblings by `childOrder`;
- is hidden while its parent is hidden, and rises with it (a selection, a drag start, a style `raise`);
- takes its parent's element `dim` when it sets none, and multiplies its own element `opacity` by the parent's; its
  parts are styled by its own rules;
- is deleted with its parent. A child cannot have children.

In WebGL a child's depth is its parent's key plus a sub-order after the parent's primitives.

## Updates

Store changes reach the WebGL backend once per frame. The scene layer queues them and applies them in one batch before
it draws, one entry per element: an add followed by updates stays one add, updates merge their fields, and an add
followed by a delete cancels out. The depth keys are renumbered once per frame, so N element changes cost one
renumbering. The Canvas 2D interpreter reads the store when it draws.

## `compareOrder`

`graph.scene.compareOrder(a, b)` is the scene order of two components, shared by drawing and hit-testing: negative
when `a` draws below `b`. `HitTest` sorts its results with it, so the component drawn on top is hit first.

- Components with a scene key (a `SceneComponent` whose element is written, see `getSceneKey()`) compare by their
  elements: the bucket (`zIndex` plus the style's `raise`), then the element's `order` (a raise gives a new, larger
  one), then a child element right above its parent, siblings by `childOrder`.
- Other components (connections until step 2, groups, layer components) compare by `(zIndex, renderOrder)`.
- A component without a scene key against a scene component compares its `zIndex` with the element's bucket; at an
  equal value it lies above.

## `query` and `drawInterpreted`

`query(rect)` takes a world rectangle as `TRect` (`{ x, y, width, height }`, like `zoomToRect`) and returns read-only
views of the visible (non-hidden) elements whose bounds meet it, in draw order, bottom first: block elements, each
followed by its anchors' child elements. A view's `bounds` is relative to the element's origin (`x`, `y`), and
`hidden` is always `false`. `query` does not filter by level.

`drawInterpreted(ctx, elements, scale, options)` draws views on any 2D context with the Canvas 2D interpreter,
whatever the active renderer. The caller owns the context transform, device pixel ratio included. Options:
`skipText` leaves text out, `level` skips primitives of other levels, `drawHidden` draws hidden elements too, and
`textPolicy` (`{ cameraAware: boolean }`) replaces the `cameraAwareText` setting for this draw. Texts are laid out at
`scale`. The minimap draws scene blocks this way, at the minimalistic level and without text:

```ts
const dpr = window.devicePixelRatio || 1;
const elements = graph.scene.query({ x: 0, y: 0, width: 4000, height: 3000 });
ctx.save();
ctx.setTransform(k * dpr, 0, 0, k * dpr, offsetX * dpr, offsetY * dpr); // world to minimap device pixels
graph.scene.drawInterpreted(ctx, elements, k, { level: "minimalistic", skipText: true });
ctx.restore();
```

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
  first, such as the grid and the `GraphLayer` canvas with connections and `LegacyCanvasBlock`s. The picture is what
  the user sees under the selection and HTML layers. Any other rect draws the scene only (no connections, no
  `LegacyCanvasBlock` bodies), until step 2 moves connections into it.
- **`level` alone.** `toImage({ level })` without `rect` and `scale` is still the current view. The layer canvases
  under the scene come as drawn live, at the live level: connections and `LegacyCanvasBlock` bodies look as on screen.
  Only the scene is drawn at the requested level. For a picture of the scene alone at another level, pass `rect` (for
  example the camera's view in world units) or `scale`.
- **Size.** `scale` and `pixelRatio` must be finite and positive, and the output at most 16,384 px per side and 2^26
  px in total. Otherwise `toImage` throws a `RangeError` before it prepares anything.
- **Anchors.** The picture does not depend on where the camera has been. Blocks create their anchor components lazily
  (see [Anchors](../components/anchors.md#drawing-and-lazy-creation)), so an export creates the missing ones its rect
  and level need, through their normal lifecycle (`renderAnchor`, level methods, tags and styles), and drops them
  after the draw, also when the draw throws. Blocks hidden by a collapsed group or drawn by React get none, and no
  block does while `useBlocksAnchors` is off. The default `Anchor` draws nothing on the minimalistic and detailed
  levels, so exports there create none of them; an `Anchor` subclass counts as drawing on every level.
- **Styles** are computed at the export's level and scale: rules with `scope.levels` or `minScale` / `maxScale` apply
  as at the requested level and scale. An element `dim` or `opacity` that a block's row gains only at the export's
  level also reaches its anchors.
- **Texts** are laid out at the export's `scale` under the `cameraAwareText` setting: a camera-aware name re-fits its
  box as it would on screen at that scale.
- **Cost.** `toImage` is synchronous. A whole-graph export at a level that draws anchors creates and drops every
  missing anchor component in the call: about 0.75 s and +200 MB of peak JS heap for 10,000 blocks with 39,687 anchors
  (Apple M3 Pro). The next frame applies what the export queued: for each temporary anchor
  `AnchorState.$viewComponentReady` went `true` and back to `false`, `graph-component-unmounted` was dispatched, its
  hit box was added and destroyed (`hitTest.isUnstable` until the next hit-test run), and the connections at its port
  recompute their geometry.
- **`Anchor.LOOK_EXTENT`.** The export finds the blocks that need temporary anchors by their rect, widened by their
  anchor points and by the `LOOK_EXTENT` of their anchor classes: 11.5 world units, the default dot and ring with
  `Block`'s anchor props (size 18, lineWidth 2). An `Anchor` subclass whose look reaches farther, or a block that gives
  its anchors a larger `size` or `lineWidth`, declares its own (`public static override LOOK_EXTENT = 40;`). Otherwise
  an export can miss its anchors near the crop edge. Development builds warn, naming the class, when an anchor's
  initial look (the first check of that instance) reaches past its class's extent; a later growth of the same
  instance is not checked.
- **`renderAnchor`.** The search calls a block's `renderAnchor` override to learn its anchor classes, for blocks
  outside the rect too, and the export calls it again when it constructs the anchors: keep it a pure function of the
  block's data. While the block has a pending update (new props or state not applied yet) the search does not call it,
  and the block counts as a candidate. A throw from it aborts the export.
- **Errors.** A call while another export prepares, draws or cleans up throws. So does a call from a block's own
  lifecycle hook (`stateChanged`, `willIterate`, ...) when that block has to create anchors for the export: "cannot
  create the anchors of block `<id>` from that block's own update". Running that update again would run its hooks
  twice. Calls from elsewhere work: an event handler, a layer's `render()`, another component's hook.
- **Timing.** The picture shows the updates applied so far. Inside `batch()` the store's subscribers have not run yet,
  so an export there shows the state before the batch. After `setContext()`, components that derive their look from
  the context show it after their next update. Call `toImage()` after the batch, or on the next frame.
- `toImage` reads no signal for its caller: an effect that exports does not re-run on what the export read.

`graph.getGraphCanvas()` is unchanged: it returns the `GraphLayer` canvas, which holds connections but no scene
blocks. Use `toImage()` for screenshots.

## Styles: `bindStyle`, `styleFor`, `explain`

Elements take their looks from [tags and styles](tags-and-styles.md). `graph.scene.bindStyle(elementId, { type, id },
target)` (`@internal`) keeps an element's style row on the tags of an entity; add the element to the store first.
`graph.scene.styleFor(target, tags)` computes a style, and `graph.scene.explain(entityType, id)` lists an entity's
tags, matched rules and computed style.

## Text primitives

A text primitive draws its `text` in a box: `x`, `y`, `width` and, optionally, `height`. Both renderers and exports lay
it out with one shared layout (`lib/scene/textLayout.ts`), the rules of v1's `layoutText`:

- **Size.** `size` is the font size in world units. With `cameraAware` (`true`, or `{ minWorld?, maxWorld? }`) it is
  in screen pixels at every camera scale: the world font size is `size / scale`, clamped by the bounds. Off
  (`false` or unset) means the authored world size. `lineHeight` is the line pitch at `size`, and the pitch scales
  with the resolved font size.
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
  text: view.name,
  family: "sans-serif",
  weight: "500",
  size: 9,
  cameraAware: { maxWorld: 90 },
  lineHeight: 9,
  x: 10,
  y: 10,
  width: view.width - 20,
  height: view.height - 20,
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
  width: view.width - 62,
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

## Limits

Development builds report each limit with one console error before the WebGL renderer falls back to Canvas 2D
(`$renderer` becomes `"webgl-fallback"`). Production builds check nothing in advance and fall back when the WebGL
backend throws.

- **Parts:** at most 15 distinct part names in the scene, plus `"none"`, which is reserved for primitives without a
  part.
- **zIndex bands:** at most 16, raised buckets included: a block in bucket 200 that the theme raises while selected
  draws in band 201.
- **Owner elements per band:** at most 16,384. Child elements do not count.
- **Depth:** every owner element takes one depth key with 2^b sub-orders, where b is at least 5 and fits the owner with
  the most primitives, its child elements' included. Keys × 2^b must stay within 2^23. With 10,000 owners an owner can
  have 512 primitives with its children; with 262,144 owners (16 full bands), 32. The width follows the widest owner
  and re-encodes nothing when it changes.

## Renderer differences

The two renderers draw the same picture, with these known differences:

- WebGL does not draw `icon` and `polygon` primitives yet, nor the `dash` of rect and circle borders (paths keep
  theirs). Canvas 2D draws them.
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
- A style's `scale` (the theme's ×1.8 anchor hover) is not part of an element's bounds. Canvas 2D viewport and tile
  culling and `toImage` crops can clip a scaled look at their edges.

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
never uploads the atlas; it keeps the glyphs, not the texts. A heightless world text's layout is kept in the shared
layout cache while its primitive lives (its bounds are its laid-out lines, and both renderers draw that layout).

Instance lists upload their dirty spans, each with one `bufferSubData`, and never more than twice what changed in a
list in a frame. A dense change (every block restyled), whose dirty spans cover at least half of the span enclosing
them, goes up as that one span: many large writes into one buffer can stall a frame for tens of ms. Otherwise gaps
under 16 KB between spans are joined, the smallest first, while the gaps joined add up to no more than the bytes of
the spans themselves; past 64 spans larger gaps are joined too, within that budget. A sparse change (a few texts laid
out again) goes up as its spans.

# v2 graph scene: core design (step 1)

The design of the scene core of `@gravity-ui/graph` v2, its declarative components, and tags and styles. Never
committed.

- **Inputs.**
  - The decisions file `2026-11-09-webgl-block-design-questions.md` (sections 1–15, appendices). It holds the reasons
    for every decision; this spec does not repeat them.
  - The WebGL vertical slice: commit `0dbba9d9` and `../research/2026-11-10-webgl-slice-results.md`.
  - The tags research spec, `2026-11-08-graph-tags-styles-research-design.md` in worktree
    `graph-external-states-50c3aa`.
  - The validation `2026-11-09-webgl-scene-spec-validation.md`.
- **Markers.** "(user)" marks a decision of the user; the decisions file has the date and wording. **"Proposal"** marks
  an agent proposal that the user has not confirmed yet. A proposal becomes binding when this spec is approved.
- **Scope.**
  - In: `graph.scene`, the element store and order, LOD, renderers and the renderer state machine, `SceneComponent`,
    `Block`, `Anchor`, evented areas, view data, parts, tags and styles, the handover to HTML, hit-testing, the
    lifecycle, and limits.
  - Out, in their own specs: connections in the scene (step 2); the full WebGL backend with polygons, icons, sprites,
    culling and the `@gravity-ui/graph-webgl` package (step 3); groups (their own layer, V10); the v1 → v2 migration
    guide.

## 1. Goals and success criteria

- **Goal.** One scene draws the graph, with one order for all its elements, so a block can lie under connections or
  above them (user). Looks are declarative, and states are tags (T1–T4).
- **Success criteria per renderer** (user):
  - **canvas:** the same picture as WebGL minus effects, and no slower than 13.5 ms per tick on the guarantee scene
    (pan at scale 0.038);
  - **webgl:** at most 4 ms per tick on the same scene, with effects and animations through the global scheduler. The
    slice measured 1.1 ms CPU. GPU claims wait for the step 3 experiment (user).
- **Tag criteria**, from the tags research spec:
  - a new visual state needs no new component class;
  - a tag change on k entities is O(k);
  - a theme or rule change re-encodes nothing while it changes table properties only.

## 2. Architecture

```text
stores (blocks, anchors, app state) ──▶ components (retained) ──▶ level methods ──▶ elements ──┐
systems (selection, hover, app) ──▶ tags ──▶ stylesheet ──▶ computed style (styleId) ─────────┤
camera ──▶ $level, scale ─────────────────────────────────────────────────────────────────────┤
                                                                                               ▼
                                                   graph.scene: element store, order, styles ──▶ renderer
                                                   (interpreter on Canvas2D | WebGL backend)
```

- **`graph.scene` draws the graph.** It takes GraphLayer's CSS slot (`zIndex` 2) (user).
- **GraphLayer keeps logic only:** the component tree, events, hover, hit-test and the camera component. It owns no
  canvas.
- **Components are retained.** They describe their looks once, and update them when their view data, level or styles
  change. Nothing renders in the frame walk.
- **Layers may still draw.** A layer keeps imperative Canvas2D on its own canvas, and may add scene elements through
  `SceneComponent` (R9).

## 3. `graph.scene`

### 3.1 Public surface (proposal for the names)

```ts
type TSceneLevel = "minimalistic" | "schematic" | "detailed";
type TSceneRenderer = "canvas" | "webgl";
type TSceneRendererState = "canvas" | "loading" | "webgl" | "lost" | "restoring" | "webgl-fallback";

interface IGraphScene {
  /** The one LOD source (section 6). */
  readonly $level: ReadonlySignal<TSceneLevel>;
  /** The actual renderer state (section 8). */
  readonly $renderer: ReadonlySignal<TSceneRendererState>;
  setRenderer(renderer: TSceneRenderer): void;
  /** Seconds on the graph clock (section 3.3). */
  readonly clock: { now(): number };
  /**
   * Elements in a world rect, in scene order (bottom first): for the minimap, export and layers. Options filter by
   * level and entity type and add hidden elements (plan 3b).
   */
  query(rect: TRect, options?: TSceneQueryOptions): readonly TSceneElementView[];
  /** Steps at the end of each graph frame in which elements of that entity type changed (plan 3b). */
  revisionOf(entityType: string): ReadonlySignal<number>;
  /** Called at the end of every graph frame, after every layer and the scene updated (plan 3b). */
  onFrameEnd(listener: () => void): () => void;
  /** Scene order of two components; uses the same key as drawing and hit-testing (section 9). */
  compareOrder(a: SceneComponent, b: SceneComponent): number;
  /** Devtools: tags, matched rules and computed style of an entity (section 7.6). */
  explain(entityType: string, id: string): TStyleExplanation;
}

type TSceneQueryOptions = {
  readonly level?: TSceneLevel;
  readonly includeHidden?: boolean;
  /** The `static entityType` of the component that wrote the element (element metadata, not an id prefix). */
  readonly entityTypes?: readonly string[];
};
```

`query(rect, options)`, `revisionOf(entityType)` and `onFrameEnd(listener)` are public scene API (plan 3b).

`graph.scene.tags` and `graph.scene.styles` belong to the scene (user, 2026-11-11: tags exist for the scene's looks;
the first draft had them as siblings of `graph.scene`). See section 7.

**Settings:**
- `renderer: "canvas" | "webgl"`, default `"canvas"`, changeable at runtime (user);
- `webglBackend?: () => Promise<ISceneBackendModule>`, the loader exported by `@gravity-ui/graph-webgl` (user:
  separate package, luma.gl as a peer).
  - `renderer: "webgl"` without `webglBackend` goes to `webgl-fallback` with one dev warning. *(Until step 3
    moves the backend into `@gravity-ui/graph-webgl`, plan 1 falls back to the built-in dynamic import instead.)*
  - The core imports no WebGL code.

### 3.2 Elements and the store

- **What an element is.** An element is the drawable record of one element-owner component: id, origin `x`/`y`,
  `bounds`, `primitives`, `zIndex`, `order`, `styleId` and `hidden`. Elements are internal; the public API reads them
  through `query()` as read-only views.
- **Store changes.** The store emits changes with the fields that changed. The renderer applies them:
  - `x`/`y`, `hidden` and `styleId` change one record and re-encode nothing;
  - `zIndex` and `order` change the depth key;
  - `primitives` re-encode the element.
- **Bounds** are the union of the primitives at their largest extent over all camera scales (user: bounds padding).
  - For a camera-aware stroke this is `maxWorld`, or `maxPx` at the minimum camera scale.
  - An unbounded size warns in dev mode.
  - Bounds are for culling only. Hit shapes are separate (section 9).

### 3.3 Frame order and the clock (proposal, validation G8)

- **The scene draws after all layers update.** *(As built in plan 1: Graph's one frame task runs `layers.update()`
  and then `scene.update()`, so the scene draws in the same tick after every layer of its graph, with one scheduler
  registration. Elements written by LOW/LOWEST scheduler work (debounced helpers, resize throttle) are drawn a frame
  later.)* The original wording: it registers its own task with the global scheduler, at a priority
  below the layers' frame task, so it runs in the same tick after every layer has written its elements. A layer that
  writes elements during its update is never one frame late.
- **Animations.** While a visible element has an animated effect (WebGL only), the scene asks the scheduler for the
  next frame. Without animations, a frame where only the scene is dirty walks no layer.
- **The graph clock.**
  - `graph.scene.clock.now()` is read once per tick and gives the effect time.
  - It pauses on `graph.stop()` and resumes from the same value on `start()`.
  - It does not advance while the page is hidden.
  - It survives a renderer re-creation, so effects do not restart after a context restore.
- **The Canvas2D cost is stated, not hidden.** On the canvas renderer every change redraws the whole visible scene:
  about 13 ms per frame on the guarantee scene at fit-to-view.

## 4. Primitives

- **Kinds:** `rect`, `circle`, `text`, `icon`, `path`, `polygon` and `sprite`. Coordinates are relative to the
  element origin.
  - The WebGL backend of step 1 draws `rect`, `circle`, `text` and `path`. The other kinds come with step 3. Until
    then the WebGL backend counts skipped primitives in its stats and warns once per kind in dev mode.
- **Camera-aware sizes (user).** Any size may be:
  - a number (world units);
  - `{ px, minWorld?, maxWorld? }`;
  - `{ world, minPx?, maxPx? }`.

  Both renderers resolve them per frame with one function.
- **Parts.** Each primitive may name a `part`. Styles address parts (section 7).
- **Visibility.** Each primitive may carry `minScale`/`maxScale` within its level. The level comes from the method
  that returned it (section 6).
- **Text** (provisional rule kept; pixel-sized text is still open):
  - fields: `text`, `family`, `weight`, `size`, `lineHeight`, `color`, `x`, `y`, `width`, `height?`, `align`,
    `baseline`, `maxLines?`, `overflow: "clip" | "ellipsis"`;
  - text wraps once, at the base size (`resolveSceneSize(size, 1)`).
  - **Proposal (validation G4):**
    - Both renderers place glyphs from one shared layout: advances are measured once on Canvas2D, and the WebGL glyph
      atlas follows that layout. A renderer switch then never moves line breaks.
    - On `document.fonts` `loadingdone`, the scene clears the measure cache and the atlas, and re-lays out text.
    - Level methods get a ctx-free `measureText(text, font)` in their view-data helpers, so layout that depends on
      measured text (Nirvana's centred name and sub-name) stays pure.
- **`sprite`** (proposal, validation T7): an escape hatch for an imperative Canvas2D callback inside the order.
  - It is rasterized into the atlas per scale bucket on both renderers, so both renderers show the same blur between
    buckets.
  - Its cache key includes the `styleId`.

## 5. Components

### 5.1 `SceneComponent`

`SceneComponent` is the base class for declarative scene components (user, Q11). It is a `GraphComponent`.

```ts
abstract class SceneComponent<TView extends object = object> extends GraphComponent {
  /** Retained is the default; immediate components render in the walk (user, lean Q13: confirm at implementation). */
  static mode: "retained" | "immediate";
  /** Tag address of an element owner; blocks are "block", anchors "anchor". */
  static entityType?: string;

  /** View data: the inputs of the level methods (section 5.3). */
  protected getViewData(): TView;
  protected minimalistic?(view: TView): TScenePrimitive[];
  protected schematic?(view: TView): TScenePrimitive[];
  protected detailed?(view: TView): TScenePrimitive[];
  /** Re-runs the level methods for inputs that are not signals. */
  protected invalidate(): void;
}
```

- **Two modes (user):**
  - **Element owner.** It owns a scene element with its own key. The `zIndex` bucket comes from props or the layer,
    and `order` is assigned on mount.
  - **Sub-component.** Sub-components draw in child elements nested in their parent's element, to any depth, keyed by
    their parent's key plus a child sub-order (D2). Anchors (section 5.2) and child components returned from
    `updateChildren()` are sub-components; by default one draws at its parent's origin and is hit by its element's
    bounds (plan 3b).
- **An element owner may have no primitives** (proposal, validation G6.2). It still has a key, a hitbox and events, and
  it counts in the usable rect if it says so. Examples: bend handles, comment anchors, reservers.
- **Event transparency.** `static transparentToEvents = true` lets pointer events pass through a component that has
  a hitbox (proposal, validation G6.6). It lives on `GraphComponent`: the pointer's target, its hover, the cursor and
  `getElementOverPoint()` skip it; its hitbox stays in the usable rect and in `getElementsOverPoint()` /
  `getElementsOverRect()` (plan 3b).
- **Dev warning for a forgotten opt-in** (proposal, validation T8): a retained component that defines `render()` gets
  a warning that the walk will never call it.

### 5.2 `Block` and `Anchor`

- **`Block extends SceneComponent<TBlockView>`.** It adds:
  - data from `BlockState`;
  - `getAnchorClass(anchor)`;
  - drag;
  - the handover to HTML (section 10).

  Registration goes through `blockComponents` by `is`. An unknown `is` falls back to the library's default `Block`.
- **`Anchor extends SceneComponent<TAnchorView>`** is a sub-component of its block. It adds ports and drag-to-connect.
  Its view data carries the parent block's view data (user, V6b).
- **Anchors own scene elements** (user, 2026-11-12; replaces "anchor primitives go into the block's element"). Each
  anchor is a child element with its own `styleId`, so an anchor's selection or hover changes one table row reference,
  not the block's encoding.
  - **Key.** A child element does not take a rank of its own in the bucket: its depth key is the parent's
    `(zIndex, order)` plus a child sub-order, so anchors draw right above their block and under the next block, and
    the 16,384 elements-per-bucket limit still counts blocks only.
  - **Inherited element properties** (agent's reading, to confirm in plan 3 review): a child element inherits the
    parent element's element-level `dim`, `opacity` (multiplied), `raise` and hidden state, so focus, ghost and
    selection raise apply to a block's anchors. Part properties come from the anchor's own rules.
  - **Measured, not assumed** (user, 2026-11-12): plan 3 keeps anchors as components and measures mount time and
    memory of the guarantee scene against today; anchors are created lazily only if it is clearly worse (+50 ms mount
    or +20 % memory).
- **Child components** (formerly "evented areas") are child components with a hit box of their own, hit-tested
  globally, with events and state, and an optional look (user, Q7; D2, plan 3b). The evented-area API is removed.
- **Hover styling is each component's own** (D5). The library `Block` shows as hovered (`hoveredTag`) while the
  pointer's target is it or one of its descendants, as CSS `:hover` (В1); anchors, connections and groups while they
  are the target; a custom component decides for itself (`setHoveredTag`). Events walk the parent chain, and hover
  events carry `relatedTarget`; every pointer event's hit target is `getEventTarget(event)`. No library code reads
  `hoveredTag` to decide behaviour.
- **The handover** (section 10) is `delegateRender({ canvasVisible })`, gated by the detailed level (В4, plan 3b).
- **`selected` is not block state** (user). `BlockState.$state` and `TBlock` carry no `selected`; selection lives in the
  selection buckets and shows through `selectedTag`.

### 5.3 View data and re-runs (user, V6b)

- **What view data is.** `getViewData()` returns the inputs of the level methods. It is read inside a `computed`, so
  every signal it reads is tracked.
  - The default for `Block` is the block data without `x` and `y`.
  - A subclass adds what it reads from its own stores. Example: a title read from an external store.
- **When level methods run again.** Only when the view data changes, by a shallow compare, or after `invalidate()`:
  - a move writes only the element origin;
  - a level change re-encodes nothing (section 6);
  - a style change goes through the style table (section 7).
- **States are tags, not view data.** Muted, highlighted and running are tags.
- **Purity** (proposal, validation T5). Level methods are pure functions of their view data.
  - In dev mode the view data is frozen, and a level method that reads the camera warns.
  - The shallow compare compares `meta` by value one level deep. A consumer that rebuilds `meta` objects on every
    update then does not cause re-runs.
- **Lazy encoding** (proposal, validation T9).
  - Level methods run at mount for every block. The step 1 plan measures the guarantee scene's mount and a change of
    all blocks.
  - If either costs more than 50 ms, off-screen elements become dirty-marked and re-encode when their grid cell is
    next drawn. This is safe because bounds come from the maximum extents (section 3.2).

### 5.4 Limits (from the slice; dev errors name them)

| Limit | Value | When exceeded |
| --- | --- | --- |
| Primitives per element, sub-components included | 32 | dev error; WebGL falls back to Canvas2D |
| Distinct parts in one scene | 15 + "none" (16 slots since plan 3a; the slice had 7) | dev error; WebGL falls back |
| `zIndex` buckets | 16 | dev error; WebGL falls back |
| Elements per bucket | 16,384 | dev error; WebGL falls back |
| Glyph atlas | 1024 × 1024, no eviction | WebGL falls back |

The guarantee scene's 10,000 blocks fill 61 % of one bucket. **Proposal (validation G11):** the step 1 plan measures the
mount time and memory of the guarantee scene with about 40k anchors as components. If it is clearly worse than today,
anchors are created lazily, on the first level that shows them.

## 6. LOD (user; consolidation is a proposal, validation G7)

- **One source.** `graph.scene.$level` is a `computed` over the camera, through the user-replaceable
  `getCameraBlockScaleLevel`.
  - ReactLayer activation, `BlocksList`, the anchor hover factor and the renderers all read it. ReactLayer no longer
    reads `SCALES[2]` directly.
  - Constants change only through `setConstants`, which re-evaluates the level.
- **Levels are masks.** Primitives carry the mask of the level method that returned them, plus optional
  `minScale`/`maxScale`.
- **Every level stays encoded.** The current level is a filter in the interpreter and a uniform in WebGL, so a zoom or
  a level change re-encodes nothing.

## 7. Tags and styles (user: in the core)

### 7.1 Tags

The tag store follows the tags research spec, section 2: `graph.scene.tags` with `set`, `add`, `delete`, `clear`, `bind`,
`setRoot` and `$of`.
- **Address.** Tags are addressed by `(entityType, id)`. Layer components declare `static entityType` (user).
- **Values.** Tags carry discrete values from the first version, e.g. `defineTag<{ color: string }>("presence")`
  (user). Continuous values belong to a per-element channel that is designed later.
- **Built-in tags:**
  - `selectedTag`, bound to the selection buckets;
  - `hoveredTag` (block hover gets no default rule; user: block hover later);
  - `draggingTag`;
  - `dropTargetTag` (groups' layer);
  - `connectionSourceTag` and `connectionTargetTag` (connections spec).
- **The name is `tag`** (user).

### 7.2 Stylesheet

Rules follow the tags research spec, section 3:
- `target` (matched with `instanceof`), `tags`, `notTags`, `root`, `scope` (levels or scale ranges), `priority` and
  `style`;
- `style` may be a function of the tags' values;
- rules are typed by the part schema of the target class (user).

### 7.3 Cascade

- The order is theme rules < values the component puts into its primitives from data < tag rules.
- **Tag rules always win.** There is no `important` (user).
- The theme becomes base rules built from `TGraphColors`.
- Today's selected and hover looks are the theme rules of `selectedTag`, `draggingTag` and anchor `hoveredTag`.
  Examples: border colour `colors.block.selectedBorder`, and anchor scale ×1.8.

### 7.4 What a style can change and what it costs

| Change | Cost |
| --- | --- |
| Colours, `dim`, part visibility, text size parameters, widths within the bounds padding, effect uniforms | one style-table row, or one `styleId` write per tagged entity |
| A paint that becomes translucent or opaque | re-encode the element and move the primitive between passes (user) |
| An effect program, a width beyond the bounds padding | re-encode the element |
| `raise` | the element's `zIndex` bucket +1 while the tag is on (user); undone with the tag |

Further rules:
- **Hiding.** `visible: false` hides the whole primitive in both renderers (user, from the slice).
- **Pseudo-parts.** There are none (user). A state that needs new structure uses a part declared by the component,
  hidden by default.
- **Fading many elements.** Use the opaque `dim`, which stays in the opaque pass. True `opacity` is for few elements.

### 7.5 Computed style

- **Signature and id.** The style is resolved per signature `(class, sorted entity tags, tag values)` into a frozen
  object with an integer `styleId`.
- **Global inputs.** Root tags and the scale band are global inputs, not part of the signature.
- **Lifetime.** Rows are interned and reference-counted. A rule or theme change bumps a generation and recomputes the
  table.

### 7.6 Devtools and React

- `graph.scene.explain(entityType, id)` returns the entity's tags, the matched rules with their priorities, and the
  computed style per part (user: an API in v1, a UI later).
- `GraphBlock` adds a `graph-tag-<name>` class per tag and CSS variables of the computed style, so the detailed level
  follows tags (tags research spec, section 4.10).

## 8. Renderers

### 8.1 Canvas2D interpreter

- **The default renderer** (user).
- **Drawing order.** It draws the visible elements in scene order. Paths of one style are batched within runs of
  consecutive elements, so a block between two connections splits a batch. **Proposal (validation T2):** the step 1
  plan measures the guarantee scene with K = 10, 100 and 1000 blocks interleaved between connection buckets, to state
  the real canvas cost.
- **Effects** are not drawn; each element draws its base look (user).

### 8.2 WebGL backend (slice scope; full scope in step 3)

As built in the slice (commit `0dbba9d9`):
- **Context.** Our own WebGL2 context, created with `{ antialias: true, premultipliedAlpha: true, depth: true,
  preserveDrawingBuffer: false }`. luma.gl 9.4 attaches to it with `luma.attachDevice`.
- **Tables on the GPU.** A depth key of 23 bits: bucket (4), dense rank (14) and sub-order (5). Element and style
  tables are RGBA32F textures, and instance ranges are kept per element.
- **Passes:**
  1. Opaque: depth test `greater` and alpha-to-coverage. The opaque pass writes full colour with coverage as alpha.
  2. Alpha-only: writes alpha 1 on covered samples.
  3. Translucent: by `zIndex` bucket from the lowest up. Inside a bucket the programs run as paths, rects, text, and
     each program is sorted by key (user).
- **Thin strokes.** Strokes thinner than a device pixel are blended in the translucent pass (user). **Proposal:** opaque
  paths are drawn in both passes, with a discard by device width, so a zoom moves no instance.
- **Effects.** Effects are injected through a luma `ShaderPlugin` at `fs:#decl`.

### 8.3 Renderer state machine (user; built in the slice)

`canvas → loading → webgl → lost → restoring → webgl | webgl-fallback`.
- **Loss.** On `onLost` the interpreter draws. On `onRestored` the lost backend is disposed and a new one replays the
  store; a lost backend is never reused.
- **Failures.**
  - Any failure of the loader, the creation, the replay, `apply`, `setStyles` or `draw` disposes the backend, warns
    once and goes to `webgl-fallback`.
  - Detaching the layer disposes the backend; re-attaching reloads it.
- **Proposal:** a loss that arrives during `loading` or `restoring` is remembered. The restore then waits for
  `webglcontextrestored`, so the scene does not end in `webgl` on a dead context.

## 9. Hit-testing (proposal, validation G6)

- **One order key.** Hit order is the scene order `(zIndex, order)`. A sub-component uses
  `(parent zIndex, parent order, child index)`. `graph.scene.compareOrder(a, b)` is public, so a layer can ask "is A
  above B" across kinds.
- **Hit shapes are separate from bounds.**
  - A component's hit shape is its hitbox: the element rectangle for blocks, and their own boxes for sub-components.
  - Primitives outside the hitbox, such as badges and the ×1.8 hover scale, are drawn and culled by bounds, but they
    are not hit.
- **Hit-testability follows the level: hit where shown** (D4, plan 3b).
  - An element owner is hit on every level.
  - A sub-component is hit on the levels where its primitives are visible, and on every level where something
    outside the scene shows its owner (an HTML view's hold at the detailed level, `setRenderDelegated(true)`).
  - Example: an anchor with only `schematic` primitives is not hit at `minimalistic`, nor at `detailed` without an
    HTML view (В5).
  - A sub-component with no primitives is hit only on the levels it declares (`static hitLevels`); without a
    declaration it is not hit, with a development warning.
  - `static hitLevels` is authoritative: it may exclude any level, even under an HTML view.
  - A component hidden for a reason other than delegation is a hit barrier for its whole subtree (as `display: none`).
- **No `renderOrder`.** `HitTest` sorts by the scene key.

## 10. Handover to HTML

- **What `delegateRender` hides** (user). It hides the element's whole scene drawing: the body, the parts and the
  anchors. Connections stay in the scene.
- **HTML lies above the whole scene** (user, documented limitation).
- **The detailed level without React** is drawn by `detailed()`; without that method, by the schematic primitives.
- **When the handover happens** (proposal, validation G3).
  - ReactLayer delegates a block only after its HTML has mounted, so no frame shows neither picture.
  - `GraphBlock canvasVisible` stays as the manual override: `canvasVisible={!ready}` keeps the scene drawing until
    the React view is ready.
  - A delegated block keeps its view data and tags current, because both are signals.
- **React z-index** (proposal, validation T4). It is the dense rank of the element's key among the delegated blocks.
  It is recomputed when that set or a key changes, because the `order` counter grows without bound.

## 11. Lifecycle (proposal, validation G10)

- **Headless and tests.** The default renderer is `"canvas"`, which loads no WebGL code. `graph.scheduler.performUpdate()`
  flushes synchronously and draws with the interpreter, so jsdom tests with `jest-canvas-mock` keep working.
- **SSR.** Importing the core touches no `document`, `OffscreenCanvas` or luma. Canvases are created on attach.
- **DPR and resize.**
  - The scene subscribes to `graph.layers.rootSize`.
  - On a DPR change, the WebGL glyph and sprite atlases are re-rasterized. *(Not in plan 1: glyphs are SDF and scale
    without re-rasterization; sprites arrive in step 3, which handles this.)*
  - The WebGL canvas copies the 2D canvas size each frame.
- **Disposal.** `graph.unmount()` disposes the backend. Disposal destroys luma resources, calls `loseContext()`
  eagerly, removes the WebGL canvas and drops the listeners, so single-page apps do not hit the context limit.
- **Export and screenshots.**
  - Export draws through the interpreter onto its own canvas, so `preserveDrawingBuffer` stays `false`.
  - **`getGraphCanvas()` stays stable** (user, 2026-11-12): it keeps returning the GraphLayer canvas, which layers
    cache for coordinates, listeners and `ownerDocument` (ConnectionEditingLayer, DuplicateBlockLayer, DragService,
    dragListener). Screenshots and export go through a separate scene API (for example `graph.scene.toImage()`) that
    draws the current picture with either renderer. *(Replaces "returns the canvas the scene currently shows".)*

## 12. Minimap

The minimap is a layer with its own canvas (user, Q8):
- it reads `graph.scene.query()`: block elements, in the blocks list order (В2 (а)), hidden ones included;
- it caches its picture and redraws on `revisionOf()` of its block types and on block moves, at most about every
  100 ms during continuous changes (D6, D7);
- it draws the elements' `minimalistic` primitives with the interpreter and its own camera;
- it filters out text;
- it uses computed styles, so it shows tags.

No block API exists just for the minimap.

## 13. Testing

- **CPU modules** (Jest, no GPU): the store and its events, the depth key, the tables, instance ranges, encoders, the
  tag store, rule matching and the cascade, computed style, `resolveSceneSize`, and the renderer state machine with a
  fake backend.
- **Renderer parity** (Jest with the canvas mock): one scene drawn by the interpreter gives the expected calls; the
  same scene encoded for WebGL gives the expected instances. Covers styles, `visible: false` and level masks.
- **GPU checks** (Playwright with the GPU, the slice harness grown into e2e). C1–C12 of the slice, plus:
  - thin strokes blended;
  - the translucent order by bucket;
  - a style that moves a primitive between passes;
  - bounds padding for an outside border at minimum scale.
- **Bench:**
  - the scene bench with `walk`, `cached` and `webgl`;
  - the interleaving experiment (section 8.1);
  - mount and lazy-encoding measurements (sections 5.3, 5.4).

## 14. Open items

- **Pixel-sized text.** Wrap and ellipsis depend on the zoom, so the provisional rule (wrap once at the base size)
  holds until the user decides.
- **The `static mode: "retained" | "immediate"` rename** is confirmed (user, 2026-11-12): it replaces `static detached`
  while v2 is unreleased.
- **Out of this spec:** connections (step 2), the full WebGL backend (step 3), groups, and the migration guide.
- **`--gpu` as the bench default** is still open.

## Appendix: decision index

| Topic | Source |
| --- | --- |
| Scene, renderer setting, effects WebGL-only | decisions §2–§3, V2, V5 |
| luma.gl 9.4 then v10, separate package with peer | decisions §4, V11, slice §10.3 |
| SceneComponent, Block, Anchor, areas, mode | decisions §5, Q2, Q7, Q11, Q13 |
| View data, invalidate, theme | decisions §5.3, V6b |
| LOD | decisions §6, Q3 |
| Order key, buckets, counter | decisions §7, V3, V4 |
| Tags and styles | decisions §8, T1–T4, tag answers 2026-11-10 |
| delegateRender, HTML above the scene | decisions §9, V1, V8 |
| Camera-aware sizes, bounds padding | decisions §11, V7, slice §10.2 |
| Thin strokes, translucent order, style pass change | decisions §8, §11, slice §10.1, §10.5, §10.6 |
| GPU experiment at step 3 | decisions §14, slice §10.4 |

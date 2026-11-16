# Plan 3b facts: areas, handover, minimap, anchor classes, event transparency, hit levels

Code facts for plan 3b (`docs/superpowers/plans/2026-11-15-scene-blocks-3b.md`). Read on 2026-11-15 at HEAD `a614f42e`
(branch `claude/webgl-unified-scene`, plan 3a committed). Paths are under `packages/graph/src/` unless they start with
`packages/`, `apps/`, `scripts/` or `.superpowers/`. Never committed.

**Revised in fix round 1** (2026-11-15) after the Codex and Opus plan reviews
(`.superpowers/sdd/2026-11-15-scene-blocks-3b/{codex,opus}-plan-review.md`) and the user's decisions D1–D4
(`plan-fix1-brief.md`). The user removed the evented-area API (D2): section 1 stays as the record of what is removed.
New in this revision: section 2's `hidden` dependency and layer order, section 3's draw order and change costs, section
5's v1 hit check at the detailed level, section 6's non-bubbling events, and the corrections of section 12.

**Revised in fix round 2** (2026-11-15) after the Codex re-review (`codex-plan-rereview.md`) and the user's answers
В1–В5 (`plan-fix2-brief.md`). New: section 5's connection-editing paths, the e2e scale and the store's one-level
nesting; section 6's hover facts and hit-index timing; section 11's risks; the corrections of section 12b.

**Revised in fix round 3** (2026-11-15) after the second Codex re-review (`codex-plan-rereview2.md`) and the user's
event model D5 (`plan-fix3-brief.md`, with two refinements). New: section 6's D5 facts (dispatch, `hoveredTag`'s
consumers, captures, root exit, the tests that drive the tag); section 12a on composed rows and child orders; the
corrections of section 12c.

**Revised in fix round 4** (2026-11-15) after the third Codex re-review (`codex-plan-rereview3.md`,
`plan-fix4-brief.md`; no new user decisions). New: section 6's round-4 facts (the bus detail and its type, the helper
default, the throttle, the unmount order, hit box writers, lazy anchors, camera emulation); section 9's
`dispatchEvent` under D5; section 10's hit-level, retarget and dispatch costs; the corrections of section 12d.

Each section separates **facts** (what the code does, with `file:line`) from **inferences** (what follows, marked
"Inference"). Nirvana paths use two prefixes:

- `GE` = `~/arcadia/nirvana/frontend/src/ui/nirvana/pages/page-flow/next-workflow/components/WorkflowGraph/components/GraphEditor`;
- `C` = `GE/components/canvas` (`NirvanaBaseBlock.ts`, `NirvanaAnchor.ts`, `NirvanaBlock.tsx`, ...).

Nirvana uses `@gravity-ui/graph` 1.13.0 (`~/arcadia/nirvana/frontend/package.json:231`); `~/arcadia/data-ui/nirvana-common`
has no graph code (no dependency, no graph imports in `src`).

## 1. Evented areas today (removed by D2)

D2: «eventedArea давай в целом уберем, но важно чтобы sceneComponent мог иметь дочерние элементы которые будут
рисоваться и учавствовать в событийной модели». The facts below describe what plan 3b removes; the migration recipe
maps each case to a child scene component.

**Facts.**

- **Registration while painting.** `EventedComponent.eventedArea(fn, params)` calls `fn({ hovered })` and stores the
  returned rect (world units) with its params under `params.key` (`components/canvas/EventedComponent/EventedComponent.ts:202-209`).
  `willRender()` clears every area (`:106-116`); `didRender()` fires the `mouseleave` of a hovered area that was not
  registered again (`:118-125`).
- **Only walked components have areas.** `willRender`/`render`/`didRender` run in `Component.renderLifeCycle()`
  (`lib/Component.ts:120-126`), which only `iterate()` calls, and only while the component is in the viewport,
  `shouldRender` and `isRenderAllowed()` (`lib/Component.ts:189-207`). Retained components never get `iterate()`
  (`lib/CoreComponent.ts:106-114`), so a retained `Block` can never register an area.
- **Hit test of an area.** `_areaHitTest(area, data)` uses `params.onHitBox(data)` when given, else a box test of the
  area rect against the pointer's hit box (`EventedComponent.ts:127-142`). The pointer's box is the owner's
  `_lastHitBoxData`, written by `GraphComponent.onHitBox()` each time the hit test tests the owner
  (`components/canvas/GraphComponent/index.ts:430-433`).
- **Dispatch.** `_fireEvent(cmp, event)` runs the component's own listeners, then every area that has a handler for the
  event type and hits, skipping `mouseenter`, `mouseleave`, `key`, `onHitBox` (`EventedComponent.ts:255-290`). So a
  click on an area of a block selects the block (`Block.handleClick`, `components/canvas/blocks/Block.ts:808-812`) and
  calls the area's handler. `_hasListener()` counts area handlers, so `_dipping()` fires a component whose only
  handler for a type is an area's instead of skipping it (`:296-330`).
- **Hover.** GraphLayer calls `targetComponent?._trackAreaHover()` after every root `mousemove`
  (`components/canvas/layers/graphLayer/GraphLayer.ts:180-186`), and `prevTargetComponent?._clearAreaHover(true)`
  before the `mouseleave` of a changed target (`:290-300`). `_trackAreaHover()` takes the **first registered** area
  that hits, fires synthetic `mouseleave`/`mouseenter` (`bubbles: false`) and re-renders the owner (`:144-184`).
- **Event order the e2e pins** (`apps/e2e/tests/evented-area.spec.ts:339-402`): entering a block over an area fires
  `component:mouseenter` then `area:mouseenter`; moving inside the block from an area to the body fires only
  `area:mouseleave` (the block stays the target); leaving fires `area:mouseleave` then `component:mouseleave`.
- **The e2e runs on `LegacyCanvasBlock`.** Plan 3a moved the five test blocks to `LegacyCanvasBlock` with `render()` +
  `eventedArea()` (`apps/e2e/tests/evented-area.spec.ts:11-152`, 22 tests). No library component, story or bench
  registers areas (grep of `eventedArea` over `packages/*/src`, `apps/storybook/src`, `scripts`: only
  `EventedComponent.ts`, its test and the e2e).
- **Docs:** `packages/graph/docs/system/event-model.md:108-112`, `packages/graph/docs/components/canvas-graph-component.md:338-358`,
  `packages/graph/docs/system/component-lifecycle.md:134` (areas are registered while painting).

**Inferences.**

- A block delegated to React keeps the areas of its last paint: `isRenderAllowed()` is false, so `willRender()` does not
  clear them (`GraphComponent/index.ts:374-376`, `Component.ts:203-207`). Clicking such a stale area on a React block
  still runs its handler. Nothing documents it; it is an accident of v1.
- Overlapping areas: hover goes to the first registered one, a click to every one that hits. v1's draw order (later
  areas paint on top) and hover order disagree.

## 2. The handover to HTML

**Facts.**

- **The switch.** `GraphComponent.setRenderDelegated(d)` = `setVisibility(!d, { removeHitbox: false })`
  (`GraphComponent/index.ts:397-416`): it sets `hidden`, keeps the hit box and calls `performRender()`. Other callers:
  connection tests (`components/canvas/connections/visibility.test.ts:322-335`), `customLifecycle.test.ts:130-135`,
  `SceneComponent.test.ts:107-199`, `Block.scene.test.ts:259`, `exportAnchors.test.ts:709`.
- **What it hides in the scene.** `Block.isSceneHidden()` = `this.hidden || this.blockHidden` (`Block.ts:716-718`),
  read in the component's queued update (`components/canvas/scene/SceneComponent.ts:286-289,526-558`). Child elements
  inherit the parent's hidden state (`lib/scene/SceneStore.ts` `isDrawnHidden`, used by `query` at `:565`). So a
  delegated block hides its body, its parts and its anchors (plan 3a, `Block.scene.test.ts:255-266`), and keeps its hit
  box. Connections are not children and stay.
- **Hidden blocks stay current.** The scene component writes its element whatever its hidden state: view data,
  origin, bucket and primitives are synced in `syncSceneElement` (`SceneComponent.ts:526-558`), and its style binding
  follows tags. `isRendered()` is false while hidden (`SceneComponent.ts:322-330`); `LegacyCanvasBlock.isRendered()` is
  `shouldRender && isVisible()` (`components/canvas/blocks/LegacyCanvasBlock.ts:46-49`).
- **Who calls it.** graph-react's `GraphBlock` calls `viewState?.setRenderDelegated(true)` in a passive `useEffect`
  after its HTML mounted, or `setRenderDelegated(!canvasVisible)` with `autoHideCanvas={false}`, and
  `setRenderDelegated(false)` in the cleanup (`packages/graph-react/src/Block.tsx:128-141`). Nothing else in the repo
  calls it at runtime.
- **When HTML is shown.** `ReactLayer` sets its HTML layer active exactly at `graph.scene.$level === "detailed"`, in a
  synchronous signal callback (`packages/graph-react/src/layer/ReactLayer.tsx:34-41`); `Layer.setHtmlActive` toggles the
  `layer-hidden` class at once (`services/Layer.ts:486-503`). `BlocksList` lists the blocks in the viewport at the
  detailed level, and `[]` otherwise (`packages/graph-react/src/BlocksList.tsx:44-60`), through `useSceneChange`, a
  scheduler debounce at `HIGHEST` priority with `frameInterval: 1` (`packages/graph-react/src/hooks/useSceneChange.ts:15-41`).
- **The level is synchronous with the camera.** `CameraService.set()` writes `graph.$camera` at once
  (`services/camera/CameraService.ts:94-108`); `graph.scene.$level` is a computed over it
  (`services/scene/sceneLevel.ts:24-30`).
- **React z-index.** `Block.$viewState` is `{ zIndex: 0, order: rank }`, where `rank` comes from
  `graph.scene.delegatedRanks` while a container watches the signal (`Block.ts:1053-1068`,
  `services/scene/DelegatedRanks.ts:18-103`), applied by `applyBlockContainerLayout` (`packages/graph-react/src/utils/applyBlockContainerLayout.ts:34-40`).
  Ranks flush once per frame in `GraphScene.update()` (`services/scene/GraphScene.ts:209-213`), so a new container gets
  its rank one frame late (ledger `progress.md:94`).
- **e2e:** `apps/e2e/tests/block/block-render-delegated.spec.ts:60-194` (no HTML at 0.3, HTML and `isRendered() ===
  false` at 1.0, hit box kept, zoom transitions after `waitForFrames(5)`). No test checks the frames in between.
- **Name.** The spec's `delegateRender` does not exist; the method is `setRenderDelegated` on `GraphComponent`.
- **Consumers read `hidden` as "an HTML view holds me".** Nirvana keeps its React view's snapshot current only while
  `this.isVisible() || this.hidden` (`C/NirvanaBaseBlock.ts:253-262`, comment: "setRenderDelegated/setHiddenBlock which
  sets this.hidden = true"). A handover that no longer sets `hidden` makes that branch skip the update for every block
  an HTML view holds.
- **Layer order is not fixed.** Layers update in `Set` insertion order (`services/LayersService.ts:106-115`), but
  `LayersService.attachLayer()` re-adds a detached layer at the end (`LayersService.ts:75-86`). So after a detach and a
  re-attach of GraphLayer, a ReactLayer created later updates before it.
- **Standalone ReactLayers.** `packages/graph-react/src/layer/ReactLayer.test.ts:25-41` builds `new ReactLayer(...)`
  outside `graph.layers`; four tests check `isHtmlActive()` synchronously after `camera.set` or a strategy change
  (`:375-438`: "should hide HTML layer…", "should toggle visibility…", "follows graph.scene.$level…", "reacts to a
  strategy change…"). Such a layer is never updated by a frame (`lib/CoreComponent.ts:552-560`: roots are not driven on
  their own).

**Inferences.**

- **A blank frame on zoom-out, in v1 and in 3a (unmeasured).** On a zoom from detailed to schematic, the HTML layer is
  hidden in the same task as the camera change, but a delegated block stays hidden in the scene until React unmounts its
  `GraphBlock` and the passive cleanup calls `setRenderDelegated(false)`. That needs the `BlocksList` debounce, a React
  render and commit (asynchronous for `createRoot`), the passive cleanup, and then the block's queued update in a later
  graph frame. Whether a painted frame shows neither picture, and for how many frames, depends on callback and React
  timing; static reading cannot establish it. Plan 3b Task 8's e2e samples the frame output to settle it.
- **Zoom-in has no gap.** At the detailed level the scene draws `detailed()` (the default block's body without its
  title) until the HTML mounted and its effect ran; both pictures overlap for a frame, the HTML on top.
- **Deriving the switch from the level removes the gap only with the HTML switch in the same frame.** If the effective
  delegation is "an HTML view holds the block and the level is detailed", a level change flips it at once, and the
  block's update runs in the next graph frame. The HTML layer must switch in that same frame, after the blocks'
  updates: relying on the layer order breaks after a re-attach (above), so the switch belongs at the end of the graph
  frame (a scene frame-end hook). This is "derive, don't override": `GraphBlock` stays the only writer of its request.

## 3. The minimap

**Facts.**

- **Drawing.** `MiniMapLayer.renderBlocks()` walks `rootStore.blocksList.$blocks`, draws a `LegacyCanvasBlock` with
  `renderMinimalisticBlock(ctx, { text: false })`, and collects the other blocks' elements through the internal
  `SceneComponent.getSceneElementView()`, drawn with `graph.scene.drawInterpreted(ctx, run, scale, { level:
  "minimalistic", skipText: true, drawHidden: true })` (`packages/graph-minimap/src/layer.ts:233-262`,
  `SceneComponent.ts:312-315` "the minimap draws it until 3b"). Anchors (child elements) are not drawn.
- **Redraw triggers.** `$usableRect`, `colors-changed`, `block-change`, `blocks-geometry-change` and every camera change
  (`layer.ts:62-89`). No store or tag change redraws it: a selection or a tag rule shows on the minimap only at the next
  camera move or block change.
- **Every redraw is full.** A camera pan redraws all 10k blocks (`render()` → `renderBlocks()`, `layer.ts:98-114`).
- **`graph.scene.query(rect)`** returns frozen copies of the visible, non-hidden elements in draw order, owners with
  their children, with no level, type or hidden option (`services/scene/GraphScene.ts:436-453`,
  `lib/scene/SceneStore.ts:546-593`; the hidden filter is at `SceneStore.ts:565`). Its views carry no entity type; the
  element id of a scene component is `entityKey(type, id)` = `` `${type}\u0000${id}` `` (`services/tags/TagStore.ts:8-10`,
  `SceneComponent.ts:296-300`), and the store already splits the id to name a type (`SceneStore.ts:70-71`).
- **Public change signal.** None. `graph.scene.store` is `@internal` (`GraphScene.ts:95-96`); its `subscribe` /
  `subscribeStyles` (`SceneStore.ts:236-255`) are what `SceneRendererLayer` uses (`lib/scene/SceneRendererLayer.ts:85-100`).
  `$styleGeneration` changes on rule, root-tag, level and scale-band changes, not on per-entity tag changes
  (`services/scene/types.ts:70-74`).
- **Graph frame order.** One frame task runs `layers.update()` and then `scene.update()` (`graph.ts:131-135`); layers
  update in creation order, so a minimap added after GraphLayer updates after it.
- **v1 minimap** (Nirvana's installed build): it called `viewComponent?.renderMinimalisticBlock(this.context.ctx)` for
  every block with no hidden check (`~/arcadia/nirvana/frontend/node_modules/@gravity-ui/graph/build/plugins/minimap/layer.js:209-214`),
  so collapsed and delegated blocks were drawn, without anchors.
- **Bench and e2e.** `scene-run.mjs --minimap` adds a `MiniMapLayer` to the blocks columns
  (`scripts/bench/culling/scene-run.mjs:34-35`, `scripts/bench/culling/scene/blocks.ts:110`); no 3a number with the
  final tree exists. The e2e (`apps/e2e/tests/minimap/*.spec.ts`) checks navigation, styling and text, not block
  pixels; `minimap-text.spec.ts:46-66` patches the minimap canvas's `fillText`.
- **Docs** state the 3a behaviour: `packages/graph/docs/system/scene.md:96-118` (query example for a minimap),
  `packages/graph/docs/migration-guides/v1-to-v2.md:1206-1209`.
- **Draw order.** HEAD paints blocks in `$blocks` list order, flushing scene runs around each `LegacyCanvasBlock`
  (`layer.ts:245-262`); v1 also used list order. `query()` returns scene order: bucket with the style's raise, then
  `order`, so a selected or raised block comes last (`SceneStore.ts:447-462,557-593`). Overlapping blocks would stack
  differently on the minimap if it drew in query order.
- **Drags redraw in the same frame.** `block-change` is emitted synchronously by `BlocksList.updatePosition()`
  (`store/block/BlocksList.ts:239-250`), and the minimap updates after GraphLayer in `layers.update()`. A change that
  reaches the minimap only through the scene's end-of-frame step (a tag, a style) is drawn one frame later.
- **What a scene change counts.** The store emits a change for every element (`SceneStore.emit`), anchors and other
  child elements included, and `subscribeStyles` fires for every row defined, freed or replaced and for the dim colour
  (`SceneStore.ts:236-300,366-430`). Hovering an anchor changes the anchor's row reference, may define a row and frees
  the old one when its last user leaves (rows are interned and counted, spec §7.5). A minimap that redraws on every
  scene change would redraw all blocks on each anchor hover.
- **Cost of `query()` per redraw.** A tile walk, a sort of the found owners and one frozen copy per element
  (`GraphScene.ts:436-453`); HEAD reads each block's live element with a `Map` lookup (`SceneComponent.ts:312-315`).
- **Element ids are not entity types.** `createSceneElementId()` may be overridden (`SceneComponent.ts:296-304`); a
  block that keeps `entityType = "block"` and uses another id would not match an id-prefix filter.
- **`minimap-text.spec.ts` patches the visible canvas's `fillText`** and triggers redraws with camera moves
  (`apps/e2e/tests/minimap/minimap-text.spec.ts:43-87`); a cached picture draws text on another context and redraws
  without camera moves, so that spec would stop seeing what it checks.

**Inferences.**

- Moving to `query()` as it is drops every delegated block from the minimap (they are hidden), and would draw any
  future scene element with a minimalistic look (a custom anchor class, a layer component, connections in step 2).
  The minimap needs `query` options: hidden elements, a level, entity types (as metadata, not id prefixes).
- With a change signal per entity type, the minimap can cache its block picture, redraw it only when block elements
  change, and blit it on camera moves; `LegacyCanvasBlock`s, whose looks live outside their elements, still need a
  full redraw on camera moves to keep HEAD's behaviour.

## 4. Anchor classes and `renderAnchor`

**Facts.**

- **Creation.** `Block.updateChildren()` maps the anchor list through `renderAnchor(anchor)`, lazily
  (`Block.ts:955-969`); the default `renderAnchor` creates `Anchor` with `{ ...anchor, zIndex, size: 18, lineWidth: 2,
  port }` keyed by `anchor.id` (`Block.ts:929-942`). The only in-repo override outside tests is identical to the
  default (`apps/storybook/src/stories/Playground/ActionBlock/index.tsx:142-154`). Test overrides:
  `components/canvas/blocks/exportAnchors.test.ts:137,180,212,536` (and `ClassAnchorBlock` subclasses),
  `components/canvas/blocks/lazyAnchors.test.ts:438`, `components/canvas/anchors/Anchor.scene.test.ts:213`,
  `components/canvas/nativeVisibilityCulling.test.ts:35`.
- **Classes without constructing.** Exports and the lazy rule read anchor classes through `anchorClasses()`, which
  calls `renderAnchor()` per anchor and reads `.klass` (`Block.ts:678-684`); while the block has a pending update it
  returns `undefined` and the block counts as a candidate (`:661-669`). `renderAnchor()` calls `getAnchorPort()`, which
  claims the port (`GraphComponent/index.ts:113-121`). The ledger records "renderAnchor runs twice per update until
  anchors exist" and "renderAnchor override runs per anchor per export" (`.superpowers/sdd/2026-11-12-scene-blocks/progress.md:184,196`).
- **Reach.** `Anchor.LOOK_EXTENT = 11.5` (`components/canvas/anchors/index.ts:82-96`), exact only for size 18 and
  line width 2 (`progress.md:184`). The graph-wide reach is the largest extent read so far (`Block.ts:161-180`); a class
  is read only by `anchorLookReach()` in a block's lazy test (`:548-554`) or by an export. Residual: "custom
  LOOK_EXTENT unknown before first camera search" (`progress.md:196`).
- **Levels.** Anchors are created at the schematic and detailed levels only: `shouldCreateAnchors()` returns false at
  minimalistic (`Block.ts:531-541`), and the camera's view test returns at once there (`components/canvas/blocks/Blocks.ts:199-200`).
  `Anchor.drawsOnLevel(klass, level)` is conservative for exports: every subclass counts as drawing on every level
  (`anchors/index.ts:98-108`).
- **Hit.** `Anchor.onHitBox()` returns false at minimalistic (`anchors/index.ts:277-284`); `graph.getElementsOverRect()`
  drops `Anchor` instances there (`graph.ts:308-325`). Tests: `lazyAnchors.test.ts:188-204,345-359`.
- **Typing (probe in `.superpowers/sdd/2026-11-12-scene-blocks/t3b-probe/`, tsc 6 strict).**
  - `typeof Anchor` has a generic construct signature, so `class SquareAnchor extends Anchor {}` (non-generic) is **not**
    assignable to `typeof Anchor` (TS2419). The in-repo tests use the generic form
    `class X<T extends TAnchorProps = TAnchorProps> extends Anchor<T>` for this reason.
  - A subclass whose props add required fields (Nirvana's `NirvanaAnchor extends Anchor<TNirvanaAnchorProps>`) is not
    assignable to `typeof Anchor`, and `NirvanaLikeAnchor.create(...)` is not assignable to the 3a return type
    `ComponentDescriptor<typeof Anchor>` (TS2322).
  - A non-generic type `(new (props: TAnchorProps, parent: Component) => Anchor) & Pick<typeof Anchor, "LOOK_EXTENT" |
    "create" | ...>` accepts `Anchor`, plain subclasses and generic subclasses, rejects the required-extra-props one,
    and `klass.create(...)` on it is a `ChildDescriptor`.

**Inferences.**

- **A custom class with a minimalistic look is drawn at minimalistic only if the camera visited schematic first**
  (anchors are kept once created). The picture then depends on camera history, which plan 3a removed for exports.
- `getAnchorClass(anchor)` (spec §5.2, decisions §5.5 "the library creates the anchor") is cheap and side-effect free
  (no port claims), so a block can read its classes in its own update, after its data is applied, whenever that data
  changed (not only when the anchor list changes: Nirvana picks shapes from `this.state.meta.anchorsMeta`, and `$anchors`
  does not follow block meta, `store/block/Block.ts:123-125,244-250`). That closes the `LOOK_EXTENT` residual and keeps
  classes, reach and creation levels current for an offscreen block too.
- Detecting "this class draws on the minimalistic level" by prototype identity would count an override that returns
  `[]`; an explicit declaration (with a development warning learned from a created instance's primitives) avoids
  creating every anchor of such a class at far zoom by accident (Opus review I5).
- Extra props have no source once the library creates the anchor; an anchor class reads what it needs from its anchor
  data (`this.props`: id, type, index) and its block's view data (`view.block`, spec V6b). Nirvana's shapes become
  classes (circle, square, triangle) picked per anchor.

## 5. Hit-testing and the scene order

**Facts.**

- `HitTest.testHitBox()` collects items whose `onHitBox(data)` is true and sorts them by `graph.scene.compareOrder(b, a)`
  (`services/HitTest.ts:362-375`); `testBox()` neither filters nor sorts (`:316-319`).
- `GraphScene.compareOrder(a, b)` compares scene keys (element order, child rank, then `sub`), and components without
  a key by `(zIndex, renderOrder)`, above scene components of an equal zIndex (`GraphScene.ts:412-434`). A key is
  `{ elementId, sub }` (`services/scene/sceneKey.ts:1-13`); every SceneComponent today has `sub: 0`
  (`SceneComponent.ts:307-310,607`).
- The ledger's deferred minor "comment for scene key without stored element falling back to tree zIndex"
  (`deferred-minors.md:10`) applies to `sceneElementOf` (`GraphScene.ts:430-434`).
- No component other than `Anchor` restricts its hit-testing by level. `GraphComponent.onHitBox()` returns
  `isIterated()` (`GraphComponent/index.ts:430-433`).
- Child-element order of anchors is their `renderOrder` among the block's retained children
  (`anchors/index.ts:383-389`, `lib/CoreComponent.ts:455-470`); every reconcile calls `setProps` on kept children,
  which queues their update (`lib/CoreComponent.ts:419-428`, `lib/Component.ts:50-61`).

- **v1 at the detailed level without React** (Nirvana's installed 1.13.0 build): `Anchor.render()` returns at once at
  the detailed level (`~/arcadia/nirvana/frontend/node_modules/@gravity-ui/graph/build/components/canvas/anchors/index.js:150-152`),
  so v1 drew no canvas anchors there; it has no `onHitBox` override (`:1-175`), so v1 anchors were hit on every level,
  the detailed one included, and drawn and hit at the minimalistic level. v1 blocks drew `renderDetailedView()` (the
  body without the name) at the detailed level (`build/components/canvas/blocks/Block.js:377-396`).
- **Every event comes from the graph's bus.** GraphLayer listens on the root, where events of HTML views bubble
  (`GraphLayer.ts:133-141`), and targets the hit-tested component (`GraphLayer.ts:264`); a click on a React
  `GraphBlockAnchor` therefore reaches `graph.on("click")` with the canvas anchor as target only while the canvas
  anchor is hittable at that level.
- **Rect queries and ports.** `getElementsInViewport()` is `getElementsOverRect()` of the viewport (`graph.ts:303-306`).
  Its users: connection snapping (`graph-connection-editing/src/ConnectionEditingLayer.ts:738-752`, the ports of every
  `GraphComponent` in view), selection by area (`SelectionLayer.ts:158-166`, `SELECTABLE_ENTITY_TYPES` defaults to
  `[Block]`, `graphConfig.ts:315`) and graph-react's block list (`BlocksList.tsx:56`, `[CanvasBlock]`). A block's
  anchor ports live in the block's own port map: `Block.getAnchorPort()` calls `GraphComponent.getPort()`, which
  creates them in `this.ports` (`Block.ts:774-776`, `GraphComponent/index.ts:113-120`), and `getPorts()` returns that
  map (`:127-129`).
- **Child order and keys.** `childOrder` must be an integer of at least 0 (`SceneStore.ts:95-98`); children sort by it,
  then by the order they were added (`SceneStore.ts:635-646`). Two child descriptors with one key map to one entry of
  the children map: the second construction overwrites the first under that key (`lib/CoreComponent.ts:417-431,
  352-376`); nothing reports it.

**Inferences.**

- "Hit-testable on the levels where its primitives are visible" (spec §9) cannot apply to the stock `Anchor` as
  written: it has primitives only at schematic, but its block's HTML view shows it at detailed, and connection creation
  starts from the canvas anchor there (Nirvana relies on it, section 9). D4 settles it: a component is hit on the
  levels where it is shown, by its scene look or by an HTML view.
- Under D4, a stock anchor at the detailed level *without* an HTML view is no longer hit; v1 hit it there although it
  drew nothing. v1 drew no canvas anchor at detailed, so no detailed look is needed to keep v1's picture.
- If rect queries follow the same rule (plan Task 4), an anchor not shown at the detailed level leaves
  `getElementsInViewport()` there. Selection by area and the block list ask for blocks, which are hit on every level.
- **Connection editing under D4** (corrected in round 2; the re-review's table is the list of consequences, plan
  "Decisions applied"):
  - the snapping tree takes only ports whose meta marks them `snappable` (`ConnectionEditingLayer.ts:229-232,
    738-752`), so it does not keep a plain anchor;
  - a gesture's source is a snappable port of the pressed component, an `Anchor`, or a block with Shift
    (`:283-312`). Its end is the nearest snappable port, a snappable port under the cursor, or, for anchor and block
    sources, the `CanvasBlock` or `Anchor` under the cursor (`:444-478`);
  - at detailed without HTML the pressed component and the one under the cursor are the block, so a plain anchor
    starts nothing (the press is the block's: a drag), and a gesture that ends on its point ends on the block's input
    port;
  - a snappable anchor port is still found through the block's port map (`findPortAtPointByComponent` on the block,
    `:285-293`). This is an inference that plan Task 4's e2e checks.
- **The connection-editing e2e runs at the detailed level.** `connection-editing.spec.ts` initializes with
  `zoomTo("center")` (`page-objects/GraphPageObject.ts:66`), which fits its 700 × 400 scene into a `100vw × 100vh` root
  (`apps/e2e/pages/base.html:12-14`). The camera clamps to `scaleMax` 1 (`CameraService.ts:70,274,305-306`), so its
  anchor gestures run at the detailed level without HTML. The React spec moves to 0.5 first
  (`connection-editing-react.spec.ts:132-133`).
- **The store keeps one level of child elements today.** `add` rejects a child whose parent is a child
  (`SceneStore.ts:199-203`). Hidden comes from the physical root only (`isDrawnHidden`, `SceneStore.ts:272-274`;
  the query's test, `:565`), and so do the inherited element styles (`applyChildStyle`, `:672-694`). The WebGL
  backend assumes the same: `hiddenInScene` reads the owner (`WebGLSceneBackend.ts:816-818`), and only an owner's
  hidden change rewrites its children (`:727-728`). Its depth bases follow `childrenOf(owner)` (`:832-850`), which a
  pre-order list satisfies. A fixed order span per direct child (round 1) gives a grandchild and its parent's next
  sibling one order, and keeps a grandchild's order after its parent moves: the re-review's probe put `A1` before `A`.

## 6. Event pass-through

**Facts.**

- No transparency API exists. GraphLayer's target is `graph.getElementOverPoint(point) || camera`
  (`GraphLayer.ts:264,273`); `getElementOverPoint` is the first of `getElementsOverPoint` (`graph.ts:267-285`).
- `interactive: false` mutes a component's events but it stays the target (`EventedComponent.ts:84-90,318-320`), so
  events do not reach the component under it.
- `_dipping()` walks parents and ignores `bubbles: false` (`EventedComponent.ts:296-316`); GraphLayer creates
  `mouseenter`/`mouseleave` with `bubbles: false` and `mouseover`/`mouseout` with `bubbles: true`
  (`GraphLayer.ts:290-334`). So a child's `mouseenter` reaches its parent's `mouseenter` listener unless the child
  stops it; `Anchor.handleEvent` stops every event (`anchors/index.ts:310-312`). In the library only connections and
  anchors listen to `mouseenter`/`mouseleave` themselves (`connections/BaseConnection.ts:197,225-228`,
  `anchors/index.ts:139-141`); no container (`Blocks`, `Camera`, `BlockConnections`) does. Nirvana's `dispatchEvent`
  override (`C/NirvanaBaseBlock.ts:127-135`) exists to stop such bubbling from its blocks.
- The cursor follows the graph `mouseenter` target (`components/canvas/layers/cursorLayer/CursorLayer.ts:154-175`)
  and is set on `graph.layers.$root` (`:210-215`). The hovered tag follows `$hoveredComponent`
  (`services/tags/systems.ts:37-43`), written from the target (`GraphLayer.ts:175-178`). It is one component: a
  block loses `hoveredTag` while the pointer is on its anchor.
- React's tag classes follow the entity's tags: `useEntityStyle` (`graph-react/src/hooks/useEntityStyle.ts:8-35`)
  gives `GraphBlock`'s wrapper `graph-tag-<name>` classes and `--graph-block-<part>-color` variables from the computed
  style (`Block.tsx:196-210`).
- `Camera` is an `EventedComponent`, not a `GraphComponent` (`services/camera/Camera.ts:22`); it is the target where
  nothing is hit (`GraphLayer.ts:264`). Connections and groups have no `GraphComponent` children in the library;
  blocks have anchors.
- An unmounted component is dropped from the pointer state without events (`GraphLayer.ts:166-173`, called from
  `GraphComponent.unmount`, `GraphComponent/index.ts:348-350`). GraphLayer finds the target again only on pointer
  input and, with `emulateMouseEventsOnCameraChange`, on camera changes (`GraphLayer.ts:120-126,242-288`).
- Hit boxes reach the index through a queue processed at the lowest scheduler priority, after the frame task
  (`HitTest.ts:127-168`), which then emits `update` (`:161`). Queries before that see the previous boxes.
- Style rows are interned per target class and tag set (`services/styles/StyleResolver.ts:70-80,146-158`). Two tag
  sets that compute the same style get two rows, so a block entering the hovered set changes its row even where no
  rule styles a hovered block.
- `GraphBlock` with `autoHideCanvas={false}` and no `canvasVisible` touches no delegation (`graph-react/src/Block.tsx:128-141`),
  while its HTML anchors draw regardless (`graph-react/src/Anchor.tsx:74`).
- The connection-editing layer's own jest tests call its default actions directly; drags are covered only by the e2e
  suite (`graph-connection-editing/src/ConnectionEditingLayer.test.ts:6`).
- **D5 facts (round 3).**
  - Every event dispatched to a component walks its parent chain, whatever `bubbles` says, and `stopPropagation()`
    ends the walk (`EventedComponent.ts:292-316`). GraphLayer dispatches the hover events of a target change in the
    order leave, out, enter, over (`GraphLayer.ts:290-339`), with `detail.target` and no related target today.
  - `Anchor.handleEvent` calls `stopPropagation()` for every event it gets, hover included
    (`anchors/index.ts:310-312`). So a block's listeners never hear its anchors' `mouseenter`/`mouseleave` today, and
    a block-side hover written from bubbled events needs the anchor to let them pass.
  - `hoveredTag` is read only by style rules: the theme's anchor rule (`services/styles/themeRules.ts:46-50`, the ×1.8
    hover) and the ActionBlock story's block rule (`apps/storybook/src/stories/Playground/ActionBlock/index.tsx:174-182`).
    No library code reads it to decide behaviour. The only mention in components is a comment
    (`GraphComponent/index.ts:348`, `anchors/index.ts:364`).
  - Blocks already register a component listener (`click`, `Block.ts:485`); each new event type adds one listener set
    per block. Inference: two more types on 10k blocks would cost several hundred bytes each, a few MB against the
    +2 MB heap gate, so plan 3b's `Block` follows bubbled events through a prototype hook (`onDispatchedEvent`)
    instead of per-instance listeners.
  - Tests that drive `hoveredTag` through `setHoveredComponent` (the binding): `services/tags/systems.test.ts:55-77`,
    `components/canvas/anchors/Anchor.scene.test.ts:106-109`, `components/canvas/blocks/exportAnchors.test.ts:670`.
    No other test, story or bench does (grep of `setHoveredComponent`).
  - Nirvana's hover menu follows the bus: `useHoveredGraphComponent` ignores an enter of another type and resets on a
    block's leave (`GE/hooks/useHoveredGraphComponent.ts:104-140`); `BlockMenu` uses it with `types: [NirvanaBlock]`
    (`GE/Layers/BlockMenuLayer/components/BlockMenu/BlockMenu.tsx:14-25`). The bus keeps its target semantics under D5,
    so the menu behaves as today.
- **Captures and the root (round 3).** `captureEvents` and `releaseCapture` (`GraphLayer.ts:148-156`) are used by the
  drag listener at a drag's start and end (`utils/functions/dragListener.ts:166,209`). `updateTargetComponent` returns
  in its capture branch before it stores the pointer's position (`GraphLayer.ts:250-262`), and `releaseCapture` only
  publishes the previous target. GraphLayer has no handler for the pointer leaving the root (it listens to the root's
  bubbling events and `mousemove`, `GraphLayer.ts:133-141`).
- **The bus, the sides of a change, removals and hit boxes (round 4).**
  - `dispatchNativeEvent` builds the bus detail from `target`, `pointerPressed` and `sourceEvent` only
    (`GraphLayer.ts:211-229`). `graph.on()` and `useGraphEvent` are typed by `graphEvents.ts:7-11`'s own
    `GraphMouseEvent`, not by GraphLayer's local type. Of the hover events only `mouseenter` and `mouseleave` are bus
    events (`graphEvents.ts:18,40,47-49`).
  - Jest's transform is `@swc/jest` (`packages/graph/jest.config.mjs:11-13`), which strips types without checking
    them. `packages/graph/tsconfig.json` includes `src/**/*.ts`, tests too, so `pnpm --dir packages/graph run
    typecheck` checks them; type-only tests are `*.test-d.ts` files (`services/styles/types.test-d.ts:1`), which
    Jest's default pattern does not run and `tsconfig.publish.json` excludes.
  - `applyEventToTargetComponent(event, target = this.targetComponent)` (`GraphLayer.ts:231-240`): a default
    parameter applies to an explicit `undefined` too. At HEAD the first entry (`prevTargetComponent` undefined)
    therefore sends the new target a `mouseleave` and a `mouseout` with `detail.target` undefined, and the bus's
    `mouseleave` names the new target (`GraphLayer.ts:290-311`).
  - `updateTargetComponent` returns on a move of less than 3 px (Manhattan, `getEventDelta`,
    `utils/functions/index.ts:34-36`) from the last handled one (`GraphLayer.ts:246`) without writing
    `prevTargetComponent`, and `onRootPointerMove` fires whenever the two differ (`:291`). So at HEAD a short move
    right after a change fires that change's four events again. Plan 3b keeps it; its tag writes repeat the same
    values.
  - `CoreComponent.__unmount` flags the component, unmounts its children, then calls its own `unmount()`
    (`CoreComponent.ts:308-320`): a child's `forgetComponent` runs before its parent's (`GraphComponent.unmount`).
  - `Anchor.onPositionChanged` sets its hit box directly (`anchors/index.ts:224-227`); `GraphComponent.setHitBox`
    updates the hit test and the culling bounds only (`GraphComponent/index.ts:363-367`). `BlockState.updateBlock`
    forces the block's hit box update after every update, changed or not (`store/block/Block.ts:244-252`). An
    anchor's place follows `$anchorIndexs`, an index per anchor type (`store/block/Block.ts:104-116`;
    `Block.getAnchorPosition`, `Block.ts:897-904`: `HEAD_HEIGHT + BODY_PADDING` (88) plus `2 * GRID_SIZE` (32) per
    index); `updateAnchors` keeps anchor states by id (`store/block/Block.ts:226-236`).
  - Lazy anchors are created when the camera shows their block (`Blocks.createAnchorsInView`, `Blocks.ts:194-228`), so
    their first hit box comes from a camera move.
  - `onCameraChangeEmulateMouseEvents` checks only the stored coordinates and the capture (`GraphLayer.ts:268-288`).
    It runs synchronously from the committed camera signal (`services/Layer.ts:404,444-447`); `CameraService.set`
    emits `camera-change` and writes it (`CameraService.ts:94-101`).
  - `Camera`'s `click` listener unsets the selection (`services/camera/Camera.ts:42,57-59`); `Block` stops its clicks
    (`Block.ts:809`).

## 7. Style scale outside element bounds (ledger fold-in)

**Facts.** A style's `scale` multiplies a circle's radius when the row is baked (`lib/scene/style.ts:68-70,202,306`)
and is part of the encode key (`style.ts:229`). The store indexes an element by the bounds its component wrote
(`SceneStore.ts:703-707`); a style row change emits `primitives` but never changes the indexed bounds
(`SceneStore.ts:617-636`). The theme's anchor hover is a `scale` of 1.8 (`services/styles/themeRules.ts`, plan 3a
docs `packages/graph/docs/components/anchors.md:19-23`).

**Inference.** A hovered anchor (radius 9 → 16.2; the ring's reach 11.5 → 9 × 1.8 + 5 / 2 = 18.7, since `scale`
multiplies the radius, not the stroke width, `style.ts:68-69`, `anchors/index.ts:395-404`) at a viewport edge is culled
by its unstyled bounds in the Canvas2D interpreter (ledger `progress.md:181,184`, `deferred-minors.md:24`). WebGL does
not cull. Exports resolve styles at their own level and scale and pass them to `query()` for ordering only
(`GraphScene.ts:614-627`), so a row that grows geometry only in an export is not found by the export's crop either
(Codex review finding 2); D3 («экспорт картинки - картинка нам в целом не сильно важна») leaves that as a documented
limitation.

## 8. `LegacyCanvasBlock` interplay

**Facts.** `LegacyCanvasBlock` is `mode = "immediate"` (walked) with an element without primitives
(`LegacyCanvasBlock.ts:21-49`); it draws on the GraphLayer canvas under the scene canvas; its `render()` dispatches by
`$level` (`:141-156`) and honours `isRenderAllowed()` like any walked component, so delegation hides its body; its
anchors are scene child elements. Render-time areas work only on it (section 1). The minimap special-cases it (section 3).
Its tree zIndex still orders legacy bodies among themselves on the GraphLayer canvas (`:51-73`).

**Inference.** Child scene components can serve a `LegacyCanvasBlock` too (its element exists, and retained children
of an immediate parent are allowed, `lib/CoreComponent.ts:349-354`), so removing the render-time areas (D2) leaves
legacy blocks a path.

## 9. Nirvana usage (evidence of needs)

**Evented areas.** No `eventedArea` use (grep of `eventedArea|addEventedArea|_eventedAreas|_lastHitBoxData|
EventedComponent|isPointInside` over `src` and `e2e`). Every control on a block is HTML: the hover side menu
(`GE/Layers/BlockMenuLayer/index.tsx:7`, `.../BlockMenu.tsx:14-45`, shown from Schematic up through
`GE/hooks/useHoveredGraphComponent.ts:59,83-102,118`), resize handles (`GE/Layers/BlockResizeLayer/index.tsx:6-17`),
endpoint buttons (`GE/Layers/AddGraphEndpointsLayer/AddGraphEndpointsLayer.tsx:108-188`), markers
(`GE/Layers/MarkersLayer/Marker.tsx:46-50,84-88`). Canvas blocks only track whole-block hover for their border
(`C/NirvanaBaseBlock.ts:230-243,373-410`). Inference: nothing in Nirvana migrates from `eventedArea`; the need is
library-level (canvas-only consumers, LOD levels where HTML is off).

**Handover.**
- `GE/components/Block/BaseBlock/index.tsx:24,30,64-67`: `<GraphBlock autoHideCanvas={false} canvasVisible={!ready}>`
  with `ready` defaulting to `true` and never passed, so the manual path always delegates (the `ready` path is dead
  code; its intent is "keep the canvas until the React view is ready").
- React views read a snapshot kept by the canvas block, which stays current while delegated
  (`C/NirvanaBaseBlock.ts:172-175,216-228,245-274`; test `C/test/NirvanaBaseBlock.test.ts:75-158`).
- Canvas anchors draw only at Schematic (`C/NirvanaAnchor.ts:65-68`); React draws anchors at Detailed
  (`GE/components/Block/BlockAnchor/BlockAnchor.tsx:57-85`) and they stay hittable on canvas.
- Primitives outside the block rect (the "Changed" badge above the corner, highlight messages below:
  `C/NirvanaBaseBlock.ts:444-461,519-536,599-610`) are drawn again by React (`BaseBlock/index.tsx:74-121`). Inference:
  hiding the whole element when delegated (spec §10, user) fits Nirvana; no `keepWhenDelegated` is needed.
- Nirvana's `SCALES` are `[0.125, 0.15, 0.6]` (`GE/hooks/useGraph.ts:125-131`): ReactLayer follows `$level`, so the
  handover follows the custom detailed threshold.

**Minimap.** Not used (grep `minimap|MiniMap` hits only Monaco settings). No class overrides `renderMinimalisticBlock`.

**Custom anchors.** `NirvanaAnchor extends Anchor<TNirvanaAnchorProps>` adds the required props `shape`
(`triangle|circle|square`) and `dataTypes`, and the optional `isMuted?: () => boolean` and `isGraphEndpoint?: boolean`
(`C/NirvanaAnchor.ts:18-23`). A `renderAnchor` override creates it, keyed `` `${anchor.id}/${anchor.index}` ``, with
`size: this.anchorSize` and `lineWidth: 2` (`C/NirvanaBaseBlock.ts:291-321`); `anchorSize` is a getter that returns the
constant `BLOCK_OPTION_TEXT_LINE_HEIGHT` (16) (`NirvanaBaseBlock.ts:204-206`). The shape follows the block's
`anchorsMeta` (execution, stream). It draws a triangle path, a circle or a square at Schematic only
(`C/NirvanaAnchor.ts:65-126`; `dataTypes` colours it at `:100-102`), is not draggable (`:27-29`) and sets
`affectsUsableRect` false (`:36`). Props are also read outside the look: `isGraphEndpoint()` (`NirvanaAnchor.ts:48-49`)
by connection validation (`GE/hooks/useCreationConnection/utils.ts:101-106`), and `props.type` / `props.id` there
(`:53-77`). Inferences: under v2 typing this pattern does not compile (section 4); the shapes map to classes chosen per
anchor; the data the look reads comes from the block's view data (`view.block.meta`); what validation reads becomes a
method of the anchor class that reads its block's data; muted becomes a tag. The key's index and the size getter have
no visible effect (identity only; a constant 16 fits a class's `SIZE`).

**Event pass-through.** `C/NirvanaBaseBlock.ts:127-135` overrides `dispatchEvent` so an interactive block with a
listener does not bubble to its ancestors; it does not pass events to what lies below (the validation's G6.6 reading
of it is inaccurate). The real "hit box but no clicks" cases are `GraphEndpointBoundsComponent`
(`GE/Layers/AddGraphEndpointsLayer/GraphEndpointBoundsComponent.ts:22,43-45`, `onHitBox() => false`, created with
`interactive: false, affectsUsableRect: true` at `GraphEndpointsLayer.ts:107-115`) and, in the worktree
`~/arc-wt/screnshot-polyline`, `ConnectionRouteBounds` (`.../components/canvas/NirvanaConnection.ts:545-551`). Both
reserve usable-rect space and must never be picked. Context menus use `graph.getElementOverPoint(point)`
(`GE/index.tsx:180`).

**`dispatchEvent` under D5 (round 4).** The override (`C/NirvanaBaseBlock.ts:127-135`): a non-interactive block uses
`_dipping`; an interactive one fires its own listeners for the type (`_fireEvent(this, event)`) and returns, and without
a listener nothing runs. Its border listeners for `mouseenter` and `mouseleave` are added in `willMount`
(`:230-237`), so the block's own hover events take the `_fireEvent` branch. Inference: plan 3b's `onDispatchedEvent`
is called in `_dipping`'s walk, so the block's own enter and leave skip it, while its anchors' events walk through the
block and reach it. Without an adaptation the library `Block`'s `hoveredTag` would be off over the body and stay on
after a leave from the body. Calling `this.onDispatchedEvent(event)` in the override, before its listeners, keeps its
stopping and gives the hook every event (Task 12's recipe; Task 3's test).

**Hit-testability by level.** No component switches its hit box by level in the main checkout; consumers gate instead
(hover menus from Schematic, `AnchorsTooltipLayer.tsx:30-33` skips Minimalistic). Components with a hit box and no
canvas look: comments (`GE/Layers/CommentsLayer/CommentComponent.ts:184-186`, HTML at every level), endpoint port
owners (`GraphEndpointsLayer.ts:27-63`), endpoint bounds. The bend layer (worktree only) removes its handles at
Minimalistic (`ConnectionBendLayer.ts:132-147,501-504`) and compares `zIndex` across kinds for occlusion
(`:302-330,363-381`). Inference: a class-level "hit on these levels" declaration covers the bend handles; HTML-drawn
components (comments) need "all levels", the default.

## 10. Costs

Measured at HEAD (plan 3a, guarantee scene, M3 Pro, `--gpu`, 5 repeats; the pan, zoom and drag ticks are the runner's
means over the measured steps, mount, heap and change-all medians of the repeats, section 12d): Canvas 2D `blocks` pan
14.27 / zoom 14.24 / drag 15.86 ms, mount 521 ms, heap 194 MB, change-all 139 ms; WebGL `blocks-webgl` pan 3.21 /
zoom 3.07 / drag 5.30 ms, mount 716 ms, heap 269 MB, change-all 180 ms (from the brief; the 3a ledger's final lines
agree within noise, `progress.md:186,230`). No minimap number exists for the final tree.

Estimated for 3b (not measured; Task 14 measures the default paths, Task 13's cases the new ones):

| Change | Cost |
| --- | --- |
| Hit levels | per hit-test candidate of a point or rect query (`onHitBox`, pointer moves included): an element owner without a declaration, one class-mask lookup; every child (and a declared owner), the lookup, `isShownByOwnerOutsideScene()` (a walk up its scene-component ancestors calling `isShownOutsideScene()` on each: two calls for an anchor), and unless that is true `isChildDrawnHidden()` (a store lookup and `isDrawnHidden`'s walk up the nesting), then a mask test; none per frame |
| Retarget requests | per `setHitBox` call, a compare with the last rect and, on a change of a set box, a flag write; per frame with a request and the pointer inside the root, one point query at the frame's end (or after the hit test's queue); none during a capture |
| Hover dispatch | per target change, the same four events as today, minus those of a missing side; one batch; per removed target, a walk up to the nearest graph component |
| Child scene components | no field per component without children; per child: a component, a child element, a style binding, a hit box (as an anchor) |
| `transparentToEvents` | a loop over the sorted hits on pointer moves; none per frame |
| `getAnchorClass` | none for the default class (identity check); for an override, O(anchors) once per update whose block data other than `x`/`y` changed |
| Creation levels | a class that declares the minimalistic level makes the camera's lazy search run at the far zoom on every camera change, for every block in view (estimated 1–3 ms per change on the guarantee scene; Task 13 measures), and creates all its anchors there |
| Handover | no field per block until an HTML view holds it; one `$level` subscription per held block |
| Styled bounds | none for rows without `scale` or `width`; one bake per element whose row's geometry values changed |
| Revisions per type | one `Set` insert per store change; one signal write per frame and changed type |
| Minimap cache | pan and zoom: a blit instead of 10k blocks (a full redraw while `LegacyCanvasBlock`s exist); drag and block changes: one redraw per frame, as today; anchor changes: none |

## 11. Risks

- **Same-frame handover.** Camera changes come from input handlers (`services/camera/Camera.ts:286`), API calls
  (`graph.ts:197,225`) and zoom transitions, which run in their own `requestAnimationFrame` loop
  (`utils/functions/index.ts:177-190`, used by `api/PublicGraphApi.ts:142-148`). Such a callback can run after the
  graph's frame in the same browser frame. Gating the delegation by `$level` is not enough on its own: the HTML layer's
  switch must happen in the graph frame, after the blocks' updates, and not depend on the layer order (section 2).
- **Removing `renderAnchor`** breaks consumers that override it (Nirvana does); their anchor props must move to classes,
  view data and methods. The migration guide must give the recipe.
- **`hidden` loses a meaning.** Code that reads `hidden` as "an HTML view holds me" (Nirvana) must read the public
  predicate instead; the migration guide names it.
- **Minimap styles.** It draws with the live style rows, computed at the live level and scale; a level-scoped rule
  (scope `levels`) shows on the minimap as it applies to the main view's level, not the minimalistic one (as in 3a).
- **Styled bounds on bulk rules.** A user rule that sets a `width` on `selectedTag` makes select-all bake and bound
  every selected element (about 2-3 µs each, estimated). A `{ px }` width without `maxWorld` in a style grows bounds by
  the size at the minimum camera scale (`levelBounds.ts:21,64-95`): a `selectedTag` border of `{ px: 2 }` grows each
  selected element's index box by 200 world units.
- **Hover under D5.** The dispatch stays the tree model, so the bus, the cursor and target-following menus do not
  change, except that a change's missing side gets no event (HEAD's false leave on the first entry goes) and the bus
  carries `relatedTarget`. Two things do change for styling. `Anchor` lets its hover events reach its block, so a block listener that ignores
  `detail.target` now hears its anchors' hover (Nirvana's border hover is one, an inference from
  `C/NirvanaBaseBlock.ts:230-243,373-410`). And `hoveredTag` moves from the binding to the components: a custom
  component with a `static entityType` loses the tag unless it writes it, while a block keeps it over its anchors (В1;
  the ActionBlock story's darkened body stays on there). A class that overrides `dispatchEvent` without the parent
  walk (Nirvana's, section 9) keeps its own events out of the hover hook and needs the migration guide's recipe.
- **Retarget timing.** The target found under a stationary pointer depends on the hit index. A retarget at the frame's
  end before the queue is processed would read stale boxes, so it waits for the queue (section 6). Every change of a
  set hit box asks for one, so hover and cursor follow API moves under a still pointer at the frame's end, a visible
  change within settled item 11; a first box does not, and neither does a first hit mask (Task 4), so the lazy
  anchors a camera move creates leave camera moves under today's `emulateMouseEventsOnCameraChange` rule. The bus's
  `mouseenter` and `mouseleave` fire at such a retarget: Nirvana's `useHoveredGraphComponent`
  (`GE/hooks/useHoveredGraphComponent.ts:104-140`) can reset or select its tracked block, and `AnchorsTooltipLayer`
  (`GE/.../AnchorsTooltipLayer.tsx:22,45`) hide or show its tooltip, without a pointer move (round 4's re-review).
- **Nesting in the store.** Owners' draw lists are rebuilt on structural changes. The WebGL backend must read hidden
  through the nesting; until it does, a hidden middle child's descendants would still draw on WebGL.

## 12. Corrections in fix round 1

- Nirvana's `isMuted` and `isGraphEndpoint` are optional props; `shape` and `dataTypes` are required (section 9).
- The hovered stock ring reaches 18.7 world units, not 20.7 (section 7).
- The blank frame on zoom-out is an unmeasured inference; its duration is not established (section 2).
- Nirvana reads `hidden` as "an HTML view holds me" (section 2).
- Re-attaching a layer changes the layer order (section 2).
- v1 drew no canvas anchors at the detailed level and hit them there (section 5).

## 12a. Composed rows and child orders (round 3)

**Facts.**
- `applyChildStyle` interns a composed row per `${own}|${parent}` and counts the elements that draw with it
  (`SceneStore.ts:672-694`). `releaseComposed` frees it once that count reaches 0 (`:696-701`), and `freeStyle` resets
  the row and offers its id to the next `defineStyle` (`:417-426`, `:288-298`). Nothing counts other composed rows
  composed from it, because today a composed row is never a parent row: children have no children.
- A child-order change reaches the store as an update with `childOrder` (`SceneComponent.ts:172`,
  `SceneStore.ts:487-490`). It names the child alone.

**Inferences.**
- With nesting, a middle child's drawn row can be the parent row of a nested element's composed row. Freeing it when
  the middle child moves to another row resets it under its dependents; the re-review's probe lost `a11`'s opacity and
  dim. Freeing a composed row only when neither elements nor composed rows use it keeps every row in use intact.
- `stylesWith`'s one pass in map order recomposes parents first only if an entry stays before its dependents. A row
  with dependents is never freed, so its entry is not deleted and re-inserted while they exist.
- A reorder of a middle child changes the query order of everything nested in it, of the same or other types. A
  revision per type must step their types too.

## 12b. Corrections in fix round 2

- Connection snapping does not keep plain anchors at detailed: it takes only `snappable` ports, and the fallback
  picks the block's input port (section 5).
- A fixed order span on direct children does not order nested subtrees, and flattening into the owner loses a middle
  child's hidden flag and element styles (section 5). Plan 3b keeps the nesting in the store instead.
- The connection-editing e2e's anchor gestures run at the detailed level today (section 5).
- The rewritten minimap text test of round 1 repeated a no-op selection and move; the far block's first move changes
  the usable rect, which redraws the minimap before 3b too, so that test is a characterization test, not a red one.

## 12c. Corrections in fix round 3

- The round-2 dispatch along a hovered set is replaced by D5: today's tree dispatch with `relatedTarget`, and
  `hoveredTag` written by concrete components on themselves (section 6).
- Round 2's composed-row reuse was unsafe with nesting (section 12a).
- Round 2's nested-type revisions missed `childOrder` (section 12a).
- Round 2's retarget dropped a request during a capture, kept a stale position, did not follow a moved hit rect, and
  ignored the pointer leaving the root (section 6).

## 12d. Corrections in fix round 4

- Round 3 put `relatedTarget` on the components' events only: the bus rebuilds its detail without it, and the public
  `GraphMouseEvent` has its own type (section 6).
- Round 3 passed an explicit `undefined` side to `applyEventToTargetComponent`, whose default put the current target
  there: a false leave on the first entry and after a root exit (section 6).
- Round 3 forgot a removed target without telling its ancestors: a block whose hovered child stuck out of it kept
  `hoveredTag` when the pointer turned out to be over the camera (section 6, `CoreComponent.__unmount`'s order).
- `syncHitRect` covered automatic hit rects only; an anchor's own box (`onPositionChanged`) and a block moved through
  the API asked for no retarget (section 6).
- Camera emulation ignored the root exit (section 6).
- Nirvana's `dispatchEvent` override bypasses the new hook for the block's own events (section 9).
- The hover bench took the first 30 blocks of a widened viewport query: `getElementsInViewport()` queries
  `getViewportRect()` (`graph.ts:291,303-306`), the view widened by `CAMERA_VIEWPORT_TRESHOLD` (0.5), and lazy anchors
  follow the narrower camera search (`Blocks.ts:203`). Nothing checked that the points were in the 1600 x 1000 client
  view or hit the block and its anchor component.
- The runner prints ticks as `mean(r.samples)` over every measured step of every repeat (`scene-run.mjs:416`) and
  actions as `mean(r.actionMs)` (`:414`) of per-run means (`entry.ts:356`); frames as median and p95 (`:412`); mount,
  heap and the bulk actions as medians of the repeats (`:457`). Gates called "median" for ticks and actions read
  means. `fail()` exits the runner (`:106-109`).
- Section 10's hit-level row understated `isHitOnLevel()`: every child candidate walks its scene ancestors
  (`isShownByOwnerOutsideScene()`) and, unless shown outside, checks its hidden ancestry.
- After round 4 (`codex-plan-rereview4.md`): exempting a first hit box was not enough. Task 4's `syncHitMask` moved a
  new anchor's mask from 0 at its first add and asked for a retarget, so a same-level pan that created lazy anchors
  still made one the target (Codex's in-memory probe). The first add now sets the mask without asking.

## 13. Ledger items that touch 3b

| Ledger line | Item | 3b |
| --- | --- | --- |
| `progress.md:196` | custom `LOOK_EXTENT` unknown before the first camera search | Task 2 |
| `progress.md:196`, `:184` | `renderAnchor` runs twice per update until anchors exist; runs per anchor per export | Task 2 (replaced by `getAnchorClass`) |
| `progress.md:181,184`, `deferred-minors.md:24` | hover ×1.8 style scale outside element bounds (culling; export crops left as a D3 limitation) | Task 6 |
| `progress.md:184` | `LOOK_EXTENT` 11.5 exact for size 18 / lineWidth 2 only | Task 2 (`Anchor.SIZE`, `LINE_WIDTH`, docs) |
| `progress.md:107` | minimap text flag ignored by `EtlBlock` | Task 10 (checked: scene blocks draw with `skipText`) |
| `deferred-minors.md:10` | comment for a scene key without a stored element | Task 4 |
| `progress.md:94` | new HTML container rank one frame late | not folded: needs a synchronous rank flush inside a computed; documented in Task 12 |
| `deferred-minors.md:23` | renderAnchor override per anchor per export; subclasses get temporary anchors on minimalistic and detailed exports | first half Task 2; second kept (exports stay conservative) |

Task numbers refer to `docs/superpowers/plans/2026-11-15-scene-blocks-3b.md`.

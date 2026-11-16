# v2 graph scene: design decisions

Current decisions for the v2 graph scene and its block API, one statement per topic. Never committed.

- **Rewritten on 2026-11-10.** It merges the Q1–Q14 brainstorm (2026-11-09) and the user's answers V1–V11 to the
  validation (2026-11-10).
- **History.** The text before the rewrite is in `archive/2026-11-10-webgl-block-design-questions-before-rewrite.md`.
  Appendix A lists every answer that a later one replaced.
- **Origins.** Each decision names where it came from:
  - `Q<n>` is a brainstorm question of 2026-11-09;
  - `V<n>` is the user's answer to the validation on 2026-11-10;
  - `R<n>` is a decision of the research spec;
  - `G<n>` / `T<n>` / `C<n>` are validation findings.

  Decisions are the user's unless they are marked "agent proposal".
- **Related documents** (all in this worktree):
  - research spec `2026-11-08-webgl-scene-components-research-design.md`;
  - validation `2026-11-09-webgl-scene-spec-validation.md`;
  - facts `../research/2026-11-09-webgl-scene-facts.md`;
  - experiment results `../research/2026-11-09-e1-e2-results.md`.

## 1. Product context

- **v2 is a new library with a new rendering engine.** Agents rewrite existing v1 graphs onto it. v2 must bring
  enough advantages that nobody has a reason to stay on v1.
- **There is no legacy model for graph entities.**
  - Blocks, anchors and connections are described only by primitives. They have no imperative `render(ctx)`.
  - The graph has no legacy mode, and there is nothing to mix or to validate against mixing.
  - What v2 needs instead is a v1 → v2 migration guide written for agents.
- **The end goal is one scene with one shared order.** A block can be put under connections or raised above them;
  this is the user's core need.
  - The scene has enough primitives (line, rect, text, icon, sprite, …) to draw the whole graph.
  - Effects add motion and emphasis to primitives, and tags customise looks. Both must work together.
- **Nirvana is the reference consumer.** It uses the whole library, so every API is checked against it.

## 2. The scene

- **`graph.scene` draws the graph.** It sits at GraphLayer's CSS slot. It owns:
  - the canvas and the renderer;
  - the element store and the order key;
  - the LOD level signal;
  - animation frames through the global scheduler.
- **GraphLayer keeps logic only:** the component tree, the retained-update queue, events, hover tracking, hit-test
  and the camera component. It never draws.
- **Order inside a tick.** GraphLayer applies component updates, and the components write their elements. Then the
  scene draws.
- **Layers.**
  - A layer may keep imperative Canvas2D on its own canvas, as devtools, the minimap and connection creation do.
  - A layer may also add elements to the scene through `SceneComponent` (R9).
- **Imperative drawing for a component** has two places (Q8):
  - **Inside the order:** a `sprite` primitive. The component's Canvas2D callback is rasterized into an atlas per
    scale bucket, which costs memory and blurs between buckets.
  - **Over or under the scene:** the canvas of the component's layer. It cannot interleave with scene elements.
- **Animations go through the global scheduler.** There is no own rAF loop.
  - While a visible element has a time-dependent effect, the scene asks the scheduler for the next frame.
  - The effect's time is the scheduler's frame time, so there is one clock and `graph.stop()` pauses animations.
  - The WebGL canvas and the Canvas2D/HTML layers update in the same frame.
  - To check: an animation-only frame must not walk the other layers.

## 3. Renderers

- **`renderer: "canvas" | "webgl"` is a setting of the scene** (Q1.5, V5).
  - It governs every element described by primitives: blocks, anchors, other sub-components and connections.
  - Layers' own canvases and HTML do not follow it.
- **The default is `"canvas"`; WebGL is opt-in** (Q1.5, V5). The agent proposed `"auto"`, and the user kept
  `"canvas"`.
  - A graph that does not ask for WebGL never loads the backend.
  - Tests in jsdom and SSR need nothing special.
- **The renderer can change at runtime.** The scene drops its backend and replays its elements into the other one, as
  #451 does for connections. Components are not re-created (Q1.5).
- **Fallback** (agent proposal, Q1.5): without WebGL2, or after a context loss that is not restored, the scene draws
  with the Canvas2D interpreter. A signal reports the actual state (`"webgl" | "canvas" | "webgl-fallback"`). The
  states and transitions go into the core spec (G9).
- **Effects work only with the WebGL renderer** (V2). Canvas2D could not keep up with them anyway.
  - On Canvas2D, including the fallback, an element draws its base look without the effect. There is no Canvas2D
    fallback for effects.
  - A `dashFlow` connection on Canvas2D is its base stroke as written: solid unless the base look has a dash.
- **Success criteria per renderer** (V5; agent proposal, the user did not object):
  - **canvas:** the same picture as WebGL minus effects, and no slower than today's 13.5 ms per tick on the guarantee
    scene (pan at scale 0.038, interpreter with cached connection paths);
  - **webgl:** 4 ms per tick on the same scene, with effects and animations through the global scheduler.

## 4. The WebGL backend

- **We build our own backend** (Q14). The agent writes the code, and we need only a small part of WebGL.
  - No third-party scene engine and no deck.gl.
  - Engines with one object per element are ruled out: PixiJS was slower than our Canvas2D on the stress test. So
    are the three.js scene, Konva and Fabric.
  - Also ruled out:
    - CanvasKit: several MB of WASM, and it draws per element;
    - Sigma.js and cosmos: nodes and edges only, with labels on Canvas2D;
    - deck.gl, the closest one: its size, no rounded rect with a border, and its own frame loop and effect
      model.
- **The GL helper is luma.gl 9.4, then v10 once v10 is stable** (V11).
  - Why luma: it is actively developed and has a device abstraction over WebGL2 with a future WebGPU path. It also
    has `Model` with instancing, and shader modules with injection, which fit effects as composable modules.
  - Pin the 9.4 line; do not build on the v10 alpha.
  - All luma code stays inside the backend module, and shader injection lives in one place. In 9.4 it is
    `ShaderModule.inject`; in v10 it is a `ShaderPlugin` with `injections`. So the move to v10 is local.
  - The frame loop stays ours: the global scheduler, not luma's `AnimationLoop`.
  - Facts of 2026-11-10: v10 moves and renames the APIs we use and does not drop them. Examples: `@luma.gl/webgl`
    becomes `@luma.gl/core/webgl`, and `shadertools` becomes `@luma.gl/shaders`. Details are in Appendix B.
- **`tiny-sdf` generates glyph SDFs.**
- **The WebGL backend ships as a separate package with luma.gl as a peer dependency** (user, 2026-11-10).
  - Working name `@gravity-ui/graph-webgl`, following the v2 package extraction. The core has no luma dependency;
    `renderer: "webgl"` loads the backend from that package.
  - Reason: luma writes `globalThis.luma` and throws when another luma version is on the page, in both directions.
    With luma as a peer, a host with deck.gl 9.x shares one luma copy, and neither side breaks.
  - Cost: an application that wants WebGL installs one more package and aligns its luma version with the host's.
  - The slice keeps luma in `packages/graph` for now; the move happens with the backend step.
- **The backend loads lazily** with a dynamic `import()` when `renderer` becomes `"webgl"`.
- **One WebGL context per graph.** The scene owns it, and connections merge into the scene (Q6).
- **#451's infrastructure stays useful** (Q12): context creation, loss and restore, replay, line tessellation, effect
  GLSL, and the fake WebGL2 for tests.

## 5. Components

### 5.1 `SceneComponent`

`SceneComponent` is the base class for declarative rendering (Q11). It is a `GraphComponent`, so user layers can bring
their own declarative components.

- **Mechanics:**
  - it is retained, and so are its children: the walk does not visit them;
  - level methods return primitives;
  - named parts carry state;
  - it has a hitbox and events;
  - it has view data (5.3) and `invalidate()`.
- **Two modes:**
  - **Element owner.** It writes its own scene element with its own order key. The `zIndex` bucket comes from the
    layer or the props, and `order` is assigned on mount. Examples: comment badges or bend handles of a layer.
  - **Sub-component.** It adds its primitives to the parent's element, at an offset. Examples: anchors and evented
    areas.
- **`Block` and `Anchor` extend it.**
  - `Block` adds block data from `BlockState`, `getAnchorClass`, drag and the handover to HTML.
  - `Anchor` adds ports and drag-to-connect.

### 5.2 `Block`

- **The classes are `Block` and `Anchor`.** They are declarative and retained.
- **The look lives on the block subclass.** The subclass overrides the level methods itself and has no separate view
  class. This deliberately differs from connections' `static line`.
  - `minimalistic(view)` and `schematic(view)` return primitives.
  - `detailed(view)` is optional (section 9).
- **Registration** goes through `blockComponents` by `is`. An unknown `is` falls back to the library's default
  `Block`, which looks like today's default block.

### 5.3 View data and re-runs

- **Level methods receive view data** (V6b, Q10).
  - By default the view data is the block's data: `TBlock` with `meta`, `width` and `height`, but without `x` / `y`.
  - A subclass can override the view data `computed` and add anything it reads through signals. Example: an
    execution status from an external store.
  - Primitives are relative to the block's origin.
- **Level methods run again only when the view data changes.** The comparison is shallow and excludes `x` and `y`.
  `selected` is not part of block state (section 8).
  - A move writes only the element's origin.
  - Selection goes through parts (5.4).
  - A LOD change goes through level masks (section 6).
  - `invalidate()` re-runs the level methods for inputs that are not signals. It is the counterpart of
    `invalidateLine()` on connections.
- **View data is for structure.** It carries inputs that change primitives, such as a title read from an external
  store. States that change only paint are tags (section 8).
- **Theme references.** Colours in primitives may be theme references such as `"block.border"`. The scene resolves
  them, so a theme change re-encodes colours only and runs no level method.
- **States are tags, not view data** (section 8). Example: a workflow starts and 40 blocks change their status in
  Redux. A system binds a `running` tag to the store, and the style rules recolour the blocks. No level method
  runs again, and the graph data does not change.
- **Purity.** Level methods are pure functions of their view data: no camera, no other blocks' state, no time. This is
  documented; dev mode may catch camera access. The validation notes that purity cannot be enforced (T5).

### 5.4 Parts and states

- **Named parts.** The author marks primitives with a part, such as `part: "border"` or `part: "anchor"`. The library
  applies state to a part without running level methods. A part can be recoloured and scaled.
- **Default looks of states** (Q9.2) become the theme's default rules for the built-in tags (section 8), with
  colours from the graph theme:
  - `Block`, part `border`, `selected`: colour `colors.block.selectedBorder`. Its width can be a camera-aware size
    (section 11), like today's `clamp(3 / scale, 3, 10)`.
  - `Anchor`, part `anchor`, `selected`: colour `colors.anchor.selectedBorder`, width +3.
  - `Anchor`, part `anchor`, `hovered`: scale ×1.8 (`CANVAS_HOVER_FACTOR`).
- **Block hover comes later** (V6). It is not in the first scene spec. Anchor hover stays, because anchors have it
  today.
- **Tags and styles are in the scene core** (section 8), so there is no interim table API.

### 5.5 Anchors and evented areas

- **`Anchor` is a retained sub-component of the block** (Q2).
  - It keeps events, drag, selected and hovered state, the hitbox and the ports.
  - Its look comes from level methods on the anchor subclass, with primitives relative to the anchor point.
  - Its level methods receive its own data and the parent block's view data (V6b). Example: an anchor looks muted
    when its block is muted.
  - The block picks the class with `getAnchorClass(anchor)`, and the library creates the anchor.
- **First version: anchor primitives go into the block's element.** So overlap is correct by construction, with one
  element per block. Moving to one element per anchor keeps the API.
- **Evented areas are sub-components of the block** (Q7). Each has a hitbox, events and state, and an optional look.
  - Nothing is registered again on every frame. Today areas are cleared in `willRender` and registered in `render`.
  - `Anchor` is the specialisation with ports and drag-to-connect.

### 5.6 Retained and immediate (lean decision)

- **`static mode: "retained" | "immediate"` replaces `static detached = true`** (Q13).
- Retained is the default. Immediate is the opt-in for components that render in the walk, mostly layers' imperative
  components.
- This is a lean decision: confirm and rename together with the scene work.

## 6. LOD

- **One level signal per graph** (Q3). It is a `computed` over the camera, through the user-replaceable
  `getCameraBlockScaleLevel`.
- **Primitives carry a level mask** from the method that returned them, plus optional `minScale` / `maxScale`.
- **Every level stays encoded.** The current level is a filter in the interpreter and a uniform in WebGL. So neither
  zoom nor a level change re-encodes anything. User strategies and runtime threshold changes keep working.

## 7. Order

- **One key `(zIndex, order)` for every scene element** (Q4, V3). There is no `renderOrder`.
  - `zIndex` is a bucket.
  - `order` sorts inside the bucket.
- **`order` is a scene counter** (V3).
  - The scene keeps one counter for all its elements, whatever their kind.
  - An element gets the next number when it enters the scene. A batch load numbers elements in list order; the spec
    fixes the order of kinds.
  - A raise gives the element a new highest number. Selection and the start of a drag are raises.
  - The number stays after deselection, so the last element touched stays on top of its bucket, as today.
  - `order` is not part of the entity data and is not saved with the graph. After a reload the order follows the
    lists again.
- **Default `zIndex` buckets** (V4):
  - connections: `100`, and `101` for a selected connection;
  - blocks: `200`, and `201` for a selected or dragged block. A signal computes this raise from selection and drag, and
    the raise is undone when they end.
  - A selected connection rises above other connections but stays under blocks, in drawing and in hit order.
  - The gaps are for user buckets and future kinds. For example, a block with `zIndex: 50` lies under every connection.
  - The values are constants, so overrides such as Nirvana's (blocks `20`, connections `1`) keep working.
- **Parts of an element have no buckets of their own.** Examples are an arrow, a label and anchors.
- **Hit-test uses the same key.** A sub-component uses `(parent zIndex, parent order, child index)`.
  - Example: an anchor of a lower block no longer wins a click over an upper block that covers it.
- **React container z-index** is computed from the key, `zIndex × SPAN + order`, by a signal instead of in
  `didIterate` (Q4).
- **The order applies inside the scene only** (V1). HTML lies above the whole scene (section 9).
- **Groups are not in this order** (V10, section 12).

## 8. Tags and styles

- **Decision (user, 2026-11-10): tags and styles are part of the scene core.** They are built in step 1 together with
  the scene and the block API, not as a later step. Adding them later could make the scene and the component model
  hard to extend.
- **Source design.** The tags research spec
  `../../../../graph-external-states-50c3aa/docs/superpowers/specs/2026-11-08-graph-tags-styles-research-design.md`
  (worktree `graph-external-states-50c3aa`).
  - The user decided T1–T4 there:
    - **T1.** A new visual state needs no new component class.
    - **T2.** The model is ECS plus CSS. Tags are keyed by entity id and written by systems: selection, hover, a
      highlight plugin, application statuses. A stylesheet maps tags, the component class and LOD to the values of
      named parts. The component describes structure only.
    - **T3.** The working name is `tag`.
    - **T4.** Tags are built with WebGL for every component, not as a Canvas2D-only feature first.
  - The rest of that spec is agent design: the tag store, built-in tags, rules, the cascade, computed style with a
    `styleId`, the GPU style table and its experiments. The user decided all its open questions on 2026-11-10
    (below). The design itself goes into the core spec, which the user reviews.
- **Tag rules always win over data values** (user, 2026-11-10). There is no `important` flag.
  - Example: a block takes its border colour from data, and `selectedTag` still shows the selection border.
  - Example: a Nirvana block is filled by its operation category, and a `running` rule on the minimalistic level
    still fills it green.
  - An author who wants to keep a colour writes a rule for their own class (`target: MyBlock`) that sets another
    part or property.
- **Tags may carry discrete values from the first version** (user, 2026-11-10).
  - The tag API has a value type from the start, for example `defineTag<{ color: string }>("presence")`, and a
    rule reads the value through a function.
  - A value is part of the style signature, so a tag should have few distinct values: a colleague's colour or a
    status from an enum. The documentation says so.
  - Continuous values, such as a heat map over 10k blocks, do not go into tags. They need a per-element channel,
    such as effect parameters, which is designed later.
- **No pseudo-parts in the first version** (user, 2026-11-10). The scene does not add `halo` or `badge` to elements.
  - A rule changes only the parts a component declares. A state that needs new structure, such as a ring around a
    search result or an error icon in a corner, needs a part declared by the component, hidden by default
    (`visible: false`) and shown by a rule.
  - So T1 (no new class for a new state) holds for states that change existing parts. The default `Block` must
    declare the parts its built-in states and the T1 demo need (running, failed, highlight, focus); the core
    spec lists them.
  - Pseudo-parts can be added later without breaking the API.
- **`selected` is removed from `BlockState.$state` and from `TBlock`** (user, 2026-11-10).
  - Selection lives only in the selection buckets. Code reads it through `BlockState.$selected`, `selectedTag` or
    the selection API.
  - A selection change no longer creates a new `$state`, so the hitbox, geometry and the React block do not wake
    up.
  - The view data comparison needs no exception for `selected` (5.3).
  - Fact: today `TBlock.selected` does nothing. `$state` always overwrites it with the bucket value, and the store
    never reads it from data (`store/block/Block.ts:27-30`).
  - The same for connections and anchors is assumed; the core spec checks it.
- **The remaining questions of the tags research spec** (agent's proposals, all accepted by the user on
  2026-11-10):
  - **Typing of rules for custom parts.** The part schema is a generic of the component class, and a rule's `style`
    is type-checked against the schema of its `target`.
  - **Transitions**, such as a glow fading in on hover, are not in the first version. Later they become an effect
    that takes the tag's start time in its parameters, so they work only on WebGL (V2).
  - **A CSS bridge** is not in the first version. The theme already comes from CSS variables through `setColors`,
    and an application can build rules from CSS variables in code.
  - **Devtools.** The first version has an API that answers "why is this block green": the entity's tags, the
    matched rules and the computed style. A UI in `graph-devtools` comes later.
  - **Entity types of layers.** An element-owner `SceneComponent` declares its entity type, so tags address it by
    `(entityType, id)` like blocks and connections.
  - **Hover churn.** A hover tag changes only when the hovered entity changes, which is O(1) per change. No debounce by
    default; the bench measures it.
  - **The name** stays `tag`.
  - **`raise` and the key.** V4 settles it: `raise` adds to the `zIndex` bucket, and the key stays `(zIndex, order)`.
    The bit layout of the depth key is an implementation detail.
  - **Table and element classes of properties.** The core spec draws the line after the vertical slice measures where
    border width stops fitting into the bounds padding.
  - **`selected` in connection and anchor data** is removed as for blocks.
- **A style that changes a primitive's translucency moves it between passes** (user, 2026-11-10; from the WebGL
  slice).
  - The CPU sees from the computed style that a primitive's paint became translucent (or opaque again). It
    re-encodes the element and moves the primitive into the translucent pass, or back.
  - This is an element-class change of the tags research spec: one re-encode per element when the tag changes.
  - Without it, a translucent override stays in the opaque pass and alpha-to-coverage turns it into a screen-door
    pattern, which is what the slice does today.
  - Rules that fade many elements use the opaque `dim`, which changes only the style table.
- **How tags fit the decisions above** (agent's reading, to confirm in the core spec):
  - **Level methods describe structure.** Every primitive names its part. Paint values that come from data are the
    middle step of the cascade: theme rules < data values < tag rules. The computed style of the part fills the rest.
  - **Default looks** of selection, drag and anchor hover (5.4) are theme rules of the built-in tags `selectedTag`,
    `draggingTag` and `hoveredTag`.
  - **States are tags** (5.3). View data stays for structural inputs.
  - **The bucket raise is a style property.** The +1 bucket of a selected or dragged element (V4) is `raise` in the
    rules of `selectedTag` and `draggingTag`, so it is undone with the tag. The counter raise (V3) stays an action of
    selection and drag.
  - **Theme references** (5.3) overlap with the theme step of the cascade. The core spec keeps one of them.
  - **Effects by tag.** A rule can turn on an effect, for example `dashFlow` on running connections. It works only on
    WebGL (V2).
  - **Groups.** Group tags such as `dropTargetTag` go with the groups layer (V10).
  - **React.** `GraphBlock` adds a class per tag and CSS variables of the computed style, so the detailed level
    follows tags too.

## 9. Handover to HTML

- **At the detailed level React takes the block through `delegateRender`** (Q3, V8). Today this is
  `setRenderDelegated` (`GraphComponent/index.ts:411`).
  - `delegateRender` hides the element's whole scene drawing: the body, the parts and the anchors.
  - Connections stay in the scene.
- **Without React**, the optional `detailed(view)` method draws the detailed level. Without that method, the schematic
  primitives are used.
- **HTML lies above the whole scene** (V1). A block handed to HTML is above every scene element, including
  connections, whatever their `zIndex`. This is a documented limitation.
  - A later option is WebGL above HTML, or something similar.
  - A later tuning step is a selection layer that draws chosen blocks above HTML.

## 10. Connections in the scene

- **Connections merge into the scene** (Q6).
  - Lines, arrows and labels become scene elements.
  - `WebGLLine` and `Path2DLine` merge into one line description for an abstract renderer (R8, R14).
  - Labels become text primitives, and hit-tests become analytic.
  - Effects (`dashFlow`, `pulse`) work only with the WebGL renderer (section 3).
- **`renderer` governs connections too.**
- **#451's public API is not reviewed or merged on its own** (Q12), because it is going away.

## 11. Primitives

- **Bounds take the largest width a camera-aware stroke can reach** (user, 2026-11-10).
  - An element's bounds are computed once, from the largest world width of each stroke over all camera scales:
    `maxWorld` for `{ px, maxWorld }`, and `maxPx` at the camera's minimum scale for `{ world, maxPx }`.
  - A size without an upper limit, such as `{ px: 3 }`, has unbounded world width at low zoom. Dev mode warns.
  - At low zoom an element counts as visible a little longer; nothing is recomputed on zoom.
  - Tag rules follow the same line: a width within this padding is a style-table change; a wider one re-encodes
    the element.
- **The translucent pass runs by `zIndex` bucket** (user, 2026-11-10; from the WebGL slice).
  - Buckets are drawn from the lowest up. Inside a bucket the programs run in a fixed order (paths, rects, text),
    and inside a program the instances are sorted by the order key.
  - So translucent elements of different kinds in different buckets are ordered correctly; examples are a
    highlight under connections, flowing connections and thin blended strokes under translucent blocks. Kinds that
    share one bucket keep the fixed program order.
  - Cost: buckets × 3 draw calls in the translucent pass. WebGL2 has no base instance, so each bucket rebinds the
    instance attribute offsets.
  - The slice drew the translucent pass by program only; the core implements the bucket order.
- **Strokes thinner than a device pixel are blended, not dithered** (user, 2026-11-10; from the WebGL slice).
  - The slice showed that alpha-to-coverage draws such a stroke as dots: an alpha of about 0.15 keeps one of four
    samples. Canvas2D draws a continuous faint line.
  - The WebGL backend draws these strokes in the translucent pass. Opaque elements still occlude them through depth;
    only their order among other translucent elements follows the translucent pass.
  - Proposal (agent): the opaque path instances are drawn in both passes, and each pass discards by device width
    (the opaque pass keeps strokes of at least 1 device px, the translucent pass keeps the thinner ones). A zoom
    then moves no instance between passes and re-encodes nothing.
- **Camera-aware sizes are a general feature** (V7).
  - Any size of a primitive can be camera-aware: stroke width, corner radius, font size and others.
  - They work the way text size works: a world size with optional pixel clamps, or a fixed pixel size.
  - An inset stroke follows the effective width.
  - The core spec defines the exact type.
- **Text (provisional)** (Q9.1):
  - fields: `text` (a string, or an array of pre-broken lines), `font` (family and weight), `size` (a camera-aware
    size), `color`, `x`, `y`, `width`, `height?`, `align`, `baseline`, `maxLines?`, `overflow: "clip" | "ellipsis"`;
  - multi-line text is wrapped once, at the base size, and not re-wrapped on zoom. Pixel-sized text is still open
    (section 15).
- **Icons (provisional)** (Q9.4): `icon: { path: string, viewBox: number }`, with SVG path data.
  - The string is an atlas key and is rasterized once; the interpreter builds a `Path2D` from it.
  - SDF icons (R6) arrive with the WebGL step.
- **Hit shape (provisional)** (Q9.3): the element's rectangle only, as today. Special zones are sub-components.
- **`sprite`** is the escape hatch for imperative drawing inside the order (section 2).

## 12. Groups

- **Groups are a separate layer's job, to research later** (V10).
- They are not in the first scene spec and not in its order.

## 13. Minimap

- **The minimap is a layer with its own canvas that draws scene data** (Q8).
  - It draws block elements with their `minimalistic` primitives through the Canvas2D interpreter and its own camera.
  - It filters text out by primitive kind, as `{ text: false }` does today.
  - No block API exists just for the minimap.
  - It may cache its picture and redraw only when scene data changes; check during implementation.
- **Later:** a second view of the WebGL scene in the shared context, with a scissor and its own camera.

## 14. Implementation start and order of work

- **The first user story** (brainstorm): a custom block by LOD only.
  - Covered: structure per level, dynamic text size, icons and anchor positions.
  - Later: states through tags, block effects and animations, and components brought by layers.
- **Start from #454** (Q12). #454 contains #451, the interpreter, `SceneStore` and the bench. Decide later whether
  the stack lands in v2 as one engine change.
- **Order of work** (agent proposal; the user has not changed it):
  0. **A WebGL vertical slice on luma.gl 9.4.**
     - One scene draws `rect`, `path` and `text` with one order through depth.
     - It checks a block lowered under a connection and raised above it, translucency, text under an overlap, and
       animation through the global scheduler.
     - Checks added by the validation (T1):
       - an inset border with a pixel clamp;
       - a delegated block under a connection;
       - an anchor hover with scale;
       - a forced `loseContext()` during a drag.
     - A check added with tags in the core (agent proposal, 2026-11-10): setting and clearing a tag recolours an
       element through the style table, with no re-encoding.
     - It measures the backend bundle size, and checks async device creation, context restore and `globalThis.luma`
       (V11).
  1. The scene core and the block API: `graph.scene`, `SceneComponent`, `Block`, `Anchor`, the level signal, the
     order key, the interpreter, and tags with styles (section 8).
  2. Connections in the scene.
  3. The WebGL backend for every primitive. It starts with the GPU headroom experiment (user, 2026-11-10): GPU time
     per frame (timer queries if Chromium offers them, else frame time on a heavy scene) on the guarantee scene and
     a 100k-block scene at several scales. It decides whether WebGL needs viewport culling: the slice submits all
     568k instances at every zoom. Until then the spec states no GPU performance claims.
  4. Layer components in the scene, then a selection layer above HTML. Groups get their own research (section 12).

## 15. Open questions

**Spec split (user, 2026-11-10; answers Q6.1).** Four documents, one per step of the order of work:

1. **The core spec (step 1), written first:**
   - `graph.scene`: the element store, the order key, the LOD signal, the renderer setting and state machine, the
     Canvas2D interpreter, and the WebGL backend at the slice's scope;
   - `SceneComponent`, `Block`, `Anchor` and evented areas; view data, parts, tags and styles; `delegateRender`;
   - the hit-testing contract, the lifecycle and the limits;
   - the extension points that connections use.
2. **Connections in the scene (step 2):** a separate spec that depends on the core.
3. **The full WebGL backend (step 3):** a separate spec. It covers the GPU experiment, polygons, icons, sprites,
   culling, and the `@gravity-ui/graph-webgl` package.
4. **The v1 → v2 migration guide for agents**, once the core and connections settle.

The user expects more questions and hard cases during implementation.

- **Pixel-sized text** (V9, Q-G4). Wrapping and ellipsis depend on the zoom: forbid it, cut it in the shader, or
  re-wrap per zoom step? Should one text layout serve both renderers? The user does not know yet. The provisional
  rule stays: wrap once at the base size.
- **Research forks** of the research spec:
  - G2: text quality through an atlas;
  - G3: depth or MSAA;
  - G4: extend `BatchScene` or build a new scene.
- **Bench:** should `--gpu` be the default?
- **Deliverables still missing:**
  - the core spec written from this file;
  - the v1 → v2 migration guide for agents;
  - success criteria beyond speed (shared order, tags, DX).
- **To settle in the core spec.** These validation findings have no decision yet; the validation file holds the
  agent's proposals:
  - **G3.** Is there a manual per-block handover, like Nirvana's `canvasVisible={!ready}`? Today the React
    `GraphBlock` already has a `canvasVisible` prop for this (`graph-react/src/Block.tsx:129-136`).
  - **G5.** Connections in the scene: the label size `max(14, 9 / scale)`, label bounds, the order inside a
    connection, multipoint labels.
  - **G6.** Hit-testing as a public contract: components without primitives, bounds against the hit shape, hits
    against the level.
  - **G7.** LOD has four sources today (`getCameraBlockScaleLevel`, ReactLayer's `SCALES[2]`, `BlocksList` and
    per-primitive ranges). They collapse into `graph.scene.$level`.
  - **G8.** The scene draws after every layer updates, and layers update in creation order
    (`LayersService.ts:99-101`). A graph clock replaces the frame timestamp that the scheduler does not pass.
  - **G9.** A backend state machine: `canvas → loading → webgl → lost → restoring → webgl | webgl-fallback`. It covers
    two canvas elements and `getGraphCanvas()`, and a loss during a drag.
  - **G10.** Lifecycle:
    - headless tests with a synchronous flush;
    - SSR with no `document` and no luma at import;
    - DPR changes and resize;
    - disposal with an eager `loseContext()`;
    - export without `preserveDrawingBuffer`.
  - **G11.** A mount and memory budget for 40k sub-components.
  - **Experiments:**
    - T2: interleaved blocks K = 10 / 100 / 1000, because 13 ms is a lower bound;
    - T3: hover one anchor of 8 and measure the re-upload;
    - T9: time the level methods and text layout at mount.
  - **Smaller items:**
    - T4: a dense rank for the React z-index, since the counter grows;
    - T7: `sprite` differs per renderer;
    - T8: a dev warning for a forgotten `"immediate"`.

## Appendix A. Superseded answers

Each entry gives the earlier answer, where it was recorded, and what replaced it.

- **Class names.** `WebGLBlock` (brainstorm), then `ModernBlock` / `ModernAnchor` (Q1 reframe). Now `Block` and
  `Anchor`, because v2 has no legacy model.
- **Who picks the renderer.** First each entity family, through its classes (Q1 direction, which reopened R8). Now
  the scene's `renderer` setting (Q1.5, R7).
- **Mixing models.** Mixing was forbidden and validated, with a `defaultBlock` setting and a derived fallback (Q1.1,
  Q1.4). Now there is no legacy model, so there is nothing to mix.
- **Legacy graph mode** (Q5.1, open). Now there is none.
- **Canvas bands per family** (Q1.3). Now there is one scene canvas, ordered by the key.
- **Scene canvas above GraphLayer and below ReactLayer** (Q5). Now the scene takes GraphLayer's place.
- **"The detailed level stays React"** (brainstorm). Now React takes it through `delegateRender`; otherwise
  `detailed()` draws it; otherwise the schematic primitives do (Q3, V8).
- **Hover.**
  - The brainstorm said parts are recoloured "when selected or hovered".
  - Q9.2 said "blocks have no hover today, and none is added".
  - Now block hover comes later (V6), and anchor hover stays.
- **Effect fallback.** The research spec (§2, §7) and Q6 kept a Canvas2D fallback for effects. Now effects are
  WebGL-only, and Canvas2D draws the base look (V2).
- **`sequence`.**
  - Q4: the block's stable list order (`initialIndex`), so raises are reversible.
  - The research spec and the prototype: a counter renewed on raise.
  - Now it is `order`, a scene counter (V3).
- **Bucket numbers.** Today's numbers (block `1`/`2`, connection `0`, `+10` when selected or hovered) would put a
  selected connection above blocks. Now the default buckets are `100` and `200` (V4).
- **Level method input.** Q10 gave the methods `TBlock` data only. Now they get view data (V6b).
- **Groups.**
  - Q1.3: groups stay Canvas2D for now.
  - The end goal and the order of work put groups into the scene at step 5.
  - Now groups are a separate layer's job (V10).
- **GL helper.**
  - Q14: luma.gl or twgl, chosen in the slice; then luma.gl preferred.
  - V11: twgl.js, after the claim that v10 drops the APIs we need.
  - The re-check showed v10 only moves and renames them, so V11 now says luma.gl 9.4, then v10.
- **Tags and styles.** The order of work had them at step 4, after the WebGL backend, with a built-in table of
  part looks until then (Q9.2). Now they are in the scene core at step 1 (section 8).
- **Rendering steps.** The brainstorm planned "Canvas2D first, then WebGL as experiment E3". Now this is the order of
  work in section 14.
- **Default renderer.** `"canvas"` (Q1.5). It was confirmed against the agent's `"auto"` (V5).

## Appendix B. Facts behind the decisions

From a code survey of this worktree on 2026-11-09; paths are under `packages/graph/src/`.

- **Retained (detached) mechanics.**
  - `CoreComponent.isDetachedClass` and the `DetachedUpdates` queue (`lib/CoreComponent.ts:83-85,150-167,226-238`).
  - An applied update runs `checkData`, `willIterate` and `childrenLifeCycle`, never `render`
    (`lib/Component.ts:163-179`).
  - Subscriptions are made in `willMount`.
  - A detached component cannot have attached children: `mountChild` throws (`lib/CoreComponent.ts:336-341`).
- **What already works without the walk.**
  - Hit-test: `onHitBox` follows `isIterated` of the parent (`GraphComponent/index.ts:427-430`).
  - Registration through `blockComponents`, because `mountChild` reads `static detached` per class
    (`blocks/Blocks.ts:61-74`, `lib/CoreComponent.ts:336-353`).
  - The hitbox follows the `$state` signal (`blocks/Block.ts:232-241`).
  - Selection is a signal; drag is event-driven (`DragService`).
- **What the scene replaces.**
  - Attached `Anchor` children (`blocks/Block.ts:468-495`).
  - `$viewState` written in `didIterate` (`blocks/Block.ts:257-264`).
  - LOD chosen per frame in `render()` (`blocks/Block.ts:587-604`).
  - Evented areas registered in `render()` (`EventedComponent.ts:105-122`).
  - The minimap calling `renderMinimalisticBlock(ctx)` (`graph-minimap/src/layer.ts:225-235`).
  - The WebGL context private to connections, below the 2D graph canvas
    (`components/canvas/connections/webgl/WebGLConnections.ts:86-107,146-151,348-410`).
- **Today's order.**
  - Block `zIndex` is `1`, or `2` when selected or dragged (`graphConfig.ts:343`, `blocks/Block.ts:270-273`).
  - Connection `zIndex` is `0`; its batch level is `+10` when selected or hovered (`BlockConnection.ts:118`).
  - An anchor is its block's `zIndex + 1` (`anchors/index.ts:45-46`).
  - Within a bucket, `updateChildZIndex` moves a re-raised child to the end of its parent's children, so the last
    element touched is on top.
  - `initialIndex` is the index in the store's block array at each reconcile, and nothing reads it
    (`blocks/Blocks.ts:66`).
- **luma.gl** (npm and the upgrade guide on `master`, read 2026-11-10).
  - Stable is 9.4.2 (2026-09-19). v10 is at 10.0.0-alpha.11 (2026-11-08), and its "Q3 2026" target has slipped.
  - v10 moves `@luma.gl/webgl`, `@luma.gl/webgpu` and `@luma.gl/constants` into `@luma.gl/core` subpaths:
    `/webgl`, `/webgpu` and `/webgl-constants`.
  - v10 renames `@luma.gl/shadertools` to `@luma.gl/shaders`, keeping the symbol names.
  - v10 replaces `ShaderModule.inject` with a `ShaderPlugin` that has `injections`. Each injection has a stage, a
    target and separate GLSL and WGSL source. Hooks become "injection targets" on an explicit `GLSLShaderAssembler`.
  - v10 removes `RenderPass.withParameters()` in favour of `Model.draw(renderPass, { parameters })`.
  - The unreleased part of the upgrade guide renamed shader hooks twice, so that API is not settled until v10 is
    stable.
- **twgl.js** (npm, 2026-11-10): 7.0.0, MIT, last published 2025-07-16. Its package entry is one bundled ES module.
- **Measured** (E1/E2/E2b): pan at scale 0.038 costs 36.95 ms with the walk, 20.90 ms with the interpreter and
  13.48 ms with the interpreter and cached connection paths. The target is 4 ms.

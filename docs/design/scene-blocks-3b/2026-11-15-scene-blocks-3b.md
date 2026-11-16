# Scene Blocks (step 1, plan 3b of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish step 1 of the v2 scene:
- any `SceneComponent` can have child scene components, nested to any depth, that draw and take part in the event
  model; anchors become one user of this, and the evented-area API goes;
- events keep today's tree model with a `relatedTarget` (D5), and a block shows as hovered while the pointer is on
  it or on any of its children (В1, written by the block itself);
- components are hit on the levels where they are shown;
- the handover to HTML follows the scene level and the HTML view's mount;
- the minimap reads `graph.scene.query()`;
- blocks pick anchor classes with `getAnchorClass(anchor)`;
- components can be transparent to pointer events.

**Architecture:**
- **Anchor classes** (Task 2). `Block.getAnchorClass(anchor)` returns a class; the block creates the anchor with the
  class's `SIZE` and `LINE_WIDTH`. The block reads its classes in its own update after its data changed, and keeps
  their reach and creation levels (`static CREATION_LEVELS`) cached.
- **Child scene components** (Task 3). A `SceneComponent` returned from another one's `updateChildren()` is a
  sub-component:
  - it draws in a child element nested in its parent's element, at its parent's origin;
  - the store keeps the nesting: each element's place follows its whole ancestor path, and hidden, `dim` and `opacity`
    are inherited down that path;
  - its element's bounds are its hit box, and it is a target of the global hit test, ordered by its scene key.
  `Anchor` uses the same defaults.
- **Events and hover** (Task 3, D5, В1):
  - every pointer event is dispatched at the hit target and walks the parent chain, as today; hover events also name
    a `relatedTarget`, on the components and on the graph's bus, and go only to the sides of a change that exist;
  - each library component writes `hoveredTag` on itself: a block while the target is it or a descendant, an anchor,
    a connection or a group while it is the target. No binding remains;
  - GraphLayer finds the target again under a still pointer when what may be hit there changes, across captures and
    when the pointer leaves the root.
- **Hit levels** (Task 4, D4). A component is hit on the levels where it is shown: its scene look, or its owner's HTML
  view. A look-less child declares its levels (`static hitLevels`); a declaration is authoritative.
- **Event transparency** (Task 5). `static transparentToEvents` on `GraphComponent`.
- **Styled bounds** (Task 6). A live style row that scales or widens primitives widens the element's indexed bounds.
- **Evented areas removed** (Task 7, D2): the render-time `eventedArea()`, its hover tracking and its e2e go; children
  cover their use.
- **Handover** (Task 8):
  - an HTML view holds the block through `Block.delegateRender(request)`, also when it keeps the canvas drawn;
  - the scene hides the block while a view asks for that and the level is detailed;
  - ReactLayer switches its HTML at the end of the graph frame (`graph.scene.onFrameEnd`), so the frame that hides the
    HTML draws the blocks it held.
- **Minimap** (Tasks 9–10):
  - `query(rect, { level, includeHidden, entityTypes })`, with entity types as element metadata;
  - `graph.scene.revisionOf(entityType)`, which steps the children's types as well when their owner changes;
  - the minimap caches its block picture, keeps HEAD's list order and redraws only when block elements change.
- **The rest:** a story (11), docs and the migration guide (12), bench cases for the new paths (13), the final
  verification and gates (14).

**Tech Stack:** TypeScript 6 (`strict`), preact signals-core 1.12, Jest 30 (jsdom, jest-canvas-mock), React 18
(graph-react, `@testing-library/react`), Playwright (e2e and the GPU harness), luma.gl 9.4 behind a dynamic import.

**Spec:** `docs/superpowers/specs/2026-11-10-v2-scene-core-design.md`:
- §5.1 (sub-components, owners without primitives, `transparentToEvents`);
- §5.2 (`getAnchorClass`, sub-components with a hit box, events and state, the handover on `Block`);
- §9 (one order key, separate hit shapes, hit-testability by level);
- §10 (what `delegateRender` hides, when the handover happens, `canvasVisible`);
- §12 (the minimap on `query()`).

Reasons: `docs/superpowers/specs/2026-11-09-webgl-block-design-questions.md` §5.5, §9, §13, §15 (G3, G6) and
`docs/superpowers/specs/2026-11-09-webgl-scene-spec-validation.md` G3, G6. Code facts with `file:line`:
`docs/superpowers/research/2026-11-15-plan3b-facts.md` (read it first). Reviews this revision answers, all in
`.superpowers/sdd/2026-11-15-scene-blocks-3b/`:
- `{codex,opus}-plan-review.md`, ruled on in `plan-fix1-brief.md`;
- `codex-plan-rereview.md`, ruled on in `plan-fix2-brief.md`;
- `codex-plan-rereview2.md`, ruled on in `plan-fix3-brief.md`;
- `codex-plan-rereview3.md`, ruled on in `plan-fix4-brief.md`.

Plan 3a, the format and the scene this plan extends: `docs/superpowers/plans/2026-11-12-scene-blocks.md`.

## Decisions applied

**User decisions (2026-11-15, binding):**
- **D1. Minimap refresh.** «Это не обязательно, миникарта может обновляться в том же кадре - но не должна». The
  minimap may draw a change one frame late. Drags and block moves redraw it in the same frame (`block-change` is
  synchronous); tag and style changes reach it through the scene's end-of-frame revision, one frame later.
- **D2. Evented areas.** «eventedArea давай в целом уберем, но важно чтобы sceneComponent мог иметь дочерние элементы
  которые будут рисоваться и учавствовать в событийной модели». The evented-area API goes (Task 7). Any
  `SceneComponent` may return child `SceneComponent`s from `updateChildren()`. Each draws in a child element nested
  in its parent's element, is a hit-test target of its own ordered by its scene key, and receives events through the
  normal model (Task 3). Anchors are one user of this.
- **D3. Export.** «экспорт картинки - картинка нам в целом не сильно важна». Styled bounds are fixed for the live view
  (Task 6); an export whose own styles grow geometry can crop it, documented in `scene.md` (Task 12). An export-only
  element `dim` or `opacity` reaches the direct children of an element, not deeper descendants (Task 3).
- **D4. One event source.** «при переходе на detailed - тут важно чтобы источник события был один. Так если мы слушаем
  события click по якорю мы слушаем через единую шину событий, поэтому клики по якорю на detailed должны вызывать клик
  по графу». Events always come from the graph's bus: GraphLayer listens on the root, where HTML events bubble, and
  targets the hit-tested component. Rule: a component is hit on the levels where it is shown, by its scene look or by
  an HTML view; an explicit `hitLevels` is authoritative and may exclude any level (Task 4).
- **В1 = (б), CSS `:hover`.** «как пользователь графы я бы хотел чтобы блок оставался hovered, как в css - hover
  считается при наведении на любой из дочерних элементов». D5 says how: the block writes it from the events (below).
  Visible change, accepted by the user: a block stays hovered (`hoveredTag`, React's `graph-tag-hovered`) while the
  pointer is on its anchor; today its tag goes away there.
- **D5. The event model.** «Мне кажется, что событийная модель дерева компонентов спроектирована таким образом, чтобы
  события на дочернем элементе всплывали к родителям, и родитель мог бы отслушать собатия мыши. Соответственно,
  компонент, на который навели мышь, обрабатывает это событие, но не останавливает, либо останавливает по своему
  желанию. Если он его не останавливает, то оно идет к его родителю, к его родителю, к его родителю дальше.
  Соответственно, таким образом, якорь, либо какой-то evented area компонент обработает событие нужным для себя образом
  и передаст его своему родительскому компоненту. Родительский компонент, в свою очередь, тоже сможет проверить.
  Однако, в этом обработчике своего события родитель может проверить, кто является таргетом этого события. И принять
  необходимое решение. Случай с hoveredag - это особый способ стилизации на hover. т.е компонент будет добавлять на
  себя этот тег чтобы применить необходимые стили». Refinement: «hoveredTag - вешается на конкретные компоненты, то как
  их навешать решает разработчик. В нашем случае блок будет слушать все события на себе и на своих дочерних элементах
  и навешивать этот тег на себя. ДОчерние элементы в свою очередь будут навешивать hoverTag на себя». It replaces both
  earlier hover designs (round 1's target-only enter/leave, round 2's hovered-set synthesis). Task 3:
  - **one event model, today's tree model.** Every pointer event, `mouseenter` and `mouseleave` included, is
    dispatched at the hit target and walks the parent chain (`_dipping` ignores `bubbles: false`).
    `stopPropagation()` ends the walk, and `detail.target` is the hit target. On a target change GraphLayer fires
    `mouseleave` and `mouseout` at the old target, then `mouseenter` and `mouseover` at the new one, as today. Only
    the sides that exist get events: the first entry has no leave and a root exit no enter (HEAD's helper put the
    new target in place of a missing old side, a false leave). A target that unmounted gets no event, as today; the
    nearest graph component above it takes its place as the old side of the next change, unless the pointer is on
    that one then;
  - **`relatedTarget`.** The hover events' `detail.relatedTarget` names the other side of the change, none for the
    camera or outside. A parent tells from it whether the pointer stayed in its subtree. It is an additive field;
  - **the bus.** `graph.on(...)` and `useGraphEvent` get the same events with the same targets, as today, plus
    `relatedTarget`: `dispatchNativeEvent` carries it and the public `GraphMouseEvent` (`graphEvents.ts`) types it.
    The CursorLayer and Nirvana's target-following hover menus behave as today;
  - **`hoveredTag` is a styling tool that components put on themselves:**
    - the library `Block` puts it on itself while the target is the block or one of its descendants (В1). It follows
      its own and its descendants' bubbling events, and a subclass decides by target through `isHoveredBy(target)`;
    - `Anchor`, connections and groups put it on themselves while they are the target. `Anchor` passes hover events on
      to its block and stops only clicks and presses;
    - a custom component tags itself only if its developer does so, with the protected helper `setHoveredTag` and the
      recipes of Task 12. It is not a default of `SceneComponent` or `GraphComponent`;
    - each component writes only its own entity, so the binding of `services/tags/systems.ts` goes;
    - one target change is one batch, so a block whose pointer moves onto its anchor is never drawn un-hovered;
  - **styling only.** No library code reads `hoveredTag`, or any tag's membership, to decide behaviour. Events,
    targets, the cursor, hit-testing and menus come only from the events above. Today the tag's only consumers are
    style rules: the theme's anchor ×1.8 rule and the ActionBlock story's rule. One indirect effect is documented:
    - a rule that gives a tagged component a `raise` changes the scene order, and the hit order follows the scene
      order. So a `hoveredTag → raise` rule changes which component gets clicks where components overlap; the theme
      has no such rule;
    - a style `scale` (the anchor's ×1.8) changes the drawing and the culling bounds, not the hit box (spec §9).
- **В2 = (а).** The minimap keeps HEAD's and v1's list order, with legacy blocks in between (Task 10).
- **В3 = (а).** An anchor class that declares the minimalistic level in `CREATION_LEVELS` is created, drawn and hit
  there. A development warning fires when a created anchor draws on a level it does not declare (Task 2).
- **В4 = (а).** The handover is gated by the level, and ReactLayer switches its HTML at the end of the graph frame
  (Task 8).
- **В5 = (а).** At the detailed level without an HTML view, the stock anchor is not hit, although v1 hit it there (D4).
  v1 drew no canvas anchors there (the 1.13.0 build's `Anchor.render()` returns at once at detailed; its hit box was
  created at mount and had no level gate), so no detailed look is added. The interaction consequences, confirmed by the
  re-review, are listed below; Task 12 puts them in the migration guide, and the tasks named in the table test them.

**D4 consequences** (re-review "D4 относительно установленной v1"; standard minimalistic anchors are not a new
consequence: plan 3a already removed them, although v1 drew and hit them there):

| Case | D4 consequence | Tested in |
| --- | --- | --- |
| Detailed without HTML, a stock anchor | Point queries no longer return it; the target is the block under it, or another entity, or the camera | Task 4 (jest) |
| A click on such an anchor | The anchor's selection toggle no longer runs; the block's or the background's action may run | Task 4 (jest) |
| Hover | The anchor's enter/leave, raised state, `hoveredTag`, tooltip and cursor do not activate; the new target gets the events | Task 4 (jest) |
| The graph bus and target-based menus | `mousedown`, `click`, `dblclick`, hover events and `getElementOverPoint()` callers get another target | Task 4 (jest) |
| Starting a connection gesture | The anchor-based start goes; where a block start is allowed (Shift) the block gesture remains | Task 4 (e2e) |
| Finishing a connection gesture | Without `snappable` meta the fallback picks the block's input port instead of the anchor's; validation and the endpoint change | Task 4 (e2e) |
| Explicitly snappable ports | The port search can still reach the anchor port through the block's port map: a separate port path | Task 4 (e2e) |
| Rect and viewport queries | Excluded anchors leave `getElementsOverRect()` and `getElementsInViewport()`; their custom callers change | Task 4 (jest) |
| Rect selection | The default `[Block]` is unchanged; a configuration that includes `Anchor` no longer selects unshown detailed anchors; programmatic selection is unaffected | Task 4 (jest) |
| Drag | Where an anchor took the gesture, the block's or the camera's rules apply; visible with `captureAnchors` and connection editing | Task 4 (e2e) |
| A custom anchor drawn at minimalistic | Once created with its look, it is a hit target there: hover, selection and anchor gestures where HEAD rejected every anchor | Tasks 2, 4 (jest) |
| Detailed with an HTML hold | Anchors and other children keep the graph-bus interaction, except levels excluded by `hitLevels`; `autoHideCanvas={false}` without `canvasVisible` registers the hold too | Tasks 4, 8 (jest) |
| Explicit `hitLevels` | It may exclude detailed even under HTML; the next eligible target gets the events | Task 4 (jest) |

**Settled by the binding rules and the controller's rulings** (no question needed):
1. `getAnchorClass(anchor)` replaces `renderAnchor` (breaking the developer API is allowed). The anchor size is per
   class (`SIZE`) and the key is the anchor id: Nirvana's `anchorSize` is the constant 16, and its `${id}/${index}` key
   only changes component identity, so neither choice changes what users see.
2. Anchor classes, their reach and creation levels derive from the block's applied data in the block's update; a
   change of the chosen classes reconciles the anchors.
3. `GraphComponent.setRenderDelegated` stays the low-level "do not draw, keep the hit box" switch. One public
   predicate, `isRenderDelegated()`, covers it and an HTML view's hold. `hidden` no longer means "held by HTML". Any HTML
   view that holds a block with `canvasVisible: false` hides it, so two views that disagree hide it. A view that keeps
   the canvas drawn (`autoHideCanvas={false}`, `canvasVisible` true or unset) still registers its presence (D4).
4. `transparentToEvents` (spec §5.1) skips the component as the pointer's target and lives on `GraphComponent`. It is
   an option for usable-rect reservers, not a required replacement of `onHitBox() => false`.
5. The minimap shows block elements only, hidden ones included, as v1 did (rule 1).
6. The minimap caches its picture and redraws on `graph.scene.revisionOf("block")`; an anchor-only change does not
   redraw it. While `LegacyCanvasBlock`s exist it redraws fully on camera moves, as HEAD does.
7. Entity types are element metadata (`TSceneElement.entityType`), not id prefixes.
8. **Nesting at any depth is kept in the store** (re-review 1, 2), rather than a one-level limit, so no question
   remains:
   - each element records its scene parent (`nestedIn` when that is a child), and its owner's draw list is the
     pre-order of the nesting; a reorder of any child moves its whole subtree, and a late child lands after its
     parent's existing descendants;
   - hidden, `dim` and `opacity` are derived down the scene-parent chain by the store; nothing copies flags;
   - the cost: `SceneStore` keeps per-element kids and rebuilds the owner's draw list on a structural change, O(children
     of that owner). The WebGL backend reads hidden through the store and rewrites a nested element's descendants
     when its hidden flag changes. Physical ownership (`TSceneElement.parent` is the owner) is unchanged, so the
     renderers' one-level model stays.
9. A child's default hit box is its element's bounds; an element owner sets its own (as `Block` does).
10. **A look-less child is hit only on the levels it declares** (`static hitLevels`; re-review 3). Its parent's levels
    over-approximate: a parent's look exists on every level even where the region it stands for is not drawn, and only
    the author knows where the region is shown. Development builds warn once per class when a look-less child sets a
    hit rect without a declaration.
11. **Retargeting under a still pointer** (re-reviews 6, round 2's 4, 5, 8, round 3's 3, 4, 5). GraphLayer finds the
    target again at the last pointer position, at the end of the frame or once the hit test has processed its queue,
    and fires the normal leave and enter of D5, after:
    - the target unmounts (it gets no event, as before; the nearest graph component above it is the old side);
    - a component's visibility changes (`setVisibility`, `setHiddenBlock`);
    - a hit box that was set before is moved, resized, removed or set again (`GraphComponent.setHitBox`,
      `removeHitBox`): a child's automatic hit rect, an anchor's own box, a block or a connection moved through the
      API. A component's first hit box asks nothing: a component that mounts under a still pointer is found at the
      next pointer move, as today, and the anchors the camera's lazy search creates do not turn camera moves into
      retargets;
    - a child's hit levels change after its first write. Its first hit mask, set at its first add, asks nothing, for
      the same reason as a first hit box (Task 4; round 4's re-review);
    - an HTML hold is taken or released;
    - the scene level changes.
    During a capture (a drag) the request waits, the latest pointer position is kept, and the release always finds the
    target again. A pointer that leaves the graph's root changes the target to none; with a capture held, the release
    does it. Camera moves keep today's rule (`emulateMouseEventsOnCameraChange`), and the emulation finds no target
    while the pointer is outside the root. Visible change, within this item: hover and cursor follow an API move under
    a still pointer at the end of the frame, not at the next pointer move (Task 12 lists it). The graph's
    `mouseenter` and `mouseleave` fire then too, so bus listeners that follow the target react without a pointer
    move: Nirvana's hover menu (`useHoveredGraphComponent`) and anchor tooltips (`AnchorsTooltipLayer`) among them.
12. The Chromium lock of the 3b workspace (`.superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh`) is
    separate from 3a's, which is finished; every Chromium run of 3b goes through it.

## Вопросы к пользователю

Открытых вопросов нет. Ответы на В1–В5 и событийная модель D5 записаны в «Decisions applied». Вложенность дочерних компонентов на любую глубину
реализуется в хранилище сцены (пункт 8 там же), поэтому запасной вариант с ограничением в один уровень не нужен.

## Global Constraints

- **Never commit without the user's explicit permission.** No-commit mode (user, 2026-11-13: «Подагенты, без
  коммитов»): every task ends with its changes in the working tree, and the controller records the tree hash with
  `bash .superpowers/sdd/2026-11-15-scene-blocks-3b/snap.sh`. Implementers do not stage, commit, stash, reset or switch
  branches.
- Design docs under `docs/superpowers/` and the `.superpowers/` workspace are never committed.
- **Every task ends green:** `pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest` and
  `pnpm run typecheck` pass at the end of every task (Task 1 changes nothing). A task that changes a public member
  changes all its in-repo users (packages, Storybook, e2e, benches, contracts, docs examples it touches) in the same
  task. Package-level typechecks (`pnpm --dir packages/graph-minimap run typecheck`,
  `pnpm --dir apps/storybook run typecheck`) resolve `@gravity-ui/graph` through build output: run `pnpm run build`
  before them (the root `pnpm run typecheck` builds first).
- **Red first:** a test or GPU check that pins a fix runs against the tree before the fix and fails there, as its
  step says, and the failure is recorded; characterization tests that pass on HEAD are marked as such.
- **No luma or tiny-sdf import** may be reachable from a module that a Jest test imports. The WebGL backend is reached
  only through a dynamic `import()`. `lib/scene/levels.ts`, `lib/scene/style.ts` and `lib/scene/webgl/levelBounds.ts`
  are pure and may be imported anywhere.
- Run single Jest tests as `pnpm --dir packages/graph exec jest src/<path>` or
  `pnpm --dir packages/graph-react exec jest src/<path>` (not `pnpm test:unit`).
- **Code style** follows the repository's CLAUDE.md:
  - no `any`; explicit return types; explicit accessibility modifiers; double quotes; lines of at most 120 characters;
  - `pnpm --dir packages/graph exec eslint --fix src/<path>` (or the package's own `--dir`) before a manual lint fix;
  - `no-bitwise` is on (level masks use arithmetic: `isOnLevel`, `levelMaskOf`, `unionLevelMasks`);
  - `@typescript-eslint/no-unused-expressions` is an error: read a signal for tracking through a call such as
    `track(signal)`, not a bare `signal.value;`;
  - a test that spies on `console` restores it (`mockRestore()` in the test or `jest.restoreAllMocks()` in `afterEach`).
- **User rules (binding):**
  - breaking the developer API is acceptable; visible behaviour and interaction must not change (both text modes,
    event order, hover, selection, the minimap's content and order), except where D1–D4 and В1–В5 decide otherwise;
  - Canvas LOD is core: every look covers the minimalistic, schematic and detailed levels on Canvas 2D and WebGL;
  - derive, don't override core: kit-level state derives from core values; never a second writer of a core value.
- **Names from the spec:** `delegateRender`, `getAnchorClass(anchor)`, `static transparentToEvents`,
  `graph.scene.query()`, `SceneComponent`, `static mode`, `static entityType`, level methods `minimalistic(view)`,
  `schematic(view)`, `detailed(view)`. Names this plan adds are in Shared names below.
- **Limits** (spec §5.4, plan 3a): 15 parts plus `"none"`, 16 `zIndex` bands, 16,384 owner elements per band (child
  elements do not count), the adaptive sub-order width (`watchSceneLimits`). Every descendant's primitives count toward
  its owner's sub-order width (`lib/scene/sceneLimits.ts:95`), so many children with looks on one block can make WebGL
  fall back; the development error names the owner. Nesting adds no depth limit of its own.
- **Performance gates** (Task 14), guarantee scene (10k blocks, ~40k anchors, 9.9k connections, 1k groups; 1600×1000
  at scale 0.038; Apple M3 Pro, `--gpu`, 5 repeats), against Task 1's baseline taken the same way on HEAD
  `a614f42e`. Each gate reads the statistic the runner prints (round 3, finding 8):
  - a tick or an action time is a **mean** over every measured step of the 5 repeats (`scene-run.mjs:414,416`;
    `entry.ts:356` averages a run's action times first);
  - mount, heap and the bulk actions are the **median** of the 5 repeats (`scene-run.mjs:457`);
  - pan, zoom and drag mean ticks of `blocks` and `blocks-webgl`: at most the baseline + 5 % or + 0.3 ms, whichever is
    larger;
  - the same three mean ticks of `blocks` and `blocks-webgl` with `--minimap`: at most the baseline's `--minimap`
    ticks + 5 % or + 0.3 ms, and the pan tick at most the baseline's (the cache removes the per-pan redraw);
  - median mount: at most the baseline + 20 ms; median JS heap: at most the baseline + 2 MB; median change-all,
    select-all and drag-start-1000: at most the baseline + 10 ms;
  - reference numbers of plan 3a: Canvas 2D `blocks` pan 14.27 / zoom 14.24 / drag 15.86 ms, mount 521 ms, heap
    194 MB, change-all 139 ms; WebGL `blocks-webgl` pan 3.21 / zoom 3.07 / drag 5.30 ms, mount 716 ms, heap 269 MB,
    change-all 180 ms;
  - the guarantee scene uses the stock anchor class and no children with looks, so it cannot cover the new paths: the
    cases of Task 13 (an anchor class created at minimalistic; children with looks) are measured and reported, not
    gated, and their costs are not presented as covered by these gates;
  - on a failure: stop, run an interleaved A/B against `a614f42e` (two runs each, alternating, as plan 3a Task 17h),
    and report the per-tick split before changing code.
- **GPU checks** (`node scripts/bench/culling/scene-slice.mjs`), the bench and e2e use Chromium: run them outside the
  sandbox, one at a time, through `bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh <log> <cmd>`
  (the 3b workspace's lock; 3a's workspace is finished). New checks: C30 (Task 2), C31 (Task 3), C32 (Task 7), C33
  (Task 8). Kill a process that hangs after printing.
- **Every public type** introduced here is exported from `packages/graph/src/index.ts`.
- **Do not break existing behaviour** beyond the migrations this plan lists. Existing tests change only as the task
  that breaks them says.
- **Testing note** (plan 2): never compare a live component with `toMatchObject` or `toEqual`; compare by identity
  (`toBe`), by id, or with `includes(...)` booleans. Tests of visible behaviour sample pixels, not only state.

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/graph/src/lib/scene/levels.ts` | `levelMaskOfPrimitives`, `unionLevelMasks` |
| `packages/graph/src/lib/scene/style.ts` | `styleGeometryKey` |
| `packages/graph/src/lib/scene/{types,SceneStore}.ts` | nesting, `entityType`, styled bounds, `includeHidden`, style-change reasons |
| `packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts` | hidden through the store's nesting |
| `packages/graph/src/lib/CoreComponent.ts` | `getChildComponents()`, development error for duplicate child keys |
| `packages/graph/src/components/canvas/scene/SceneComponent.ts` | child defaults, hit box, hit levels, `invalidateChildren` |
| `packages/graph/src/components/canvas/anchors/index.ts` | `TAnchorClass`, statics, the generic child path |
| `packages/graph/src/components/canvas/blocks/{Block,Blocks}.ts` | `getAnchorClass`, creation levels, `delegateRender` |
| `packages/graph/src/components/canvas/EventedComponent/EventedComponent.ts` | areas removed; `onDispatchedEvent`, hover helpers |
| `packages/graph/src/components/canvas/GraphComponent/index.ts` | `transparentToEvents`, `isRenderDelegated()`, `setHoveredTag`, retarget requests |
| `packages/graph/src/graphEvents.ts`, `graphEvents.test-d.ts` | `relatedTarget` on the bus's `GraphMouseEvent`; its type test |
| `packages/graph/src/components/canvas/layers/graphLayer/GraphLayer.ts` | `relatedTarget`, hover events at the sides that exist, retargeting, root exit, captures; area calls removed |
| `packages/graph/src/services/tags/systems.ts` | the `hoveredTag` binding removed |
| `packages/graph/src/services/scene/{GraphScene,types}.ts` | `onFrameEnd`, query options, `revisionOf` |
| `packages/graph/src/graph.ts`, `index.ts` | hit queries, exports |
| `packages/graph-react/src/{Block.tsx,layer/ReactLayer.tsx}` | `delegateRender`; HTML switch at the frame end |
| `packages/graph-minimap/src/layer.ts` | `query()`, cached picture, list order |
| `apps/e2e/tests/...`, `scripts/bench/culling/...` | e2e, GPU checks C30–C33, bench cases |
| `apps/storybook/src/stories/canvas/sceneInteraction/sceneInteraction.stories.tsx` | the 3b story |
| `packages/graph/docs/...`, `packages/graph-minimap/README.md` | docs and the migration guide |

### Shared names (every task uses these exactly)

```ts
// lib/scene/levels.ts
export function levelMaskOfPrimitives(primitives: readonly TScenePrimitive[]): number; // 0 without primitives
export function unionLevelMasks(a: number, b: number): number;
// lib/scene/style.ts
export function styleGeometryKey(style: TSceneStyle | undefined): string; // "" when no part sets scale or width
// lib/scene/types.ts
TSceneElement.parent?: string; // unchanged: a child element's owner (root)
TSceneElement.nestedIn?: string; // the child element it is nested in; undefined for a direct child of its owner
TSceneElement.entityType?: string; // the `static entityType` of the component that wrote the element
export type TSceneStyleChange = "define" | "free" | "replace" | "dim";
// lib/scene/SceneStore.ts
add(input: TSceneElementInput): TSceneElement; // input.parent: its owner or the child element it is nested in
childrenOf(id: string): readonly TSceneElement[]; // an owner's draw list, or what is nested in a child, pre-order
isDrawnHidden(element: TSceneElement): boolean; // hidden itself or anywhere up its scene-parent chain
query(rect: TTileRect, level?: TSceneLevel, styles?: readonly TSceneStyle[], includeHidden?: boolean): TSceneElement[];
subscribeStyles(listener: (change: TSceneStyleChange) => void): () => void;
// components/canvas/anchors/index.ts
export type TAnchorClass = (new (props: TAnchorProps, parent: Component) => Anchor) &
  Pick<typeof Anchor, "SIZE" | "LINE_WIDTH" | "LOOK_EXTENT" | "CREATION_LEVELS" | "create">;
Anchor.SIZE = 18; Anchor.LINE_WIDTH = 2; Anchor.CREATION_LEVELS: readonly TSceneLevel[] = ["schematic", "detailed"];
Anchor.creationLevelsOf(klass: TAnchorClass): number; // @internal, a level mask
Anchor.drawsOnLevel(klass: TAnchorClass, level: TSceneLevel): boolean; // parameter type changes
// components/canvas/blocks/Block.ts
protected getAnchorClass(anchor: TAnchor): TAnchorClass; // replaces renderAnchor
export function anchorLevelsOf(graph: Graph): number; // @internal
export function resetAnchorLevels(graph: Graph, mask: number): void; // @internal
public getAnchorLevels(): number; // @internal
export type THtmlViewRequest = { readonly canvasVisible: boolean };
public delegateRender(request: THtmlViewRequest): () => void;
public isHeldByHtml(): boolean; // an HTML view holds it and the level is detailed
public override isRenderDelegated(): boolean; // + a hold with canvasVisible false
public override isShownOutsideScene(): boolean; // isRenderDelegated() || isHeldByHtml()
// components/canvas/GraphComponent/index.ts
public static transparentToEvents = false;
public isTransparentToEvents(): boolean;
public isRenderDelegated(): boolean; // a flag of its own, set by setRenderDelegated
// components/canvas/scene/SceneComponent.ts
public static hitLevels?: readonly TSceneLevel[];
public isHitOnLevel(level: TSceneLevel): boolean;
public override onHitBox(data: HitBoxData): boolean;
public isShownOutsideScene(): boolean; // default isRenderDelegated()
public readSceneOrigin(): TPoint; // @internal
protected getSceneParent(): TSceneParent | undefined; // default: the parent scene component's element, renderOrder
protected getSceneOrigin(): TPoint; // default: the parent scene component's origin for a sub-component
protected getHitRect(bounds: TTileRect | undefined): TRect | undefined; // world bounds; default: a child's bounds
protected invalidateChildren(): void;
// lib/CoreComponent.ts
protected getChildComponents(): readonly CoreComponent[]; // mounted children, reconcile order
// components/canvas/layers/graphLayer/GraphLayer.ts
public readonly $hoveredComponent: ReadonlySignal<GraphComponent | undefined>; // unchanged: the target, no tag
public requestRetarget(): void; // @internal: find the target again at the frame's end or the capture's release
// graphEvents.ts (the bus: graph.on, useGraphEvent) and GraphLayer.ts: hover events, the other side of the change
GraphMouseEvent.detail.relatedTarget?: EventedComponent;
// services/HitTest.ts
public hasPendingUpdates(): boolean; // @internal: hit boxes wait in the queue
// index.ts
export { GraphComponent, type TGraphComponentProps } from "./components/canvas/GraphComponent";
// components/canvas/EventedComponent/EventedComponent.ts
protected onDispatchedEvent(event: Event): void; // each event walking through it, before its listeners; a no-op
export type TGraphHoverDetail = { target; relatedTarget; sourceEvent; pointerPressed };
export function pointerTargetAfter(event: Event): EventedComponent | undefined; // enter: target; leave: related
export function isWithinComponent(ancestor: CoreComponent, target: CoreComponent | undefined): boolean;
// removed: eventedArea(), _eventedAreas, _trackAreaHover(), _clearAreaHover(), _lastHitBoxData, TEventedArea*,
// createSyntheticHoverEvent (Task 7)
// components/canvas/GraphComponent/index.ts (hover)
protected setHoveredTag(hovered: boolean): void; // writes this component's own hoveredTag; no default caller
protected requestRetarget(): void; // asks GraphLayer; from setHitBox (a set box changed), removeHitBox, setVisibility
// components/canvas/blocks/Block.ts (hover)
protected isHoveredBy(target: EventedComponent | undefined): boolean; // default: the block or a descendant
// services/scene/types.ts
export type TSceneQueryOptions = {
  readonly level?: TSceneLevel;
  readonly includeHidden?: boolean;
  readonly entityTypes?: readonly string[];
  /** @internal The store's live elements instead of frozen copies. */
  readonly live?: boolean;
};
TSceneElementView.entityType?: string;
TSceneElementView.nestedIn?: string;
IGraphScene.query(rect: TRect, options?: TSceneQueryOptions): readonly TSceneElementView[];
IGraphScene.revisionOf(entityType: string): ReadonlySignal<number>;
IGraphScene.onFrameEnd(listener: () => void): () => void; // Task 3
```

---

### Task 1: Today's numbers at HEAD (controller)

No library change. The controller runs it; the numbers are Task 14's baseline. The 3b workspace
(`.superpowers/sdd/2026-11-15-scene-blocks-3b/`, with its own `snap.sh`, `pkg.sh` and `with-chromium-lock.sh`) exists.

- [ ] **Step 1: Record the base tree**

Run: `bash .superpowers/sdd/2026-11-15-scene-blocks-3b/snap.sh`
Expected: one tree hash; write it to `progress.md` as "Base tree (before Task 2)".

- [ ] **Step 2: The bench on HEAD, without and with the minimap**

Run outside the sandbox, one after the other:

```bash
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/t1-bench.log \
  node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038 --modes pan,zoom,drag \
  --renderers walk,cached,webgl,blocks,blocks-webgl,blocks-default --repeats 5
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/t1-bench-minimap.log \
  node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038 --modes pan,zoom,drag \
  --renderers blocks,blocks-webgl --repeats 5 --minimap
```

Expected: both exit 0; `blocks` and `blocks-webgl` lines near plan 3a's numbers (Global Constraints). Copy the
`blocks`, `blocks-webgl` and `blocks-default` lines of both logs, with the HEAD hash, into `baseline.txt`.

- [ ] **Step 3: GPU checks and e2e on HEAD**

```bash
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/t1-slice.log node scripts/bench/culling/scene-slice.mjs
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/t1-e2e.log \
  pnpm --filter @gravity-ui/graph-e2e exec playwright test --reporter=line
```

Expected: the slice prints C1–C29 with every line PASS; e2e reports 289 passed. Add both counts to `baseline.txt`,
with the test counts of `pnpm --dir packages/graph exec jest` and `pnpm --dir packages/graph-react exec jest` on HEAD
(Task 14 compares its counts with them).

---

### Task 2: `getAnchorClass` replaces `renderAnchor`

Settled items 1 and 2; В3 (а): an anchor class that declares the minimalistic level in `CREATION_LEVELS` is created,
drawn and hit there.

**Files:**
- Modify: `packages/graph/src/lib/scene/levels.ts` (+ `levels.test.ts`): `levelMaskOfPrimitives`, `unionLevelMasks`.
- Modify: `packages/graph/src/lib/scene/SceneStore.ts`: its private `levelsOf` becomes `levelMaskOfPrimitives`.
- Modify: `packages/graph/src/components/canvas/anchors/index.ts`: `TAnchorClass`, `SIZE`, `LINE_WIDTH`,
  `CREATION_LEVELS`, `creationLevelsOf`, the `drawsOnLevel` parameter type, the creation-levels warning, comments.
- Modify: `packages/graph/src/components/canvas/blocks/Block.ts`: `getAnchorClass`, `syncAnchorClasses`, the cached
  classes, reach and levels; `renderAnchor` is removed.
- Modify: `packages/graph/src/components/canvas/blocks/Blocks.ts`: the view test follows `anchorLevelsOf`.
- Modify: `packages/graph/src/index.ts`: `export { Anchor, type TAnchor, type TAnchorClass, type TAnchorProps, type
  TAnchorView } from "./components/canvas/anchors";`.
- Modify: `apps/storybook/src/stories/Playground/ActionBlock/index.tsx`: delete its `renderAnchor` (identical to the
  default) and the imports only it used.
- Modify: `scripts/bench/culling/scene/slice.ts` (GPU check C30), `scripts/bench/culling/README.md` (its line).
- Test: `packages/graph/src/components/canvas/blocks/anchorClass.test.ts` (create); migrate
  `components/canvas/blocks/exportAnchors.test.ts`, `components/canvas/blocks/lazyAnchors.test.ts`,
  `components/canvas/anchors/Anchor.scene.test.ts`, `components/canvas/nativeVisibilityCulling.test.ts`.

**Interfaces:**
- Produces (Shared names): `levelMaskOfPrimitives`, `unionLevelMasks`, `TAnchorClass`, `Anchor.SIZE`,
  `Anchor.LINE_WIDTH`, `Anchor.CREATION_LEVELS`, `Anchor.creationLevelsOf`, `Block.getAnchorClass`, `anchorLevelsOf`,
  `resetAnchorLevels`, `Block.getAnchorLevels`.
- Removes: `Block.renderAnchor(anchor): ComponentDescriptor<typeof Anchor>`.

- [ ] **Step 1: Level-mask helpers, test first**

Add to `packages/graph/src/lib/scene/levels.test.ts` (extend its import from `./levels` with `ALL_LEVELS_MASK`,
`LEVEL_BIT`, `levelMaskOfPrimitives` and `unionLevelMasks`):

```ts
it("unions the levels of primitives: none is 0, a primitive without a mask is every level", () => {
  expect(levelMaskOfPrimitives([])).toBe(0);
  expect(levelMaskOfPrimitives([{ kind: "rect", x: 0, y: 0, width: 1, height: 1 }])).toBe(ALL_LEVELS_MASK);
  expect(
    levelMaskOfPrimitives([
      { kind: "circle", cx: 0, cy: 0, r: 1, levelMask: LEVEL_BIT.minimalistic },
      { kind: "circle", cx: 0, cy: 0, r: 1, levelMask: LEVEL_BIT.detailed },
    ])
  ).toBe(LEVEL_BIT.minimalistic + LEVEL_BIT.detailed);
});

it("unions two level masks without bitwise operators", () => {
  expect(unionLevelMasks(LEVEL_BIT.schematic, LEVEL_BIT.schematic + LEVEL_BIT.detailed)).toBe(6);
  expect(unionLevelMasks(0, LEVEL_BIT.minimalistic)).toBe(1);
  expect(unionLevelMasks(0, 0)).toBe(0);
});
```

Run: `pnpm --dir packages/graph exec jest src/lib/scene/levels.test.ts`
Expected: FAIL (`levelMaskOfPrimitives is not a function`).

Add to `packages/graph/src/lib/scene/levels.ts` (and `import type { TScenePrimitive } from "./types";`):

```ts
/** The levels at least one of the primitives shows on, as a level mask; 0 for no primitives. */
export function levelMaskOfPrimitives(primitives: readonly TScenePrimitive[]): number {
  let mask = 0;
  for (const level of SCENE_LEVELS) {
    if (primitives.some((primitive) => isOnLevel(primitive.levelMask, level))) mask += LEVEL_BIT[level];
  }
  return mask;
}

/** The levels of either mask, as one mask (arithmetic only: no-bitwise). */
export function unionLevelMasks(a: number, b: number): number {
  let mask = 0;
  for (const level of SCENE_LEVELS) {
    if (isOnLevel(a, level) || isOnLevel(b, level)) mask += LEVEL_BIT[level];
  }
  return mask;
}
```

In `SceneStore.ts`, delete the private `levelsOf` function, import `levelMaskOfPrimitives` from `./levels` and use it
at both former call sites (`add` and `update`).

Run: `pnpm --dir packages/graph exec jest src/lib/scene`
Expected: PASS.

- [ ] **Step 2: The failing anchor-class tests**

Create `packages/graph/src/components/canvas/blocks/anchorClass.test.ts`:

```ts
import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../lib/scene/types";
import type { TSceneLevel } from "../../../services/scene/types";
import { entityKey } from "../../../services/tags/TagStore";
import { Anchor } from "../anchors";
import type { TAnchor, TAnchorClass, TAnchorProps } from "../anchors";

import { Block, anchorLevelsOf, anchorReachOf } from "./Block";
import type { TBlock } from "./Block";

/** Below SCALES[1] (0.225): the minimalistic level. */
const FAR = 0.1;
/** Schematic: from 0.225 to 0.7. */
const NEAR = 0.5;

const anchored = (id: string, x: number, is = "Block", meta?: Record<string, unknown>): TBlock => ({
  id,
  is,
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors: [
    { id: "in", blockId: id, type: "IN" },
    { id: "out", blockId: id, type: "OUT" },
  ],
  meta,
});

function frames(count = 4): void {
  for (let i = 0; i < count; i++) globalScheduler.performUpdate();
}

/** A square smaller than the stock dot, with its size and reach on the class. */
class SquareAnchor extends Anchor {
  public static override SIZE = 12;
  public static override LINE_WIDTH = 1;
  public static override LOOK_EXTENT = 8;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -6, y: -6, width: 12, height: 12 }];
  }
}

/** The stock look, with a reach of 40 declared. */
class WideAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
  public static override LOOK_EXTENT = 40;
}

/** A look on the minimalistic level too, declared in its creation levels. */
class FarDotAnchor extends Anchor {
  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -2, y: -2, width: 4, height: 4 }];
  }
}

/** A minimalistic look without the declaration: never created there; development builds warn. */
class UndeclaredFarAnchor extends Anchor {
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -2, y: -2, width: 4, height: 4 }];
  }
}

class SquareOutBlock extends Block {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SquareAnchor : Anchor;
  }
}

class WideBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return WideAnchor;
  }
}

class FarDotBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return FarDotAnchor;
  }
}

class UndeclaredBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return UndeclaredFarAnchor;
  }
}

/** The class follows the block's meta, as Nirvana picks shapes from `meta.anchorsMeta`. */
class MetaChosenBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    const meta = this.state.meta as { far?: boolean; square?: boolean } | undefined;
    if (meta?.far) return FarDotAnchor;
    return meta?.square ? SquareAnchor : Anchor;
  }
}

describe("anchor classes from getAnchorClass", () => {
  let graph: Graph;

  /** A graph with a 1000 x 800 view whose camera starts at `scale`, at the world origin. */
  function start(blocks: TBlock[], scale: number): void {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        settings: {
          useBlocksAnchors: true,
          blockComponents: {
            Square: SquareOutBlock,
            Wide: WideBlock,
            FarDot: FarDotBlock,
            Undeclared: UndeclaredBlock,
            Meta: MetaChosenBlock,
          },
        },
      },
      root
    );
    graph.start();
    graph.cameraService.set({ scale, x: 0, y: 0 });
    graph.setEntities({ blocks, connections: [] });
    frames();
  }

  const anchorOf = (id: string, anchorId: string): Anchor | undefined =>
    graph.rootStore.blocksList.getBlockState(id)?.getAnchorById(anchorId)?.getViewComponent();
  const anchorChildren = (id: string): number => graph.scene.store.childrenOf(entityKey("block", id)).length;

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("creates each anchor with its class, sized by the class's SIZE and LINE_WIDTH", () => {
    start([anchored("a", 100, "Square")], NEAR);
    const square = anchorOf("a", "out");
    expect(square).toBeInstanceOf(SquareAnchor);
    expect([square?.props.size, square?.props.lineWidth]).toEqual([12, 1]);
    expect(anchorOf("a", "in")?.constructor).toBe(Anchor);
    expect(anchorOf("a", "in")?.props.size).toBe(18);
    const element = square ? graph.scene.store.get(square.getSceneElementId()) : undefined;
    expect(element?.primitives.map((primitive) => primitive.kind)).toEqual(["rect"]);
  });

  it("learns the reach of its anchor classes at mount, before any camera search shows the block", () => {
    // The minimalistic level creates no anchor components, so only the block's own update reads the classes.
    start([anchored("w", 100, "Wide")], FAR);
    expect(anchorChildren("w")).toBe(0);
    expect(anchorReachOf(graph)).toBe(40);
  });

  it("creates anchors on the minimalistic level for a class that declares it, and none for the stock class", () => {
    start([anchored("dot", 100, "FarDot"), anchored("plain", 400)], FAR);
    expect(anchorChildren("dot")).toBe(2);
    expect(anchorChildren("plain")).toBe(0);
  });

  it("creates them when the camera shows such a block on the minimalistic level", () => {
    // At 0.1 the view spans world x 0..10000: the block at 20000 is out of it.
    start([anchored("dot", 20_000, "FarDot")], FAR);
    expect(anchorChildren("dot")).toBe(0);
    graph.cameraService.set({ scale: FAR, x: -20_000 * FAR, y: 0 });
    frames();
    expect(anchorChildren("dot")).toBe(2);
  });

  it("does not create a class on the minimalistic level that only draws there, and warns once", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    start([anchored("u", 100, "Undeclared")], NEAR);
    expect(anchorChildren("u")).toBe(2);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("CREATION_LEVELS"))).toHaveLength(1);
    graph.setEntities({ blocks: [anchored("u2", 100, "Undeclared")], connections: [] });
    graph.cameraService.set({ scale: FAR, x: 0, y: 0 });
    frames();
    expect(anchorChildren("u2")).toBe(0);
  });

  it("swaps the anchor components when a meta change picks another class", () => {
    start([anchored("m", 100, "Meta")], NEAR);
    expect(anchorOf("m", "out")?.constructor).toBe(Anchor);
    graph.api.updateBlock({ id: "m", meta: { square: true } });
    frames();
    expect(anchorOf("m", "out")).toBeInstanceOf(SquareAnchor);
  });

  it("learns the creation levels of an offscreen block whose meta changes, and creates its anchors when shown", () => {
    start([anchored("m", 20_000, "Meta")], FAR);
    expect(anchorLevelsOf(graph)).toBe(6);
    graph.api.updateBlock({ id: "m", meta: { far: true } });
    frames();
    expect(anchorLevelsOf(graph)).toBe(7);
    graph.cameraService.set({ scale: FAR, x: -20_000 * FAR, y: 0 });
    frames();
    expect(anchorOf("m", "out")).toBeInstanceOf(FarDotAnchor);
  });

  it("does not ask getAnchorClass again for a move", () => {
    start([anchored("m", 100, "Meta")], NEAR);
    const ask = jest.spyOn(
      MetaChosenBlock.prototype as unknown as { getAnchorClass(): TAnchorClass },
      "getAnchorClass"
    );
    graph.api.updateBlock({ id: "m", x: 300 });
    frames();
    expect(ask).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --dir packages/graph exec jest src/components/canvas/blocks/anchorClass.test.ts`
Expected: FAIL: the first test finds a stock `Anchor` for "out" (no `getAnchorClass` hook), the second reads 11.5, the
minimalistic tests find 0 anchors, `anchorLevelsOf` does not exist.

- [ ] **Step 3: `Anchor` statics, `TAnchorClass` and creation levels**

In `packages/graph/src/components/canvas/anchors/index.ts`:
- import `LEVEL_BIT`, `isOnLevel`, `levelMaskOf`, `levelMaskOfPrimitives` next to `SCENE_LEVELS` from
  `../../../lib/scene/levels`;
- after `TAnchorView`, add:

```ts
/**
 * An anchor class `Block.getAnchorClass` returns (spec §5.2): `Anchor` or a subclass whose props are `TAnchorProps`.
 * The block creates the component with the anchor's data, its port and the class's `SIZE` and `LINE_WIDTH`; a class
 * reads anything else from its anchor (`this.props`) and its block (its view data `view.block`, or the block's data in
 * a method of its own).
 */
export type TAnchorClass = (new (props: TAnchorProps, parent: Component) => Anchor) &
  Pick<typeof Anchor, "SIZE" | "LINE_WIDTH" | "LOOK_EXTENT" | "CREATION_LEVELS" | "create">;
```

- add a module constant `const warnedCreationLevels = new WeakSet<object>();` next to `warnedExtents`;
- in the class, before `CANVAS_HOVER_FACTOR`, add:

```ts
  /** The dot's diameter of this class's anchors in world units, passed as their `size` (hover scales it). */
  public static SIZE = 18;

  /** The line width of this class's anchors, passed as their `lineWidth`; the stock ring is `lineWidth + 3` wide. */
  public static LINE_WIDTH = 2;

  /**
   * The levels on which blocks create anchors of this class lazily, once the camera shows the block there. The stock
   * look draws on the schematic level, and React draws anchors on the detailed one (where they are hit while an HTML
   * view holds the block). A class whose look draws on the minimalistic level declares it here; development builds warn
   * when a created anchor draws on a level this list omits.
   */
  public static CREATION_LEVELS: readonly TSceneLevel[] = ["schematic", "detailed"];
```

- in the `LOOK_EXTENT` comment, replace "with `Block`'s anchor props (size 18, lineWidth 2)" by "with `SIZE` 18 and
  `LINE_WIDTH` 2", and "a block that passes a larger `size` or `lineWidth` to its anchors" by "a class with a larger
  `SIZE` or `LINE_WIDTH`";
- change the signature `public static drawsOnLevel(klass: typeof Anchor, level: TSceneLevel): boolean` to take
  `klass: TAnchorClass` (the body is unchanged);
- after `drawsOnLevel`, add:

```ts
  /** @internal The levels on which blocks create anchors of a class (`CREATION_LEVELS`), as a level mask. */
  public static creationLevelsOf(klass: TAnchorClass): number {
    return levelMaskOf(klass.CREATION_LEVELS);
  }
```

- in `checkLook()`, after the `LOOK_EXTENT` check (before its `return`s can skip it, so put it first in the method,
  after `this.lookChecked = true;`), add:

```ts
    const element = this.getSceneElementView();
    const drawn = element ? levelMaskOfPrimitives(element.primitives) : 0;
    const created = Anchor.creationLevelsOf(klass);
    const missing = SCENE_LEVELS.filter((level) => isOnLevel(drawn, level) && !isOnLevel(created, level));
    if (drawn > 0 && missing.length > 0 && !warnedCreationLevels.has(klass)) {
      warnedCreationLevels.add(klass);
      console.warn(
        `${name}: its anchors draw on the ${missing.join(" and ")} level, but ${name}.CREATION_LEVELS omits it: ` +
          "blocks do not create them there, so the look shows there only after the camera visited another level. " +
          `Declare \`public static override CREATION_LEVELS = [${SCENE_LEVELS.map((l) => `"${l}"`).join(", ")}];\`.`
      );
    }
```

  (`LEVEL_BIT` is not needed once `levelMaskOf` is used; drop it from the import if eslint reports it.)

`Component` is already imported as a value in this file (`import { Component } from "../../../lib/Component";`).

- [ ] **Step 4: `Block.getAnchorClass`, cached classes and creation levels**

In `packages/graph/src/components/canvas/blocks/Block.ts`:
- imports: `import { LEVEL_BIT, isOnLevel, unionLevelMasks } from "../../../lib/scene/levels";`; replace
  `import { Anchor, TAnchor } from "../anchors";` by `import { Anchor } from "../anchors";` and
  `import type { TAnchor, TAnchorClass } from "../anchors";`; drop `ComponentDescriptor` from the `CoreComponent`
  type import (keep `ChildDescriptor`).
- replace the `defaultAnchorClasses` declaration and `lookExtentOf` with:

```ts
/** The anchor classes of a block that keeps `Block.getAnchorClass`; set on first use (no import-order dependency). */
let defaultAnchorClasses: readonly TAnchorClass[] | undefined;

/** The levels on which a block creates stock anchors (`Anchor.CREATION_LEVELS`): schematic and detailed. */
const DEFAULT_ANCHOR_LEVELS = LEVEL_BIT.schematic + LEVEL_BIT.detailed;

/** Per graph: the creation levels of the anchor classes its blocks have read (`Block.syncAnchorClasses`). */
const anchorLevels = new WeakMap<Graph, number>();

/** Block classes whose `getAnchorClass` failure was reported once. */
const reportedClassErrors = new WeakSet<object>();

function noteAnchorLevels(graph: Graph, mask: number): void {
  const current = anchorLevels.get(graph) ?? DEFAULT_ANCHOR_LEVELS;
  const next = unionLevelMasks(current, mask);
  if (next !== current) anchorLevels.set(graph, next);
}

/**
 * @internal The levels on which blocks of this graph may create anchor components: the stock ones (schematic and
 * detailed) and those of the anchor classes its blocks have read (`Anchor.CREATION_LEVELS`). The camera's lazy search
 * (`Blocks`) runs on these levels only.
 */
export function anchorLevelsOf(graph: Graph): number {
  return unionLevelMasks(DEFAULT_ANCHOR_LEVELS, anchorLevels.get(graph) ?? 0);
}

/** @internal Sets the graph's anchor creation levels to `mask` (`Blocks`, as `resetAnchorReach`). */
export function resetAnchorLevels(graph: Graph, mask: number): void {
  anchorLevels.set(graph, mask);
}

/** The largest `LOOK_EXTENT` of these anchor classes. */
function lookExtentOf(classes: readonly TAnchorClass[]): number {
  let extent = 0;
  for (const klass of classes) if (klass.LOOK_EXTENT > extent) extent = klass.LOOK_EXTENT;
  return extent;
}

/** The levels on which anchors of these classes are created, as one mask. */
function creationLevelsOfClasses(classes: readonly TAnchorClass[]): number {
  let mask = 0;
  for (const klass of classes) mask = unionLevelMasks(mask, Anchor.creationLevelsOf(klass));
  return mask;
}

function sameClasses(a: readonly TAnchorClass[], b: readonly TAnchorClass[]): boolean {
  return a.length === b.length && a.every((klass, index) => klass === b[index]);
}

/** Whether a state change moves the block only: `getAnchorClass` is not asked again for it. */
function onlyPlaceChanged(state: object, next: object): boolean {
  for (const key of Object.keys(next)) {
    if (key === "x" || key === "y") continue;
    if (Reflect.get(state, key) !== Reflect.get(next, key)) return false;
  }
  return true;
}
```

- fields, next to `anchorReach`:

```ts
  /** The class `getAnchorClass` chose for each anchor of `$anchors`, in its order (`syncAnchorClasses`). */
  private anchorClassList?: readonly TAnchorClass[];

  /** The distinct classes of `anchorClassList`, for exports and the lazy rule. */
  private anchorClassSet?: readonly TAnchorClass[];

  /** Whether block data `getAnchorClass` may read changed since the classes were read. */
  private anchorClassesDirty = true;

  /** The levels on which its anchors are created (`Anchor.CREATION_LEVELS`), as last read. */
  private anchorCreationMask = DEFAULT_ANCHOR_LEVELS;
```

- in `subscribe()`, in the `$anchors.subscribe` callback, add `this.anchorClassesDirty = true;` next to
  `this.anchorsCreated = false;`;
- in `propsChanged()`, add `this.anchorClassesDirty = true;` before `super.propsChanged(nextProps);`;
- add a `stateChanged` override (the class has none; `LegacyCanvasBlock`'s calls `super`):

```ts
  protected override stateChanged(nextState: TBlockComponentState<T>): void {
    // Anything but a move may change the anchor classes; a move never asks getAnchorClass again.
    if (
      !this.anchorClassesDirty &&
      this.getAnchorClass !== Block.prototype.getAnchorClass &&
      !onlyPlaceChanged(this.state, nextState)
    ) {
      this.anchorClassesDirty = true;
    }
    super.stateChanged(nextState);
  }
```

- in `willIterate()`, right after `super.willIterate();`, add `this.syncAnchorClasses();`;
- replace the first line of `shouldCreateAnchors()` with:

```ts
    if (this.blockHidden) return false;
    if (!isOnLevel(this.anchorCreationLevels(), this.context.graph.scene.$level.peek())) return false;
```

  and its JSDoc's "the scene level is not minimalistic (anchors have no look there)" by "the scene level is one its
  anchor classes are created on (`Anchor.CREATION_LEVELS`)";
- replace `anchorLookReach()` with:

```ts
  /**
   * How far the look of this block's anchors reaches from their points at most: the largest `LOOK_EXTENT` of their
   * classes, as last read in its update. While its classes are unknown, the graph's largest reach. Recorded as the
   * graph's largest for the camera's view search (`anchorReachOf`).
   */
  private anchorLookReach(): number {
    const classes = this.anchorClasses();
    const reach = classes ? lookExtentOf(classes) : anchorReachOf(this.context.graph);
    this.anchorReach = reach;
    noteAnchorReach(this.context.graph, reach);
    return reach;
  }
```

- `anchorsShowIn(anchors, rect, level)` calls `this.anchorClasses()` (no argument);
- replace `anchorClasses()` and its JSDoc with:

```ts
  /**
   * The classes of these anchors' components: an export reads their `LOOK_EXTENT` and level methods
   * (`Anchor.drawsOnLevel`). Without a `getAnchorClass` override every anchor is an `Anchor`. With one, the classes
   * read in the block's last update; `undefined` while an update is pending or the data changed since (they may not be
   * final), so no class-based rejection happens and the export draws whatever intersects.
   */
  private anchorClasses(): readonly TAnchorClass[] | undefined {
    if (this.getAnchorClass === Block.prototype.getAnchorClass) {
      return (defaultAnchorClasses ??= Object.freeze([Anchor]));
    }
    if (this.hasPendingUpdate() || this.anchorClassesDirty) return undefined;
    return this.anchorClassSet;
  }

  /**
   * Reads the anchor classes from the block's applied data (`getAnchorClass`) after it changed (a move excepted), in
   * the block's update: their reach and creation levels are cached and noted for the camera's lazy search, an offscreen
   * block's too, and a change of the chosen classes reconciles the anchors, so each component has the class chosen now.
   */
  private syncAnchorClasses(): void {
    if (!this.anchorClassesDirty) return;
    this.anchorClassesDirty = false;
    if (this.getAnchorClass === Block.prototype.getAnchorClass) return;
    let list: TAnchorClass[];
    try {
      list = this.connectedState.$anchors.peek().map((anchor) => this.getAnchorClass(anchor));
    } catch (error) {
      this.reportAnchorClassError(error);
      return;
    }
    const previous = this.anchorClassList;
    const classes = [...new Set(list)];
    this.anchorClassList = list;
    this.anchorClassSet = classes;
    this.anchorReach = lookExtentOf(classes);
    noteAnchorReach(this.context.graph, this.anchorReach);
    this.anchorCreationMask = creationLevelsOfClasses(classes);
    noteAnchorLevels(this.context.graph, this.anchorCreationMask);
    if (this.anchorsCreated && previous !== undefined && !sameClasses(previous, list)) this.shouldUpdateChildren = true;
  }

  private reportAnchorClassError(error: unknown): void {
    if (reportedClassErrors.has(this.constructor)) return;
    reportedClassErrors.add(this.constructor);
    console.error(`${this.constructor.name}: getAnchorClass() threw; its anchors use the graph's reach`, error);
  }

  /** The levels on which this block creates its anchors now: its classes', or the graph's while they are unknown. */
  private anchorCreationLevels(): number {
    if (this.getAnchorClass === Block.prototype.getAnchorClass) return DEFAULT_ANCHOR_LEVELS;
    return this.anchorClassList ? this.anchorCreationMask : anchorLevelsOf(this.context.graph);
  }

  /** @internal The levels on which its anchors are created, as last read (`Blocks` recomputes the graph's). */
  public getAnchorLevels(): number {
    return this.anchorCreationMask;
  }
```

- replace `renderAnchor` (its JSDoc included) with:

```ts
  /**
   * The class of one anchor's component (spec §5.2): `Anchor` by default. Return a subclass for another look: its
   * level methods describe it, its view data carries this block's (`view.block`), and its statics `SIZE`,
   * `LINE_WIDTH`, `LOOK_EXTENT` and `CREATION_LEVELS` give its size, reach and levels. The block creates the component
   * with the anchor's data and port, keyed by the anchor's id.
   *
   * Calling contract: a pure function of the anchor and the block's data (`this.state`, `this.props`,
   * `this.connectedState`), without side effects. The block calls it in its update after that data changed (a move
   * excepted), and reconciles its anchors when a class changes.
   */
  protected getAnchorClass(_anchor: TAnchor): TAnchorClass {
    return Anchor;
  }

  /** One anchor's component: its class with the anchor's data, its port and the class's `SIZE` and `LINE_WIDTH`. */
  private anchorDescriptor(anchor: TAnchor, index: number): ChildDescriptor {
    const list = this.anchorClassList;
    const klass = list && list.length === (this.state.anchors ?? []).length ? list[index] : this.getAnchorClass(anchor);
    return klass.create(
      {
        ...anchor,
        zIndex: this.zIndex,
        size: klass.SIZE,
        lineWidth: klass.LINE_WIDTH,
        port: this.getAnchorPort(anchor.id),
      },
      { key: anchor.id }
    );
  }
```

- in `updateChildren()`, replace `.map((anchor) => { return this.renderAnchor(anchor); })` by
  `.map((anchor, index) => this.anchorDescriptor(anchor, index))`;
- update the comments that name `renderAnchor` (`createExportAnchors`, `hasPendingUpdate`) to `getAnchorClass`.

In `packages/graph/src/components/canvas/blocks/Blocks.ts`:
- import `isOnLevel` and `unionLevelMasks` from `../../../lib/scene/levels`, and `anchorLevelsOf`,
  `resetAnchorLevels` from `./Block`;
- in `createAnchorsInView`, the first line becomes:

```ts
    const graph = this.context.graph;
    if (!isOnLevel(anchorLevelsOf(graph), level) || !graph.rootStore.settings.getConfigFlag("useBlocksAnchors")) return;
```

- in `didUpdateChildren`, add `let levels = 0;` next to `let reach = 0;`, inside the loop
  `levels = unionLevelMasks(levels, block.getAnchorLevels());`, and after it `resetAnchorLevels(this.context.graph, levels);`.

Run: `pnpm --dir packages/graph exec jest src/components/canvas/blocks/anchorClass.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Migrate the in-repo overrides**

`exportAnchors.test.ts`:
- `ClassAnchorBlock`:

```ts
/** Renders its anchors as `anchorClass`. */
class ClassAnchorBlock extends Block {
  protected anchorClass: TAnchorClass = Anchor;

  protected override getAnchorClass(): TAnchorClass {
    return this.anchorClass;
  }
}
```

  and every subclass's field becomes `protected override anchorClass: TAnchorClass = <Class>;`;
- `PropsChosenBlock`:
  `protected override getAnchorClass(): TAnchorClass { return this.isWide() ? WideAnchor : SmallAnchor; }`;
- `DataChosenBlock`: `protected override getAnchorClass(): TAnchorClass` returning
  `(this.state.meta as { wide?: boolean } | undefined)?.wide ? WideAnchor : SmallAnchor` (wrapped at 120 characters);
- the block that creates `BrokenAnchor`: `protected override getAnchorClass(): TAnchorClass { return BrokenAnchor; }`;
- the test "asks a block's renderAnchor() for its anchor classes, and an export fails when it throws" becomes "asks a
  block's getAnchorClass() for its anchor classes, and an export fails when it throws": `NoAnchorsBlock` overrides
  `getAnchorClass(): TAnchorClass { throw new Error("no anchors"); }`; the test starts with
  `const error = jest.spyOn(console, "error").mockImplementation(() => undefined);`, keeps its expectations, adds
  `expect(error).toHaveBeenCalledTimes(1);` (the block's update reported it once) before
  `expect(() => schematic(...)).toThrow("no anchors")`, and ends with `error.mockRestore();`;
- `FarAnchor` keeps no `CREATION_LEVELS` declaration, so the test "creates no default anchors for a level they draw
  nothing on, and a subclass's that draw there" keeps its expectations (the export creates its temporary anchors).
  The temporary `FarAnchor` now logs the creation-levels warning once: if a test of the file asserts that nothing was
  warned, spy on `console.warn` there and assert the warning names `FarAnchor`;
- import `type TAnchorClass` from `../anchors`; drop `ComponentDescriptor` if unused.

`lazyAnchors.test.ts`: the test "reads the reach of a renderAnchor class that declares a larger LOOK_EXTENT" becomes
"reads the reach of a getAnchorClass class that declares a larger LOOK_EXTENT"; `WideAnchorBlock` overrides
`protected override getAnchorClass(): TAnchorClass { return WideAnchor; }`.

`Anchor.scene.test.ts`, the describe "an anchor whose constructor finds no anchor state":

```ts
  /** Builds its anchors with an id their block does not have: the Anchor constructor throws before it binds. */
  class MissingAnchor<T extends TAnchorProps = TAnchorProps> extends Anchor<T> {
    constructor(props: T, parent: Component) {
      super({ ...props, id: "missing" }, parent);
    }
  }

  class MissingAnchorBlock extends Block {
    protected override getAnchorClass(): TAnchorClass {
      return MissingAnchor;
    }
  }
```

(import `Component` from `../../../lib/Component` and `type TAnchorClass, type TAnchorProps` from `./index`).

`nativeVisibilityCulling.test.ts`: delete `const AnchorView: typeof Anchor = TracedAnchor;` and replace `TracedBlock`'s
`renderAnchor` by `protected override getAnchorClass(): TAnchorClass { return TracedAnchor; }`.

`ActionBlock/index.tsx`: delete `renderAnchor` and the imports only it used (`Anchor` if nothing else uses it).

Run: `pnpm --dir packages/graph exec jest src/components/canvas`
Expected: PASS. Then
`pnpm --dir packages/graph exec eslint --fix src/components/canvas/blocks src/components/canvas/anchors src/lib/scene`
and `pnpm --dir apps/storybook exec eslint --fix src/stories/Playground/ActionBlock/index.tsx`: no errors.

- [ ] **Step 6: GPU check C30 (anchor classes on both renderers)**

In `scripts/bench/culling/scene/slice.ts`:
- imports: `import { Anchor, CanvasBlock, Graph } from "GRAPH";` and
  `import type { TAnchor, TAnchorClass, TSceneLevel } from "GRAPH";` (merge with the existing type imports);
- the header comment reads "checks C1-C30";
- at module level:

```ts
/** C30: a 16 x 16 square instead of the stock dot, on the schematic level. */
class SliceSquareAnchor extends Anchor {
  public static override SIZE = 16;
  public static override LOOK_EXTENT = 8;

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -8, y: -8, width: 16, height: 16 }];
  }
}

/** C30: an 80 x 80 square on the minimalistic level only, declared in its creation levels. */
class SliceFarAnchor extends Anchor {
  public static override LOOK_EXTENT = 40;

  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -40, y: -40, width: 80, height: 80 }];
  }
}

/** C30: OUT anchors are squares, IN anchors draw on the minimalistic level. */
class SliceShapesBlock extends CanvasBlock {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SliceSquareAnchor : SliceFarAnchor;
  }
}
```

- after the C29 check:

```ts
  // C30: anchor classes from getAnchorClass. Block S (x 0..200, y 3000..3100) has a square OUT anchor at (200, 3088)
  // and an IN anchor at (0, 3088) whose class draws an 80 x 80 square on the minimalistic level only.
  // 1. schematic (0.5): the square's corner (207, 3081), outside a radius-9 dot, has the anchor colour, as on Canvas2D;
  // 2. minimalistic (0.1), S added while the camera is there: the IN anchor exists (its class declares the level) and
  //    its square left of the block, at (-25, 3088), has the anchor colour, as on Canvas2D.
  await check("C30", async () => {
    const anchorColor = hex("#ff00ff");
    const shapes = {
      id: "S",
      is: "Shapes",
      name: "Shapes",
      x: 0,
      y: 3000,
      width: 200,
      height: 100,
      anchors: [
        { id: "i", blockId: "S", type: "IN" },
        { id: "o", blockId: "S", type: "OUT" },
      ],
    };
    const lookAt = (scale: number): void => camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 3000 * scale });
    graph.updateSettings({ useBlocksAnchors: true, blockComponents: { Shapes: SliceShapesBlock } });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    try {
      lookAt(0.5);
      graph.setEntities({ blocks: [shapes], connections: [] });
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
      const corner = pixelAt(207, 3081);
      const square = againstCanvas2D(194, 3082, 12, 12);
      graph.setEntities({ blocks: [], connections: [] });
      lookAt(0.1);
      graph.setEntities({ blocks: [shapes], connections: [] });
      for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
      const far = pixelAt(-25, 3088);
      const farRegion = againstCanvas2D(-35, 3080, 20, 16);
      const created = graph.rootStore.blocksList.getBlockState("S")?.getAnchorById("i")?.getViewComponent();
      const worst = Math.max(square.worst, farRegion.worst);
      record(
        "C30",
        near(corner, anchorColor) && near(far, anchorColor) && created instanceof SliceFarAnchor && worst <= TOLERANCE,
        `schematic square corner ${show(corner)} (want #ff00ff); minimalistic IN square ${show(far)} (want #ff00ff), ` +
          `IN anchor created at minimalistic=${created instanceof SliceFarAnchor}; worst channel difference from ` +
          `Canvas2D=${worst} (square ${square.worst}, far ${farRegion.worst})`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });
```

- in `scripts/bench/culling/README.md`, add "C30 — anchor classes: a `getAnchorClass` square matches Canvas2D; a class
  that declares the minimalistic level is created and drawn there."

Run (outside the sandbox, through the lock): `node scripts/bench/culling/scene-slice.mjs`
Expected: C1–C30 PASS.

- [ ] **Step 7: Whole suites and types**

Run: `pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`
Expected: all pass; `grep -rn "renderAnchor" packages/*/src apps/storybook/src apps/e2e/tests scripts/bench` finds
nothing but comments this task did not reach (fix them). Docs are Task 12's.

- [ ] **Step 8: Leave the changes in the working tree**; the controller records the tree hash with
  `bash .superpowers/sdd/2026-11-15-scene-blocks-3b/snap.sh` (commit message when allowed:
  `feat(graph)!: Block.getAnchorClass replaces renderAnchor`).

---

### Task 3: Child scene components, nested to any depth, and the event model of D5

D2, D5, В1 (б), settled items 8–11. Re-review findings, round 1: 1, 2 and 6 (the parts that do not depend on hit
levels or holds; Tasks 4 and 8 add their triggers). Round 2: 1, 4, 5, 6, 8 and 11. Round 3: 1 to 6.

Any `SceneComponent` returned from another one's `updateChildren()` is a sub-component:
- it draws in a child element nested in its parent's element, at its parent's origin;
- its element's bounds are its hit box (`getHitRect`);
- it is a target of the global hit test like any graph component, ordered by its scene key;
- its events walk the parent chain to its block (D5).

The store keeps the nesting (settled item 8):
- `TSceneElement.parent` stays the owner, so the renderers keep their one-level model;
- `nestedIn` names the child element an element is nested in;
- the owner's draw list is the pre-order of the nesting;
- hidden, `dim` and `opacity` are derived down the scene-parent chain. A composed row is never freed while another
  composed row depends on it, so a subtree re-links before its old rows go (round 2, finding 1).

Events stay today's tree model (D5):
- `relatedTarget` is added to the hover events, on the components and on the graph's bus;
- a target change sends events only to the sides that exist: the first entry has no leave, a root exit no enter;
- `hoveredTag` is written by each library component on itself: a block while the pointer is on it or a descendant, an
  anchor, a connection or a group while it is the target. There is no binding and no base-class default;
- GraphLayer finds the target again when what a still pointer hits changes (settled item 11), across captures and when
  the pointer leaves the root. An unmounted target gets no event; the nearest graph component above it takes its
  place as the old side, so a block whose removed child stuck out of it still hears the pointer leave.

**Files:**
- Modify: `packages/graph/src/lib/scene/types.ts`: `TSceneElement.nestedIn`.
- Modify: `packages/graph/src/lib/scene/SceneStore.ts`:
  - `TNode.up` and `TNode.kids`;
  - `add`, where a parent may be a child element;
  - `childrenOf`, `isDrawnHidden`, the hidden test of `query`, `delete`, child-order updates;
  - styles: `applyChildStyle`, `setStyle`, `replaceStyles`, `stylesWith`;
  - `insertKid`, `removeKid`, `reorderKid`, `rebuildChildren`, which replace `insertChild`, `removeChild` and
    `setChildren`.
- Modify: `packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts`: hidden through the nesting; a nested element's
  hidden change rewrites what is nested in it.
- Modify: `packages/graph/src/lib/CoreComponent.ts`: `getChildComponents()`, the development error for duplicate keys.
- Modify: `packages/graph/src/components/canvas/scene/SceneComponent.ts`:
  - the default `getSceneParent` and `getSceneOrigin`;
  - `getHitRect`, the hit box written with the element, `readSceneOrigin`, `invalidateChildren`;
  - children write again after their parent's element was added again;
  - its hit box changes ask for a retarget through `GraphComponent`'s hit box path (Step 5).
- Modify: `packages/graph/src/components/canvas/anchors/index.ts`: drop the `getSceneParent` override; `getHitRect`
  returns none.
- Modify: `packages/graph/src/components/canvas/EventedComponent/EventedComponent.ts`: `onDispatchedEvent`, the hover
  helpers `TGraphHoverDetail`, `pointerTargetAfter` and `isWithinComponent`.
- Modify: `packages/graph/src/graphEvents.ts`: `relatedTarget` on the public `GraphMouseEvent`, which types
  `graph.on()` and `useGraphEvent`.
- Modify: `packages/graph/src/components/canvas/layers/graphLayer/GraphLayer.ts`:
  - `relatedTarget` on the components' events and on the bus (`dispatchNativeEvent`), one batch per target change;
  - hover events only at the sides that exist (`dispatchHoverEvent`); the nearest graph component above an unmounted
    target as the old side of the next change (`lostTargetOwner`);
  - `requestRetarget()`, the retarget at the frame's end, the request kept during a capture, the position kept during
    a capture;
  - the root exit as a target change to none; camera emulation only while the pointer is inside the root.
- Modify: `packages/graph/src/services/tags/systems.ts`: the `hoveredTag` binding goes.
- Modify: `packages/graph/src/components/canvas/GraphComponent/index.ts`: `setHoveredTag`, the tag taken off at
  unmount, `requestRetarget()` from `setHitBox` (a change of an existing box), `removeHitBox` and `setVisibility`.
- Modify: `components/canvas/blocks/Block.ts` (`isHoveredBy`, `onDispatchedEvent`, a retarget request in
  `setHiddenBlock`), `components/canvas/connections/BaseConnection.ts` and `components/canvas/groups/Group.ts`: each
  writes its own `hoveredTag`.
- Modify: `packages/graph/src/services/scene/GraphScene.ts`, `services/scene/types.ts`: `onFrameEnd`.
- Modify: `packages/graph/src/services/HitTest.ts`: `hasPendingUpdates()`.
- Test:
  - create `packages/graph/src/lib/scene/SceneStore.nested.test.ts` and
    `packages/graph/src/components/canvas/scene/sceneChildren.test.ts`;
  - create `packages/graph/src/graphEvents.test-d.ts`, a type test that `pnpm --dir packages/graph run typecheck`
    checks (Jest does not);
  - replace two tests of `services/tags/systems.test.ts` and one of
    `components/canvas/EventedComponent/EventedComponent.test.ts`;
  - migrate `components/canvas/anchors/Anchor.scene.test.ts:106` and
    `components/canvas/blocks/exportAnchors.test.ts:670`;
  - GPU check C31 in `scripts/bench/culling/scene/slice.ts`, red first.

**Interfaces:**
- Produces (Shared names):
  - store: `TSceneElement.nestedIn`, the nested `SceneStore.add`, `childrenOf` and `isDrawnHidden`;
  - components: `SceneComponent.getHitRect(bounds)`, `readSceneOrigin()`, `invalidateChildren()`,
    `CoreComponent.getChildComponents()`, and the sub-component defaults of `getSceneParent()` and `getSceneOrigin()`;
  - events: `EventedComponent.onDispatchedEvent`, `TGraphHoverDetail`, `pointerTargetAfter`, `isWithinComponent`, the
    hover events' `relatedTarget` (also on the bus's `GraphMouseEvent`), `GraphComponent.setHoveredTag`,
    `GraphComponent.requestRetarget()`, `Block.isHoveredBy`, `GraphLayer.requestRetarget()`,
    `HitTest.hasPendingUpdates()`;
  - `IGraphScene.onFrameEnd(listener)`.
- Removes: the `hoveredTag` binding of `services/tags/systems.ts`.
- Consumes: nothing new.

- [ ] **Step 1: The failing store tests**

Create `packages/graph/src/lib/scene/SceneStore.nested.test.ts`:

```ts
import { SceneStore } from "./SceneStore";
import type { TSceneElementInput } from "./SceneStore";
import type { TScenePrimitive } from "./types";

const dot: TScenePrimitive = { kind: "circle", cx: 0, cy: 0, r: 2 };
const ALL = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

const element = (id: string, parent?: string, childOrder?: number): TSceneElementInput => ({
  id,
  zIndex: 1,
  x: 0,
  y: 0,
  bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
  primitives: [dot],
  parent,
  childOrder,
});

/** owner → [a → [a1 → [a11], a2], b], added in the order a, b, a1, a11, a2. */
function tree(): SceneStore {
  const store = new SceneStore(100);
  store.add(element("owner"));
  store.add(element("a", "owner", 0));
  store.add(element("b", "owner", 1));
  store.add(element("a1", "a", 0));
  store.add(element("a11", "a1", 0));
  store.add(element("a2", "a", 1));
  return store;
}

const ids = (elements: readonly { id: string }[]): string[] => elements.map((entry) => entry.id);

describe("nested child elements", () => {
  it("draws an owner's children in the pre-order of their nesting, at any depth", () => {
    const store = tree();
    expect(ids(store.childrenOf("owner"))).toEqual(["a", "a1", "a11", "a2", "b"]);
    expect(ids(store.childrenOf("a"))).toEqual(["a1", "a11", "a2"]);
    expect([store.get("a11")?.parent, store.get("a11")?.nestedIn]).toEqual(["owner", "a1"]);
    expect(store.get("a")?.nestedIn).toBeUndefined();
    expect(ids(store.query(ALL))).toEqual(["owner", "a", "a1", "a11", "a2", "b"]);
  });

  it("moves a child's whole subtree with its order, and places a late child after its parent's descendants", () => {
    const store = tree();
    store.update("a", { childOrder: 2 });
    expect(ids(store.childrenOf("owner"))).toEqual(["b", "a", "a1", "a11", "a2"]);
    store.add(element("a3", "a", 2));
    store.add(element("b1", "b", 0));
    expect(ids(store.childrenOf("owner"))).toEqual(["b", "b1", "a", "a1", "a11", "a2", "a3"]);
    const [b1, a11] = [store.get("b1"), store.get("a11")];
    expect(b1 !== undefined && a11 !== undefined && store.compareOrder(b1, a11) < 0).toBe(true);
  });

  it("deletes what is nested in a deleted child first, deepest first", () => {
    const store = tree();
    const deleted: string[] = [];
    store.subscribe((change) => {
      if (change.type === "delete") deleted.push(change.element.id);
    });
    store.delete("a");
    expect(deleted).toEqual(["a11", "a1", "a2", "a"]);
    expect(ids(store.childrenOf("owner"))).toEqual(["b"]);
  });

  it("hides what is nested in a hidden child, in queries and isDrawnHidden", () => {
    const store = tree();
    store.update("a1", { hidden: true });
    expect(ids(store.query(ALL))).toEqual(["owner", "a", "a2", "b"]);
    const a11 = store.get("a11");
    expect(a11 !== undefined && store.isDrawnHidden(a11)).toBe(true);
    store.update("a1", { hidden: false });
    expect(a11 !== undefined && store.isDrawnHidden(a11)).toBe(false);
  });

  it("composes opacity and dim down the nesting: opacity multiplies, the nearest dim wins", () => {
    const store = tree();
    const drawn = (id: string): { opacity?: number; dim?: number } => {
      const row = store.getStyles()[store.get(id)?.styleId ?? 0];
      return { opacity: row?.opacity, dim: row?.dim };
    };
    store.setStyle("owner", store.defineStyle({ opacity: 0.5 }));
    store.setStyle("a", store.defineStyle({ opacity: 0.5, dim: 0.2 }));
    expect(drawn("a").opacity).toBeCloseTo(0.25);
    expect(drawn("a11").opacity).toBeCloseTo(0.25);
    expect(drawn("a11").dim).toBe(0.2);
    expect(drawn("b").opacity).toBeCloseTo(0.5);
    store.setStyle("owner", 0);
    expect(drawn("a11").opacity).toBeCloseTo(0.5);
    expect(drawn("a11").dim).toBe(0.2);
    expect(drawn("b").opacity).toBeUndefined();
  });

  it("frees a composed row only when no element or composed row uses it; exports compose through it", () => {
    const store = tree();
    const rowOf = (id: string): number => store.get(id)?.styleId ?? 0;
    const opacity = (id: string): number | undefined => store.getStyles()[rowOf(id)]?.opacity;
    store.setStyle("owner", store.defineStyle({ opacity: 0.5 }));
    store.setStyle("a", store.defineStyle({ opacity: 0.5 }));
    // A second change of the owner's row re-links the subtree: a's, a1's and a11's composed rows are replaced.
    store.setStyle("owner", store.defineStyle({ opacity: 0.8 }));
    expect([opacity("a"), opacity("a1"), opacity("a11")].map((value) => value?.toFixed(2))).toEqual([
      "0.40",
      "0.40",
      "0.40",
    ]);
    // Every row in use still holds its content (nothing was freed under a user or a dependent row).
    for (const id of ["a", "a1", "a11", "a2", "b"]) expect(store.getStyles()[rowOf(id)]).toBeDefined();
    const exported = store.stylesWith(new Map([[rowOf("owner"), { opacity: 0.25 }]]));
    expect(exported.styles[rowOf("a11")]?.opacity).toBeCloseTo(0.125);
  });
});
```

Run: `pnpm --dir packages/graph exec jest src/lib/scene/SceneStore.nested.test.ts`
Expected: FAIL: adding `a1` throws "child elements cannot have children" (`SceneStore.ts:199-203`).

- [ ] **Step 2: Nesting in the store**

In `packages/graph/src/lib/scene/types.ts`, `TSceneElement` gets, after `parent`:

```ts
  /**
   * The child element this child is nested in (its scene parent), when that is not its owner. `parent` stays the owner:
   * the element draws in its owner's bucket, after it, in the pre-order of the nesting (`SceneStore.childrenOf`).
   */
  readonly nestedIn?: string;
```

The JSDoc of `TSceneChange` in the same file: "A raise or `raiseMany`, a `zIndex` update, a change of the raise of its
style name the owner alone; a change of an element's `hidden` flag names that element alone. A renderer derives each
child's depth key from its owner and its hidden state from its nesting (`SceneStore.rootOf`, `childrenOf`,
`isDrawnHidden`)."

In `packages/graph/src/lib/scene/SceneStore.ts`:
- `TNode` becomes:

```ts
type TNode = {
  readonly element: TSceneElement;
  /** A child's owner node (the root of its nesting); undefined for an owner. */
  readonly parent: TNode | undefined;
  /** A child's scene parent: its owner, or the child element it is nested in; undefined for an owner. */
  readonly up: TNode | undefined;
  /** The elements nested directly in this one, by child order, then in the order they were added. */
  kids: readonly TNode[];
  /** An owner's child elements in draw order: each kid, then what is nested in it (pre-order). Empty for a child. */
  children: readonly TSceneElement[];
  /** A child's index in its owner's `children`: its place in `compareOrder`. */
  childIndex: number;
  /** When a child was added: siblings of an equal child order keep this order. */
  added: number;
  /** The levels its primitives show on (`levelMaskOfPrimitives`): a query for a level skips an element without it. */
  levels: number;
  /** The last query that reached the node: an owner it collected, or a child it found. */
  mark: number;
  /** For an owner in the query that marked it: whether it found the owner itself, and how many of its children. */
  self: boolean;
  found: number;
  /** For an owner in the query that marked it: its bucket, the zIndex with the raise of its style. */
  bucket: number;
};
```

  with a module constant `const NO_NODES: readonly TNode[] = Object.freeze([]);`;
- `add`: its JSDoc reads "An input with `parent` adds a child element (spec §5.2): `parent` is its owner or the child
  element it is nested in; the element records its owner as `parent` and the child element as `nestedIn`, takes no
  `order` of its own (0), and its drawn row starts composed with its scene parent's drawn row." Replace the parent check
  and the element and node literals with:

```ts
    let upNode: TNode | undefined;
    if (input.parent !== undefined) {
      upNode = this.nodes.get(input.parent);
      if (!upNode) {
        throw new Error(`Scene element ${input.id}: its parent ${input.parent} does not exist`);
      }
    }
    const ownerNode = upNode ? upNode.parent ?? upNode : undefined;
    freezeTexts(input.primitives);
    const element: TSceneElement = {
      ...input,
      parent: ownerNode?.element.id,
      nestedIn: upNode !== undefined && upNode !== ownerNode ? upNode.element.id : undefined,
      hidden: input.hidden ?? false,
      childOrder: input.childOrder ?? 0,
      order: ownerNode === undefined ? ++this.order : 0,
      styleId: 0,
    };
    const node: TNode = {
      element,
      parent: ownerNode,
      up: upNode,
      kids: NO_NODES,
      children: NO_ELEMENTS,
      childIndex: 0,
      added: upNode ? ++this.childSequence : 0,
      levels: levelMaskOfPrimitives(element.primitives),
      mark: 0,
      self: false,
      found: 0,
      bucket: 0,
    };
    this.nodes.set(element.id, node);
    this.place(node);
    if (upNode) {
      this.insertKid(node);
      // No update: the add carries the element with its drawn row.
      this.applyChildStyle(element, false);
    }
```

- `childrenOf` and `isDrawnHidden` become:

```ts
  /**
   * The child elements drawn after an element inside its owner, in draw order: each by child order among its siblings
   * (an equal order: in the order they were added), followed by what is nested in it. For an owner, its whole draw
   * list (both renderers draw it so); for a child, what is nested in it. Empty without any.
   */
  public childrenOf(id: string): readonly TSceneElement[] {
    const node = this.nodes.get(id);
    if (!node) return NO_ELEMENTS;
    if (node.parent === undefined) return node.children;
    if (node.kids.length === 0) return NO_ELEMENTS;
    const list: TSceneElement[] = [];
    const visit = (current: TNode): void => {
      for (const kid of current.kids) {
        list.push(kid.element);
        visit(kid);
      }
    };
    visit(node);
    return list;
  }

  /** Whether the element is not drawn: hidden itself, or nested in a hidden element up to and including its owner. */
  public isDrawnHidden(element: TSceneElement): boolean {
    const node = this.nodes.get(element.id);
    if (node) return this.isNodeHidden(node);
    return element.hidden || (element.parent !== undefined && this.rootOf(element).hidden);
  }
```

- private helpers, replacing `insertChild`, `removeChild` and `setChildren`:

```ts
  private isNodeHidden(node: TNode): boolean {
    for (let current: TNode | undefined = node; current; current = current.up) {
      if (current.element.hidden) return true;
    }
    return false;
  }

  private sortKids(kids: readonly TNode[]): readonly TNode[] {
    return [...kids].sort((a, b) => a.element.childOrder - b.element.childOrder || a.added - b.added);
  }

  /** Puts a child among its scene parent's kids and rebuilds its owner's draw list. */
  private insertKid(node: TNode): void {
    const up = node.up;
    if (!up) return;
    up.kids = this.sortKids([...up.kids, node]);
    this.rebuildChildren(node.parent);
  }

  private removeKid(node: TNode): void {
    const up = node.up;
    if (!up) return;
    const kids = up.kids.filter((kid) => kid !== node);
    up.kids = kids.length > 0 ? kids : NO_NODES;
    this.rebuildChildren(node.parent);
  }

  /** After a child-order change: its subtree moves with it. */
  private reorderKid(node: TNode): void {
    const up = node.up;
    if (!up) return;
    up.kids = this.sortKids(up.kids);
    this.rebuildChildren(node.parent);
  }

  /** An owner's draw list, the pre-order of its nesting, and each child's rank in it; O(its children). */
  private rebuildChildren(owner: TNode | undefined): void {
    if (!owner) return;
    const list: TSceneElement[] = [];
    const visit = (current: TNode): void => {
      for (const kid of current.kids) {
        kid.childIndex = list.length;
        list.push(kid.element);
        visit(kid);
      }
    };
    visit(owner);
    owner.children = list.length > 0 ? list : NO_ELEMENTS;
  }
```

- `query`: the hidden test `if (node.element.hidden || owner.element.hidden) return;` becomes
  `if (this.isNodeHidden(node)) return;` (Task 9 adds `includeHidden` in front of it), and the JSDoc's "not children
  of hidden parents" reads "not nested in a hidden element";
- `update`: the child-order branch becomes `if (patch.childOrder !== undefined && node.up !== undefined) this.reorderKid(node);`;
- `delete` becomes:

```ts
  /** Deletes the element; what is nested in it goes first, deepest first, with one delete change each. */
  public delete(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    const { element } = node;
    [...node.kids].forEach((kid) => this.delete(kid.element.id));
    this.nodes.delete(id);
    this.styleUsers.get(element.styleId)?.delete(id);
    this.index.delete(node);
    let composedKey: string | undefined;
    if (node.up !== undefined) {
      this.removeKid(node);
      composedKey = this.composedOf.get(id);
      this.composedOf.delete(id);
      this.ownStyles.delete(id);
    }
    this.emit({ type: "delete", element });
    if (composedKey !== undefined) this.releaseComposed(composedKey);
  }
```

- `applyChildStyle`: `const parentRow = this.rootOf(child).styleId;` becomes
  `const parentRow = (this.nodes.get(child.id)?.up?.element ?? this.rootOf(child)).styleId;`, and its JSDoc says "its
  scene parent's drawn row" instead of "its parent's row";
- composed rows get dependents (round 2, finding 1). With nesting, a composed row can be the `parent` of another
  composed row (a nested element's drawn row). HEAD frees a composed row as soon as no element draws with it
  (`releaseComposed`, `SceneStore.ts:696-701`), which resets its content and offers its id to the next
  `defineStyle`, under the rows that depend on it. So:
  - an entry of `composed` gets `dependents: number`, the count of composed entries whose `parent` is its `id`;
  - a map `composedById: Map<number, TComposedEntry>` finds an entry by its row (with
    `type TComposedEntry = { id: number; own: number; parent: number; users: number; dependents: number }`);
  - creating an entry in `applyChildStyle` adds `composedById.get(parentRow)?.dependents++` (written as
    `const above = this.composedById.get(parentRow); if (above) above.dependents += 1;`);
  - `releaseComposed(key)` lowers `users` and calls `freeIfUnused(entry)`:

    ```ts
  /**
   * Frees a composed row once no element draws with it and no other composed row is composed from it, then lets the
   * row it was composed from go the same way. A subtree that re-links (its owner's row changed) keeps its old rows
   * until its last nested element left them, so no row is freed or reused under a dependent row.
   */
  private freeIfUnused(entry: TComposedEntry): void {
    if (entry.users > 0 || entry.dependents > 0) return;
    this.composed.delete(`${entry.own}|${entry.parent}`);
    this.composedById.delete(entry.id);
    this.freeStyle(entry.id);
    const above = this.composedById.get(entry.parent);
    if (!above) return;
    above.dependents -= 1;
    this.freeIfUnused(above);
  }
    ```

  The test "composes opacity and dim down the nesting" of Step 1 is the regression: without dependents,
  `setStyle("owner", 0)` frees a's old composed row under a1's and a11's, and a11 loses its opacity and dim (the
  re-review's probe);
- `setStyle`, the child branch: after `this.applyChildStyle(element, true);` add
  `this.childrenOf(id).forEach((nested) => this.applyChildStyle(nested, true));` (what is nested in it composes with
  its new drawn row; `childrenOf` lists parents before what is nested in them);
- `replaceStyles`, the loop "A parent row can start or stop needing composition": drop the
  `element.parent === undefined` condition, so any element that uses a changed row gets its nested elements' drawn
  rows again (`if (element) this.childrenOf(elementId).forEach(...)`). Its last comment becomes "A composed row can be
  the parent row of a nested element's composed row; the nesting is a tree, so this recursion ends.";
- `stylesWith`:
  - its composed loop recomposes transitively, in creation order:

    ```ts
    const changed = new Set(rows.keys());
    this.composed.forEach((entry) => {
      if (changed.has(entry.own) || changed.has(entry.parent)) {
        next[entry.id] = composeChildStyle(next[entry.own], next[entry.parent]);
        changed.add(entry.id);
      }
    });
    ```

    `composed` iterates in insertion order. An entry is inserted after the entry of the row it is composed from:
    that row is its scene parent's drawn row when it is created. A row with dependents is never freed, so its id is
    not reused, and its entry stays in the map before its dependents. So one pass in map order recomposes parents
    first, after frees too; the second store test of Step 1 checks an export after a re-link.
  - its `childRows` loop drops the `node.parent !== undefined` test and iterates `node.kids` (`kid.element`) instead
    of `node.children`: an export-only element `dim` or `opacity` reaches the direct children of the element that
    sets it (D3: deeper descendants keep their live rows in such an export).
- the `add` error "child elements cannot have children" goes.

Run: `pnpm --dir packages/graph exec jest src/lib/scene`
Expected: PASS: the new file's 5 tests, and the existing store tests (a store without nesting behaves as before: an
owner's kids are its children, in the same order).

- [ ] **Step 3: The failing component tests**

Create `packages/graph/src/components/canvas/scene/sceneChildren.test.ts`. Its `Chip` follows the recipe for a child
that is hovered while it is the target; its `ChipBox` follows `Block`'s CSS-like recipe (hovered while the target is
it or a descendant). Neither is a library default (D5).

```ts
import { Graph } from "../../../graph";
import { Component } from "../../../lib/Component";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { hoveredTag } from "../../../services/tags/builtinTags";
import { entityKey } from "../../../services/tags/TagStore";
import { anchorEntityId } from "../../../store/anchor/anchorEntityId";
import type { TRect } from "../../../utils/types/shapes";
import { isWithinComponent, pointerTargetAfter } from "../EventedComponent/EventedComponent";
import type { TGraphComponentProps } from "../GraphComponent";
import type { TAnchor } from "../anchors";
import { Block } from "../blocks/Block";
import type { TBlock } from "../blocks/Block";

import { SceneComponent } from "./SceneComponent";
import { Box, TestLayer, boxSource, frames } from "./sceneTestKit";
import type { TBoxProps, TBoxSource } from "./sceneTestKit";

const EVENTS = ["click", "mouseenter", "mouseleave", "mouseover", "mouseout"] as const;

/** Every component event of the current test, as `listener:type:target`, in the order they arrive. */
let events: string[] = [];

/** The id a log entry gives an event's target: a chip's id, "box", or "none" (the camera or no target). */
function nameOf(component: unknown): string {
  if (component instanceof Chip) return component.props.id;
  if (component instanceof ChipBox) return "box";
  return "none";
}

const targetOf = (event: Event): unknown => (event as CustomEvent<{ target?: unknown }>).detail?.target;

type TChipProps = TGraphComponentProps & {
  id: string;
  /** Left edge of its 20 x 10 look in its parent's frame; its top is at 10. */
  x: number;
  look?: boolean;
  /** Stops the propagation of its clicks. */
  stop?: boolean;
  inner?: ChildDescriptor[];
};

type TChipView = { x: number; look: boolean; width: number };

/**
 * A child chip: a 20 x 10 rect drawn on every level (one schematic list), logging the events it gets. It puts
 * `hoveredTag` on itself while it is the pointer's target (the recipe for a child, D5).
 */
class Chip extends SceneComponent<TChipView, TChipProps> {
  public static override entityType = "chip";

  public override readonly cursor = "pointer";

  constructor(props: TChipProps, parent: Component) {
    super(props, parent);
    for (const type of EVENTS) {
      this.addEventListener(type, (event: Event) => {
        events.push(`${this.props.id}:${type}:${nameOf(targetOf(event))}`);
        if (type === "click" && this.props.stop) event.stopPropagation();
        if (type === "mouseenter" || type === "mouseleave") this.setHoveredTag(pointerTargetAfter(event) === this);
      });
    }
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  public touch(): void {
    this.performRender();
  }

  protected override propsChanged(next: TChipProps): void {
    this.shouldUpdateChildren = true;
    super.propsChanged(next);
  }

  protected override getViewData(): TChipView {
    const box = this.getParent();
    return { x: this.props.x, look: this.props.look ?? true, width: box instanceof ChipBox ? box.chipWidth : 20 };
  }

  protected override schematic(view: TChipView): readonly TScenePrimitive[] {
    return view.look ? [{ kind: "rect", part: "chip", x: view.x, y: 10, width: view.width, height: 10 }] : [];
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.inner ?? [];
  }
}

/** A chip without a look and a hit rect of its own. */
class HitChip extends Chip {
  protected override getHitRect(_bounds: TTileRect | undefined): TRect | undefined {
    return { x: 70, y: 10, width: 20, height: 10 };
  }
}

/** The chips of the next box, set by each test before it mounts one. */
let chips: ChildDescriptor[] = [];

/**
 * A box with chips that logs the events it gets, its own and its chips' bubbling up, as `box:type:target`. It puts
 * `hoveredTag` on itself while the target is the box or one of its chips (`Block`'s recipe, D5).
 */
class ChipBox extends Box {
  public chipWidth = 20;

  constructor(props: TBoxProps, parent: Component) {
    super(props, parent);
    for (const type of EVENTS) {
      this.addEventListener(type, (event: Event) => events.push(`box:${type}:${nameOf(targetOf(event))}`));
    }
  }

  public refreshChildren(): void {
    this.invalidateChildren();
  }

  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  public setChips(next: ChildDescriptor[]): void {
    chips = next;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  protected override onDispatchedEvent(event: Event): void {
    super.onDispatchedEvent(event);
    if (event.type === "mouseenter" || event.type === "mouseleave") {
      this.setHoveredTag(isWithinComponent(this, pointerTargetAfter(event)));
    }
  }

  protected override updateChildren(): ChildDescriptor[] {
    return chips;
  }
}

/** An element owner without primitives: it sets its own hit box (Box's) and draws nothing. */
class Frame extends ChipBox {
  protected override minimalistic(): TScenePrimitive[] {
    return [];
  }

  protected override schematic(): TScenePrimitive[] {
    return [];
  }
}

/** A block that is not hovered over its anchors: the documented override of `Block.isHoveredBy`. */
class SelfHoverBlock extends Block {
  protected override isHoveredBy(target: unknown): boolean {
    return target === this;
  }
}

/**
 * A block that keeps its own events to itself, as a consumer's `dispatchEvent` override does (facts §9): while
 * interactive it fires its own listeners and lets nothing walk on, so its own events skip the parent walk.
 */
class KeepingBlock extends Block {
  protected override willMount(): void {
    // A hover state of its own, set from its own enter and leave.
    this.addEventListener("mouseenter", () => undefined);
    this.addEventListener("mouseleave", () => undefined);
    super.willMount();
  }

  public override dispatchEvent(event: Event): boolean {
    if (!this.isInteractive()) return this._dipping(this, event);
    if (this._hasListener(this, event.type)) this._fireEvent(this, event);
    return false;
  }
}

/** The migration guide's recipe (Task 12): the same stopping, and its own events reach the hover hook first (D5). */
class AdaptedKeepingBlock extends KeepingBlock {
  public override dispatchEvent(event: Event): boolean {
    if (!this.isInteractive()) return this._dipping(this, event);
    this.onDispatchedEvent(event);
    if (this._hasListener(this, event.type)) this._fireEvent(this, event);
    return false;
  }
}

describe("child scene components", () => {
  let graph: Graph;
  let box: ChipBox | undefined;
  let source: TBoxSource;
  const kept: Record<string, Chip> = {};
  const keep =
    (id: string) =>
    (chip: Chip): void => {
      kept[id] = chip;
    };
  const chip = (id: string, x: number, extra: Partial<TChipProps> = {}): ChildDescriptor =>
    Chip.create({ id, x, ...extra }, { key: id, ref: keep(id) });

  function mount(children: ChildDescriptor[]): void {
    chips = children;
    events = [];
    source = boxSource("box");
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    graph.addLayer(TestLayer, {
      children: [
        ChipBox.create(
          { id: "b", source },
          {
            ref: (component: ChipBox): void => {
              box = component;
            },
          }
        ),
      ],
    });
    frames(5);
  }

  const childIds = (): string[] => graph.scene.store.childrenOf(entityKey("box", "b")).map((element) => element.id);
  const chipKey = (id: string): string => entityKey("chip", id);
  /** A pointer move to a world point (scale 1, camera at the origin: world = client). */
  const move = (x: number, y: number): void =>
    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
  /** The enter and leave entries so far; the log is cleared. */
  const take = (): string[] => {
    const taken = events.filter((entry) => /:mouse(enter|leave):/.test(entry));
    events = [];
    return taken;
  };
  const tagged = (type: string, id: string): boolean => graph.scene.tags.peekOf(type, id).has(hoveredTag);

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("draws a child in its parent's element, in child order, at its parent's origin", () => {
    mount([chip("c1", 5), chip("c2", 40)]);
    expect(childIds()).toEqual([chipKey("c1"), chipKey("c2")]);
    const element = (): ReturnType<Graph["scene"]["store"]["get"]> => graph.scene.store.get(chipKey("c1"));
    expect([element()?.x, element()?.y]).toEqual([0, 0]);
    source.x.value = 300;
    frames(3);
    expect([element()?.x, element()?.y]).toEqual([300, 0]);
    expect(graph.getElementOverPoint({ x: 315, y: 15 })).toBe(kept.c1);
  });

  it("is the pointer's target over its look, above its parent; its click bubbles to the parent unless stopped", () => {
    mount([chip("c1", 5), chip("stop", 40, { stop: true })]);
    expect(graph.getElementOverPoint({ x: 15, y: 15 })).toBe(kept.c1);
    expect(graph.getElementOverPoint({ x: 60, y: 30 })).toBe(box);
    kept.c1.dispatchEvent(new CustomEvent("click", { detail: { target: kept.c1 } }));
    kept.stop.dispatchEvent(new CustomEvent("click", { detail: { target: kept.stop } }));
    // The child's handler runs first, then the parent's through the parent walk; a stopped click stays with the child.
    expect(events).toEqual(["c1:click:c1", "box:click:c1", "stop:click:stop"]);
  });

  it("nests to any depth: the pre-order, a reorder moves the subtree, a late child lands after its parent's", () => {
    mount([chip("a", 5, { inner: [chip("a1", 30, { inner: [chip("a11", 55)] })] }), chip("z", 80)]);
    expect(childIds()).toEqual([chipKey("a"), chipKey("a1"), chipKey("a11"), chipKey("z")]);
    expect(graph.scene.store.get(chipKey("a11"))?.nestedIn).toBe(chipKey("a1"));
    expect(graph.getElementOverPoint({ x: 60, y: 15 })).toBe(kept.a11);
    box?.setChips([chip("z", 80), chip("a", 5, { inner: [chip("a1", 30, { inner: [chip("a11", 55)] })] })]);
    frames(3);
    expect(childIds()).toEqual([chipKey("z"), chipKey("a"), chipKey("a1"), chipKey("a11")]);
    box?.setChips([
      chip("z", 80),
      chip("a", 5, { inner: [chip("a1", 30, { inner: [chip("a11", 55)] }), chip("a2", 45)] }),
    ]);
    frames(3);
    expect(childIds()).toEqual([chipKey("z"), chipKey("a"), chipKey("a1"), chipKey("a11"), chipKey("a2")]);
  });

  it("hides what is nested in a hidden child, and writes the nested elements again after a re-add", () => {
    mount([chip("a", 5, { inner: [chip("a1", 30)] })]);
    kept.a.hide();
    frames(2);
    const all = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    expect(graph.scene.store.query(all).map((element) => element.id)).toEqual([entityKey("box", "b")]);
    // An element deleted behind its component (its nested ones go with it): the component's update adds it again,
    // and its children write theirs again.
    graph.scene.store.delete(chipKey("a"));
    kept.a.touch();
    frames(3);
    expect(childIds()).toEqual([chipKey("a"), chipKey("a1")]);
  });

  it("gets no hit box without a look, and the one it declares", () => {
    mount([chip("plain", 5, { look: false }), HitChip.create({ id: "hit", x: 70, look: false }, { key: "hit" })]);
    expect(graph.getElementOverPoint({ x: 15, y: 15 })).toBe(box);
    expect(graph.scene.store.get(entityKey("chip", "hit"))?.primitives).toEqual([]);
    const view = graph.getElementsOverPoint({ x: 80, y: 15 }).find((item) => item instanceof HitChip);
    // getHitBox() is [x, y, width, height].
    expect(view?.getHitBox().slice(0, 4)).toEqual([70, 10, 20, 10]);
  });

  it("reads its view data again when its parent invalidates its children", () => {
    mount([chip("c1", 5)]);
    const width = (): number | undefined => {
      const [primitive] = graph.scene.store.get(chipKey("c1"))?.primitives ?? [];
      return primitive?.kind === "rect" ? primitive.width : undefined;
    };
    expect(width()).toBe(20);
    if (box) box.chipWidth = 30;
    frames(2);
    expect(width()).toBe(20);
    box?.refreshChildren();
    frames(2);
    expect(width()).toBe(30);
  });

  it("reports two children with one key in development builds", () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mount([Chip.create({ id: "x", x: 5 }, { key: "same" }), Chip.create({ id: "y", x: 40 }, { key: "same" })]);
    expect(error.mock.calls.filter(([message]) => String(message).includes('share the key "same"'))).toHaveLength(1);
  });

  describe("hover events (D5) and hoveredTag", () => {
    it("bubbles a child's enter and leave to its parent; the box stays tagged over a chip, a chip while target", () => {
      mount([chip("c1", 5), chip("c2", 40)]);
      move(60, 30);
      expect(take()).toEqual(["box:mouseenter:box"]);
      move(15, 15);
      // The box's own leave (its relatedTarget is c1, inside the box), then c1's enter, bubbling up to the box.
      expect(take()).toEqual(["box:mouseleave:box", "c1:mouseenter:c1", "box:mouseenter:c1"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, true]);
      move(50, 15);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "c2:mouseenter:c2", "box:mouseenter:c2"]);
      expect([tagged("box", "b"), tagged("chip", "c1"), tagged("chip", "c2")]).toEqual([true, false, true]);
      move(500, 500);
      expect(take()).toEqual(["c2:mouseleave:c2", "box:mouseleave:c2"]);
      expect([tagged("box", "b"), tagged("chip", "c2")]).toEqual([false, false]);
    });

    it("gives the related target: the other side of the change, none for the camera", () => {
      mount([chip("c1", 5)]);
      const related: string[] = [];
      const relatedOf = (event: Event): unknown =>
        (event as CustomEvent<{ relatedTarget?: unknown }>).detail?.relatedTarget;
      box?.addEventListener("mouseleave", (event: Event) => related.push(`leave:${nameOf(relatedOf(event))}`));
      box?.addEventListener("mouseenter", (event: Event) => related.push(`enter:${nameOf(relatedOf(event))}`));
      move(60, 30);
      move(15, 15);
      move(500, 500);
      // Enter the box from the camera; leave it for c1 and enter c1 from it; leave c1 for the camera.
      expect(related).toEqual(["enter:none", "leave:c1", "enter:box", "leave:none"]);
    });

    it("sends the graph's hover events with both sides of the change, only for the sides that exist", () => {
      mount([chip("c1", 5)]);
      const bus: string[] = [];
      // `relatedTarget` is typed on the bus's `GraphMouseEvent` (`graphEvents.ts`): typecheck checks these lines.
      graph.on("mouseenter", (event) => {
        bus.push(`enter:${nameOf(event.detail.target)}:${nameOf(event.detail.relatedTarget)}`);
      });
      graph.on("mouseleave", (event) => {
        bus.push(`leave:${nameOf(event.detail.target)}:${nameOf(event.detail.relatedTarget)}`);
      });
      // The first entry has no old side, so no leave (HEAD's bus named the new target in a false one).
      move(60, 30);
      expect(bus.splice(0)).toEqual(["enter:box:none"]);
      move(15, 15);
      expect(bus.splice(0)).toEqual(["leave:box:c1", "enter:c1:box"]);
      // The root exit has no new side, so no enter.
      graph.getGraphLayer().handleEvent(new MouseEvent("mouseleave"));
      expect(bus.splice(0)).toEqual(["leave:c1:none"]);
    });

    it("finds the target again under a still pointer: a child's look goes, moves away, the child unmounts", () => {
      mount([chip("c1", 5)]);
      move(15, 15);
      take();
      box?.setChips([chip("c1", 5, { look: false })]);
      frames(3);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "box:mouseenter:box"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, false]);

      box?.setChips([chip("c1", 5)]);
      frames(3);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(kept.c1);
      take();
      // The look moves away from the pointer: its automatic hit rect changes geometry (re-review 5).
      box?.setChips([chip("c1", 60)]);
      frames(3);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "box:mouseenter:box"]);

      box?.setChips([chip("c1", 5)]);
      frames(3);
      take();
      box?.setChips([]);
      frames(3);
      // An unmounted child gets no event and takes its own tag off; the box is entered as the new target.
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["box:mouseenter:box"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, false]);
    });

    it("ends the box's hover when a chip that sticks out of it is removed under a still pointer", () => {
      // "out" draws at 110-130, right of the box's 100 x 50 hit box.
      mount([chip("c1", 5), chip("out", 110)]);
      move(120, 15);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(kept.out);
      expect([tagged("box", "b"), tagged("chip", "out")]).toEqual([true, true]);
      take();
      box?.setChips([chip("c1", 5)]);
      frames(3);
      // The pointer is over the camera now. The removed chip gets nothing; the box, the nearest graph component above
      // it, takes its place as the old side and gets the leave (round 3, finding 3).
      expect(graph.getGraphLayer().$hoveredComponent.value).toBeUndefined();
      expect(take()).toEqual(["box:mouseleave:box"]);
      expect([tagged("box", "b"), tagged("chip", "out")]).toEqual([false, false]);
    });

    it("changes the target to none when the pointer leaves the root, straight from a child, and back", () => {
      mount([chip("c1", 5)]);
      move(15, 15);
      take();
      graph.getGraphLayer().handleEvent(new MouseEvent("mouseleave"));
      expect(graph.getGraphLayer().$hoveredComponent.value).toBeUndefined();
      // The exit has no new side: leaves only.
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([false, false]);
      // Back in: enters only. HEAD's helper sent the new target a leave first (round 3, finding 2).
      move(15, 15);
      expect(take()).toEqual(["c1:mouseenter:c1", "box:mouseenter:c1"]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([true, true]);
    });

    it("finds no target after a root exit when the camera moves, also after a capture's release outside", () => {
      mount([chip("c1", 5)]);
      graph.updateSettings({ emulateMouseEventsOnCameraChange: true });
      const layer = graph.getGraphLayer();
      move(15, 15);
      layer.handleEvent(new MouseEvent("mouseleave"));
      take();
      // c1 stays under the last position (world 16, 15): the emulation must not enter it from outside the root.
      graph.cameraService.set({ x: -1 });
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect(take()).toEqual([]);
      // A drag on c1 leaves the root; its release ends the hover outside, and a later camera move finds nothing.
      move(15, 15);
      layer.handleEvent(new MouseEvent("mousedown", { clientX: 15, clientY: 15 }));
      layer.captureEvents(kept.c1);
      layer.handleEvent(new MouseEvent("mouseleave"));
      take();
      layer.handleEvent(new MouseEvent("mouseup", { clientX: 15, clientY: 15 }));
      layer.releaseCapture();
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1"]);
      graph.cameraService.set({ x: -2 });
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect(take()).toEqual([]);
      expect([tagged("box", "b"), tagged("chip", "c1")]).toEqual([false, false]);
    });

    it("keeps the latest pointer position during a capture and finds the target again at its release", () => {
      mount([chip("c1", 5)]);
      const layer = graph.getGraphLayer();
      move(15, 15);
      // A press on the chip, then the drag listener's capture (`dragListener.ts:166`).
      layer.handleEvent(new MouseEvent("mousedown", { clientX: 15, clientY: 15 }));
      layer.captureEvents(kept.c1);
      // A drag moves the pointer onto the body: the captured chip stays the target.
      move(60, 30);
      frames(2);
      expect(layer.$hoveredComponent.value).toBe(kept.c1);
      take();
      // The drag listener releases the capture on mouseup (`dragListener.ts:209`), with no mousemove after it.
      layer.handleEvent(new MouseEvent("mouseup", { clientX: 60, clientY: 30 }));
      layer.releaseCapture();
      frames(3);
      expect(layer.$hoveredComponent.value).toBe(box);
      expect(take()).toEqual(["c1:mouseleave:c1", "box:mouseleave:c1", "box:mouseenter:box"]);
    });

    it("keeps a block hovered while the pointer is on its anchor, unless its class decides by target", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { useBlocksAnchors: true, blockComponents: { Self: SelfHoverBlock } } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const anchored = (id: string, x: number, is = "Block"): TBlock => ({
        id,
        is,
        name: id,
        x,
        y: 100,
        width: 200,
        height: 100,
        anchors: [{ id: "out", blockId: id, type: "OUT" }],
      });
      graph.setEntities({ blocks: [anchored("a", 100), anchored("s", 500, "Self")], connections: [] });
      for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      // At scale 0.5 an OUT anchor's point (x + 200, 188) is at client ((x + 200) / 2, 94); a body at (x / 2 + 50, 75).
      move(100, 75);
      move(150, 94);
      expect(graph.getGraphLayer().$hoveredComponent.value).toBe(
        graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent()
      );
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, true]);
      move(100, 75);
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "out"))]).toEqual([true, false]);
      move(300, 75);
      move(350, 94);
      expect(tagged("block", "s")).toBe(false);
      move(300, 75);
      expect(tagged("block", "s")).toBe(true);
    });

    it("finds the target again when an anchor or its block moves through the API under a still pointer", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      graph = new Graph({ settings: { useBlocksAnchors: true } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const out = (id: string): TAnchor => ({ id, blockId: "a", type: "OUT" });
      const block: TBlock = { id: "a", is: "Block", name: "a", x: 100, y: 100, width: 200, height: 100, anchors: [] };
      graph.setEntities({ blocks: [{ ...block, anchors: [out("o1"), out("o2")] }], connections: [] });
      const update = (): void => {
        for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      };
      update();
      const layer = graph.getGraphLayer();
      const state = graph.rootStore.blocksList.getBlockState("a");
      const o2 = state?.getAnchorById("o2")?.getViewComponent();
      // The second OUT anchor's point is (300, 220): GRID_SIZE * 2 below the first one's (300, 188). Client (150, 110).
      move(150, 110);
      expect(layer.$hoveredComponent.value).toBe(o2);
      // Without o1, o2 is the first OUT anchor, at (300, 188): only its own hit box moves (`onPositionChanged`); the
      // block's stays. No mousemove and no capture follow (round 3, finding 4).
      graph.api.updateBlock({ id: "a", anchors: [out("o2")] });
      update();
      // The same component, keyed by its id: a moved box, not a removal.
      expect(state?.getAnchorById("o2")?.getViewComponent()).toBe(o2);
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect([tagged("block", "a"), tagged("anchor", anchorEntityId("a", "o2"))]).toEqual([false, false]);
      // The block moves away from a still pointer on its body through the API: its own hit box moves.
      move(100, 75);
      expect(layer.$hoveredComponent.value).toBe(state?.getViewComponent());
      graph.api.updateBlock({ id: "a", x: 400 });
      update();
      expect(layer.$hoveredComponent.value).toBeUndefined();
      expect(tagged("block", "a")).toBe(false);
    });

    it("keeps a block's hover consistent when its class keeps its own events, with the migration recipe", () => {
      const root = document.createElement("div");
      Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
      const blockComponents = { Keeping: KeepingBlock, Adapted: AdaptedKeepingBlock };
      graph = new Graph({ settings: { useBlocksAnchors: true, blockComponents } }, root);
      graph.start();
      graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
      const anchored = (id: string, x: number, is: string): TBlock => ({
        id,
        is,
        name: id,
        x,
        y: 100,
        width: 200,
        height: 100,
        anchors: [{ id: "out", blockId: id, type: "OUT" }],
      });
      graph.setEntities({ blocks: [anchored("k", 100, "Keeping"), anchored("ad", 500, "Adapted")], connections: [] });
      for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
      /** The block's tag after each move of body, anchor, body, outside (client points at scale 0.5, as above). */
      const route = (id: string, x: number): boolean[] =>
        [
          [x / 2 + 50, 75],
          [(x + 200) / 2, 94],
          [x / 2 + 50, 75],
          [x / 2 + 50, 10],
        ].map(([clientX, clientY]) => {
          move(clientX, clientY);
          return tagged("block", id);
        });
      // The recipe calls the hook for its own events: hovered over its body and its anchor, not outside.
      expect(route("ad", 500)).toEqual([true, true, true, false]);
      // Without it, its own enter and leave skip the hook and only its anchor's events reach it: not hovered over its
      // body, and still hovered outside (round 3, finding 6).
      expect(route("k", 100)).toEqual([false, true, true, true]);
    });
  });
});

describe("an element owner without primitives (spec §5.1)", () => {
  it("keeps a key, a hit box, events and the usable rect", () => {
    chips = [];
    events = [];
    const graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    let frame: Frame | undefined;
    graph.addLayer(TestLayer, {
      children: [
        Frame.create(
          { id: "f", source: boxSource("frame") },
          {
            ref: (component: Frame): void => {
              frame = component;
            },
          }
        ),
      ],
    });
    frames(5);
    expect(frame?.getSceneKey()?.elementId).toBe(entityKey("box", "f"));
    expect(graph.scene.store.get(entityKey("box", "f"))?.primitives).toEqual([]);
    expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(frame);
    frame?.dispatchEvent(new CustomEvent("click", { detail: { target: frame } }));
    expect(events).toEqual(["box:click:box"]);
    expect(graph.hitTest.$usableRect.value).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    graph.unmount();
  });
});
```

In `services/tags/systems.test.ts`, the tests "hoveredTag follows GraphLayer's hovered component" and "hoveredTag is
dropped when the hovered component is removed under a stationary pointer" pin the binding that D5 removes. Replace them
with:

```ts
  it("leaves hoveredTag to the components: GraphLayer's hovered component writes no tag", () => {
    const graph = makeGraph();
    const layer = graph.getGraphLayer();
    const block = graph.rootStore.blocksList.getBlockState("a")?.getViewComponent();
    layer.setHoveredComponent(block);
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(false);
    // A pointer move over the block: the block tags itself (scale 1 at the origin, world = client).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(true);
    graph.unmount();
  });

  it("drops a block's hoveredTag when the block is removed under a still pointer", () => {
    const graph = makeGraph();
    const layer = graph.getGraphLayer();
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(true);
    graph.setEntities({
      blocks: [{ is: "Block", id: "b", name: "B", x: 200, y: 0, width: 100, height: 50, anchors: [] }],
      connections: [],
    });
    for (let i = 0; i < 3; i++) globalScheduler.performUpdate();
    expect(layer.$hoveredComponent.value).toBeUndefined();
    expect(graph.scene.tags.$of("block", "a").value.has(hoveredTag)).toBe(false);
    graph.unmount();
  });
```

The other tests that drove `hoveredTag` through `setHoveredComponent` dispatch the anchor's own hover event instead,
which is what GraphLayer sends to a target:
- `components/canvas/anchors/Anchor.scene.test.ts:106`: `graph.getGraphLayer().setHoveredComponent(anchor("lower", "out"));`
  becomes `const hovered = anchor("lower", "out"); hovered.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: hovered } }));`;
- `components/canvas/blocks/exportAnchors.test.ts:670`: the same with `created`.

Replace the round-2 test of `EventedComponent.test.ts` ("mouseenter and mouseleave reach the component they are
dispatched to only") with:

```ts
test("events walk the parent chain; onDispatchedEvent sees them before listeners; stopping ends the walk", () => {
  const seen: string[] = [];
  class Hooked extends TestComponent {
    public name = "";

    protected override onDispatchedEvent(event: Event): void {
      seen.push(`${this.name}:hook:${event.type}`);
    }
  }
  const root = new Component({});
  const parent = new Hooked({}, root);
  const child = new Hooked({}, parent);
  parent.name = "parent";
  child.name = "child";
  parent.addEventListener("mouseenter", () => seen.push("parent:listener:mouseenter"));
  child.addEventListener("mouseleave", (event: Event) => event.stopPropagation());
  child.dispatchEvent(new CustomEvent("mouseenter", { bubbles: false }));
  child.dispatchEvent(new CustomEvent("mouseleave", { bubbles: false }));
  expect(seen).toEqual([
    "child:hook:mouseenter",
    "parent:hook:mouseenter",
    "parent:listener:mouseenter",
    "child:hook:mouseleave",
  ]);
  Component.unmount(child);
  Component.unmount(parent);
  Component.unmount(root);
});
```

Create `packages/graph/src/graphEvents.test-d.ts`, a type test in the form of `services/styles/types.test-d.ts`.
Jest's `@swc/jest` transform strips types, so only `pnpm --dir packages/graph run typecheck` checks it (round 3,
finding 1):

```ts
// Type test: checked by `pnpm --dir packages/graph run typecheck`, not run by Jest.
import type { EventedComponent } from "./components/canvas/EventedComponent/EventedComponent";
import type { Graph } from "./graph";

declare const graph: Graph;
const related = (component: EventedComponent | undefined): EventedComponent | undefined => component;

// The graph's hover events name the other side of the target change (D5).
graph.on("mouseenter", (event) => related(event.detail.relatedTarget));
graph.on("mouseleave", (event) => related(event.detail.relatedTarget));
```

Run: `pnpm --dir packages/graph exec jest src/components/canvas/scene/sceneChildren.test.ts src/services/tags src/components/canvas/EventedComponent`
Expected: FAIL (Jest strips types, so the missing members fail at run time):
- the chips are owners, so `childIds()` is empty;
- `invalidateChildren`, `setHoveredTag`, `isWithinComponent` and `pointerTargetAfter` do not exist (`is not a
  function`, or an undefined import), and nothing calls `onDispatchedEvent`;
- no duplicate-key error is reported;
- `hoveredTag` still follows GraphLayer's target (the binding);
- the first entry starts with a false `mouseleave` at the new target (HEAD's helper default), the bus carries no
  `relatedTarget`, and an API move, a removed chip or a camera move after a root exit leaves a stale target or tag.

Run: `pnpm --dir packages/graph run typecheck`
Expected: FAIL: TS2339 for `relatedTarget` on the bus's `GraphMouseEvent` (`graphEvents.test-d.ts` and the bus test of
`sceneChildren.test.ts`), and errors for the members above (TS2339, and TS4113 for the overrides of
`onDispatchedEvent`).

The `Frame` test passes already: it is the M13 regression, a characterization test.

- [ ] **Step 4: `CoreComponent`: children and duplicate keys**

In `packages/graph/src/lib/CoreComponent.ts`:
- after the module's `let constructing` declaration, add:

```ts
/** Component classes whose duplicate child keys were reported (once per class). */
const reportedDuplicateKeys = new WeakSet<object>();

/**
 * Development error for two child descriptors with one key: the reconcile maps both to one component, so the second
 * never gets its own (a scene child would never draw, an anchor would vanish).
 */
function reportDuplicateKeys(owner: object, keys: readonly string[]): void {
  if (reportedDuplicateKeys.has(owner.constructor)) return;
  const seen = new Set<string>();
  for (const key of keys) {
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    reportedDuplicateKeys.add(owner.constructor);
    console.error(
      `${owner.constructor.name}: two children share the key ${JSON.stringify(key)}; the second gets no component. ` +
        "Give each child descriptor its own key (an anchor's key is its id)."
    );
    return;
  }
}
```

- in `__updateChildren()`, after the `next.forEach(...)` loop, add `if (isDevelopmentBuild()) reportDuplicateKeys(this, nextKeys);`;
- add after `getParent()`:

```ts
  /** The mounted children, in reconcile order. */
  protected getChildComponents(): readonly CoreComponent[] {
    const children: CoreComponent[] = [];
    for (const key of this.__comp.childrenKeys) {
      const child = this.__comp.children.get(key);
      if (child) children.push(child);
    }
    return children;
  }
```

- [ ] **Step 5: `SceneComponent` defaults for sub-components**

In `packages/graph/src/components/canvas/scene/SceneComponent.ts`:
- import `TRect` with `TPoint`: `import type { TPoint, TRect } from "../../../utils/types/shapes";`;
- replace `getSceneOrigin()` and `getSceneParent()` (their JSDoc included) with:

```ts
  /**
   * The element's origin in world units; tracked, and read again after new props. A sub-component (a scene component
   * returned from another one's `updateChildren()`) draws at its parent's origin by default, so its primitives are in
   * its parent's frame; any other component at the world origin.
   */
  protected getSceneOrigin(): TPoint {
    const parent = this.getParent();
    return parent instanceof SceneComponent ? parent.readSceneOrigin() : { x: 0, y: 0 };
  }

  /**
   * The parent element of a child element; read in the update, so a change must call performRender(). By default a
   * sub-component is nested in its parent's element (an owner's or another child's), ordered by its place among the
   * parent's retained children; the store derives its draw order from the whole nesting. Return undefined for an
   * element of its own.
   */
  protected getSceneParent(): TSceneParent | undefined {
    const parent = this.getParent();
    if (!(parent instanceof SceneComponent)) return undefined;
    return { elementId: parent.getSceneElementId(), order: this.renderOrder };
  }

  /**
   * The hit box a write sets, from the element's bounds in world units (its origin applied; undefined without
   * primitives). By default a sub-component's bounds, so a child is hit where it draws; none for an element owner,
   * which sets its own hit box (`setHitBox`, as `Block` does), and none without primitives. Override it for another
   * shape or a look-less child, or return undefined to set the hit box yourself (as `Anchor` does).
   */
  protected getHitRect(bounds: TTileRect | undefined): TRect | undefined {
    if (!bounds || this.written?.parent === undefined) return undefined;
    return { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
  }

  /**
   * Reads the view data of its child scene components again in their next update, for inputs of theirs that are not
   * signals (a field of this component they read). What they read through `readSceneView()` is tracked already.
   */
  protected invalidateChildren(): void {
    for (const child of this.getChildComponents()) {
      if (child instanceof SceneComponent) child.invalidate();
    }
  }
```

- add after `readSceneView()`:

```ts
  /**
   * @internal The element origin as this component's update reads it; tracked inside a computed, so a sub-component
   * that draws at this origin follows its moves.
   */
  public readSceneOrigin(): TPoint {
    const trigger = this.sceneTrigger?.value;
    return trigger ? { x: trigger.x, y: trigger.y } : this.getSceneOrigin();
  }
```

- fields after `measuresText`:

```ts
  /** The hit box last set from `getHitRect` (removed again when it returns none); undefined while none is set. */
  private lastHitRect?: TRect;

  /** How many times its element was added: after the first, its scene children write theirs again. */
  private adds = 0;
```

- private methods after `writtenPlaceHolds`:

```ts
  /** Sets the hit box from `getHitRect` after a write that moved or reshaped the element. */
  private syncHitRect(next: TWritten): void {
    const bounds =
      next.primitives.length === 0
        ? undefined
        : {
            minX: next.x + next.bounds.minX,
            minY: next.y + next.bounds.minY,
            maxX: next.x + next.bounds.maxX,
            maxY: next.y + next.bounds.maxY,
          };
    const rect = this.getHitRect(bounds);
    const last = this.lastHitRect;
    const same =
      rect === undefined
        ? last === undefined
        : last !== undefined &&
          rect.x === last.x &&
          rect.y === last.y &&
          rect.width === last.width &&
          rect.height === last.height;
    if (same) return;
    this.lastHitRect = rect;
    // A look that goes, comes back, moves or changes size changes what a still pointer hits (re-review 5):
    // `setHitBox` and `removeHitBox` ask GraphLayer to find the target again (`GraphComponent.requestRetarget`).
    if (rect) this.setHitBox(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    else if (last) this.removeHitBox();
  }

  /** After its element was added again (what was nested in it went with the old one): its children write again. */
  private rewriteChildren(): void {
    for (const child of this.getChildComponents()) {
      if (child instanceof SceneComponent) child.performRender();
    }
  }
```

- in `syncSceneElement`, in the update branch after `this.written = next;`, add
  `if (patch.x !== undefined || patch.y !== undefined || patch.bounds !== undefined || patch.primitives !== undefined) this.syncHitRect(next);`
  (wrapped at 120 characters);
- in `addSceneElement`, after `this.bindSceneStyle(id);`, add `this.syncHitRect(next);` and
  `if (this.adds++ > 0) this.rewriteChildren();`;
- the class JSDoc gains: "A scene component returned from another one's `updateChildren()` is a sub-component: by
  default it is nested in its parent's element, at its parent's origin, and is hit where it draws."

In `GraphComponent/index.ts`, one geometry path asks for a retarget for every hit box (round 3, finding 4): a
child's automatic one, an anchor's own (`Anchor.onPositionChanged`), a block's, a connection's or a group's.
- fields after `hitBox`:

```ts
  /** Whether a hit box was set: the first one, at mount, asks for no retarget. */
  private hitBoxSet = false;

  /** Whether `removeHitBox` took the hit box out of the hit test and none was set since. */
  private hitBoxRemoved = false;
```

- `setHitBox` and `removeHitBox` become, with a protected helper after them:

```ts
  public setHitBox(minX: number, minY: number, maxX: number, maxY: number, force?: boolean) {
    const [x, y, width, height] = this.hitBox.getRect();
    const moved = minX !== x || minY !== y || maxX - minX !== width || maxY - minY !== height;
    // A hit box set again, moved or resized changes what a still pointer hits (settled item 11). The first one asks
    // nothing: a component mounts there (a block added through the API, found at the next pointer move as today, or
    // an anchor the camera's lazy search creates: camera moves keep today's rule). Nor does a forced update of the
    // same box (`BlockState.updateBlock` forces one after every update).
    const changed = this.hitBoxSet && (this.hitBoxRemoved || moved);
    this.hitBoxSet = true;
    this.hitBoxRemoved = false;
    this.hitBox.update(minX, minY, maxX, maxY, force);
    // Every component reports its own bounds to the layer's shared index.
    if (!this.hitBox.destroyed) this.setCullingBounds(minX, minY, maxX, maxY);
    if (changed && !this.hitBox.destroyed) this.requestRetarget();
  }

  public removeHitBox() {
    this.hitBox.remove();
    if (this.hitBoxRemoved || !this.hitBoxSet) return;
    this.hitBoxRemoved = true;
    this.requestRetarget();
  }

  /** Asks GraphLayer to find the pointer's target again at the frame's end (settled item 11). */
  protected requestRetarget(): void {
    (this.context.graph as Partial<Graph>).getGraphLayer?.()?.requestRetarget();
  }
```

- `setVisibility`: after `this.hidden = hidden;` add `this.requestRetarget();` (a visibility change changes what a
  still pointer hits, with or without a hit box change: `setRenderDelegated` keeps the box).

In `Block.ts`, `setHiddenBlock`: after `this.blockHidden = hidden;` add `this.requestRetarget();`. A block hidden from
its mount never set a hit box, so showing it sets its first one, which asks nothing by itself.

Task 4's hit masks follow the same rule: a sub-component's first mask, set at its first add, asks nothing, and a
later change of it asks for a retarget. Without that, a pan at one level that creates lazy anchors would still turn
the pointer's target into an anchor (round 4's re-review); Task 4 tests it.

The cost is a compare per `setHitBox` call and, on a change, a flag write; the retarget is one point query at the
frame's end while the pointer is inside the root, none during a capture (facts §10).

- [ ] **Step 6: `graph.scene.onFrameEnd`**

In `services/scene/types.ts`, add to `IGraphScene`:

```ts
  /**
   * Calls the listener at the end of every graph frame, after every layer and the scene updated (the scene drew).
   * GraphLayer finds the pointer's target again there, and a layer that switches HTML with the scene (ReactLayer) does
   * it there, so the frame that changes the HTML draws the scene that goes with it, whatever the layer order. Returns
   * the function that removes the listener.
   */
  onFrameEnd(listener: () => void): () => void;
```

In `GraphScene.ts`:
- a field: `private readonly frameEndListeners = new Set<() => void>();`;
- the method:

```ts
  public onFrameEnd(listener: () => void): () => void {
    this.frameEndListeners.add(listener);
    return (): void => {
      this.frameEndListeners.delete(listener);
    };
  }
```

- `update()` ends with (after `Component.update(this.layer);`):

```ts
    this.frameEndListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("graph.scene.onFrameEnd: a listener threw", error);
      }
    });
```

- `dispose()` clears the set.

- [ ] **Step 7: The event model of D5, `hoveredTag` written by components, and retargeting**

The dispatch stays today's tree model:
- every pointer event, `mouseenter` and `mouseleave` included, is dispatched at the hit target and walks the parent
  chain (`_dipping` ignores `bubbles: false`, `EventedComponent.ts:296-316`);
- `stopPropagation()` ends the walk, and `detail.target` is the hit target.

This step adds:
- `detail.relatedTarget`;
- a hook a class can override to see each event that walks through it (`onDispatchedEvent`, no per-instance listener
  storage on 10k blocks);
- the helpers of the hover recipes;
- `hoveredTag` written by each library component on itself, with no binding;
- GraphLayer's retargeting.

In `packages/graph/src/components/canvas/EventedComponent/EventedComponent.ts`:
- after the imports, add the hover helpers, exported from `packages/graph/src/index.ts` as
  `export { isWithinComponent, pointerTargetAfter, type TGraphHoverDetail } from "./components/canvas/EventedComponent/EventedComponent";`:

```ts
/** The detail of the hover events GraphLayer dispatches (`mouseenter`, `mouseleave`, `mouseover`, `mouseout`; D5). */
export type TGraphHoverDetail = {
  /** The hit target: the old one on `mouseleave`/`mouseout`, the new one on `mouseenter`/`mouseover`. */
  target: EventedComponent | undefined;
  /** The other side of the target change: none for the camera or outside the graph. */
  relatedTarget: EventedComponent | undefined;
  sourceEvent: MouseEvent;
  pointerPressed: boolean;
};

/**
 * The pointer's target after a hover event: the target of a `mouseenter`/`mouseover`, the related target of a
 * `mouseleave`/`mouseout` (none for the camera or outside the graph).
 */
export function pointerTargetAfter(event: Event): EventedComponent | undefined {
  const detail = (event as CustomEvent<Partial<TGraphHoverDetail> | undefined>).detail;
  if (typeof detail !== "object" || detail === null) return undefined;
  return event.type === "mouseenter" || event.type === "mouseover" ? detail.target : detail.relatedTarget;
}

/** Whether `target` is `ancestor` or one of its descendants (the CSS-like hover of `Block`). */
export function isWithinComponent(ancestor: CoreComponent, target: CoreComponent | undefined): boolean {
  for (let node: CoreComponent | undefined = target; node; node = node.getParent()) {
    if (node === ancestor) return true;
  }
  return false;
}
```

- in the class, after `handleEvent`:

```ts
  /**
   * Called for each event that walks through this component (its own and its descendants' bubbling up), before its
   * listeners and whatever its interactivity, unless an earlier component stopped the event. A class overrides it to
   * follow events without listeners of its own per instance (`Block`'s hover, D5). It does nothing here.
   */
  protected onDispatchedEvent(_event: Event): void {
    // A hook for subclasses.
  }
```

- the loop of `_dipping` becomes:

```ts
    while (parent) {
      if (parent instanceof EventedComponent) parent.onDispatchedEvent(event);
      if (stopPropagation) return false;
      if (!this._isMutedByInteractivity(parent, event.type) && this._hasListener(parent, event.type)) {
        this._fireEvent(parent, event);
        if (stopPropagation) return false;
      }
      parent = parent.getParent();
    }
```

In `packages/graph/src/components/canvas/GraphComponent/index.ts`:
- imports: `hoveredTag` from `../../../services/tags/builtinTags`, `getEntityAddress` from
  `../../../services/tags/entity`;
- a field: `/** Whether this component put hoveredTag on itself (\`setHoveredTag\`). */ private hoveredTagged = false;`;
- a protected helper:

```ts
  /**
   * Puts `hoveredTag` on this component's own entity, or takes it off (D5). `hoveredTag` is a styling tool: a component
   * decides itself when it shows as hovered, from the pointer events it gets and those bubbling up from its
   * descendants (`detail.target`, `detail.relatedTarget`). It writes only its own entity; without an entity address
   * (no `static entityType`) there is nothing to write. No library code reads the tag to decide behaviour.
   */
  protected setHoveredTag(hovered: boolean): void {
    if (hovered === this.hoveredTagged) return;
    const address = getEntityAddress(this);
    if (!address) return;
    this.hoveredTagged = hovered;
    const { tags } = this.context.graph.scene;
    if (hovered) tags.add(hoveredTag, { [address.type]: [address.id] });
    else tags.delete(hoveredTag, { [address.type]: [address.id] });
  }
```

- `unmount()`: before `(this.context.graph as Partial<Graph>).getGraphLayer?.()?.forgetComponent(this);` add
  `this.setHoveredTag(false);` (a removed component takes its own tag off). The retarget requests are Step 5's.

The library's components write their own tag (no base-class default; the user's D5 refinement):
- `components/canvas/blocks/Block.ts`: the CSS-like hover of В1, while the target is the block or a descendant:

```ts
  /**
   * Whether the block shows as hovered (`hoveredTag`) while `target` is the pointer's target: by default while the
   * target is the block or one of its descendants (its anchors, its children), as CSS `:hover` (В1, D5). Override to
   * decide by target, for example a block that is not hovered over its anchors: `return target === this;`.
   */
  protected isHoveredBy(target: EventedComponent | undefined): boolean {
    return isWithinComponent(this, target);
  }

  /** The block's hover: its own `mouseenter`/`mouseleave` and those bubbling up from its descendants (D5). */
  protected override onDispatchedEvent(event: Event): void {
    super.onDispatchedEvent(event);
    if (event.type === "mouseenter" || event.type === "mouseleave") {
      this.setHoveredTag(this.isHoveredBy(pointerTargetAfter(event)));
    }
  }
```

  (imports `isWithinComponent`, `pointerTargetAfter` and `type EventedComponent` from
  `../EventedComponent/EventedComponent`; `setHiddenBlock`'s request is Step 5's);
- `components/canvas/connections/BaseConnection.ts`: in its `handleEvent` switch, `case "mouseenter":` adds
  `this.setHoveredTag(true);` and `case "mouseleave":` adds `this.setHoveredTag(false);` before the debounced hover
  (the connection is hovered while it is the target, as the binding did);
- `components/canvas/groups/Group.ts`: the same, while the group is the target:

```ts
  protected override onDispatchedEvent(event: Event): void {
    super.onDispatchedEvent(event);
    if (event.type === "mouseenter" || event.type === "mouseleave") {
      this.setHoveredTag(pointerTargetAfter(event) === this);
    }
  }
```

- `Anchor` in Step 8.

In `packages/graph/src/services/tags/systems.ts`, delete the `hoveredTag` binding (and the `hoveredTag` import): a
bound tag has one writer, the binding, and D5 makes each component the writer of its own entity. `selectedTag` and
`draggingTag` stay bound.

In `packages/graph/src/components/canvas/layers/graphLayer/GraphLayer.ts`:
- `GraphMouseEvent`'s detail gets `relatedTarget?: EventedComponent;` ("on the hover events: the other side of the
  target change"), and so does the public `GraphMouseEvent` of `packages/graph/src/graphEvents.ts:7`, which types
  `graph.on()` and `useGraphEvent` (round 3, finding 1):

```ts
export type GraphMouseEvent<E extends Event = Event> = CustomEvent<{
  target?: EventedComponent;
  /** On `mouseenter` and `mouseleave`: the other side of the target change; none for the camera or outside. */
  relatedTarget?: EventedComponent;
  sourceEvent: E;
  pointerPressed?: boolean;
}>;
```

- imports: `batch` with `signal` from `@preact/signals-core`; `type TGraphHoverDetail` with `EventedComponent`;
  `import type { CoreComponent } from "../../../../lib/CoreComponent";`;
- after the imports, a helper:

```ts
/** The nearest graph component above `component` (a block above its anchor or child), if any. */
function graphComponentAbove(component: EventedComponent): GraphComponent | undefined {
  for (let node: CoreComponent | undefined = component.getParent(); node; node = node.getParent()) {
    if (node instanceof GraphComponent) return node;
  }
  return undefined;
}
```

- `dispatchNativeEvent` carries `relatedTarget` to the bus: a fourth parameter, named in the hover events' detail
  (the other events' detail is unchanged). Its start becomes, the rest unchanged:

```ts
  private dispatchNativeEvent(
    type: GraphMouseEventNames,
    event: MouseEvent | GraphMouseEvent,
    targetComponent?: EventedComponent,
    relatedTarget?: EventedComponent
  ) {
    const hover = type === "mouseenter" || type === "mouseleave";
    const graphEvent = this.props.graph.emit(type, {
      target: targetComponent,
      ...(hover ? { relatedTarget } : {}),
      pointerPressed: this.pointerPressed,
      sourceEvent: event,
    });
```

- fields:

```ts
  /** Set by `requestRetarget()`; the frame's end finds the target again (`retargetAtPointer`). */
  private retargetRequested = false;

  /** Whether the pointer is over the graph's root: set by its moves, cleared when it leaves the root. */
  private pointerInside = false;

  /**
   * The nearest graph component above a target that unmounted (`forgetComponent`): the old side of the next target
   * change, so its hover ends when the pointer is not on it any more (round 3, finding 3).
   */
  private lostTargetOwner?: GraphComponent;
```

- in `afterInit()`, before `super.afterInit()`:

```ts
    // The target is found again once the frame's hit boxes are in the index: at the frame's end when the hit test has
    // nothing queued, else when it has processed its queue (it runs at the lowest priority, after the frame task).
    const { hitTest } = this.context.graph;
    const onHitTestUpdate = (): void => this.retargetAtPointer();
    const stopFrame = this.context.graph.scene.onFrameEnd(() => {
      if (!hitTest.hasPendingUpdates()) this.retargetAtPointer();
    });
    hitTest.on("update", onHitTestUpdate);
    this.eventAbortController.signal.addEventListener(
      "abort",
      () => {
        stopFrame();
        hitTest.off("update", onHitTestUpdate);
      },
      { once: true }
    );
```

- in `packages/graph/src/services/HitTest.ts`, add after `isUnstable`:

```ts
  /** @internal Whether hit boxes wait in the queue: queries see them only after it is processed. */
  public hasPendingUpdates(): boolean {
    return this.processQueue.isScheduled() || this.queue.size > 0;
  }
```

- in `attachListeners()`, after `this.onRootEvent("mousemove", this);`, add `this.onRootEvent("mouseleave", this);`;
- `handleEvent` starts with:

```ts
    if (e.type === "mouseleave") {
      this.onRootLeave(e as MouseEvent);
      return;
    }
    if (e.type === "mousemove") {
      this.pointerInside = true;
      this.updateTargetComponent(e as MouseEvent);
      this.onRootPointerMove(e as MouseEvent);
      this.targetComponent?._trackAreaHover();
      return;
    }
```

  (Task 7 deletes the `_trackAreaHover()` line with the evented areas);
- `updateTargetComponent` keeps the pointer's position before the capture branch (re-review 4):

```ts
  private updateTargetComponent(event: MouseEvent, force = false) {
    if (!force && this.eventByTargetComponent && getEventDelta(event, this.eventByTargetComponent) < 3) return;
    this.eventByTargetComponent = event;
    const point = this.context.graph.getPointInCameraSpace(event);
    // Kept during a capture too: the retarget at its release uses the latest position.
    this.lastMouseCanvasX = point.canvas.x;
    this.lastMouseCanvasY = point.canvas.y;
    if (this.capturedTargetComponent) {
      this.targetComponent = this.capturedTargetComponent;
      this.publishHovered();
      return;
    }
    this.prevTargetComponent = this.targetComponent;
    this.targetComponent = this.context.graph.getElementOverPoint(point) || this.$.camera;
    this.publishHovered();
  }
```

- `releaseCapture` becomes:

```ts
  public releaseCapture() {
    this.capturedTargetComponent = undefined;
    this.publishHovered();
    // What a still pointer hits may have changed during the gesture (a hold, the level, a move): find it again.
    if (this.pointerInside) this.requestRetarget();
    else this.changeTargetTo(undefined, new MouseEvent("mouseleave"));
  }
```

- public members after `forgetComponent`:

```ts
  /**
   * @internal What a still pointer may hit changed (settled item 11): a component hidden or unmounted, a hit box that
   * was set before changed (`GraphComponent.setHitBox`, `removeHitBox`), a child's hit levels, an HTML hold, the
   * level. The target is found again at the last pointer position at the end of the frame, or at the release of a
   * capture.
   */
  public requestRetarget(): void {
    this.retargetRequested = true;
  }
```

- private methods:

```ts
  /** A target change without a new pointer move: the normal leave and enter of D5 (`onRootPointerMove`). */
  private changeTargetTo(next: EventedComponent | undefined, event: MouseEvent): void {
    // A forgotten target's owner still hears the change, also when the target stays none (a release outside).
    if (next === this.targetComponent && this.lostTargetOwner === undefined) return;
    this.prevTargetComponent = this.targetComponent;
    this.targetComponent = next;
    this.publishHovered();
    this.onRootPointerMove(event);
  }

  private retargetAtPointer(): void {
    if (!this.retargetRequested) return;
    // During a gesture the request waits: releaseCapture() finds the target again with the latest position.
    if (this.capturedTargetComponent) return;
    this.retargetRequested = false;
    if (!this.pointerInside || this.lastMouseCanvasX === undefined || this.lastMouseCanvasY === undefined) return;
    const point = this.context.camera.createCameraPoint(Point(this.lastMouseCanvasX, this.lastMouseCanvasY), "canvas");
    const next = this.context.graph.getElementOverPoint(point) || this.$.camera;
    this.changeTargetTo(next, new MouseEvent("mousemove", { bubbles: false, cancelable: false }));
  }

  /** The pointer left the graph's root: the target changes to none, unless a gesture holds the capture. */
  private onRootLeave(event: MouseEvent): void {
    this.pointerInside = false;
    this.eventByTargetComponent = undefined;
    // A captured gesture keeps its target; its release ends it outside (`releaseCapture`).
    if (this.capturedTargetComponent) return;
    this.changeTargetTo(undefined, event);
  }
```

- `onCameraChangeEmulateMouseEvents` starts with `if (!this.pointerInside) return;` (round 3, finding 5): after the
  pointer left the root, a camera move finds no target at its last position, as the root exit promises. The rest is
  unchanged; its target change goes through `onRootPointerMove` below;
- `forgetComponent` becomes (the forgotten component gets no event, as before; round 3, finding 3):

```ts
  /** @internal Drops an unmounted component from the pointer state, so no later event targets or re-publishes it. */
  public forgetComponent(component: EventedComponent): void {
    const wasTarget = this.targetComponent === component;
    // The nearest graph component above an unmounted target takes its place as the old side of the next change. A
    // parent's unmount() runs after its children's (`CoreComponent.__unmount`), so a parent forgotten next passes the
    // place on up.
    if (wasTarget || this.lostTargetOwner === component) this.lostTargetOwner = graphComponentAbove(component);
    if (wasTarget) this.targetComponent = undefined;
    if (this.prevTargetComponent === component) this.prevTargetComponent = undefined;
    if (this.pointerStartTarget === component) this.pointerStartTarget = undefined;
    if (this.capturedTargetComponent === component) this.capturedTargetComponent = undefined;
    if (this.hoveredComponent.peek() === component) this.hoveredComponent.value = undefined;
    if (wasTarget) this.requestRetarget();
  }
```

- the hover events of a change go through one helper that sends them only to a side that exists (round 3,
  finding 2). Today's `applyEventToTargetComponent(event, target = this.targetComponent)` puts the current target in
  place of an explicit `undefined` too, so the first entry sent the new target a `mouseleave`. Add after
  `applyEventToTargetComponent`, which the other events keep using:

```ts
  /**
   * One hover event of a target change (D5) at its side: the graph's event (`mouseenter` and `mouseleave`, as
   * before), then the component's, which walks the parent chain. A side that does not exist gets no event at all: the
   * first entry has nothing to leave, a root exit nothing to enter.
   */
  private dispatchHoverEvent(
    type: "mouseenter" | "mouseleave" | "mouseover" | "mouseout",
    target: EventedComponent | undefined,
    relatedTarget: EventedComponent | undefined,
    sourceEvent: MouseEvent
  ): void {
    if (!target) return;
    const detail: TGraphHoverDetail = { target, relatedTarget, sourceEvent, pointerPressed: this.pointerPressed };
    const event = new CustomEvent(type, { bubbles: type === "mouseover" || type === "mouseout", detail });
    if (isNativeGraphEventName(type) && !this.dispatchNativeEvent(type, event, target, relatedTarget)) return;
    target.dispatchEvent(event);
  }
```

- `onRootPointerMove` keeps today's order and adds `relatedTarget`, the sides that exist and one batch:

```ts
  /**
   * The hover events of a target change (D5): `mouseleave` and `mouseout` at the old target, then `mouseenter` and
   * `mouseover` at the new one, each walking the parent chain, with `relatedTarget` naming the other side (none for
   * the camera). A target that unmounted got no event (`forgetComponent`): the nearest graph component above it is
   * the old side in its place, unless the pointer is on that one now, so a block whose removed child stuck out of it
   * hears the pointer leave. One batch, so the components' `hoveredTag` writes of the change reach the frame together:
   * a block whose pointer moves onto its anchor is never drawn un-hovered.
   */
  private onRootPointerMove(event: MouseEvent) {
    const lost = this.lostTargetOwner;
    if (this.targetComponent === this.prevTargetComponent && lost === undefined) return;
    this.lostTargetOwner = undefined;
    this.prevTargetComponent?._clearAreaHover(true);
    const next = this.targetComponent;
    const prev = this.prevTargetComponent ?? (lost === next ? undefined : lost);
    const camera = this.$.camera;
    const other = (component: EventedComponent | undefined): EventedComponent | undefined =>
      component === camera ? undefined : component;
    batch(() => {
      this.dispatchHoverEvent("mouseleave", prev, other(next), event);
      this.dispatchHoverEvent("mouseout", prev, other(next), event);
      this.dispatchHoverEvent("mouseenter", next, other(prev), event);
      this.dispatchHoverEvent("mouseover", next, other(prev), event);
    });
  }
```

  (Task 7 deletes the `_clearAreaHover(true)` line).

The old side stays today's `prevTargetComponent`, which `updateTargetComponent` writes only on a move of 3 px or more
(`getEventDelta`). As at HEAD, a shorter move right after a change fires that change's events again (facts §6); their
tag writes repeat the same values.

`$hoveredComponent` stays the target, written by pointer handling only; nothing derives tags from it. The CursorLayer
is unchanged: it follows the graph's `mouseenter`, which names the target.

- [ ] **Step 8: `Anchor` on the defaults, and its own hover**

In `packages/graph/src/components/canvas/anchors/index.ts`:
- delete the `getSceneParent()` override (its JSDoc included): the default gives the block's element and the anchor's
  place among the block's retained children, as before;
- after `getSceneOrigin()`, add:

```ts
  /** None: the anchor sets its hit box from its port (`onPositionChanged`), a square of `size / 2 + lineWidth`. */
  protected override getHitRect(): TRect | undefined {
    return undefined;
  }
```

  (import `TRect` with `TPoint`; drop the `TSceneParent` import if nothing else uses it).

- `handleEvent`: clicks and presses stay the anchor's own, hover events go on to its block (D5: the anchor handles
  them and passes them on; a stopped hover event would keep its block from following the pointer). The anchor puts
  `hoveredTag` on itself while it is the target:

```ts
  public handleEvent(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    if (event.type !== "mouseenter" && event.type !== "mouseleave") event.stopPropagation();

    switch (event.type) {
      case "click": {
        this.toggleSelected();
        break;
      }
      case "mouseenter": {
        this.setState({ raised: true });
        this.setHoveredTag(true);
        break;
      }
      case "mouseleave": {
        this.setState({ raised: false });
        this.setHoveredTag(false);
        break;
      }
    }
  }
```

`sceneTestKit.ts`'s `BoxDot` keeps its own parent and origin and now gets a hit box from its bounds (a radius-4 circle
at the box's right edge); no test hits there.

Run: `pnpm --dir packages/graph exec jest src/lib/scene src/components/canvas src/services/tags src/lib`
Expected: PASS:
- 6 store tests, 19 tests in `sceneChildren.test.ts`, and the replaced systems and EventedComponent tests;
- the migrated anchor and export tests: the anchor's own hover event tags it, as GraphLayer's dispatch does;
- the other anchor and block tests unchanged (anchors draw in the same order).

A test that pins `hoveredTag` through `setHoveredComponent` (none besides the three migrated: facts §6) would now
dispatch the component's hover event instead.

- [ ] **Step 9: GPU check C31, red first**

In `scripts/bench/culling/scene/slice.ts`:
- imports: `import { CanvasBlock, Graph, SceneComponent } from "GRAPH";` and
  `import type { ChildDescriptor, TGraphComponentProps } from "GRAPH";` (merged with Task 2's imports; Task 7 exports
  `TGraphComponentProps`, so until then import it from `GRAPH_SRC/components/canvas/GraphComponent`);
- the header comment reads "checks C1-C31";
- at module level:

```ts
type TSliceChipProps = TGraphComponentProps & { id: string; x: number; color: string; inner?: ChildDescriptor[] };

/** C31: a 40 x 30 rect at (x, 60) in its block's frame, and what is nested in it, drawn on every level. */
class SliceChip extends SceneComponent<{ x: number; color: string }, TSliceChipProps> {
  public static override entityType = "sliceChip";

  public override getEntityId(): string {
    return this.props.id;
  }

  public setHiddenLook(hidden: boolean): void {
    this.setVisibility(!hidden, { removeHitbox: false });
  }

  protected override getViewData(): { x: number; color: string } {
    return { x: this.props.x, color: this.props.color };
  }

  protected override schematic(view: { x: number; color: string }): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "chip", x: view.x, y: 60, width: 40, height: 30, fill: view.color }];
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.inner ?? [];
  }
}

/** C31: chip A (blue, x 20..60) with a nested orange chip at x 30..70, then chip B (green, x 50..90). */
class SliceNestedBlock extends CanvasBlock {
  public chipA?: SliceChip;

  protected override updateChildren(): ChildDescriptor[] {
    const id = String(this.props.id);
    const inner = [SliceChip.create({ id: `${id}/a1`, x: 30, color: "#ff8800" }, { key: "a1" })];
    const chipA = SliceChip.create(
      { id: `${id}/a`, x: 20, color: "#0000ff", inner },
      {
        key: "a",
        ref: (component: SliceChip): void => {
          this.chipA = component;
        },
      }
    );
    return [chipA, SliceChip.create({ id: `${id}/b`, x: 50, color: "#00aa00" }, { key: "b" })];
  }
}
```

- after C30:

```ts
  // C31: nested children. Block NE (x 0..200, y 3500..3600) has chip A (x 20..60, y 3560..3590) with a nested chip
  // A1 (x 30..70), then chip B (x 50..90). At scale 0.5: A1 draws over A and under B (the pre-order A, A1, B), as
  // Canvas2D draws it; hiding A hides A1 on WebGL too (the backend reads the nesting), and showing A draws it again.
  await check("C31", async () => {
    graph.updateSettings({ blockComponents: { SliceNested: SliceNestedBlock } });
    graph.setEntities({
      blocks: [{ id: "NE", is: "SliceNested", name: "Nested", x: 0, y: 3500, width: 200, height: 100, anchors: [] }],
      connections: [],
    });
    camera.set({ scale: 0.5, x: ORIGIN.x, y: ORIGIN.y - 3500 * 0.5 });
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const view = graph.rootStore.blocksList.getBlockState("NE")?.getViewComponent();
      const chipA = view instanceof SliceNestedBlock ? view.chipA : undefined;
      if (!chipA) throw new Error("C31: no chip A");
      const region = againstCanvas2D(24, 3562, 70, 26);
      const a = pixelAt(25, 3575);
      const a1 = pixelAt(40, 3575);
      const b = pixelAt(65, 3575);
      chipA.setHiddenLook(true);
      for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
      const hiddenA1 = pixelAt(40, 3575);
      chipA.setHiddenLook(false);
      for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
      const shownA1 = pixelAt(40, 3575);
      record(
        "C31",
        region.worst <= TOLERANCE &&
          near(a, hex("#0000ff")) &&
          near(a1, hex("#ff8800")) &&
          near(b, hex("#00aa00")) &&
          !near(hiddenA1, hex("#ff8800")) &&
          !near(hiddenA1, hex("#0000ff")) &&
          near(shownA1, hex("#ff8800")),
        `worst channel difference from Canvas2D=${region.worst}; A ${show(a)} (want #0000ff), A1 ${show(a1)} (want ` +
          `#ff8800), B ${show(b)} (want #00aa00); A hidden: A1 ${show(hiddenA1)} (want neither); shown again: ` +
          `${show(shownA1)} (want #ff8800)`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      setCamera(1);
    }
  });
```

- in `scripts/bench/culling/README.md`, add "C31 — nested children: the pre-order draws as Canvas2D does; hiding a
  child hides what is nested in it on WebGL."

Run (outside the sandbox, through the lock): `node scripts/bench/culling/scene-slice.mjs`
Expected: C31 FAILS, and only C31. The order pixels pass (the store's pre-order), but after `setHiddenLook(true)` the
nested A1 still draws orange on WebGL: the backend reads only the owner's hidden flag (`WebGLSceneBackend.ts:816-818`)
and rewrites only an owner's children (`:727-728`). Record the failing line in the task report.

- [ ] **Step 10: The WebGL backend follows the nesting**

In `packages/graph/src/lib/scene/webgl/WebGLSceneBackend.ts`:
- `hiddenInScene` becomes:

```ts
  /** Hidden itself or through an element it is nested in, up to its owner: the texel key is -1 then. */
  private hiddenInScene(element: TSceneElement): boolean {
    if (element.hidden) return true;
    let above = element.nestedIn ?? element.parent;
    while (above !== undefined) {
      const next = this.elements.get(above);
      if (!next) return false;
      if (next.hidden) return true;
      above = next.nestedIn ?? next.parent;
    }
    return false;
  }
```

- in the update handling, `if (parent === undefined && changed("hidden")) this.writeChildren(element.id);` becomes
  `if (changed("hidden")) this.writeChildren(element.id);`. The comment above it reads "The store sends no update to
  what is nested in an element whose hidden flag changed." `writeChildren`'s parameter is renamed `id` (its
  `childrenOf` lists an owner's children or what is nested in a child);
- in `textsMoved`, `if (!hidden || element.parent !== undefined) return;` becomes `if (!hidden) return;`.

A child-order change of a nested element already rebases its owner (`element.parent` is the owner): its subtree's
sub bases follow the owner's draw list.

Run (outside the sandbox, through the lock): `node scripts/bench/culling/scene-slice.mjs`
Expected: C1–C31 PASS.

- [ ] **Step 11: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/lib/scene src/components/canvas src/lib/CoreComponent.ts src/services src/graphEvents.ts src/graphEvents.test-d.ts`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`
Expected: all pass.

- [ ] **Step 12: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph): nested child scene components; relatedTarget and hoveredTag written by components`).

---

### Task 4: Components are hit where they are shown (D4)

D4, В5, settled items 10–11; re-review findings 3 (the look-less part), 5 and 6 (the level part). Rule: a scene
component is hit on the levels where it is shown, by its scene look or by something outside the scene (an HTML
view); an explicit `static hitLevels` is authoritative.
- An element owner without a declaration: every level, as today (a block is hit at every level).
- A sub-component with a look and without a declaration: the levels its primitives are on. It is not hit while its
  element is drawn hidden: hidden itself, or anything up its nesting.
- A look-less sub-component: only the levels its class declares (settled item 10); without a declaration it is not
  hit, and development builds warn once per class when it sets a hit rect.
- While the component or a scene component above it is shown outside the scene (`isShownOutsideScene()`), a
  sub-component without a declaration is hit on every level, drawn or not: the view replaces the whole drawing (spec
  §10). Shown outside means drawing delegated with `setRenderDelegated`; Task 8 adds an HTML view's hold.
- A declaration (`hitLevels`) replaces the level rule in every case, so it can exclude the detailed level.

The consequences are the table under "Decisions applied" (D4 consequences); this task tests the rows marked Task 4.
Connection snapping is one of them:
- the snapping tree takes only ports with explicit `snappable` meta (`ConnectionEditingLayer.ts:229-232,738-752`), so
  it does not keep a plain anchor at detailed;
- without that meta, the component fallback sees the block instead of the anchor and returns the block's input port
  (`ConnectionEditingLayer.ts:464-478`): a gesture that ended on an anchor ends on the block, and the anchor-based
  start goes;
- explicitly snappable anchor ports are still found through the block's port map (`Block.getAnchorPort()` →
  `GraphComponent.getPort()`), a separate path that the e2e of Step 5 checks.

Retargeting (settled item 11): a change of a sub-component's hit levels and a change of the scene level request a
retarget, so a stationary pointer leaves a component the level no longer shows.

**Files:**
- Modify: `packages/graph/src/components/canvas/scene/SceneComponent.ts`:
  - `static hitLevels`, `isHitOnLevel`, `onHitBox`, `isShownOutsideScene`;
  - the hit mask written with the element, with retarget requests;
  - the look-less warning.
- Modify: `packages/graph/src/components/canvas/GraphComponent/index.ts`: `isRenderDelegated()`.
- Modify: `packages/graph/src/components/canvas/anchors/index.ts`: remove `onHitBox`.
- Modify: `packages/graph/src/components/canvas/layers/graphLayer/GraphLayer.ts`: a level change requests a retarget.
- Modify: `packages/graph/src/graph.ts`: `getElementsOverRect` filters by `isHitOnLevel`.
- Modify: `packages/graph/src/services/scene/GraphScene.ts`: the comment of `sceneElementOf` (ledger
  `deferred-minors.md:10`).
- Modify: `packages/graph/src/components/canvas/scene/sceneChildren.test.ts` (Task 3): `HitChip` declares its levels.
- Test: `packages/graph/src/components/canvas/scene/hitLevels.test.ts` (create);
  `apps/e2e/tests/connection-editing/connection-editing.spec.ts` (setup at the schematic level, a D4 describe).

**Interfaces:**
- Consumes:
  - `levelMaskOfPrimitives` (Task 2), `levelMaskOf`, `isOnLevel`;
  - the sub-component defaults, the nesting and `requestRetarget` (Task 3).
- Produces: `SceneComponent.hitLevels`, `isHitOnLevel(level)`, `onHitBox(data)`, `isShownOutsideScene()`,
  `GraphComponent.isRenderDelegated()`.

- [ ] **Step 1: The failing tests**

Create `packages/graph/src/components/canvas/scene/hitLevels.test.ts`:

```ts
import { Graph } from "../../../graph";
import type { ChildDescriptor } from "../../../lib/CoreComponent";
import type { TTileRect } from "../../../lib/culling/TileIndex";
import { globalScheduler } from "../../../lib/Scheduler";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { ECameraScaleLevel } from "../../../services/camera/cameraScaleEnums";
import type { TSceneLevel } from "../../../services/scene/types";
import { hoveredTag } from "../../../services/tags/builtinTags";
import { anchorEntityId } from "../../../store/anchor/anchorEntityId";
import type { TRect } from "../../../utils/types/shapes";
import type { TGraphComponentProps } from "../GraphComponent";
import { Anchor } from "../anchors";
import type { TAnchorClass } from "../anchors";
import { Block } from "../blocks/Block";
import type { TBlock } from "../blocks/Block";

import { SceneComponent } from "./SceneComponent";
import { Box, TestLayer, boxSource, frames } from "./sceneTestKit";

type TPinProps = TGraphComponentProps & { id: string; inner?: ChildDescriptor[] };

/** A child of its box: a radius-4 dot at (100, 10) in the box's frame, on the schematic level only. */
class Pin extends SceneComponent<object, TPinProps> {
  public static override entityType = "pin";

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override getViewData(): object {
    return {};
  }

  // Both empty on purpose: without them encodeLevels gives these levels the schematic list.
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return [{ kind: "circle", cx: 100, cy: 10, r: 4 }];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return [];
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.props.inner ?? [];
  }
}

/** No look: a hit region of its box's look at the same place, without a declaration. */
class RegionPin extends Pin {
  protected override schematic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override getHitRect(_bounds: TTileRect | undefined): TRect | undefined {
    return { x: 96, y: 6, width: 8, height: 8 };
  }
}

/** The same region, declared where its box's look shows it. */
class DeclaredRegionPin extends RegionPin {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

/** Declared hittable on the schematic level only, whatever shows it. */
class SchematicPin extends Pin {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

/** Declared hittable on the minimalistic level only, whatever it draws. */
class MinimalisticPin extends Pin {
  public static override hitLevels: readonly TSceneLevel[] = ["minimalistic"];
}

/** The pin of the next box, set by each test before it mounts one. */
let pin: ChildDescriptor = Pin.create({ id: "pin" });

class PinnedBox extends Box {
  public hide(): void {
    this.setVisibility(false, { removeHitbox: true });
  }

  protected override updateChildren(): ChildDescriptor[] {
    return [pin];
  }
}

describe("hit levels of scene components", () => {
  let graph: Graph;
  let box: PinnedBox | undefined;
  const pins: Record<string, Pin> = {};
  const keep =
    (id: string) =>
    (component: Pin): void => {
      pins[id] = component;
    };

  function mount(descriptor: ChildDescriptor): void {
    pin = descriptor;
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 0.5 });
    graph.addLayer(TestLayer, {
      children: [
        PinnedBox.create(
          { id: "box", source: boxSource("box") },
          {
            ref: (component: PinnedBox): void => {
              box = component;
            },
          }
        ),
      ],
    });
    frames(5);
  }

  /** The component the pointer hits at the pin at a camera scale: 0.1 minimalistic, 0.5 schematic, 1 detailed. */
  const hitAt = (scale: number): unknown => {
    graph.cameraService.set({ scale });
    return graph.getElementOverPoint({ x: 100, y: 10 });
  };

  afterEach(() => {
    graph.unmount();
    jest.restoreAllMocks();
  });

  it("hits a sub-component with a look on the levels its primitives are on", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.5)).toBe(pins.pin);
    expect(hitAt(0.1)).toBe(box);
    expect(hitAt(1)).toBe(box);
  });

  it("hits a look-less sub-component only on the levels it declares, and warns when it declares none", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mount(RegionPin.create({ id: "pin" }, { ref: keep("pin") }));
    for (const scale of [0.1, 0.5, 1]) expect(hitAt(scale)).toBe(box);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("hitLevels"))).toHaveLength(1);
    graph.unmount();
    mount(DeclaredRegionPin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.5)).toBe(pins.pin);
    expect(hitAt(0.1)).toBe(box);
    expect(hitAt(1)).toBe(box);
  });

  it("takes the levels a class declares", () => {
    mount(MinimalisticPin.create({ id: "pin" }, { ref: keep("pin") }));
    expect(hitAt(0.1)).toBe(pins.pin);
    expect(hitAt(0.5)).toBe(box);
  });

  it("hits an element owner on every level", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    for (const scale of [0.1, 0.5, 1]) {
      graph.cameraService.set({ scale });
      expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(box);
    }
  });

  it("hits every level while its owner is shown outside the scene, and keeps a declaration", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    box?.setRenderDelegated(true);
    frames(2);
    expect(box?.isShownOutsideScene()).toBe(true);
    expect(hitAt(0.1)).toBe(pins.pin);
    expect(hitAt(1)).toBe(pins.pin);
    graph.unmount();
    mount(SchematicPin.create({ id: "pin" }, { ref: keep("pin") }));
    box?.setRenderDelegated(true);
    frames(2);
    expect(hitAt(0.5)).toBe(pins.pin);
    expect(hitAt(1)).toBe(box);
  });

  it("follows the nesting: a hidden middle hides what is nested in it, a delegated middle shows it", () => {
    // pin "mid" at (100, 10) with a nested pin "deep" at the same place (its parent's origin).
    mount(Pin.create({ id: "mid", inner: [Pin.create({ id: "deep" }, { ref: keep("deep") })] }, { ref: keep("mid") }));
    expect(hitAt(0.5)).toBe(pins.deep);
    pins.mid.setRenderDelegated(true);
    frames(2);
    // Delegated: drawn hidden, shown outside the scene, so "deep" is hit on every level.
    expect(hitAt(1)).toBe(pins.deep);
    pins.mid.setRenderDelegated(false);
    box?.hide();
    frames(2);
    expect(hitAt(0.5)).toBeUndefined();
  });

  it("does not hit a sub-component of a hidden owner, and a still pointer leaves both", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    const layer = graph.getGraphLayer();
    const left: string[] = [];
    pins.pin.addEventListener("mouseleave", () => left.push("pin"));
    box?.addEventListener("mouseleave", () => left.push("box"));
    // Scale 0.5 at the origin: the pin at world (100, 10) is at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value).toBe(pins.pin);
    box?.hide();
    frames(3);
    expect(hitAt(0.5)).toBeUndefined();
    expect(layer.$hoveredComponent.value).toBeUndefined();
    expect(left).toEqual(["pin", "box"]);
  });

  it("leaves components the level does not hit out of rect queries", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    const rect = { x: 95, y: 5, width: 10, height: 10 };
    graph.cameraService.set({ scale: 0.1 });
    expect(graph.getElementsOverRect(rect).includes(pins.pin)).toBe(false);
    graph.cameraService.set({ scale: 0.5 });
    expect(graph.getElementsOverRect(rect).includes(pins.pin)).toBe(true);
  });

  it("finds the target again under a stationary pointer when the level changes without a camera move", () => {
    mount(Pin.create({ id: "pin" }, { ref: keep("pin") }));
    const layer = graph.getGraphLayer();
    // Scale 0.5 at the origin: the pin at world (100, 10) is at client (50, 5).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 5 }));
    expect(layer.$hoveredComponent.value).toBe(pins.pin);
    graph.updateSettings({ getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed });
    frames(3);
    expect(layer.$hoveredComponent.value).toBe(box);
  });
});

/** A look on the minimalistic level too, created there (Task 2). */
class FarDotAnchor extends Anchor {
  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -2, y: -2, width: 4, height: 4 }];
  }
}

/** The stock look, declared hittable on the schematic level only. */
class SchematicAnchor extends Anchor {
  public static override hitLevels: readonly TSceneLevel[] = ["schematic"];
}

class FarDotBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return FarDotAnchor;
  }
}

class SchematicAnchorBlock extends Block {
  protected override getAnchorClass(): TAnchorClass {
    return SchematicAnchor;
  }
}

describe("hit levels of anchors (D4 consequences)", () => {
  const anchored = (id: string, x: number, is = "Block"): TBlock => ({
    id,
    is,
    name: id,
    x,
    y: 100,
    width: 200,
    height: 100,
    anchors: [
      { id: "in", blockId: id, type: "IN" },
      { id: "out", blockId: id, type: "OUT" },
    ],
  });

  let graph: Graph;
  const frame = (): void => {
    for (let i = 0; i < 4; i++) globalScheduler.performUpdate();
  };
  const state = (id: string): ReturnType<Graph["rootStore"]["blocksList"]["getBlockState"]> =>
    graph.rootStore.blocksList.getBlockState(id);
  const out = (id: string): Anchor | undefined => state(id)?.getAnchorById("out")?.getViewComponent();

  beforeEach(() => {
    const root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      {
        settings: { useBlocksAnchors: true, blockComponents: { FarDot: FarDotBlock, Declared: SchematicAnchorBlock } },
      },
      root
    );
    graph.start();
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    graph.setEntities({
      blocks: [anchored("plain", 100), anchored("dot", 400, "FarDot"), anchored("declared", 700, "Declared")],
      connections: [],
    });
    frame();
  });

  afterEach(() => graph.unmount());

  it("hits a stock anchor where it is shown, a class drawn on minimalistic there, and keeps a declaration", () => {
    // The OUT anchors lie at x + 200, y 188 (HEAD_HEIGHT 64 + BODY_PADDING 24 below the block's top).
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(out("plain"));
    graph.cameraService.set({ scale: 1, x: 0, y: 0 });
    frame();
    // Detailed without an HTML view: not shown, not hit (D4); the block is.
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(state("plain")?.getViewComponent());
    state("plain")?.getViewComponent()?.setRenderDelegated(true);
    state("declared")?.getViewComponent()?.setRenderDelegated(true);
    frame();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(out("plain"));
    expect(graph.getElementOverPoint({ x: 900, y: 188 })).toBe(state("declared")?.getViewComponent());
    state("plain")?.getViewComponent()?.setRenderDelegated(false);
    graph.cameraService.set({ scale: 0.1, x: 0, y: 0 });
    frame();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(state("plain")?.getViewComponent());
    expect(graph.getElementOverPoint({ x: 600, y: 188 })).toBe(out("dot"));
  });

  it("gives an unshown detailed anchor's pointer gestures, hover and rect queries to the block (D4)", () => {
    graph.cameraService.set({ scale: 1, x: 0, y: 0 });
    frame();
    const layer = graph.getGraphLayer();
    const anchor = out("plain");
    const block = state("plain")?.getViewComponent();
    const entered: string[] = [];
    anchor?.addEventListener("mouseenter", () => entered.push("anchor"));
    const targets: unknown[] = [];
    graph.on("mousedown", (event) => {
      targets.push(event.detail.target);
    });
    graph.on("click", (event) => {
      targets.push(event.detail.target);
    });
    // Scale 1 at the origin: world = client.
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 188 }));
    for (const type of ["mousedown", "mouseup", "click"]) {
      layer.handleEvent(new MouseEvent(type, { clientX: 300, clientY: 188 }));
    }
    expect(layer.$hoveredComponent.value).toBe(block);
    expect(entered).toEqual([]);
    expect(graph.scene.tags.peekOf("anchor", anchorEntityId("plain", "out")).has(hoveredTag)).toBe(false);
    expect(targets.length === 2 && targets.every((target) => target === block)).toBe(true);
    expect(state("plain")?.getAnchorById("out")?.$selected.value).toBe(false);
    const rect = { x: 290, y: 178, width: 20, height: 20 };
    expect(graph.getElementsOverRect(rect, [Anchor])).toEqual([]);
    expect(graph.getElementsInViewport([Anchor]).includes(anchor as Anchor)).toBe(false);
    // The schematic level shows the anchor: the same queries find it.
    graph.cameraService.set({ scale: 0.5, x: 0, y: 0 });
    frame();
    expect(graph.getElementsOverRect(rect, [Anchor]).includes(anchor as Anchor)).toBe(true);
  });

  it("keeps the target when a pan at one level creates anchors under a still pointer, until the next move", () => {
    // `emulateMouseEventsOnCameraChange` is off (the default): a camera move finds no new target, and the first hit
    // mask of a lazily created anchor asks for no retarget either (Step 3).
    graph.setEntities({ blocks: [anchored("plain", 100), anchored("far", 3000)], connections: [] });
    frame();
    const layer = graph.getGraphLayer();
    const entered: unknown[] = [];
    graph.on("mouseenter", (event) => {
      entered.push(event.detail.target);
    });
    // Client (600, 94) is world (1200, 188) at scale 0.5 from the origin: empty space. The far block lies past the
    // camera's anchor search, so its anchors do not exist yet.
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 600, clientY: 94 }));
    expect(out("far")).toBeUndefined();
    expect(layer.$hoveredComponent.value).toBeUndefined();
    entered.splice(0);
    // A pan at the same scale puts the far block's OUT anchor point (3200, 188) under the pointer (600 - 3200 * 0.5).
    graph.cameraService.set({ x: -1000 });
    frame();
    expect(out("far") instanceof Anchor).toBe(true);
    expect(layer.$hoveredComponent.value).toBeUndefined();
    expect(entered).toEqual([]);
    // The next pointer move, 4 px on (past the 3 px threshold), finds the anchor: world (3208, 188).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 604, clientY: 94 }));
    expect(layer.$hoveredComponent.value).toBe(out("far"));
  });
});
```

In `sceneChildren.test.ts` (Task 3), `HitChip` gets
`public static override hitLevels: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];` (import
`TSceneLevel` from `../../../services/scene/types`): a look-less child declares where it is hit.

Run: `pnpm --dir packages/graph exec jest src/components/canvas/scene/hitLevels.test.ts`
Expected: FAIL:
- the pin is hit on every level, and `hitLevels` and `isShownOutsideScene` do not exist;
- the stock anchor is hit at detailed, so the block gets no gesture there;
- the far dot anchor is not hit at 0.1 (the stock `Anchor.onHitBox` rejects every anchor there);
- the level change keeps the pin hovered.

The pan test passes before Step 3 too: Task 3 asks nothing for a first hit box, and the tree has no hit masks yet. It
is a guard for Step 3's own change, marked as such in the red-run record. Codex's round-4 probe of a mask that asked
on its first add found the anchor as the target after the pan.

- [ ] **Step 2: `isRenderDelegated()` on `GraphComponent`**

In `packages/graph/src/components/canvas/GraphComponent/index.ts`:
- add a field next to `hidden`'s declaration: `private renderDelegated = false;`;
- `setRenderDelegated` becomes:

```ts
  /**
   * The low-level "something else draws this component" switch: it is not drawn and keeps its hit box. A scene
   * component and its sub-components are then hit on every level (`SceneComponent.isShownOutsideScene`).
   */
  public setRenderDelegated(delegated: boolean): void {
    this.renderDelegated = delegated;
    this.setVisibility(!delegated, { removeHitbox: false });
  }

  /** Whether its drawing is delegated now (`setRenderDelegated`); `Block` adds an HTML view's hold. */
  public isRenderDelegated(): boolean {
    return this.renderDelegated;
  }
```

- [ ] **Step 3: `SceneComponent` hit levels**

In `packages/graph/src/components/canvas/scene/SceneComponent.ts`:
- imports:

  ```ts
  import { isOnLevel, levelMaskOf, levelMaskOfPrimitives } from "../../../lib/scene/levels";
  import type { HitBoxData } from "../../../services/HitTest";
  import type { TSceneLevel } from "../../../services/scene/types";
  import type { CoreComponent, TComponentMode } from "../../../lib/CoreComponent";
  ```

  (the last one adds `CoreComponent` to the existing `TComponentMode` import);
- module level, after `reportOnce`:

```ts
/** `static hitLevels` as a level mask per class; undefined without a declaration (never changed later). */
const declaredHitMasks = new WeakMap<object, number | undefined>();

function declaredHitMask(klass: typeof SceneComponent): number | undefined {
  if (declaredHitMasks.has(klass)) return declaredHitMasks.get(klass);
  const declared = klass.hitLevels;
  const mask = declared === undefined ? undefined : levelMaskOf(declared);
  declaredHitMasks.set(klass, mask);
  return mask;
}
```

- after `static entityType`, add:

```ts
  /**
   * The levels on which the hit test finds components of this class, whatever shows them (spec §9, D4). Without a
   * declaration: an element owner on every level; a sub-component with a look on the levels its primitives are on, and
   * on every level while it or a scene component above it is shown outside the scene; a look-less sub-component on
   * none (declare where the look it stands for is shown).
   */
  public static hitLevels?: readonly TSceneLevel[];
```

- add a field after `lastHitRect`:

```ts
  /** A sub-component's own levels as a hit mask: those of its primitives, 0 without any (`levelMaskOfPrimitives`). */
  private hitMask = 0;
```

- add public members after `isRendered()`:

```ts
  /** Whether the hit test finds this component on a level (`static hitLevels`, spec §9, D4). */
  public isHitOnLevel(level: TSceneLevel): boolean {
    const declared = declaredHitMask(this.constructor as typeof SceneComponent);
    // An element owner without a declaration: every level, as every graph component.
    if (declared === undefined && this.written?.parent === undefined) return true;
    const shownOutside = this.isShownByOwnerOutsideScene();
    if (!shownOutside && this.isChildDrawnHidden()) return false;
    if (declared !== undefined) return isOnLevel(declared, level);
    // A look-less sub-component without a declaration is not hit (settled item 10).
    if (this.hitMask === 0) return false;
    return shownOutside || isOnLevel(this.hitMask, level);
  }

  /** Not hit on a level it is not hit on (`isHitOnLevel`); otherwise as every graph component. */
  public override onHitBox(data: HitBoxData): boolean {
    if (!this.isHitOnLevel(this.context.graph.scene.$level.peek())) return false;
    return super.onHitBox(data);
  }

  /**
   * Whether something outside the scene shows this component now (D4): it and its sub-components are then hit on
   * every level, drawn or not. By default while its drawing is delegated (`setRenderDelegated`); `Block` adds an HTML
   * view's hold.
   */
  public isShownOutsideScene(): boolean {
    return this.isRenderDelegated();
  }
```

- add private methods after `syncHitRect`:

```ts
  /**
   * Writes a sub-component's hit mask after a write; a later change asks GraphLayer to find the target again. The
   * first add only sets it (`initial`): a component that mounts under a still pointer is found at the next pointer
   * move, and the anchors a camera move creates lazily must not turn that move into a retarget (settled item 11).
   */
  private syncHitMask(written: TWritten, initial = false): void {
    const mask = written.parent === undefined ? 0 : levelMaskOfPrimitives(written.primitives);
    if (mask === this.hitMask) return;
    this.hitMask = mask;
    if (!initial) this.requestRetarget();
  }

  /** Whether this component or a scene component above it is shown outside the scene now. */
  private isShownByOwnerOutsideScene(): boolean {
    for (let node: CoreComponent | undefined = this; node instanceof SceneComponent; node = node.getParent()) {
      if (node.isShownOutsideScene()) return true;
    }
    return false;
  }

  /** Whether this is a written child element the scene does not draw: hidden itself or up its nesting. */
  private isChildDrawnHidden(): boolean {
    if (this.written?.parent === undefined) return false;
    const { store } = this.context.graph.scene;
    const element = store.get(this.getSceneElementId());
    return element !== undefined && store.isDrawnHidden(element as TSceneElement);
  }
```

- in `syncHitRect` (Task 3), after the rect is set, add the development warning:

```ts
    const klass = this.constructor as typeof SceneComponent;
    if (rect && next.primitives.length === 0 && next.parent !== undefined && declaredHitMask(klass) === undefined) {
      if (isDevelopmentBuild()) {
        reportOnce(
          klass.name,
          "hitLevels",
          `${klass.name}: a look-less child with a hit rect is hit only on the levels it declares; declare them ` +
            '(`public static override hitLevels = ["schematic"];`) where the look it stands for is shown',
          "warn"
        );
      }
    }
```

- in `syncSceneElement`, in the update branch after `this.written = next;`, add
  `if (patch.primitives !== undefined) this.syncHitMask(next);`;
- in `addSceneElement`, after `this.written = next;`, add `this.syncHitMask(next, this.adds === 0);`. It runs
  before Task 3's `this.adds++` (after `bindSceneStyle`), and a failed add returns earlier, so `adds === 0` marks the
  first successful add; a re-add after the element was deleted behind the component asks as any later change.

In `GraphLayer.ts`, `afterInit()` adds `this.onSignal(this.context.graph.scene.$level, () => this.requestRetarget());`
(a level change changes what is hit under a stationary pointer; a camera move keeps today's rule).

- [ ] **Step 4: `Anchor`, `getElementsOverRect` and a comment**

In `packages/graph/src/components/canvas/anchors/index.ts`, delete `onHitBox` (its JSDoc included) and the then
unused `HitBoxData` import. The stock look draws on the schematic level only, so the rule of Step 3 gives the stock
anchor that level, and every level while its block is shown outside the scene.

In `packages/graph/src/graph.ts`, replace `getElementsOverRect` and its JSDoc:

```ts
  /**
   * Returns the elements whose hit boxes meet a world rect, without the scene components the current level does not
   * hit (`SceneComponent.isHitOnLevel`: a stock anchor at the minimalistic level, or at the detailed level without an
   * HTML view), as points leave them out.
   */
  public getElementsOverRect<T extends GraphComponentConstructor>(rect: TRect, filter?: T[]): InstanceType<T>[] {
    const found = this.hitTest.testBox({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    });
    const matching = filter ? found.filter((item) => filter.some((Component) => item instanceof Component)) : found;
    const level = this.scene.$level.peek();
    return matching.filter(
      (item) => !(item instanceof SceneComponent) || item.isHitOnLevel(level)
    ) as InstanceType<T>[];
  }
```

with `import { SceneComponent } from "./components/canvas/scene/SceneComponent";` (drop the `Anchor` import if
nothing else in `graph.ts` uses it).

In `packages/graph/src/services/scene/GraphScene.ts`, above `sceneElementOf`, add the comment
`/** A key whose element is not in the store (not written yet, or deleted) gives none: the component then compares by its tree (zIndex, renderOrder), as one without a key. */`
(wrapped at 120 characters).

Run: `pnpm --dir packages/graph exec jest src/components/canvas src/graph`
Expected: PASS. The anchor hit tests of 3a run at the schematic and minimalistic levels
(`lazyAnchors.test.ts:345-361`, `Anchor.scene.test.ts:187-191`, `nativeVisibilityCulling.test.ts:216-243`) and keep
passing. A test that expects an anchor hit at the detailed level without an HTML view now expects its block (D4): flip
it and list it in the task report.

- [ ] **Step 5: Connection editing under D4 (e2e)**

`apps/e2e/tests/connection-editing/connection-editing.spec.ts` initializes its graph with `zoomTo("center")`, which
clamps to `scaleMax` 1 for its 700 × 400 scene: its anchor gestures run at the detailed level without HTML, which D4
removes. They test anchor gestures where anchors are shown, as `connection-editing-react.spec.ts:132-133` already
does at 0.5:
- `setup(page)` becomes `setup(page, scale = 0.5)` and ends with `await graphPO.camera().zoomToScale(scale);`;
- every existing describe keeps calling `setup(page)`;
- `graphPO.drag` takes world points, so their world offsets and geometry expectations do not change.

Add a describe for the D4 consequences at the detailed level:

```ts
test.describe("ConnectionEditingLayer – the detailed level without HTML (D4)", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page, 1);
    await layerPO.addLayer();
    await layerPO.recordEvents();
  });

  test("a plain anchor starts no connection: the press is the block's, which drags", async () => {
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    await graphPO.drag(from, { x: from.x, y: from.y + 150 });
    expect(await graphPO.getConnections()).toEqual([]);
    expect(await layerPO.getEventTypes()).toEqual([]);
    expect(await graphPO.block("block-a").getGeometry()).toMatchObject({ x: 0, y: 150 });
  });

  test("a block gesture dropped on a plain anchor's point connects to the block", async ({ page }) => {
    const from = await graphPO.block("block-c").getCenter();
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");
    // At the schematic level this drop targets the anchor and is rejected ("a block to anchor drop ...").
    const connections = await graphPO.getConnections();
    expect(connections).toHaveLength(1);
    expect(endpointFields(connections[0])).toEqual({ sourceBlockId: "block-c", targetBlockId: "block-b" });
  });

  test("snappable anchor ports still connect through the block's port map", async () => {
    await layerPO.makeAnchorPortsSnappable([
      { blockId: "block-a", anchorId: "out-a" },
      { blockId: "block-b", anchorId: "in-b" },
    ]);
    const from = await layerPO.getAnchorPoint("block-a", "out-a");
    const to = await layerPO.getAnchorPoint("block-b", "in-b");
    await graphPO.drag(from, { x: to.x - 15, y: to.y + 5 });
    expect(await graphPO.getConnections()).toEqual([
      expect.objectContaining({ sourceAnchorId: "out-a", targetAnchorId: "in-b" }),
    ]);
  });
});
```

Run (outside the sandbox, through the lock):
`pnpm --filter @gravity-ui/graph-e2e exec playwright test tests/connection-editing --reporter=line`

Expected:
- every existing test passes at 0.5. A test that fails only because of the scale (a screen-pixel distance) moves to
  `setup(page, 1)` and is listed in the report with its reason;
- the three D4 tests pass. On the tree before this task the first two fail, because the anchor is hit at detailed:
  run them there once to see them red, and record it.
- If the snappable test fails, the port path does not survive D4: report it before changing anything. It is the
  re-review's expectation, not a rule of this plan.

- [ ] **Step 6: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/components/canvas src/graph.ts src/services/scene/GraphScene.ts`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`,
`pnpm run lint` (covers the e2e spec)
Expected: all pass.

- [ ] **Step 7: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph)!: scene components are hit where they are shown`).

---

### Task 5: `transparentToEvents`

Settled item 4. `static transparentToEvents` (spec §5.1) skips a component as the pointer's target; it lives on
`GraphComponent`. It is an option for components that reserve usable-rect space, not a required replacement of
`onHitBox() => false`: that one keeps the component out of every hit query, which is what Nirvana's reserver needs
today (Opus M15).

**Files:**
- Modify: `packages/graph/src/components/canvas/GraphComponent/index.ts`: `static transparentToEvents`,
  `isTransparentToEvents()`.
- Modify: `packages/graph/src/graph.ts`: `getElementOverPoint` skips transparent components.
- Test: `packages/graph/src/components/canvas/GraphComponent/transparentToEvents.test.ts` (create).

**Interfaces:**
- Produces: `GraphComponent.transparentToEvents: boolean` (static, `false`), `GraphComponent.isTransparentToEvents()`.
  GraphLayer's pointer target, the hovered component and the cursor follow `getElementOverPoint`, so they skip them
  too; child scene components (Task 3) are targeted the same way, so a transparent child passes events to what is
  under it.

- [ ] **Step 1: The failing test**

```ts
// packages/graph/src/components/canvas/GraphComponent/transparentToEvents.test.ts
import { Graph } from "../../../graph";
import { Component } from "../../../lib/Component";
import { hoveredTag } from "../../../services/tags/builtinTags";
import { TestLayer, frames } from "../scene/sceneTestKit";

import { GraphComponent } from "./index";
import type { TGraphComponentProps } from "./index";

type TPadProps = TGraphComponentProps & { id: string; z: number; width: number };

/** A hit box from (0, 0) of the given width and 50 high, above every block (zIndex 300+). */
class Pad extends GraphComponent<TPadProps> {
  public static entityType = "pad";

  constructor(props: TPadProps, parent: Component) {
    super(props, parent);
    this.zIndex = props.z;
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override willMount(): void {
    super.willMount();
    this.setHitBox(0, 0, this.props.width, 50);
  }
}

/** Reserves space: pointer events pass through it. */
class GlassPad extends Pad {
  public static override transparentToEvents = true;
}

describe("components transparent to events", () => {
  let graph: Graph;
  const pads: Record<string, Pad> = {};
  const keep =
    (id: string) =>
    (pad: Pad): void => {
      pads[id] = pad;
    };

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
    graph.cameraService.set({ x: 0, y: 0, scale: 1 });
    graph.addLayer(TestLayer, {
      children: [
        Pad.create({ id: "under", z: 300, width: 100 }, { key: "under", ref: keep("under") }),
        GlassPad.create({ id: "glass", z: 301, width: 300 }, { key: "glass", ref: keep("glass") }),
      ],
    });
    frames(5);
  });

  afterEach(() => graph.unmount());

  it("is skipped by getElementOverPoint and returned by getElementsOverPoint", () => {
    expect(graph.getElementOverPoint({ x: 50, y: 25 })).toBe(pads.under);
    const all = graph.getElementsOverPoint({ x: 50, y: 25 });
    expect(all[0]).toBe(pads.glass);
    expect(all[1]).toBe(pads.under);
    // Over the glass pad alone the point reaches nothing.
    expect(graph.getElementOverPoint({ x: 200, y: 25 })).toBeUndefined();
  });

  it("lets the pointer target, the hover and the hovered tag reach the component under it", () => {
    graph.getGraphLayer().handleEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 25 }));
    expect(graph.getGraphLayer().$hoveredComponent.value).toBe(pads.under);
    expect(graph.scene.tags.peekOf("pad", "under").has(hoveredTag)).toBe(true);
    expect(graph.scene.tags.peekOf("pad", "glass").has(hoveredTag)).toBe(false);
  });

  it("keeps its hit box in the usable rect and in rect queries", () => {
    expect(graph.hitTest.$usableRect.value).toEqual({ x: 0, y: 0, width: 300, height: 50 });
    expect(graph.getElementsOverRect({ x: 150, y: 0, width: 10, height: 10 }).includes(pads.glass)).toBe(true);
  });
});
```

Run: `pnpm --dir packages/graph exec jest src/components/canvas/GraphComponent/transparentToEvents.test.ts`
Expected: FAIL (`getElementOverPoint` returns the glass pad; the glass pad is hovered).

- [ ] **Step 2: Implement**

In `GraphComponent/index.ts`, after `public hitBox: HitBox;`:

```ts
  /**
   * Whether pointer events pass through components of this class (spec §5.1): the pointer's target, its hover, the
   * cursor and `graph.getElementOverPoint()` skip them for the component under them. Their hit box stays: it counts
   * in the usable rect, and `getElementsOverPoint()` and `getElementsOverRect()` return them. `onHitBox() => false`
   * instead keeps a component out of every hit query.
   */
  public static transparentToEvents = false;

  /** Whether pointer events pass through this component now; `static transparentToEvents` by default. */
  public isTransparentToEvents(): boolean {
    return (this.constructor as typeof GraphComponent).transparentToEvents;
  }
```

In `graph.ts`, replace `getElementOverPoint`:

```ts
  /**
   * Returns the topmost element at a world-space point that pointer events reach: components transparent to events
   * (`GraphComponent.transparentToEvents`) are skipped. GraphLayer targets the pointer with it.
   */
  public getElementOverPoint<T extends GraphComponentConstructor>(
    point: TPoint | CameraPoint,
    filter?: T[]
  ): InstanceType<T> | undefined {
    for (const item of this.getElementsOverPoint(point, filter)) {
      if (!(item instanceof GraphComponent) || !item.isTransparentToEvents()) return item;
    }
    return undefined;
  }
```

(import `GraphComponent` from `./components/canvas/GraphComponent` if `graph.ts` does not import it yet).

Run: `pnpm --dir packages/graph exec jest src/components/canvas/GraphComponent/transparentToEvents.test.ts`
Expected: PASS.

- [ ] **Step 3: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/components/canvas/GraphComponent src/graph.ts`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`
Expected: all pass.

- [ ] **Step 4: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph): components transparent to pointer events`).

---

### Task 6: Bounds grown by a style (ledger `progress.md:184`, `deferred-minors.md:24`)

A style row that scales circles or widens strokes (the theme's anchor hover ×1.8) grows the element's indexed bounds,
so the Canvas 2D interpreter's viewport query finds what it draws (spec §9: such primitives "are drawn and culled by
bounds"). The element keeps the bounds its component wrote; WebGL is unaffected (it does not cull). Costs (Codex 10,
Opus M4): the bounds are baked again only when the row's geometry values change (`styleGeometryKey`), not for a
colour-only change; development builds warn about a row with a `{ px }` width without `maxWorld`, whose grown bounds
take its width at the minimum camera scale. D3: an export whose own rules grow geometry (`toImage()` passes another
style list to `query()`) is not covered: the index holds the live styles' bounds, and such an export can crop the grown
part. That is a documented limitation (Task 12), not fixed.

**Files:**
- Modify: `packages/graph/src/lib/scene/style.ts` (+ `style.test.ts`): `styleGeometryKey`.
- Modify: `packages/graph/src/lib/scene/SceneStore.ts` (+ `SceneStore.test.ts`): `TNode.drawn`, `TNode.drawnKey`,
  `styledBounds`, `restyle`, `place`, the `{ px }` warning in `defineStyle`.

**Interfaces:**
- Produces: `styleGeometryKey(style)`; `SceneStore.query` finds an element by its styled bounds.
  `TSceneElement.bounds` is unchanged.

- [ ] **Step 1: The failing tests**

Add to `style.test.ts` (import `styleGeometryKey`):

```ts
it("keys the geometry a row changes: circle scales and stroke widths, nothing else", () => {
  expect(styleGeometryKey(undefined)).toBe("");
  expect(styleGeometryKey({ parts: { border: { color: "#f00" } }, raise: 1 })).toBe("");
  const scaled = styleGeometryKey({ parts: { anchor: { scale: 1.8, color: "#f00" } } });
  expect(scaled).not.toBe("");
  expect(styleGeometryKey({ parts: { anchor: { scale: 1.8, color: "#0f0" } } })).toBe(scaled);
  expect(styleGeometryKey({ parts: { anchor: { scale: 2 } } })).not.toBe(scaled);
  expect(styleGeometryKey({ base: { border: { width: 4 } } })).not.toBe("");
});
```

Add to `SceneStore.test.ts`:

```ts
describe("bounds grown by a style", () => {
  const dot = (): TSceneElementInput => ({
    id: "dot",
    zIndex: 1,
    x: 0,
    y: 0,
    bounds: { minX: -9, minY: -9, maxX: 9, maxY: 9 },
    primitives: [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: 9 }],
  });
  /** 13 to 15 units right of the dot's centre: outside its radius 9, inside 9 x 1.8 = 16.2. */
  const edge = (x = 0): { minX: number; minY: number; maxX: number; maxY: number } => ({
    minX: x + 13,
    minY: -1,
    maxX: x + 15,
    maxY: 1,
  });
  const ids = (store: SceneStore, rect = edge()): string[] => store.query(rect).map((element) => element.id);

  afterEach(() => jest.restoreAllMocks());

  it("finds an element whose row scales its circles past the bounds its component wrote", () => {
    const store = new SceneStore(100);
    store.add(dot());
    expect(ids(store)).toEqual([]);
    const hovered = store.defineStyle({ parts: { anchor: { scale: 1.8 } } });
    store.setStyle("dot", hovered);
    expect(ids(store)).toEqual(["dot"]);
    expect(store.get("dot")?.bounds).toEqual({ minX: -9, minY: -9, maxX: 9, maxY: 9 });
    store.setStyle("dot", 0);
    expect(ids(store)).toEqual([]);
  });

  it("follows a change of the row the element draws with, and skips the bake for a colour-only change", () => {
    const store = new SceneStore(100);
    store.add(dot());
    const row = store.defineStyle({ parts: { anchor: { color: "#ff0000" } } });
    store.setStyle("dot", row);
    expect(ids(store)).toEqual([]);
    store.replaceStyles(new Map([[row, { parts: { anchor: { scale: 1.8 } } }]]));
    expect(ids(store)).toEqual(["dot"]);
    const bake = jest.spyOn(SceneStore.prototype as unknown as { styledBounds(): unknown }, "styledBounds");
    store.replaceStyles(new Map([[row, { parts: { anchor: { scale: 1.8, color: "#00ff00" } } }]]));
    expect(bake).not.toHaveBeenCalled();
    expect(ids(store)).toEqual(["dot"]);
  });

  it("keeps the grown bounds through a move and drops them with primitives that fit", () => {
    const store = new SceneStore(100);
    store.add(dot());
    store.setStyle("dot", store.defineStyle({ parts: { anchor: { scale: 1.8 } } }));
    store.update("dot", { x: 100 });
    expect(ids(store, edge(100))).toEqual(["dot"]);
    store.update("dot", {
      primitives: [{ kind: "circle", part: "anchor", cx: 0, cy: 0, r: 2 }],
      bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
    });
    // 2 x 1.8 = 3.6: the edge is out of reach again.
    expect(ids(store, edge(100))).toEqual([]);
  });

  it("warns once in development builds about a { px } width without maxWorld", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = new SceneStore(100);
    store.defineStyle({ parts: { border: { width: { px: 2 } } } });
    store.defineStyle({ parts: { border: { width: { px: 3 } } } });
    store.defineStyle({ parts: { border: { width: { px: 2, maxWorld: 4 } } } });
    expect(warn.mock.calls.filter(([message]) => String(message).includes("maxWorld"))).toHaveLength(1);
  });
});
```

Run: `pnpm --dir packages/graph exec jest src/lib/scene/style.test.ts src/lib/scene/SceneStore.test.ts`
Expected: FAIL (`styleGeometryKey` is not a function; the grown dot is not found; no warning).

- [ ] **Step 2: Implement**

In `style.ts`:

```ts
const geometryKeys = new WeakMap<object, string>();

/**
 * The geometry a row changes when baked (`bakeElementStyle`): each part's circle `scale` and stroke `width`, as a
 * string; "" when it changes none. Two rows with one key bake the same bounds. Rows are immutable, so the key is
 * cached per row object.
 */
export function styleGeometryKey(style: TSceneStyle | undefined): string {
  if (!style) return "";
  const cached = geometryKeys.get(style);
  if (cached !== undefined) return cached;
  const entries: string[] = [];
  for (const [layer, values] of [
    ["base", style.base],
    ["parts", style.parts],
  ] as const) {
    if (!values) continue;
    for (const part of Object.keys(values).sort()) {
      const value = values[part];
      if (!value || (value.scale === undefined && value.width === undefined)) continue;
      entries.push(`${layer}:${part}:${value.scale ?? ""}:${JSON.stringify(value.width ?? null)}`);
    }
  }
  const key = entries.join("|");
  geometryKeys.set(style, key);
  return key;
}
```

In `SceneStore.ts`:
- imports: `bakeElementStyle` and `styleGeometryKey` from `./style`, `geometryBounds` from `./webgl/levelBounds`;
- add to `TNode`:

```ts
  /** The bounds the index holds while the element's row grows its geometry (a hover scale); undefined otherwise. */
  drawn: TTileRect | undefined;
  /** The `styleGeometryKey` `drawn` was baked with; "" while the row grows nothing. */
  drawnKey: string;
```

  and `drawn: undefined, drawnKey: ""` in the node literal of `add`;
- module level:

```ts
function sameRect(a: TTileRect | undefined, b: TTileRect | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

/** A row width `{ px }` without `maxWorld`: its world width at the minimum camera scale is px / 0.01. */
function hasUnboundedWidth(style: TSceneStyle): boolean {
  for (const values of [style.base, style.parts]) {
    if (!values) continue;
    for (const part of Object.keys(values)) {
      const width = values[part]?.width;
      if (typeof width === "object" && "px" in width && width.maxWorld === undefined) return true;
    }
  }
  return false;
}
```

- private methods:

```ts
  /** The element's bounds grown by the geometry its row bakes (a circle scale, a wider stroke); undefined if equal. */
  private styledBounds(element: TSceneElement): TTileRect | undefined {
    const style = this.styles[element.styleId];
    const baked = geometryBounds(bakeElementStyle(element.primitives, style));
    const { bounds } = element;
    if (
      !baked ||
      (baked.minX >= bounds.minX && baked.minY >= bounds.minY && baked.maxX <= bounds.maxX && baked.maxY <= bounds.maxY)
    ) {
      return undefined;
    }
    return {
      minX: Math.min(bounds.minX, baked.minX),
      minY: Math.min(bounds.minY, baked.minY),
      maxX: Math.max(bounds.maxX, baked.maxX),
      maxY: Math.max(bounds.maxY, baked.maxY),
    };
  }

  /**
   * Bakes the grown bounds again when the row's geometry key changed, or always with `force` (new primitives or
   * bounds), and indexes the element again when they changed. A row that grows nothing costs a key lookup.
   */
  private restyle(node: TNode, force = false): boolean {
    const key = styleGeometryKey(this.styles[node.element.styleId]);
    if (!force && key === node.drawnKey) return false;
    node.drawnKey = key;
    const drawn = key === "" ? undefined : this.styledBounds(node.element);
    if (sameRect(drawn, node.drawn)) return false;
    node.drawn = drawn;
    return true;
  }
```

- `place(node)`: index `node.drawn ?? element.bounds` instead of `element.bounds`;
- `useRow`: after `element.styleId = styleId;` add
  `const node = this.nodes.get(element.id); if (node && this.restyle(node)) this.place(node);`;
- `update`: replace the `place` condition by

```ts
    const reshaped = patch.primitives !== undefined || patch.bounds !== undefined;
    const regrown = reshaped && node.drawnKey !== "" && this.restyle(node, true);
    if (regrown || patch.x !== undefined || patch.y !== undefined || patch.bounds !== undefined) this.place(node);
```

- `replaceStyles`: inside the loop over `changes`, before `const fields = this.styleFields(previous, style);`, add

```ts
      if (styleGeometryKey(previous) !== styleGeometryKey(style)) {
        this.styleUsers.get(id)?.forEach((elementId) => {
          const node = this.nodes.get(elementId);
          if (node && this.restyle(node)) this.place(node);
        });
      }
```

- a field next to `freeStyles`: `/** Whether a { px } width without maxWorld was reported (once per store). */`
  `private warnedUnboundedWidth = false;`;
- `defineStyle`: first line, add

```ts
    if (!this.warnedUnboundedWidth && isDevelopmentBuild() && hasUnboundedWidth(style)) {
      this.warnedUnboundedWidth = true;
      console.warn(
        "A style rule sets a { px } width without maxWorld: the culling bounds of elements drawn with it take that " +
          "width at the minimum camera scale (px / 0.01 world units). Give the width a maxWorld."
      );
    }
```

  (`isDevelopmentBuild` is imported by the store already; one warning per store, so each test's store reports
  its own).

Run: `pnpm --dir packages/graph exec jest src/lib/scene`
Expected: PASS.

- [ ] **Step 3: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/lib/scene/style.ts src/lib/scene/SceneStore.ts`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`
Expected: all pass.

- [ ] **Step 4: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `fix(graph): a style that scales or widens primitives widens their culling bounds`).

---

### Task 7: The evented-area API goes; children in the browser (e2e, check C32)

D2. The render-time evented areas go: `EventedComponent.eventedArea()` with its hover tracking and dispatch, the area
types, GraphLayer's calls, the hit data kept for them, and `apps/e2e/tests/evented-area.spec.ts` (22 tests). No
library component, story, bench or Nirvana source registers areas (facts §1, §9); the migration guide gives the
recipe (Task 12). Child scene components (Task 3) cover their use; this task tests them in the browser and on both
renderers.

**Files:**
- Modify: `packages/graph/src/components/canvas/EventedComponent/EventedComponent.ts`: remove `_eventedAreas`,
  `_lastHitBoxData`, `_hoveredEventedAreaKey`, `_prevHoveredAreaLeaveHandler`, the `willRender`/`didRender`
  overrides, `_areaHitTest`, `_trackAreaHover`, `_clearAreaHover`, `eventedArea`, the area branches of `_fireEvent` and
  `_hasListener`, `createSyntheticHoverEvent`, `TEventedAreaState`, `TEventedAreaParams`, `TEventedArea`, and the
  imports only they used (`intersects`, `HitBoxData`, `TRect`).
- Modify: `packages/graph/src/components/canvas/GraphComponent/index.ts`: `onHitBox` no longer stores the hit data.
- Modify: `packages/graph/src/components/canvas/layers/graphLayer/GraphLayer.ts`: drop the `_trackAreaHover()` call
  (`:184`) and the `_clearAreaHover(true)` call (`:292`).
- Modify: `packages/graph/src/index.ts`: `export { GraphComponent, type TGraphComponentProps } from
  "./components/canvas/GraphComponent";` (child components take these props).
- Modify: `packages/graph/src/components/canvas/EventedComponent/EventedComponent.test.ts`: the area half of its
  second test goes.
- Delete: `apps/e2e/tests/evented-area.spec.ts`.
- Create: `apps/e2e/tests/scene-children.spec.ts`.
- Modify: `scripts/bench/culling/scene/slice.ts` (check C32, header comment), `scripts/bench/culling/README.md`.

**Interfaces:**
- Removes: `EventedComponent.eventedArea(fn, params)`, `_trackAreaHover()`, `_clearAreaHover()`, `_eventedAreas`,
  `_lastHitBoxData`, `TEventedAreaState`, `TEventedAreaParams`.
- Consumes: child scene components and the event model of D5 (Task 3), hit levels (Task 4), `hoveredTag`.

- [ ] **Step 1: Remove the API**

In `EventedComponent.ts`, delete the members and types listed under Files. `_fireEvent` keeps its first part:

```ts
  protected _fireEvent(cmp: object, event: Event) {
    if (this._isMutedByInteractivity(cmp, event.type)) {
      return;
    }
    const handlers = listeners.get(cmp)?.get?.(event.type);

    handlers?.forEach((cb) => {
      if (typeof cb === "function") {
        return cb(event);
      } else if (cb instanceof EventedComponent) {
        return cb.handleEvent(event);
      }
      return cb.handleEvent(event);
    });
  }
```

and `_hasListener` becomes `return listeners.get(comp)?.has?.(type) ?? false;`.

In `GraphComponent/index.ts`, `onHitBox` becomes:

```ts
  public onHitBox(_data: HitBoxData) {
    return this.isIterated();
  }
```

In `GraphLayer.ts`, delete the `this.targetComponent?._trackAreaHover();` line of the `mousemove` branch of
`handleEvent` and the `this.prevTargetComponent?._clearAreaHover(true);` line of `onRootPointerMove`,
both kept by Task 3 until now.

In `EventedComponent.test.ts`, delete `registerArea` from `TestComponent` and the `TEventedAreaParams` import, and
replace the second test with:

```ts
test("a graph hover event reaches its listener, and none after unmount", () => {
  const parent = new Component({});
  const child = new TestComponent({}, parent);
  const listener = jest.fn();
  child.addEventListener("mouseenter", listener);
  const event = new CustomEvent("mouseenter", { detail: { sourceEvent: new MouseEvent("mousemove") } });
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledWith(event);
  Component.unmount(child);
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(1);
  Component.unmount(parent);
});
```

Delete `apps/e2e/tests/evented-area.spec.ts`.

Run: `grep -rn "eventedArea\|_trackAreaHover\|_clearAreaHover\|_lastHitBoxData\|TEventedArea" packages/*/src apps scripts --include='*.ts' --include='*.tsx' | grep -v /dist/`
Expected: no output (docs are Task 12's). Then `pnpm --dir packages/graph exec jest src/components/canvas` passes.

- [ ] **Step 2: The e2e spec**

Create `apps/e2e/tests/scene-children.spec.ts`:

```ts
import type { ChildDescriptor, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";
import { expect, test } from "@playwright/test";

import { GraphConfig, GraphPageObject } from "../page-objects/GraphPageObject";

type TChildWindow = { __childLog: string[] };
type TButtonProps = TGraphComponentProps & { id: string; stop: boolean };

/** Blocks with a child scene component: a run button at the top right, drawn on the schematic and detailed levels. */
class SceneChildrenPageObject extends GraphPageObject {
  protected async setupGraph(config: GraphConfig): Promise<void> {
    await this.page.evaluate((cfg) => {
      const rootEl = document.getElementById("root");
      if (!(rootEl instanceof HTMLDivElement)) throw new Error("Root element not found");
      const { CanvasBlock, Graph, SceneComponent, pointerTargetAfter } = window.GraphModule;
      const w = window as unknown as TChildWindow;
      w.__childLog = [];

      /** Whether an event's target is a run button, for the block's log. */
      const kindOf = (event: Event): string =>
        (event as CustomEvent<{ target?: unknown }>).detail?.target instanceof RunButton ? "button" : "block";

      /**
       * A 40 x 30 button 8 units in from the block's top right; `stop` stops its clicks there. It tags itself while it
       * is the target (the recipe for a child, D5).
       */
      class RunButton extends SceneComponent<{ width: number }, TButtonProps> {
        public static override entityType = "runButton";

        public override readonly cursor = "pointer";

        protected override willMount(): void {
          super.willMount();
          for (const type of ["click", "mouseenter", "mouseleave"] as const) {
            this.addEventListener(type, (event: Event) => {
              w.__childLog.push(`button:${type}:${this.props.id}:${kindOf(event)}`);
              if (type === "click" && this.props.stop) event.stopPropagation();
              if (type !== "click") this.setHoveredTag(pointerTargetAfter(event) === this);
            });
          }
        }

        public override getEntityId(): string {
          return this.props.id;
        }

        protected override getViewData(): { width: number } {
          const block = this.getParent();
          const view = block instanceof SceneComponent ? block.readSceneView() : undefined;
          return { width: (view as { width?: number } | undefined)?.width ?? 200 };
        }

        protected override minimalistic(): readonly TScenePrimitive[] {
          return [];
        }

        protected override schematic(view: { width: number }): readonly TScenePrimitive[] {
          return [{ kind: "rect", part: "button", x: view.width - 48, y: 8, width: 40, height: 30 }];
        }
      }

      class ButtonBlock extends CanvasBlock {
        protected override willMount(): void {
          super.willMount();
          for (const type of ["click", "mouseenter", "mouseleave"] as const) {
            this.addEventListener(type, (event: Event) => {
              w.__childLog.push(`block:${type}:${this.props.id}:${kindOf(event)}`);
            });
          }
        }

        protected override updateChildren(): ChildDescriptor[] {
          const id = String(this.props.id);
          return [RunButton.create({ id, stop: id === "block-2" }, { key: "run" }), ...super.updateChildren()];
        }
      }

      const graph = new Graph({ ...cfg, settings: { ...cfg.settings, blockComponents: { ButtonBlock } } }, rootEl);
      if (cfg.blocks || cfg.connections) graph.setEntities({ blocks: cfg.blocks, connections: cfg.connections });
      graph.start();
      graph.zoomTo("center");
      window.graph = graph;
      window.graphInitialized = true;
    }, config);
  }

  public async log(): Promise<string[]> {
    return this.page.evaluate(() => [...(window as unknown as TChildWindow).__childLog]);
  }

  public async resetLog(): Promise<void> {
    await this.page.evaluate(() => {
      (window as unknown as TChildWindow).__childLog = [];
    });
  }

  public async hovered(type: string, id: string): Promise<boolean> {
    return this.page.evaluate(
      ({ entityType, entityId }) => {
        const { hoveredTag } = window.GraphModule;
        return window.graph.scene.tags.peekOf(entityType, entityId).has(hoveredTag);
      },
      { entityType: type, entityId: id }
    );
  }

  public async rootCursor(): Promise<string> {
    return this.page.evaluate(() => document.getElementById("root")?.style.cursor ?? "");
  }
}

const makeBlock = (id: string, x: number) => ({
  id,
  is: "ButtonBlock",
  x,
  y: 100,
  width: 200,
  height: 100,
  name: id,
  anchors: [],
});

/** The button of a block at x: world x + 152..192, y 108..138. */
const button = (x: number) => ({ x: x + 172, y: 123 });
const body = (x: number) => ({ x: x + 60, y: 170 });

test.describe("child scene components", () => {
  let po: SceneChildrenPageObject;

  test.beforeEach(async ({ page }) => {
    po = new SceneChildrenPageObject(page);
    await po.initialize({ blocks: [makeBlock("block-1", 100), makeBlock("block-2", 400)], connections: [] });
    await po.camera().zoomToScale(0.5);
    await page.mouse.move(1, 1);
    await po.waitForFrames(3);
    await po.resetLog();
  });

  test("a click on the button runs its handler and bubbles to its block; on the body, the block's only", async () => {
    await po.clickAt(button(100));
    await po.clickAt(body(100));
    // The button's handler first, then the block's through bubbling (target: the button); then the body's click.
    expect((await po.log()).filter((entry) => entry.includes(":click:"))).toEqual([
      "button:click:block-1:button",
      "block:click:block-1:button",
      "block:click:block-1:block",
    ]);
  });

  test("a button that stops its click keeps it from its block", async () => {
    await po.clickAt(button(400));
    expect((await po.log()).filter((entry) => entry.includes(":click:"))).toEqual(["button:click:block-2:button"]);
  });

  test("hover events bubble from the button to its block, with the target in their detail (D5)", async () => {
    await po.hoverAt(body(100));
    expect(await po.log()).toEqual(["block:mouseenter:block-1:block"]);
    await po.resetLog();
    await po.hoverAt(button(100));
    // The block's own leave (its relatedTarget is the button), then the button's enter, bubbling up to the block.
    expect(await po.log()).toEqual([
      "block:mouseleave:block-1:block",
      "button:mouseenter:block-1:button",
      "block:mouseenter:block-1:button",
    ]);
    await po.resetLog();
    await po.hoverAt(body(100));
    expect(await po.log()).toEqual([
      "button:mouseleave:block-1:button",
      "block:mouseleave:block-1:button",
      "block:mouseenter:block-1:block",
    ]);
    await po.hoverAt(button(100));
    await po.resetLog();
    await po.hoverAt({ x: 900, y: 600 });
    expect(await po.log()).toEqual(["button:mouseleave:block-1:button", "block:mouseleave:block-1:button"]);
  });

  test("the block stays tagged over its button, the button while it is the target; the cursor follows it", async () => {
    await po.hoverAt(button(100));
    await po.waitForFrames(2);
    expect(await po.hovered("runButton", "block-1")).toBe(true);
    expect(await po.hovered("block", "block-1")).toBe(true);
    await expect.poll(() => po.rootCursor()).toBe("pointer");
    await po.hoverAt(body(100));
    await po.waitForFrames(2);
    expect(await po.hovered("runButton", "block-1")).toBe(false);
    expect(await po.hovered("block", "block-1")).toBe(true);
  });

  test("the button is not hit on the minimalistic level, where it draws nothing", async () => {
    await po.camera().zoomToScale(0.1);
    await po.waitForFrames(3);
    await po.resetLog();
    await po.clickAt(button(100));
    expect((await po.log()).filter((entry) => entry.includes(":click:"))).toEqual(["block:click:block-1:block"]);
  });
});
```

`clickAt` and `hoverAt` take world points. Run (outside the sandbox, through the lock):
`pnpm --filter @gravity-ui/graph-e2e exec playwright test tests/scene-children.spec.ts --reporter=line`
Expected: 5 passed. If `zoomToScale(0.1)` lands below the camera's minimum scale, use the minimum (any scale below
`SCALES[1]` = 0.225 is minimalistic).

- [ ] **Step 3: GPU check C32**

In `scripts/bench/culling/scene/slice.ts`:
- extend the imports: `import { Anchor, CanvasBlock, Graph, SceneComponent, hoveredTag, pointerTargetAfter } from "GRAPH";` and
  `import type { ChildDescriptor, TAnchor, TAnchorClass, TGraphComponentProps, TSceneLevel } from "GRAPH";` (this task exports `TGraphComponentProps`: drop C31's `GRAPH_SRC` import of it);
- the header comment reads "checks C1-C32" (Task 8 raises it);
- at module level:

```ts
/** C32: a 50 x 30 button at the block's bottom right, drawn on the schematic level, filled #00aaff. */
class SliceButton extends SceneComponent<{ width: number }, TGraphComponentProps & { id: string }> {
  public static override entityType = "sliceButton";

  protected override willMount(): void {
    super.willMount();
    // It tags itself while it is the target (D5: no library default does it).
    const follow = (event: Event): void => this.setHoveredTag(pointerTargetAfter(event) === this);
    this.addEventListener("mouseenter", follow);
    this.addEventListener("mouseleave", follow);
  }

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override getViewData(): { width: number } {
    const block = this.getParent();
    const view = block instanceof SceneComponent ? block.readSceneView() : undefined;
    return { width: (view as { width?: number } | undefined)?.width ?? 200 };
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(view: { width: number }): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "button", x: view.width - 50, y: 70, width: 50, height: 30, fill: "#00aaff" }];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return [];
  }
}

/** C32: the button before the anchors, so the OUT anchor draws over it. */
class SliceChildBlock extends CanvasBlock {
  public button?: SliceButton;

  protected override updateChildren(): ChildDescriptor[] {
    const button = SliceButton.create(
      { id: String(this.props.id) },
      {
        key: "button",
        ref: (component: SliceButton): void => {
          this.button = component;
        },
      }
    );
    return [button, ...super.updateChildren()];
  }
}
```

- after the C31 check (Task 3):

```ts
  // C32: child scene components. Block CH (x 0..200, y 2000..2100) has a button child at world (150..200,
  // 2070..2100) and its OUT anchor at (200, 2088), a later child. At scale 0.5 (schematic): the button draws over CH's
  // body and under the anchor, as Canvas2D draws them; the button's own hover event (as GraphLayer dispatches it to a
  // target) makes it tag itself, and a `hoveredTag` rule recolours its part, with no re-encode.
  await check("C32", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C32");
    const scale = 0.5;
    graph.updateSettings({ useBlocksAnchors: true, blockComponents: { SliceChild: SliceChildBlock } });
    graph.setColors({ anchor: { background: "#ff00ff" } });
    const removeRules = graph.scene.styles.add([
      { target: SliceButton, tags: [hoveredTag], style: { parts: { button: { color: "#ff8800" } } } },
    ]);
    graph.setEntities({
      blocks: [
        {
          id: "CH",
          is: "SliceChild",
          name: "Children",
          x: 0,
          y: 2000,
          width: 200,
          height: 100,
          anchors: [{ id: "o", blockId: "CH", type: "OUT" }],
        },
      ],
      connections: [],
    });
    camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 2000 * scale });
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const view = graph.rootStore.blocksList.getBlockState("CH")?.getViewComponent();
      const child = view instanceof SliceChildBlock ? view.button : undefined;
      if (!child) throw new Error("C32: no button child");
      const body = againstCanvas2D(40, 2020, 20, 10);
      const buttonRegion = againstCanvas2D(160, 2072, 20, 6);
      const overlap = againstCanvas2D(195, 2086, 3, 3);
      const buttonBefore = pixelAt(165, 2075);
      const anchorOverButton = pixelAt(196, 2088);
      const encodes = stats.encodes;
      child.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: child, relatedTarget: view } }));
      for (let i = 0; i < 3; i++) graph.scheduler.performUpdate();
      const buttonHovered = pixelAt(165, 2075);
      const hoverEncodes = stats.encodes - encodes;
      const worst = Math.max(body.worst, buttonRegion.worst, overlap.worst);
      record(
        "C32",
        worst <= TOLERANCE &&
          near(buttonBefore, hex("#00aaff")) &&
          near(anchorOverButton, hex("#ff00ff")) &&
          near(buttonHovered, hex("#ff8800")) &&
          hoverEncodes === 0,
        `worst channel difference from Canvas2D=${worst} (body ${body.worst}, button ${buttonRegion.worst}, anchor ` +
          `over button ${overlap.worst}); button ${show(buttonBefore)} (want #00aaff), anchor over it ` +
          `${show(anchorOverButton)} (want #ff00ff), hovered ${show(buttonHovered)} (want #ff8800); encodes on ` +
          `hover=${hoverEncodes} (want 0)`
      );
    } finally {
      removeRules();
      graph.setEntities({ blocks: [], connections: [] });
      graph.updateSettings({ blockComponents: {} });
      graph.setColors({ anchor: { background: initGraphColors.anchor.background } });
      setCamera(1);
    }
  });
```

- in `scripts/bench/culling/README.md`, add: "C32 — child scene components: a button child draws over its block and
  under its anchor as Canvas2D does; a hovered rule recolours it without re-encoding."

Run (outside the sandbox, through the lock): `node scripts/bench/culling/scene-slice.mjs`
Expected: C1–C32 PASS.

- [ ] **Step 4: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/components/canvas/EventedComponent src/components/canvas/GraphComponent src/components/canvas/layers/graphLayer src/index.ts`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`,
`pnpm run lint` (covers the e2e spec)
Expected: all pass.

- [ ] **Step 5: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph)!: remove render-time evented areas; e2e and GPU check for child scene components`).

---

### Task 8: The handover to HTML follows the level and the view's mount

Settled item 3, D4, В4 (а); re-review findings 3 (the presence part), 6 (holds) and 7 (red first).

The block is handed over while an HTML view holds it and the scene is at the detailed level. The view takes the hold
with `delegateRender`; graph-react's `GraphBlock` calls it once its HTML mounted, also when it keeps the canvas drawn
(`autoHideCanvas={false}` with `canvasVisible` true or unset). Its HTML (an anchor's, for example) is then shown, so
D4 hits what it shows.

ReactLayer switches its HTML at the end of the graph frame (`graph.scene.onFrameEnd`, Task 3), after every layer and
the scene updated, whatever the layer order (re-attaching GraphLayer moves it after ReactLayer:
`LayersService.ts:75-86`). So the frame that hides the HTML draws the blocks it held.

`setRenderDelegated` stays the low-level switch. One predicate covers both writers: `isRenderDelegated()` is true after
`setRenderDelegated(true)` and while a holding view asks for `canvasVisible: false`. Any such view hides the block, so
two views that disagree hide it. `hidden` no longer means "held by HTML": Nirvana's `NirvanaBaseBlock.ts:253-262`
reads it (migration row in Task 12).

D4: while an HTML view holds the block, the block and its children are shown outside the scene, so they are hit on
every level (Task 4). A click on an anchor's HTML bubbles to the graph root and GraphLayer targets the anchor's
component, so the graph's `click` event names it. Taking or releasing a hold changes what a stationary pointer hits:
both request a retarget (settled item 11).

**Files:**
- Modify: `packages/graph/src/components/canvas/blocks/Block.ts`: `THtmlViewRequest`, `delegateRender`,
  `isHeldByHtml`, `isRenderDelegated`, `isShownOutsideScene`, `isSceneHidden`, `isRenderAllowed`,
  `createExportAnchors`, `unmount`, the `blockHidden` comment.
- Modify: `packages/graph/src/index.ts`: `type THtmlViewRequest` with the block exports.
- Modify: `packages/graph-react/src/Block.tsx` (the effect, the props' TSDoc), `packages/graph-react/src/layer/ReactLayer.tsx`.
- Modify: `packages/graph-react/src/layer/ReactLayer.test.ts`: the four level tests (`:375-438`) run a graph frame.
- Test: `apps/e2e/tests/block/block-render-delegated.spec.ts` (one test, red first),
  `packages/graph/src/components/canvas/blocks/handover.test.ts` (create),
  `packages/graph-react/src/handover.test.tsx` (create), `scripts/bench/culling/scene/slice.ts` (C33).

**Interfaces:**
- Produces (Shared names): `THtmlViewRequest`, `Block.delegateRender(request): () => void`, `Block.isHeldByHtml()`,
  `Block.isRenderDelegated()`, `Block.isShownOutsideScene()`.
- Consumes: `GraphComponent.isRenderDelegated()`, `SceneComponent.isShownOutsideScene()` (Task 4),
  `graph.scene.onFrameEnd` and `requestRetarget` (Task 3).

- [ ] **Step 1: The frame-output e2e and GPU check C33, red first**

Add to `apps/e2e/tests/block/block-render-delegated.spec.ts`, in "Zoom transition":

```ts
  test("zooming out leaves no frame without block-1, whichever rAF callback changes the camera", async ({ page }) => {
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);
    await page.evaluate(() => {
      const graph = window.graph;
      /** What shows block-1 now: its HTML (not in a hidden layer) and the scene canvas at its centre (alpha > 0). */
      (window as unknown as { shown(): { html: boolean; canvas: boolean } }).shown = () => {
        const html = document.querySelector("[data-testid='block-block-1']");
        const geometry = graph.rootStore.blocksList.getBlockState("block-1")?.$geometry.value;
        const canvas = graph.scene.layer.getCanvas();
        const ctx = canvas?.getContext("2d");
        const camera = graph.cameraService.getCameraState();
        const dpr = graph.layers.getDPR();
        let drawn = false;
        if (geometry && ctx) {
          const x = ((geometry.x + geometry.width / 2) * camera.scale + camera.x) * dpr;
          const y = ((geometry.y + geometry.height / 2) * camera.scale + camera.y) * dpr;
          drawn = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] > 0;
        }
        return { html: html !== null && html.closest(".layer-hidden") === null, canvas: drawn };
      };
    });
    type TShownWindow = { shown(): { html: boolean; canvas: boolean } };

    // Ordering 1: the camera changes right before the graph frame (one task: the change, then the frame).
    const first = await graphPO.evaluate((graph) => {
      const shown = (window as unknown as TShownWindow).shown;
      const { width, height } = graph.cameraService.getCameraState();
      graph.cameraService.zoom(width / 2, height / 2, 0.3);
      const beforeFrame = shown();
      graph.scheduler.performUpdate();
      return { beforeFrame, afterFrame: shown() };
    });
    expect(first.beforeFrame.html || first.beforeFrame.canvas).toBe(true);
    expect(first.afterFrame).toEqual({ html: false, canvas: true });

    // Back to detailed, then ordering 2: the camera changes in a rAF callback after the graph's own frame callback,
    // so the browser paints that frame before the graph draws again.
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    const second = await page.evaluate(
      () =>
        new Promise<{ html: boolean; canvas: boolean }>((resolve) => {
          requestAnimationFrame(() => {
            const graph = window.graph;
            const { width, height } = graph.cameraService.getCameraState();
            graph.cameraService.zoom(width / 2, height / 2, 0.3);
            resolve((window as unknown as TShownWindow).shown());
          });
        })
    );
    expect(second.html || second.canvas).toBe(true);
    await graphPO.waitForFrames(1);
    expect(await page.evaluate(() => (window as unknown as TShownWindow).shown())).toEqual({
      html: false,
      canvas: true,
    });
  });
```

Update the spec's header comment: "GraphBlock hands the block over with `delegateRender` once its HTML
mounted; the core hides it only at the detailed level, and ReactLayer switches its HTML at the graph frame's end."

Run it on the tree before this task (outside the sandbox, through the lock):
`pnpm --filter @gravity-ui/graph-e2e exec playwright test tests/block/block-render-delegated.spec.ts --reporter=line`
Expected: the 10 existing tests pass and the new one fails. In the first ordering, `beforeFrame` has neither the HTML
(ReactLayer hid it synchronously) nor the canvas, or `afterFrame.canvas` is false. This is the blank frame of facts
§2, an inference this test measures. Record which assertion failed in the task report.

In `scripts/bench/culling/scene/slice.ts`, after C32 (the header comment reads "checks C1-C33"):

```ts
  // C33: the handover. Block H (x 0..200, y 2500..2600) is held by an HTML view (`delegateRender`) at scale 1
  // (detailed): its body is not drawn, with no re-encode. Zooming out to 0.5 draws it in the first graph frame after
  // the camera change (pixelAt runs exactly one), zooming back in hides it again, and the release draws it.
  await check("C33", async () => {
    const stats = layer.getBackend()?.stats;
    if (!stats) throw new Error("no backend in C33");
    const bodyColor = hex(initGraphColors.block.background);
    const lookAt = (scale: number): void => camera.set({ scale, x: ORIGIN.x, y: ORIGIN.y - 2500 * scale });
    graph.setEntities({
      blocks: [{ id: "H", is: "Block", name: "Held", x: 0, y: 2500, width: 200, height: 100, anchors: [] }],
      connections: [],
    });
    lookAt(1);
    for (let i = 0; i < 6; i++) graph.scheduler.performUpdate();
    try {
      const view = graph.rootStore.blocksList.getBlockState("H")?.getViewComponent();
      if (!view) throw new Error("C33: no block view");
      const drawn = pixelAt(50, 2550);
      const encodes = stats.encodes;
      // Run red first (re-review 11): before Step 3 the tree's handover is the ungated `setRenderDelegated`.
      const holder = view as unknown as { delegateRender?: (request: { canvasVisible: boolean }) => () => void };
      let release: () => void;
      if (holder.delegateRender) release = holder.delegateRender({ canvasVisible: false });
      else {
        view.setRenderDelegated(true);
        release = (): void => view.setRenderDelegated(false);
      }
      const held = pixelAt(50, 2550);
      const holdEncodes = stats.encodes - encodes;
      lookAt(0.5);
      const zoomedOut = pixelAt(50, 2550);
      lookAt(1);
      const back = pixelAt(50, 2550);
      release();
      const released = pixelAt(50, 2550);
      record(
        "C33",
        near(drawn, bodyColor) &&
          !near(held, bodyColor) &&
          holdEncodes === 0 &&
          near(zoomedOut, bodyColor) &&
          !near(back, bodyColor) &&
          near(released, bodyColor),
        `body drawn ${show(drawn)}, held ${show(held)} (want no body), re-encodes on hold=${holdEncodes} (want 0), ` +
          `first frame at 0.5 ${show(zoomedOut)} (want the body), back at 1 ${show(back)} (want no body), released ` +
          `${show(released)} (want the body ${initGraphColors.block.background})`
      );
    } finally {
      graph.setEntities({ blocks: [], connections: [] });
      setCamera(1);
    }
  });
```

and a README line: "C33 — the handover: a block an HTML view holds is not drawn at the detailed level, with no
re-encode, and is drawn in the first frame after a zoom-out."

Run (outside the sandbox, through the lock): `node scripts/bench/culling/scene-slice.mjs`
Expected: C33 FAILS, and only C33, at "first frame at 0.5": the ungated hold keeps the block hidden after the zoom-out.
Record the failing line.

- [ ] **Step 2: The failing core tests**

Create `packages/graph/src/components/canvas/blocks/handover.test.ts`:

```ts
import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";
import { hoveredTag } from "../../../services/tags/builtinTags";
import { entityKey } from "../../../services/tags/TagStore";
import { anchorEntityId } from "../../../store/anchor/anchorEntityId";

import { Block } from "./Block";
import type { TBlock } from "./Block";
import { LegacyCanvasBlock } from "./LegacyCanvasBlock";

const block = (id: string, x: number, is = "Block"): TBlock => ({
  id,
  is,
  name: id,
  x,
  y: 100,
  width: 200,
  height: 100,
  anchors: [{ id: "out", blockId: id, type: "OUT" }],
});

/** One graph frame: layers, the scene and the frame-end listeners. */
function frame(): void {
  globalScheduler.performUpdate();
}

describe("the handover to HTML (delegateRender)", () => {
  let graph: Graph;
  let root: HTMLDivElement;
  const view = (id: string): Block => {
    const component = graph.rootStore.blocksList.getBlockState(id)?.getViewComponent();
    if (!component) throw new Error(`no view for ${id}`);
    return component;
  };
  const element = (id: string): ReturnType<Graph["scene"]["store"]["get"]> =>
    graph.scene.store.get(entityKey("block", id));
  const at = (scale: number): void => graph.cameraService.set({ x: 0, y: 0, scale });

  beforeEach(() => {
    root = document.createElement("div");
    Object.defineProperties(root, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    graph = new Graph(
      { settings: { useBlocksAnchors: true, blockComponents: { Legacy: LegacyCanvasBlock } } },
      root
    );
    graph.start();
    at(1);
    graph.setEntities({ blocks: [block("a", 100), block("legacy", 400, "Legacy")], connections: [] });
    for (let i = 0; i < 5; i++) frame();
  });

  afterEach(() => graph.unmount());

  it("hides a block an HTML view holds at the detailed level, with its anchors, and keeps its hit box", () => {
    const release = view("a").delegateRender({ canvasVisible: false });
    frame();
    expect(element("a")?.hidden).toBe(true);
    const [anchor] = graph.scene.store.childrenOf(entityKey("block", "a"));
    expect(anchor !== undefined && graph.scene.store.isDrawnHidden(anchor)).toBe(true);
    expect([view("a").isHeldByHtml(), view("a").isRenderDelegated(), view("a").isShownOutsideScene()]).toEqual([
      true,
      true,
      true,
    ]);
    // `hidden` is no longer the handover's flag.
    expect((view("a") as unknown as { hidden: boolean }).hidden).toBe(false);
    expect(graph.getElementOverPoint({ x: 150, y: 150 })).toBe(view("a"));
    release();
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect((view("a") as unknown as { htmlViews?: unknown }).htmlViews).toBeUndefined();
  });

  it("draws it in the first frame after the level leaves detailed, and hides it when the level returns", () => {
    view("a").delegateRender({ canvasVisible: false });
    frame();
    at(0.5);
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect([view("a").isHeldByHtml(), view("a").isRenderDelegated()]).toEqual([false, false]);
    at(1);
    frame();
    expect(element("a")?.hidden).toBe(true);
  });

  it("keeps drawing while the views ask for canvasVisible, and hides it while any view does not", () => {
    const visible = view("a").delegateRender({ canvasVisible: true });
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect([view("a").isHeldByHtml(), view("a").isRenderDelegated()]).toEqual([true, false]);
    const hidden = view("a").delegateRender({ canvasVisible: false });
    frame();
    expect(element("a")?.hidden).toBe(true);
    hidden();
    frame();
    expect(element("a")?.hidden).toBe(false);
    visible();
  });

  it("stays handed over while any view holds it; a release runs once", () => {
    const first = view("a").delegateRender({ canvasVisible: false });
    const second = view("a").delegateRender({ canvasVisible: false });
    first();
    first();
    frame();
    expect(element("a")?.hidden).toBe(true);
    second();
    frame();
    expect(element("a")?.hidden).toBe(false);
  });

  it("keeps the low-level setRenderDelegated switch, without the level rule", () => {
    view("a").setRenderDelegated(true);
    at(0.5);
    frame();
    expect(element("a")?.hidden).toBe(true);
    expect([view("a").isRenderDelegated(), view("a").isHeldByHtml()]).toEqual([true, false]);
    view("a").setRenderDelegated(false);
    frame();
    expect(element("a")?.hidden).toBe(false);
  });

  it("keeps a handed-over block's view data current", () => {
    view("a").delegateRender({ canvasVisible: false });
    frame();
    graph.api.updateBlock({ id: "a", name: "renamed" });
    frame();
    const texts = (element("a")?.primitives ?? []).flatMap((primitive) =>
      primitive.kind === "text" ? [primitive.text] : []
    );
    expect(texts).toContain("renamed");
  });

  it("does not paint a handed-over LegacyCanvasBlock on the GraphLayer canvas", () => {
    const legacy = view("legacy");
    const render = jest.spyOn(legacy as unknown as { render(): void }, "render");
    graph.getGraphLayer().performRender();
    frame();
    expect(render).toHaveBeenCalled();
    render.mockClear();
    legacy.delegateRender({ canvasVisible: false });
    graph.getGraphLayer().performRender();
    frame();
    expect(render).not.toHaveBeenCalled();
    expect(legacy.isRendered()).toBe(false);
  });

  it("emits the graph's click on the anchor when its HTML is clicked at the detailed level (D4)", () => {
    // The anchor's point: the OUT anchor of "a", at (300, 188); at scale 1 and the origin, world = client.
    const html = document.createElement("div");
    root.appendChild(html);
    const targets: unknown[] = [];
    const off = graph.on("click", (event) => {
      targets.push(event.detail.target);
    });
    const click = (): void => {
      for (const type of ["mousedown", "mouseup", "click"]) {
        html.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 300, clientY: 188 }));
      }
    };
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    click();
    // Without an HTML view nothing shows the anchor at the detailed level: the block is the target.
    expect(targets.length === 1 && targets[0] === view("a")).toBe(true);
    view("a").delegateRender({ canvasVisible: false });
    frame();
    click();
    expect(targets[1]).toBe(anchor);
    off();
  });

  it("registers a view that keeps the canvas drawn: the block is drawn and its anchors are hit (D4)", () => {
    const release = view("a").delegateRender({ canvasVisible: true });
    frame();
    expect(element("a")?.hidden).toBe(false);
    expect([view("a").isHeldByHtml(), view("a").isShownOutsideScene()]).toEqual([true, true]);
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    expect(graph.getElementOverPoint({ x: 300, y: 188 })).toBe(anchor);
    release();
  });

  it("finds the target again when the hold is released during a drag, at the drag's release (D5)", () => {
    const release = view("a").delegateRender({ canvasVisible: false });
    frame();
    const anchor = graph.rootStore.blocksList.getBlockState("a")?.getAnchorById("out")?.getViewComponent();
    if (!anchor) throw new Error("no anchor");
    const block = view("a");
    const nameOf = (target: unknown): string => {
      if (target === anchor) return "anchor";
      return target === block ? "block" : "none";
    };
    const log: string[] = [];
    const record =
      (who: string) =>
      (event: Event): void => {
        log.push(`${who}:${event.type}:${nameOf((event as CustomEvent<{ target?: unknown }>).detail?.target)}`);
      };
    anchor.addEventListener("mouseleave", record("anchor"));
    block.addEventListener("mouseenter", record("block"));
    block.addEventListener("mouseleave", record("block"));
    const tagged = (): boolean[] => [
      graph.scene.tags.peekOf("block", "a").has(hoveredTag),
      graph.scene.tags.peekOf("anchor", anchorEntityId("a", "out")).has(hoveredTag),
    ];
    const layer = graph.getGraphLayer();
    // Scale 1 at the origin: world = client. Entering the anchor straight from outside: its enter bubbles to the block.
    // No leave comes first: the first entry has no old side (Task 3; HEAD's helper logged anchor:mouseleave:none).
    layer.handleEvent(new MouseEvent("mousemove", { clientX: 300, clientY: 188 }));
    expect(layer.$hoveredComponent.value).toBe(anchor);
    expect(log).toEqual(["block:mouseenter:anchor"]);
    expect(tagged()).toEqual([true, true]);
    log.splice(0);
    // A drag holds the capture (`dragListener.ts:166`) while the HTML view lets the block go.
    layer.handleEvent(new MouseEvent("mousedown", { clientX: 300, clientY: 188 }));
    layer.captureEvents(anchor);
    release();
    for (let i = 0; i < 3; i++) frame();
    expect(layer.$hoveredComponent.value).toBe(anchor);
    expect(log).toEqual([]);
    // The drag ends with no mousemove after it: the release finds the target again (`dragListener.ts:209`).
    layer.handleEvent(new MouseEvent("mouseup", { clientX: 300, clientY: 188 }));
    layer.releaseCapture();
    for (let i = 0; i < 3; i++) frame();
    // Detailed without a view: the anchor is not shown, so not hit. The block stays tagged throughout (В1).
    expect(layer.$hoveredComponent.value).toBe(block);
    expect(log).toEqual(["anchor:mouseleave:anchor", "block:mouseleave:anchor", "block:mouseenter:block"]);
    expect(tagged()).toEqual([true, false]);
  });
});
```

Run: `pnpm --dir packages/graph exec jest src/components/canvas/blocks/handover.test.ts`
Expected: FAIL (`delegateRender is not a function`).

- [ ] **Step 3: `Block.delegateRender` and the predicates**

In `Block.ts`, after `TBlockViewOptions`:

```ts
/** What an HTML view of a block asks for (`Block.delegateRender`). */
export type THtmlViewRequest = {
  /** Whether the scene keeps drawing the block while the view holds it (graph-react's `canvasVisible`). */
  readonly canvasVisible: boolean;
};
```

Fields, after `exportPorts`:

```ts
  /** The HTML views holding this block (`delegateRender`), each its own record; created on the first hold. */
  private htmlViews?: THtmlViewRequest[];

  /** Follows `$level` while an HTML view holds the block: a level change re-derives the handover. */
  private unwatchLevel?: () => void;
```

Methods, after `raiseOnDragStart`:

```ts
  /**
   * The handover to HTML (spec §10). An HTML view of this block (graph-react's `GraphBlock`) calls it once its HTML
   * has mounted, and calls the returned function when it unmounts or its request changes. While a view holds the block
   * and the scene is at the detailed level (`isHeldByHtml()`), the block and its children are hit on every level
   * (D4); while a holding view asks for `canvasVisible: false`, the scene draws nothing of the block: its body, parts,
   * anchors and children. Its hit box, view data and tags stay current; its connections stay drawn. The level is part
   * of the rule: zooming out of the detailed level draws the block in the frame that hides the HTML.
   * `setRenderDelegated` is the low-level switch without these rules.
   */
  public delegateRender(request: THtmlViewRequest): () => void {
    const held: THtmlViewRequest = { canvasVisible: request.canvasVisible };
    (this.htmlViews ??= []).push(held);
    if (!this.unwatchLevel) {
      let first = true;
      this.unwatchLevel = this.context.graph.scene.$level.subscribe(() => {
        if (first) {
          first = false;
          return;
        }
        this.performRender();
      });
    }
    this.performRender();
    this.requestRetarget();
    let released = false;
    return (): void => {
      if (released) return;
      released = true;
      const views = this.htmlViews;
      const index = views ? views.indexOf(held) : -1;
      if (views && index >= 0) views.splice(index, 1);
      if (!views || views.length === 0) {
        this.htmlViews = undefined;
        this.unwatchLevel?.();
        this.unwatchLevel = undefined;
      }
      this.performRender();
      this.requestRetarget();
    };
  }

  /** Whether an HTML view holds this block now: one has mounted (`delegateRender`) and the level is detailed. */
  public isHeldByHtml(): boolean {
    return this.htmlViews !== undefined && this.context.graph.scene.$level.peek() === "detailed";
  }

  /**
   * Whether the scene draws nothing of this block now: after `setRenderDelegated(true)`, or while a holding HTML view
   * asks for `canvasVisible: false` (any such view hides it). Read this, not `hidden`, to know the block is handed
   * over.
   */
  public override isRenderDelegated(): boolean {
    if (super.isRenderDelegated()) return true;
    return this.isHeldByHtml() && (this.htmlViews?.some((view) => !view.canvasVisible) ?? false);
  }

  /** Shown outside the scene: drawn by something else, or held by an HTML view (D4: hit on every level). */
  public override isShownOutsideScene(): boolean {
    return this.isRenderDelegated() || this.isHeldByHtml();
  }
```

Then:
- `isSceneHidden()` returns `this.hidden || this.blockHidden || this.isRenderDelegated();`;
- `isRenderAllowed()` becomes `if (this.blockHidden || this.isRenderDelegated()) return false; return super.isRenderAllowed();`;
- in `createExportAnchors`, add `|| this.isRenderDelegated()` to the first `return false` condition;
- in `unmount()`, before `super.unmount()`: `this.unwatchLevel?.(); this.unwatchLevel = undefined; this.htmlViews = undefined;`;
- the `blockHidden` field comment: "True when the block is fully hidden by CollapsibleGroup (hitbox removed). The
  handover (`isRenderDelegated()`: `setRenderDelegated` or an HTML view's hold) also hides the block's scene element and
  makes isVisible() return false, but keeps the hitbox."

In `packages/graph/src/index.ts`, add `type THtmlViewRequest` to the `./components/canvas/blocks/Block` export list.

Run: `pnpm --dir packages/graph exec jest src/components/canvas/blocks/handover.test.ts`
Expected: PASS (10 tests in `handover.test.ts`).

- [ ] **Step 4: The failing graph-react tests**

Create `packages/graph-react/src/handover.test.tsx`:

```tsx
import React from "react";

import { Graph, entityKey } from "@gravity-ui/graph";
import type { TBlock } from "@gravity-ui/graph";
import { act, render } from "@testing-library/react";

import { GraphBlock } from "./Block";
import { GraphCanvas } from "./GraphCanvas";
import type { ReactLayer } from "./layer";

const block: TBlock = { id: "b", is: "Block", name: "B", x: 0, y: 0, width: 100, height: 50, anchors: [] };

function setup(scale: number): Graph {
  const graph = new Graph({});
  act(() => {
    graph.attach(document.createElement("div"));
    graph.setEntities({ blocks: [block] });
    graph.start();
    graph.cameraService.set({ scale });
    graph.scheduler.performUpdate();
  });
  return graph;
}

const frame = (graph: Graph): void => act(() => graph.scheduler.performUpdate());
const hidden = (graph: Graph): boolean | undefined => graph.scene.store.get(entityKey("block", "b"))?.hidden;

test("GraphBlock hands its block over once mounted, and only at the detailed level", () => {
  const graph = setup(1);
  expect(hidden(graph)).toBe(false);
  const view = render(
    <GraphBlock graph={graph} block={block}>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(true);
  act(() => graph.cameraService.set({ scale: 0.5 }));
  frame(graph);
  expect(hidden(graph)).toBe(false);
  act(() => graph.cameraService.set({ scale: 1 }));
  frame(graph);
  expect(hidden(graph)).toBe(true);
  view.unmount();
  frame(graph);
  expect(hidden(graph)).toBe(false);
  graph.unmount();
});

test("canvasVisible keeps the scene drawing until the HTML view is ready", () => {
  const graph = setup(1);
  const view = render(
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(false);
  view.rerender(
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible={false}>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(true);
  view.unmount();
  graph.unmount();
});

test("autoHideCanvas={false} without canvasVisible keeps the canvas drawn and registers the view (D4)", () => {
  const graph = setup(1);
  const view = render(
    <GraphBlock graph={graph} block={block} autoHideCanvas={false}>
      <span>b</span>
    </GraphBlock>
  );
  frame(graph);
  expect(hidden(graph)).toBe(false);
  expect(graph.rootStore.blocksList.getBlockState("b")?.getViewComponent()?.isHeldByHtml()).toBe(true);
  view.unmount();
  frame(graph);
  expect(graph.rootStore.blocksList.getBlockState("b")?.getViewComponent()?.isHeldByHtml()).toBe(false);
  graph.unmount();
});

test("ReactLayer switches its HTML at the end of the graph frame that draws the blocks, after a re-attach too", () => {
  const graph = new Graph({});
  graph.setEntities({ blocks: [block] });
  graph.cameraService.set({ scale: 1 });
  const ref = { current: null as ReactLayer | null };
  const view = render(<GraphCanvas graph={graph} reactLayerRef={ref} renderBlock={() => <div />} />);
  act(() => graph.start());
  frame(graph);
  const blockView = graph.rootStore.blocksList.getBlockState("b")?.getViewComponent();
  const release = blockView?.delegateRender({ canvasVisible: false });
  frame(graph);
  expect([ref.current?.isHtmlActive(), hidden(graph)]).toEqual([true, true]);
  const zoomOutAndCheck = (): void => {
    act(() => graph.cameraService.set({ scale: 0.5 }));
    // Before the graph frame: the HTML stays, so nothing is blank.
    expect(ref.current?.isHtmlActive()).toBe(true);
    frame(graph);
    // The frame that hides the HTML draws the block.
    expect([ref.current?.isHtmlActive(), hidden(graph)]).toEqual([false, false]);
    act(() => graph.cameraService.set({ scale: 1 }));
    frame(graph);
    expect([ref.current?.isHtmlActive(), hidden(graph)]).toEqual([true, true]);
  };
  zoomOutAndCheck();
  // Re-attaching GraphLayer moves it after ReactLayer in the update order; the frame end still comes after both.
  const graphLayer = graph.getGraphLayer();
  act(() => {
    graph.detachLayer(graphLayer);
    graph.attachLayer(graphLayer);
  });
  frame(graph);
  zoomOutAndCheck();
  release?.();
  view.unmount();
  graph.unmount();
});
```

In `packages/graph-react/src/layer/ReactLayer.test.ts`, the four tests of "activationScale" and "scene level (G7)"
(`:375-438`) switch the HTML in a graph frame now. Add `const frame = (): void => graph.scene.update();` next to the
helpers at the top of the describe, call `frame()` after each `camera.set(...)` and `graph.updateSettings(...)` whose
result the test reads, and in "should toggle visibility when camera scale crosses activationScale" add, right after
the first `camera.set({ scale: aboveScale })`, `expect(layer.isHtmlActive()).toBe(false);` before its `frame()`
(the switch waits for the frame). Add one test to "scene level (G7)":

```ts
    it("switches once per frame end after a detach and re-attach", () => {
      const layer = createLayer();
      getHTMLElement(layer);
      layer.detachLayer();
      layer.attachLayer(rootElement);
      camera.set({ scale: 1 });
      frame();
      expect(layer.isHtmlActive()).toBe(true);
      camera.set({ scale: 0.1 });
      frame();
      expect(layer.isHtmlActive()).toBe(false);
    });
```

Run: `pnpm --dir packages/graph-react exec jest src/handover.test.tsx src/layer/ReactLayer.test.ts`
Expected: FAIL:
- the first test stays hidden at 0.5 (the effect's `setRenderDelegated(true)` has no level gate);
- the presence test finds no hold (`isHeldByHtml` does not exist yet);
- the ReactLayer test finds the HTML inactive right after the camera change (the synchronous switch);
- the rewritten ReactLayer tests find the HTML switched before the frame.

- [ ] **Step 5: `GraphBlock` and `ReactLayer`**

In `packages/graph-react/src/Block.tsx`, replace the delegation effect (and its comment) with:

```tsx
  /**
   * The handover (spec §10): the view holds its block once React has mounted it, so the canvas look stays until the
   * HTML exists; the core hides the block only at the detailed level, so zooming out draws it in the frame that hides
   * the HTML. `autoHideCanvas={false}` with `canvasVisible` holds it the same way and lets the scene keep drawing
   * while `canvasVisible` is true (for example `canvasVisible={!ready}` until the view's data is ready).
   */
  useEffect(() => {
    if (!viewState) return undefined;
    // The view is shown either way (D4): without auto-hide and without canvasVisible it keeps the canvas drawn.
    return viewState.delegateRender({ canvasVisible: autoHideCanvas ? false : canvasVisible ?? true });
  }, [viewState, autoHideCanvas, canvasVisible]);
```

Update the TSDoc of `autoHideCanvas` and `canvasVisible` in `TGraphBlockProps`: "hides the canvas block once React
has rendered it, while the scene is at the detailed level" and "with `autoHideCanvas={false}`: `true` keeps the canvas
block drawn, `false` hands it to the HTML view; `undefined` keeps the canvas block drawn while the view still registers its
presence, so the block's children are hit through it at the detailed level (D4)".

In `packages/graph-react/src/layer/ReactLayer.tsx`, replace the level subscription of `afterInit`:

```tsx
  protected afterInit(): void {
    // Settle the activity before the first camera transform, so a hidden layer is not left in the "moving" state.
    this.setHtmlActive(this.props.graph.scene.$level.value === "detailed");
    super.afterInit();
    // The HTML layer is active exactly at the "detailed" scene level. It switches at the end of the graph frame, after
    // every layer and the scene updated, so the frame that hides the HTML is the one that draws the blocks it held
    // (spec §10), whatever the layer order and whatever changed the camera. A stopped graph does not switch it.
    const stop = this.props.graph.scene.onFrameEnd(() => {
      this.setHtmlActive(this.props.graph.scene.$level.peek() === "detailed");
    });
    this.eventAbortController.signal.addEventListener("abort", stop, { once: true });
    this.applyBlockListClassName(undefined, this.props.blockListClassName);
  }
```

Run: `pnpm --dir packages/graph-react exec jest`
Expected: PASS, including `src/handover.test.tsx`, the rewritten `src/layer/ReactLayer.test.ts`, and the existing
`readiness.test.tsx` and `GraphCanvas.test.tsx`.

- [ ] **Step 6: GPU check C33 and the e2e, green**

Run (outside the sandbox, through the lock): `node scripts/bench/culling/scene-slice.mjs` (expected C1–C33 PASS) and
`pnpm --filter @gravity-ui/graph-e2e exec playwright test tests/block/block-render-delegated.spec.ts --reporter=line`
(expected 11 passed: the 10 existing tests and the one of Step 1, now green).

- [ ] **Step 7: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/components/canvas/blocks src/services/scene src/index.ts`,
`pnpm --dir packages/graph-react exec eslint --fix src/Block.tsx src/layer src/handover.test.tsx`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`
Expected: all pass.

- [ ] **Step 8: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph)!: the handover to HTML follows the level and the view's mount (delegateRender)`).

---

### Task 9: `query()` options and per-type revisions

Settled items 6–7, D1. Entity types are element metadata (`TSceneElement.entityType`, written by the component that
owns the element), so a block that overrides `createSceneElementId()` stays a block (Codex 9).
`graph.scene.revisionOf(entityType)` steps once at the end of a graph frame in which elements of that type changed (an
add, update or delete event of such an element, its row included), or in which style rows were rewritten or the dim
colour changed (all types: a rule, level or root-tag change); defining or freeing a row steps none. So an anchor's
hover (a child's row) steps `"anchor"` and not `"block"` (Opus I3).

Owner-caused changes of what is nested in an element (re-review 4):
- an update of an element's hidden flag, order, bucket or child order (`hidden`, `order`, `zIndex`, `childOrder`: a
  hide, a raise, a style raise, a reorder of a nested subtree) changes the query result of everything nested in it,
  and the store sends those elements no update of their own. GraphScene steps their entity types as well;
- inherited element styles reach the nested elements through their own row updates (`applyChildStyle`), which step
  their types already;
- a child-only change still steps only the child's type.

A row change between two rows that look the same steps no revision. With D5 a block tags itself when the pointer enters it,
and the theme has no hover rule for blocks: its row changes to an equal-looking one. So the update carries
`previousStyleId`, and GraphScene compares the two rows' content (`styleLookKey`, cached per row).

The minimap reads the store's live elements through an internal `live` option instead of 10k frozen copies per
redraw.

**Files:**
- Modify: `packages/graph/src/lib/scene/types.ts`: `TSceneElement.entityType`, `TSceneStyleChange`,
  `TSceneChange`'s `previousStyleId`.
- Modify: `packages/graph/src/lib/scene/style.ts` (+ `style.test.ts`): `styleLookKey`.
- Modify: `packages/graph/src/lib/scene/SceneStore.ts`: `entityType` on `add`, `query(..., includeHidden)`,
  `subscribeStyles(listener: (change) => void)`, the private `rewriteStyles(rows, change)`.
- Modify: `packages/graph/src/components/canvas/scene/SceneComponent.ts`: `addSceneElement` writes `entityType`.
- Modify: `packages/graph/src/services/scene/types.ts`: `TSceneQueryOptions`, `IGraphScene.query`, `revisionOf`,
  `TSceneElementView.entityType`, the `TSceneElementView` comment.
- Modify: `packages/graph/src/services/scene/GraphScene.ts`: `query(rect, options)`, `revisionOf`, the revision step
  in `update()`.
- Modify: `packages/graph/src/index.ts`: `type TSceneQueryOptions`, `type TSceneStyleChange`.
- Test: `packages/graph/src/services/scene/GraphScene.query.test.ts` (create).

**Interfaces:**
- Produces (Shared names): `TSceneQueryOptions`, `graph.scene.query(rect, options?)`,
  `graph.scene.revisionOf(entityType)`, `SceneStore.query(rect, level?, styles?, includeHidden?)`,
  `SceneStore.subscribeStyles(listener)`, `TSceneStyleChange`, `TSceneElement.entityType`.
- Consumes: `onFrameEnd`'s place in `update()` (Task 3): the revisions step before the frame-end listeners run;
  the store's nesting (`childrenOf` of a child, Task 3).

- [ ] **Step 1: The failing tests**

```ts
// packages/graph/src/services/scene/GraphScene.query.test.ts
import { Graph } from "../../graph";
import type { TSceneElementInput } from "../../lib/scene/SceneStore";
import type { TScenePrimitive } from "../../lib/scene/types";

import type { TSceneQueryOptions } from "./types";

const square: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 10, height: 10 };
const input = (id: string, entityType: string, patch: Partial<TSceneElementInput> = {}): TSceneElementInput => ({
  id,
  entityType,
  zIndex: 200,
  x: 0,
  y: 0,
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  primitives: [square],
  ...patch,
});
const ALL = { x: -1000, y: -1000, width: 2000, height: 2000 };

describe("graph.scene.query options and revisionOf", () => {
  let graph: Graph;
  const ids = (options?: TSceneQueryOptions): string[] => graph.scene.query(ALL, options).map((view) => view.id);
  const frame = (): void => graph.scheduler.performUpdate();

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
    graph.start();
  });

  afterEach(() => graph.unmount());

  it("leaves hidden elements out unless asked, and marks the hidden ones it returns", () => {
    const { store } = graph.scene;
    store.add(input("shown", "block"));
    store.add(input("held", "block", { hidden: true }));
    store.add(input("child", "anchor", { parent: "held" }));
    expect(ids()).toEqual(["shown"]);
    expect(graph.scene.query(ALL, { includeHidden: true }).map((view) => [view.id, view.hidden])).toEqual([
      ["shown", false],
      ["held", true],
      ["child", true],
    ]);
  });

  it("filters by the entity type the element was written with, whatever its id, and by level", () => {
    const { store } = graph.scene;
    // An id without the "block" prefix: a block that overrides createSceneElementId().
    store.add(input("custom-id", "block"));
    const schematicOnly: TScenePrimitive = { ...square, levelMask: 2 };
    store.add(input("a", "anchor", { parent: "custom-id", primitives: [schematicOnly] }));
    store.add(input("c", "comment", { zIndex: 300 }));
    expect(ids({ entityTypes: ["block"] })).toEqual(["custom-id"]);
    expect(ids({ entityTypes: ["block", "comment"] })).toEqual(["custom-id", "c"]);
    expect(ids({ level: "minimalistic" })).toEqual(["custom-id", "c"]);
    expect(ids({ level: "schematic" })).toEqual(["custom-id", "a", "c"]);
    expect(graph.scene.query(ALL, { entityTypes: ["block"] })[0]?.entityType).toBe("block");
  });

  it("returns the store's elements with the internal live option, frozen copies otherwise", () => {
    graph.scene.store.add(input("b", "block"));
    const [live] = graph.scene.query(ALL, { live: true });
    expect(live).toBe(graph.scene.store.get("b"));
    const [copy] = graph.scene.query(ALL);
    expect(copy === live).toBe(false);
    expect(Object.isFrozen(copy)).toBe(true);
  });

  it("steps a type's revision once at the end of a frame with changes of that type", () => {
    const { store } = graph.scene;
    const block = graph.scene.revisionOf("block");
    const anchor = graph.scene.revisionOf("anchor");
    frame();
    const start = [block.value, anchor.value];
    store.add(input("b", "block"));
    store.update("b", { x: 5 });
    expect([block.value, anchor.value]).toEqual(start);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1]]);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1]]);
    // A child's row (an anchor's hover): only its type.
    store.add(input("a", "anchor", { parent: "b" }));
    frame();
    const row = store.defineStyle({ parts: { anchor: { scale: 1.8 } } });
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1] + 1]);
    store.setStyle("a", row);
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 1, start[1] + 2]);
    // A rewritten row or the dim colour: every type.
    store.setDimColor("#000000");
    frame();
    expect([block.value, anchor.value]).toEqual([start[0] + 2, start[1] + 3]);
  });

  it("steps the types of what is nested in an element whose hidden flag or order changes, not the other way", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    store.add(input("child", "anchor", { parent: "owner" }));
    store.add(input("deep", "inner", { parent: "child" }));
    const [block, anchor, inner] = ["block", "anchor", "inner"].map((type) => graph.scene.revisionOf(type));
    frame();
    const at = (): number[] => [block.value, anchor.value, inner.value];
    const start = at();
    store.update("owner", { hidden: true });
    frame();
    expect(at()).toEqual([start[0] + 1, start[1] + 1, start[2] + 1]);
    store.raise("owner");
    frame();
    expect(at()).toEqual([start[0] + 2, start[1] + 2, start[2] + 2]);
    // A child hidden: it and what is nested in it, not its owner.
    store.update("child", { hidden: true });
    frame();
    expect(at()).toEqual([start[0] + 2, start[1] + 3, start[2] + 3]);
  });

  it("steps the nested types of a reordered subtree, in two subtrees of the same types", () => {
    const { store } = graph.scene;
    store.add(input("owner", "block"));
    store.add(input("a", "mid", { parent: "owner", childOrder: 0 }));
    store.add(input("b", "mid", { parent: "owner", childOrder: 1 }));
    store.add(input("leaf-a", "leaf", { parent: "a" }));
    store.add(input("leaf-b", "leaf", { parent: "b" }));
    const leaf = graph.scene.revisionOf("leaf");
    frame();
    const leaves = (): string[] => ids({ entityTypes: ["leaf"] });
    expect(leaves()).toEqual(["leaf-a", "leaf-b"]);
    const start = leaf.value;
    store.update("a", { childOrder: 2 });
    frame();
    expect(leaves()).toEqual(["leaf-b", "leaf-a"]);
    expect(leaf.value).toBe(start + 1);
  });

  it("steps no revision for a row change between rows that look the same", () => {
    const { store } = graph.scene;
    store.add(input("b", "block"));
    const block = graph.scene.revisionOf("block");
    const one = store.defineStyle({ parts: { body: { color: "#ff0000" } } });
    const twin = store.defineStyle({ parts: { body: { color: "#ff0000" } } });
    store.setStyle("b", one);
    frame();
    const start = block.value;
    store.setStyle("b", twin);
    frame();
    expect(block.value).toBe(start);
    store.setStyle("b", store.defineStyle({ parts: { body: { color: "#00ff00" } } }));
    frame();
    expect(block.value).toBe(start + 1);
  });
});
```

Run: `pnpm --dir packages/graph exec jest src/services/scene/GraphScene.query.test.ts`
Expected: FAIL (hidden elements are never returned; `revisionOf` is not a function; `entityType` is not kept). Add
to `style.test.ts`:

```ts
it("keys a row's look by its content", () => {
  const red = (): { parts: { body: { color: string } } } => ({ parts: { body: { color: "#f00" } } });
  expect(styleLookKey(red())).toBe(styleLookKey(red()));
  expect(styleLookKey(red())).not.toBe(styleLookKey({ parts: { body: { color: "#0f0" } } }));
  expect(styleLookKey(undefined)).toBe(styleLookKey({}));
});
```

- [ ] **Step 2: Implement**

`lib/scene/types.ts`: add to `TSceneElement`

```ts
  /** The `static entityType` of the component that wrote the element (the minimap's `"block"`); none for others. */
  readonly entityType?: string;
```

and

```ts
/** Why the style rows changed (`SceneStore.subscribeStyles`). */
export type TSceneStyleChange = "define" | "free" | "replace" | "dim";
```

`TSceneChange` gets `previousStyleId?: number;` ("on an update from a row change: the row the element drew with
before").

`lib/scene/style.ts`:

```ts
const lookKeys = new WeakMap<object, string>();

/** A row's content as a key: two rows with one key draw the same (cached per row object; rows are immutable). */
export function styleLookKey(style: TSceneStyle | undefined): string {
  if (!style) return "{}";
  const cached = lookKeys.get(style);
  if (cached !== undefined) return cached;
  const key = JSON.stringify(style);
  lookKeys.set(style, key);
  return key;
}
```

`useRow` in `SceneStore.ts` captures `const previousStyleId = element.styleId;` first and emits
`{ type: "update", element, fields, previousStyleId }`.

`SceneStore.ts`:
- `add`: the element literal gets `entityType: input.entityType`;
- `query` gets a fourth parameter `includeHidden = false`; its index callback's hidden test becomes
  `if (!includeHidden && this.isNodeHidden(node)) return;` (Task 3's nesting; document it in the JSDoc);
- `styleListeners` holds `(change: TSceneStyleChange) => void`; `subscribeStyles(listener: (change:
  TSceneStyleChange) => void): () => void` (a listener without a parameter still fits); `emitStyles(change)` passes it;
- `defineStyle` emits `"define"`, `setDimColor` `"dim"`;
- `replaceStyles(rows)` becomes `public replaceStyles(rows): void { this.rewriteStyles(rows, "replace"); }` and its
  body moves to `private rewriteStyles(rows: ReadonlyMap<number, TSceneStyle>, change: "replace" | "free"): void`,
  whose recursion calls `this.rewriteStyles(rewrites, "replace")` and whose last line is `this.emitStyles(change);`;
- `freeStyle` calls `this.rewriteStyles(new Map([[styleId, {}]]), "free");`.

`SceneComponent.addSceneElement`: the `store.add({...})` literal gets
`entityType: (this.constructor as typeof SceneComponent).entityType,`.

`services/scene/types.ts`:

```ts
/** Options of `graph.scene.query()`. */
export type TSceneQueryOptions = {
  /** Only elements with a primitive on this level; an owner left out still places its children that have one. */
  readonly level?: TSceneLevel;
  /**
   * Hidden elements too: a block handed to HTML, one in a collapsed group, and their children. Their views say
   * `hidden: true` (a child of a hidden owner included).
   */
  readonly includeHidden?: boolean;
  /** Only elements of these entity types: the `static entityType` of the component that wrote the element. */
  readonly entityTypes?: readonly string[];
  /**
   * @internal The store's live elements instead of frozen copies (the minimap's redraw). Read them at once; never keep
   * or change them. Their `hidden` is the element's own flag.
   */
  readonly live?: boolean;
};
```

`TSceneElementView` gets `readonly entityType?: string;` and `readonly nestedIn?: string;` (Task 3), and its comment
reads "`hidden` is `false` unless the query included hidden elements". In `IGraphScene`, `query` becomes:

```ts
  /**
   * Elements whose bounds meet a world rectangle, in draw order (bottom first): visible ones by default; options
   * filter by level and entity type and add hidden ones. Views are frozen snapshots; `bounds` stays relative to each
   * element's origin.
   */
  query(rect: TRect, options?: TSceneQueryOptions): readonly TSceneElementView[];
  /**
   * Steps once at the end of a graph frame in which elements of this entity type changed (added, moved, restyled,
   * hidden, removed), or style rows were rewritten (a rule, level or root-tag change) or the dim colour changed. A
   * layer that draws from `query()` (the minimap, with `"block"`) redraws on it, one frame after the change.
   */
  revisionOf(entityType: string): ReadonlySignal<number>;
```

`GraphScene.ts`:
- import `signal` and `type Signal` from `@preact/signals-core`, `type TSceneQueryOptions` from `./types`;
- fields:

```ts
  /** One counter per entity type a caller asked for (`revisionOf`). */
  private readonly revisions = new Map<string, Signal<number>>();

  /** Types whose elements changed since the last frame end; "" for elements without a type. */
  private readonly changedTypes = new Set<string>();

  /** Set by a row rewrite or a dim change since the last frame end: every type steps. */
  private everyTypeChanged = false;

  private readonly unsubscribeChanges: () => void;
```

- in the constructor, after `this.delegatedRanks = ...`:

```ts
    const stopElements = this.store.subscribe((change) => {
      if (change.type === "update" && this.looksTheSame(change)) return;
      this.changedTypes.add(change.element.entityType ?? "");
      // What is nested in an element follows its hidden flag and its owner's place, without updates of its own.
      if (change.type !== "update") return;
      const { fields } = change;
      const moves = ["hidden", "order", "zIndex", "childOrder"] as const;
      if (fields && !moves.some((field) => fields.has(field))) return;
      for (const nested of this.store.childrenOf(change.element.id)) this.changedTypes.add(nested.entityType ?? "");
    });
    const stopStyles = this.store.subscribeStyles((change) => {
      if (change === "replace" || change === "dim") this.everyTypeChanged = true;
    });
    this.unsubscribeChanges = (): void => {
      stopElements();
      stopStyles();
    };
```

- a private method:

```ts
  /** An update from a row change whose old and new rows draw the same: nothing a query reader sees changed. */
  private looksTheSame(change: TSceneChange): boolean {
    const { fields, previousStyleId } = change;
    if (previousStyleId === undefined || !fields || fields.size !== 1 || !fields.has("styleId")) return false;
    const styles = this.store.getStyles();
    return styleLookKey(styles[previousStyleId]) === styleLookKey(styles[change.element.styleId]);
  }
```

  (import `styleLookKey` from `../../lib/scene/style` and `type TSceneChange` from `../../lib/scene/types`);
- `revisionOf`:

```ts
  public revisionOf(entityType: string): ReadonlySignal<number> {
    let revision = this.revisions.get(entityType);
    if (!revision) {
      revision = signal(0);
      this.revisions.set(entityType, revision);
    }
    return revision;
  }
```

- in `update()`, after `Component.update(this.layer);` and before the frame-end listeners (Task 8):

```ts
    if (this.everyTypeChanged || this.changedTypes.size > 0) {
      const every = this.everyTypeChanged;
      this.everyTypeChanged = false;
      batch(() => {
        this.revisions.forEach((revision, type) => {
          if (every || this.changedTypes.has(type)) revision.value = revision.peek() + 1;
        });
      });
      this.changedTypes.clear();
    }
```

  (`batch` from `@preact/signals-core`);
- in `dispose()`, call `this.unsubscribeChanges();` first;
- `query`:

```ts
  public query(rect: TRect, options: TSceneQueryOptions = {}): readonly TSceneElementView[] {
    const tileRect = { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
    const includeHidden = options.includeHidden ?? false;
    const types = options.entityTypes;
    const found = this.store.query(tileRect, options.level, undefined, includeHidden);
    const elements = types ? found.filter((element) => types.includes(element.entityType ?? "")) : found;
    if (options.live) return elements;
    return elements.map((element) =>
      Object.freeze({
        id: element.id,
        entityType: element.entityType,
        nestedIn: element.nestedIn,
        parent: element.parent,
        childOrder: element.childOrder,
        x: element.x,
        y: element.y,
        bounds: element.bounds,
        primitives: element.primitives,
        zIndex: element.zIndex,
        order: element.order,
        styleId: element.styleId,
        hidden: includeHidden && this.store.isDrawnHidden(element),
      })
    );
  }
```

In `packages/graph/src/index.ts`, add `TSceneQueryOptions` to the `./services/scene/types` type exports and
`TSceneStyleChange` to the `./lib/scene/types` ones.

Run: `pnpm --dir packages/graph exec jest src/services/scene src/lib/scene src/components/canvas/scene`
Expected: PASS.

- [ ] **Step 3: Whole suites, lint, types**

Run: `pnpm --dir packages/graph exec eslint --fix src/services/scene src/lib/scene src/components/canvas/scene src/index.ts`,
`pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`, `pnpm run typecheck`
Expected: all pass (the bench's `visible()` calls `query(rect)` unchanged; the renderer layer's style listener takes
no parameter).

- [ ] **Step 4: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph): query() options, entity types as element metadata, per-type scene revisions`).

---

### Task 10: The minimap on `graph.scene.query()`

Settled items 5–6, D1, В2 (а); re-review finding 7.

The minimap shows block elements only, hidden ones included, as v1 (rule 1). It keeps HEAD's list order with legacy
blocks drawn in between (В2 (а)), taking scene data from `query()`. It caches its picture: the blocks are drawn again on
`revisionOf("block")` (tags and styles, one frame after the change, D1), on `block-change` and
`blocks-geometry-change` (moves and drags: the same frame), on the usable rect, the colours and its size. A camera
move only copies the picture and draws the camera frame, except while the picture holds `LegacyCanvasBlock`s, which
may draw from data the scene does not see: then every camera move redraws it, as HEAD does (Codex 3).

**Files:**
- Modify: `packages/graph-minimap/src/layer.ts`.
- Modify: `packages/graph-minimap/README.md` (what the minimap draws, when it redraws).
- Test: `apps/e2e/tests/minimap/minimap-scene.spec.ts` (create); `apps/e2e/tests/minimap/minimap-text.spec.ts`
  (rewrite).

**Interfaces:**
- Consumes: `graph.scene.query(rect, { level, includeHidden, entityTypes, live })`, `graph.scene.revisionOf` (Task 9),
  `Block.delegateRender` (Task 8, in the e2e).
- Produces: no new API; `SceneComponent.getSceneElementView()` loses its minimap caller (it stays `@internal`).

- [ ] **Step 1: The e2e: characterization and regression tests**

Create `apps/e2e/tests/minimap/minimap-scene.spec.ts`:

```ts
import { Page, expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

const block = (id: string, x: number, y: number, anchors = false) => ({
  id,
  is: "Block" as const,
  x,
  y,
  width: 200,
  height: 100,
  name: id,
  anchors: anchors ? [{ id: "out", blockId: id, type: "OUT" }] : [],
});

type TMinimapWindow = { minimapDraws: string[][] };

/** The element ids of every `drawInterpreted` call so far: only the minimap calls it on these pages. */
const draws = (page: Page): Promise<string[][]> =>
  page.evaluate(() => (window as unknown as TMinimapWindow).minimapDraws.slice());

/** The minimap canvas pixel at a world point, as [r, g, b, a]. */
const minimapPixel = (page: Page, x: number, y: number): Promise<number[]> =>
  page.evaluate(
    ({ wx, wy }) => {
      const layer = (window as unknown as { minimapLayer: Record<string, number> }).minimapLayer;
      const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
      const dpr = window.graph.layers.getDPR();
      const px = Math.round((wx - layer.relativeX) * layer.scale * dpr);
      const py = Math.round((wy - layer.relativeY) * layer.scale * dpr);
      return Array.from((canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(px, py, 1, 1).data);
    },
    { wx: x, wy: y }
  );

const isRed = (pixel: number[]): boolean => pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60;

test.describe("MiniMap – scene elements", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    await graphPO.initialize({
      blocks: [block("block-1", 0, 0, true), block("block-2", 600, 400), block("over", 100, 0)],
      connections: [],
    });
    await page.evaluate(() => {
      const w = window as unknown as TMinimapWindow;
      w.minimapDraws = [];
      const scene = window.graph.scene;
      const draw = scene.drawInterpreted.bind(scene);
      scene.drawInterpreted = (ctx, elements, scale, options): void => {
        w.minimapDraws.push(elements.map((element) => element.id));
        draw(ctx, elements, scale, options);
      };
    });
    await minimapPO.addLayer({ location: "topLeft" });
  });

  test("draws block elements only, in the blocks' list order", async ({ page }) => {
    const last = (await draws(page)).at(-1) ?? [];
    expect(last.length).toBeGreaterThan(0);
    expect(last.every((id) => id.startsWith("block\u0000"))).toBe(true);
    expect(last).toEqual(["block\u0000block-1", "block\u0000block-2", "block\u0000over"]);
  });

  test("keeps the list order where blocks overlap, and shows a style rule, without a camera move", async ({ page }) => {
    await page.evaluate(() => {
      const { CanvasBlock, selectedTag } = window.GraphModule;
      window.graph.scene.styles.add([
        { target: CanvasBlock, tags: [selectedTag], style: { parts: { body: { color: "#ff0000" } } } },
      ]);
      // block-1 (x 0..200) and over (x 100..300) overlap at x 100..200; the selection raises block-1 in the main view.
      window.graph.api.selectBlocks(["block-1"], true);
    });
    await graphPO.waitForFrames(4);
    // block-1's own part: the rule's red; the overlap: "over", drawn after block-1 in the list, keeps its colour.
    expect(isRed(await minimapPixel(page, 50, 50))).toBe(true);
    expect(isRed(await minimapPixel(page, 150, 50))).toBe(false);
  });

  test("keeps a block handed to HTML on the minimap", async ({ page }) => {
    await page.evaluate(() => {
      window.graph.cameraService.set({ scale: 1, x: 0, y: 0 });
      window.graph.rootStore.blocksList.$blocksMap.value
        .get("block-1")
        ?.getViewComponent()
        ?.delegateRender({ canvasVisible: false });
    });
    await graphPO.waitForFrames(4);
    expect((await draws(page)).at(-1) ?? []).toContain("block\u0000block-1");
  });

  test("redraws its blocks after a selection, without a camera move", async ({ page }) => {
    await graphPO.waitForFrames(4);
    const before = (await draws(page)).length;
    await page.evaluate(() => window.graph.api.selectBlocks(["block-1"], true));
    await graphPO.waitForFrames(4);
    expect((await draws(page)).length).toBeGreaterThan(before);
  });

  test("does not redraw its blocks for a camera move or an anchor's hover", async ({ page }) => {
    await graphPO.waitForFrames(4);
    const before = (await draws(page)).length;
    await page.evaluate(() => window.graph.cameraService.move(10, 0));
    await graphPO.waitForFrames(4);
    await page.evaluate(() => {
      // The anchor's own hover event, as GraphLayer dispatches it to a target: the anchor and its block tag themselves.
      const state = window.graph.rootStore.blocksList.getBlockState("block-1");
      const anchor = state?.getAnchorById("out")?.getViewComponent();
      anchor?.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: anchor, relatedTarget: undefined } }));
    });
    await graphPO.waitForFrames(4);
    expect((await draws(page)).length).toBe(before);
  });

  test("keeps the list order between a LegacyCanvasBlock and a scene block where they overlap", async ({ page }) => {
    const overlap = async (order: string[]): Promise<{ legacyOnly: boolean; shared: boolean }> => {
      await page.evaluate((ids) => {
        const { CanvasBlock, LegacyCanvasBlock } = window.GraphModule;
        window.graph.updateSettings({ blockComponents: { Legacy: LegacyCanvasBlock } });
        const all = {
          legacy: { id: "legacy", is: "Legacy", x: 0, y: 0, width: 200, height: 100, name: "L", anchors: [] },
          scene: { id: "scene", is: "Block", x: 100, y: 0, width: 200, height: 100, name: "S", anchors: [] },
        };
        window.graph.scene.styles.add([{ target: CanvasBlock, style: { parts: { body: { color: "#ff0000" } } } }]);
        window.graph.setEntities({ blocks: ids.map((id) => all[id as keyof typeof all]), connections: [] });
      }, order);
      await graphPO.waitForFrames(6);
      return {
        legacyOnly: isRed(await minimapPixel(page, 50, 50)),
        shared: isRed(await minimapPixel(page, 150, 50)),
      };
    };
    // The legacy block draws the theme's colour, the scene block the rule's red: the later one in the list is on top.
    expect(await overlap(["legacy", "scene"])).toEqual({ legacyOnly: false, shared: true });
    expect(await overlap(["scene", "legacy"])).toEqual({ legacyOnly: false, shared: false });
  });

  test("draws a LegacyCanvasBlock with renderMinimalisticBlock, and again on every camera move", async ({ page }) => {
    const calls = await page.evaluate(async () => {
      const { LegacyCanvasBlock } = window.GraphModule;
      const original = LegacyCanvasBlock.prototype.renderMinimalisticBlock;
      let count = 0;
      LegacyCanvasBlock.prototype.renderMinimalisticBlock = function (
        this: InstanceType<typeof LegacyCanvasBlock>,
        ctx: CanvasRenderingContext2D,
        options?: { text?: boolean }
      ): void {
        count++;
        original.call(this, ctx, options);
      };
      window.graph.updateSettings({ blockComponents: { Legacy: LegacyCanvasBlock } });
      window.graph.setEntities({
        blocks: [{ id: "legacy", is: "Legacy", x: 300, y: 300, width: 200, height: 100, name: "Legacy", anchors: [] }],
        connections: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const afterMount = count;
      window.graph.cameraService.move(10, 0);
      await new Promise((resolve) => setTimeout(resolve, 200));
      LegacyCanvasBlock.prototype.renderMinimalisticBlock = original;
      return { afterMount, afterMove: count };
    });
    expect(calls.afterMount).toBeGreaterThan(0);
    expect(calls.afterMove).toBeGreaterThan(calls.afterMount);
  });
});
```

Rewrite `apps/e2e/tests/minimap/minimap-text.spec.ts` (Codex 11, Opus I6): the picture draws on its own canvas, so
the spec patches `CanvasRenderingContext2D.prototype.fillText`, records where each text is drawn, and makes the
minimap redraw without a camera move under both `cameraAwareText` settings:

```ts
import { Page, expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

const BLOCKS = [
  { id: "near", is: "Block" as const, x: 0, y: 0, width: 200, height: 100, name: "Near Block", anchors: [] },
  { id: "far", is: "Block" as const, x: 10000, y: 10000, width: 200, height: 100, name: "Far Block", anchors: [] },
];

type TTextWindow = { texts: { text: string; minimap: boolean }[]; minimapDraws: number; calls: number };

test.describe("MiniMap – block text", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    await graphPO.initialize({ blocks: BLOCKS, connections: [] });
    await page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      w.texts = [];
      w.minimapDraws = 0;
      w.calls = 0;
      // Every 2D context: the minimap draws its blocks into an offscreen picture canvas.
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (
        this: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth?: number
      ): void {
        const canvas = this.canvas;
        const minimap = canvas.classList.contains("graph-minimap") || !canvas.isConnected;
        w.texts.push({ text: String(text), minimap });
        if (maxWidth === undefined) fillText.call(this, text, x, y);
        else fillText.call(this, text, x, y, maxWidth);
      };
      const scene = window.graph.scene;
      const draw = scene.drawInterpreted.bind(scene);
      scene.drawInterpreted = (ctx, elements, scale, options): void => {
        w.minimapDraws++;
        draw(ctx, elements, scale, options);
      };
      // The main camera shows the near block close enough for the main view to draw its name.
      window.graph.cameraService.set({ scale: 0.5, x: 100, y: 100 });
    });
    await graphPO.waitForFrames(3);
    await minimapPO.addLayer({ location: "topLeft" });
  });

  /**
   * Redraws the minimap without a camera move, with a change of the scene on every call (re-review 7): the selection
   * moves to the other block, and the far block moves to a new place. Returns what was drawn.
   */
  async function redraw(page: Page): Promise<{ names: string[]; draws: number; mainNames: string[] }> {
    await page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      w.texts = [];
      w.minimapDraws = 0;
      w.calls += 1;
      window.graph.api.selectBlocks([w.calls % 2 === 1 ? "near" : "far"], true);
    });
    await graphPO.waitForFrames(3);
    await page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      window.graph.api.updateBlock({ id: "far", x: 10000 + 10 * w.calls });
    });
    await graphPO.waitForFrames(3);
    return page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      const isName = (text: string): boolean => text.includes("Near") || text.includes("Far");
      return {
        names: w.texts.filter((entry) => entry.minimap && isName(entry.text)).map((entry) => entry.text),
        mainNames: w.texts.filter((entry) => !entry.minimap && isName(entry.text)).map((entry) => entry.text),
        draws: w.minimapDraws,
      };
    });
  }

  for (const cameraAwareText of [true, false]) {
    test(`draws block bodies without names (cameraAwareText ${cameraAwareText})`, async ({ page }) => {
      await page.evaluate((value) => window.graph.updateSettings({ cameraAwareText: value }), cameraAwareText);
      await graphPO.waitForFrames(3);
      const result = await redraw(page);
      // The redraw happened, the patch sees text (the main view's name), and the minimap drew none.
      expect(result.draws).toBeGreaterThan(0);
      expect(result.mainNames.length).toBeGreaterThan(0);
      expect(result.names).toEqual([]);
    });
  }

  test("does not follow the main camera's level of detail", async ({ page }) => {
    for (const scale of [0.05, 0.2, 0.5, 1]) {
      await page.evaluate((value) => window.graph.cameraService.set({ scale: value, x: 100, y: 100 }), scale);
      await graphPO.waitForFrames(3);
      const result = await redraw(page);
      expect(result.draws).toBeGreaterThan(0);
      expect(result.names).toEqual([]);
    }
  });
});
```

Run (outside the sandbox, through the lock):
`pnpm --filter @gravity-ui/graph-e2e exec playwright test tests/minimap/minimap-scene.spec.ts tests/minimap/minimap-text.spec.ts --reporter=line`
Run these on the tree before Step 2. Two groups:
- **Regression tests, red before Step 2:**
  - "keeps the list order where blocks overlap, and shows a style rule, without a camera move" and "redraws its blocks
    after a selection, without a camera move": nothing redraws the minimap without a camera move;
  - "does not redraw its blocks for a camera move or an anchor's hover": a pan redraws it.
- **Characterization tests, green before and after:**
  - "draws block elements only, in the blocks' list order", "keeps a block handed to HTML on the minimap", "keeps the
    list order between a LegacyCanvasBlock and a scene block" and "draws a LegacyCanvasBlock with
    renderMinimalisticBlock, and again on every camera move";
  - the rewritten `minimap-text.spec.ts`: its far-block move changes the usable rect, which redraws the minimap
    before this task too. They pin what must not change.

The main view draws the near block's name at 0.5 in both text modes. The last text test does not check `mainNames`,
which is empty at 0.05.

- [ ] **Step 2: Rewrite the minimap's drawing**

In `packages/graph-minimap/src/layer.ts`:
- fields, after `cameraBorderColor`:

```ts
  /** The blocks' picture at the minimap's pixel size; a camera move only copies it (see `onCameraChange`). */
  private picture?: HTMLCanvasElement;

  private pictureDirty = true;

  /** Whether the last picture drew a `LegacyCanvasBlock`: such a picture is drawn again on every camera move. */
  private pictureHasLegacy = false;
```

- `afterInit()`:

```ts
  protected afterInit(): void {
    this.applyPositionStyle();
    this.picture ??= this.minimapCanvas.ownerDocument.createElement("canvas");
    const invalidate = (): void => {
      this.pictureDirty = true;
      this.performRender();
    };
    // Fires immediately with the current value: initialises scale/relativeX/Y before the first render.
    this.onSignal(this.props.graph.hitTest.$usableRect, () => {
      this.calculateViewPortCoords();
      invalidate();
    });
    // One step at the end of a graph frame in which block elements changed: tags, styles, a block handed to HTML.
    this.onSignal(this.props.graph.scene.revisionOf("block"), invalidate);
    this.onGraphEvent("colors-changed", invalidate);
    // block-change / batched geometry during a drag: the same frame.
    const onBlocksMoved = (): void => {
      this.calculateViewPortCoords();
      invalidate();
    };
    this.onGraphEvent("block-change", onBlocksMoved);
    this.onGraphEvent("blocks-geometry-change", onBlocksMoved);
    this.onCanvasEvent("mousedown", this.handleMouseDownEvent);
    super.afterInit();
  }
```

- `onCameraChange`:

```ts
  protected onCameraChange(_camera: TCameraState): void {
    // Legacy blocks may draw from data the scene does not see: a picture with them is drawn again, as before.
    if (this.pictureHasLegacy) this.pictureDirty = true;
    this.performRender();
  }
```

- `updateCanvasSize()` ends with `this.pictureDirty = true;`;
- `render()`:

```ts
  protected render(): void {
    if (!this.context?.ctx) return;
    this.resetTransform();
    const usableRect = this.props.graph.api.getUsableRect();
    if (usableRect.width === 0 && usableRect.height === 0) return;
    if (this.pictureDirty) this.drawPicture();
    const picture = this.picture;
    if (picture && picture.width > 0 && picture.height > 0) {
      this.context.ctx.drawImage(picture, 0, 0, this.minimapWidth, this.minimapHeight);
    }
    this.context.ctx.scale(this.scale, this.scale);
    this.context.ctx.translate(-this.relativeX, -this.relativeY);
    this.drawCameraBorderFrame();
  }

  /** Draws the usable rect's background and the blocks into the picture, in device pixels. */
  private drawPicture(): void {
    const picture = this.picture;
    if (!picture) return;
    this.pictureDirty = false;
    picture.width = this.minimapCanvas.width;
    picture.height = this.minimapCanvas.height;
    const ctx = picture.getContext("2d");
    if (!ctx) return;
    const k = this.getDRP() * this.scale;
    ctx.setTransform(k, 0, 0, k, -this.relativeX * k, -this.relativeY * k);
    this.renderUsableRectBelow(ctx);
    this.renderBlocks(ctx);
  }
```

- `renderUsableRectBelow(ctx: CanvasRenderingContext2D)` draws on its parameter instead of `this.context.ctx`;
- `renderBlocks(ctx: CanvasRenderingContext2D)`:

```ts
  /**
   * The blocks in the list order (`$blocks`), as v1: runs of scene blocks through the interpreter, from the scene's
   * block elements in the minimap's view (`query()`), and `LegacyCanvasBlock`s with their own minimalistic method in
   * between. The minimap's own rules: the minimalistic level whatever the main view's, no text, blocks handed to HTML
   * and in collapsed groups included, no anchors or other elements.
   */
  private renderBlocks(ctx: CanvasRenderingContext2D): void {
    const { graph } = this.props;
    const rect = {
      x: this.relativeX,
      y: this.relativeY,
      width: this.minimapWidth / this.scale,
      height: this.minimapHeight / this.scale,
    };
    const byId = new Map<string, TSceneElementView>();
    const query = { level: "minimalistic", includeHidden: true, entityTypes: ["block"], live: true } as const;
    for (const element of graph.scene.query(rect, query)) byId.set(element.id, element);
    let run: TSceneElementView[] = [];
    let legacy = false;
    const flush = (): void => {
      if (run.length === 0) return;
      graph.scene.drawInterpreted(ctx, run, this.scale, { level: "minimalistic", skipText: true, drawHidden: true });
      run = [];
    };
    graph.rootStore.blocksList.$blocks.value.forEach((block) => {
      const view = block.getViewComponent();
      if (view instanceof LegacyCanvasBlock) {
        legacy = true;
        flush();
        view.renderMinimalisticBlock(ctx, { text: false });
        return;
      }
      const element = view ? byId.get(view.getSceneElementId()) : undefined;
      if (element) run.push(element);
    });
    flush();
    this.pictureHasLegacy = legacy;
  }
```

Run (outside the sandbox, through the lock): the e2e of Step 1 and the whole minimap folder:
`pnpm --filter @gravity-ui/graph-e2e exec playwright test tests/minimap --reporter=line`
Expected: all pass (the 6 new tests, the 5 rewritten text tests and the other minimap specs).

The ledger note `progress.md:107` ("minimap text flag ignored by `EtlBlock`") needs no code: `EtlBlock` is a scene
block since plan 3a, and scene blocks reach the minimap only through `drawInterpreted(..., { skipText: true })`, so no
text is drawn whatever the block class; the rewritten text spec checks it on the canvas that draws. Record this in the
task report.

- [ ] **Step 3: README, lint, types**

In `packages/graph-minimap/README.md`, after the usage example, add:

```markdown
## What it draws

The minimap draws the scene's block elements at the minimalistic level, without text, through the Canvas 2D
interpreter (`graph.scene.query()` and `drawInterpreted()`), whatever the main view's renderer and level, in the order
of the blocks list. Blocks handed to HTML and blocks in collapsed groups stay on it; anchors and other scene elements
do not. Tags and style rules show on it. A `LegacyCanvasBlock` draws itself with
`renderMinimalisticBlock(ctx, { text: false })`, in its place in the list.

It caches its picture. Block moves and drags redraw it in the same frame; tag and style changes at the end of the
graph frame that applied them, so the minimap shows them one frame after the main view. A camera move only redraws the
camera frame, unless a `LegacyCanvasBlock` is on the minimap: then every camera move redraws the picture.
```

Run: `pnpm run build`, then `pnpm --dir packages/graph-minimap exec eslint --fix src/layer.ts`,
`pnpm --dir packages/graph-minimap run typecheck`, `pnpm run typecheck`
Expected: pass (the package typecheck resolves `@gravity-ui/graph` through the build: Opus M7).

- [ ] **Step 4: The minimap bench**

Run (outside the sandbox, through the lock):

```bash
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/t10-bench-minimap.log \
  node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038 --modes pan,zoom,drag \
  --renderers blocks,blocks-webgl --repeats 5 --minimap
```

Expected: the `blocks` and `blocks-webgl` pan ticks at most Task 1's `--minimap` pan ticks (`baseline.txt`); zoom and
drag within that baseline + 5 % or + 0.3 ms (a drag still redraws the picture in every frame, now with one `query()`
per redraw instead of 10k element reads).

- [ ] **Step 5: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `feat(graph-minimap): draw from graph.scene.query() with a cached picture`).

---

### Task 11: The 3b story

One story shows every 3b feature on both renderers and all three levels: a run button child with a hover look, square
OUT anchors from `getAnchorClass`, the HTML handover with `canvasVisible={!ready}` (its HTML draws the run button too,
and a click on it reaches the button's component through the graph, D4), and the minimap.

**Files:**
- Create: `apps/storybook/src/stories/canvas/sceneInteraction/sceneInteraction.stories.tsx`.

**Interfaces:** consumes `SceneComponent` children (Task 3), `getAnchorClass`, `TAnchorClass`, `TGraphComponentProps`,
`GraphBlock` (`autoHideCanvas`, `canvasVisible`), `MiniMapLayer`.

- [ ] **Step 1: Write the story**

```tsx
import React, { useEffect, useState } from "react";

import {
  Anchor,
  CanvasBlock,
  ECanDrag,
  SceneComponent,
  defineTag,
  hoveredTag,
  pointerTargetAfter,
} from "@gravity-ui/graph";
import type {
  ChildDescriptor,
  Graph,
  TAnchor,
  TAnchorClass,
  TBlock,
  TBlockView,
  TConnection,
  TGraphComponentProps,
  TSceneLevel,
  TScenePrimitive,
  TStyleParts,
} from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import { GraphBlock, GraphCanvas, useGraph, useLayer, useSignal } from "@gravity-ui/graph-react";
import { Button, Flex, SegmentedRadioGroup, Text, ThemeProvider } from "@gravity-ui/uikit";
import type { Meta, StoryFn } from "@storybook/react-webpack5";

import "@gravity-ui/graph-minimap/styles.css";
import "@gravity-ui/uikit/styles/styles.css";

const runningTag = defineTag("running");

type TRunButtonView = { width: number };

/** A run button at the block's top right: a rounded square and a dot, on the schematic and detailed levels. */
class RunButton extends SceneComponent<TRunButtonView, TGraphComponentProps & { blockId: string }> {
  public static override entityType = "runButton";

  public declare readonly __styleParts?: TStyleParts<"button" | "glyph">;

  public override readonly cursor = "pointer";

  public override getEntityId(): string {
    return this.props.blockId;
  }

  protected override willMount(): void {
    super.willMount();
    // The button tags itself while it is the pointer's target (D5: a custom child decides; no default does it). Its
    // block, a library Block, stays tagged over it.
    const followHover = (event: Event): void => this.setHoveredTag(pointerTargetAfter(event) === this);
    this.addEventListener("mouseenter", followHover);
    this.addEventListener("mouseleave", followHover);
    this.addEventListener("click", (event: Event) => {
      // The button's click is its own: it does not select the block.
      event.stopPropagation();
      const { tags } = this.context.graph.scene;
      const id = this.props.blockId;
      if (tags.peekOf("block", id).has(runningTag)) tags.delete(runningTag, { block: [id] });
      else tags.add(runningTag, { block: [id] });
    });
  }

  /** The button follows the block's width (its view data). */
  protected override getViewData(): TRunButtonView {
    const block = this.getParent();
    const view = block instanceof SceneComponent ? (block.readSceneView() as TBlockView | undefined) : undefined;
    return { width: view?.width ?? 200 };
  }

  /** Too small to click on the minimalistic level: no look, so not hit there either. */
  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  /** The detailed level takes this list too (no `detailed` method). */
  protected override schematic(view: TRunButtonView): readonly TScenePrimitive[] {
    const x = view.width - 40;
    return [
      { kind: "rect", part: "button", x, y: 8, width: 32, height: 32, radius: 6, fill: "#e8f0fe" },
      { kind: "circle", part: "glyph", cx: x + 16, cy: 24, r: 6, fill: "#1a73e8" },
    ];
  }
}

/** OUT anchors are squares: another shape is another anchor class. */
class SquareAnchor extends Anchor {
  public static override SIZE = 14;

  public static override LOOK_EXTENT = 10;

  protected override schematic(): readonly TScenePrimitive[] {
    return [
      { kind: "rect", part: "anchor", x: -7, y: -7, width: 14, height: 14 },
      { kind: "rect", part: "border", x: -7, y: -7, width: 14, height: 14, border: { width: 4 } },
    ];
  }
}

/** The default block's look, a run button child that toggles the `running` tag, and square OUT anchors. */
class StageBlock extends CanvasBlock {
  protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
    return anchor.type === "OUT" ? SquareAnchor : Anchor;
  }

  /** The run button first, so the anchors draw over it. */
  protected override updateChildren(): ChildDescriptor[] {
    return [RunButton.create({ blockId: String(this.props.id) }, { key: "run" }), ...super.updateChildren()];
  }
}

const blocks: TBlock[] = Array.from({ length: 6 }, (_, i) => ({
  id: `s${i + 1}`,
  is: "Stage",
  name: `Stage ${i + 1}`,
  x: (i % 3) * 320,
  y: Math.floor(i / 3) * 220,
  width: 220,
  height: 120,
  anchors: [
    { id: `s${i + 1}_in`, blockId: `s${i + 1}`, type: "IN" },
    { id: `s${i + 1}_out`, blockId: `s${i + 1}`, type: "OUT" },
  ],
}));

const connections: TConnection[] = [
  { id: "c1", sourceBlockId: "s1", sourceAnchorId: "s1_out", targetBlockId: "s2", targetAnchorId: "s2_in" },
  { id: "c2", sourceBlockId: "s2", sourceAnchorId: "s2_out", targetBlockId: "s3", targetAnchorId: "s3_in" },
  { id: "c3", sourceBlockId: "s4", sourceAnchorId: "s4_out", targetBlockId: "s5", targetAnchorId: "s5_in" },
];

const LEVEL_SCALES: readonly { level: TSceneLevel; scale: number }[] = [
  { level: "minimalistic", scale: 0.18 },
  { level: "schematic", scale: 0.5 },
  { level: "detailed", scale: 1 },
];

/**
 * The HTML view takes the block only once its data is "ready": until then the scene keeps drawing it. Its run button
 * has no handler: a click on it bubbles to the graph root, where GraphLayer targets the block's RunButton (D4). Its
 * border reads the block's computed `border` colour, which `GraphBlock` passes as `--graph-block-border-color`
 * (`useEntityStyle`): the `running` rule turns it green here as on the canvas.
 */
function StageHtml({ graph, block }: { graph: Graph; block: TBlock }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 400);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <GraphBlock graph={graph} block={block} autoHideCanvas={false} canvasVisible={!ready}>
      <div
        style={{
          padding: 12,
          position: "relative",
          height: "100%",
          boxSizing: "border-box",
          border: "3px solid var(--graph-block-border-color)",
        }}
      >
        {ready ? `${block.name} (HTML)` : "Loading…"}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "#e8f0fe",
            cursor: "pointer",
          }}
        />
      </div>
    </GraphBlock>
  );
}

const renderBlock = <T extends TBlock>(graph: Graph, block: T): React.JSX.Element => (
  <StageHtml graph={graph} block={block} />
);

const SceneInteractionApp = (): React.JSX.Element => {
  const { graph, start, setEntities, zoomTo } = useGraph({});
  const [renderer, setRenderer] = useState<"canvas" | "webgl">("canvas");
  const [html, setHtml] = useState<"on" | "off">("on");
  const level = useSignal(graph.scene.$level);
  const rendererState = useSignal(graph.scene.$renderer);
  useLayer(graph, MiniMapLayer, { location: "bottomRight", width: 200, height: 160 });

  useEffect(() => {
    graph.updateSettings({ blockComponents: { Stage: StageBlock }, canDrag: ECanDrag.ALL });
    setEntities({ blocks, connections });
    const remove = graph.scene.styles.add([
      { target: StageBlock, tags: [runningTag], style: { parts: { border: { color: "#2e7d32" } } } },
      { target: RunButton, tags: [hoveredTag], style: { parts: { button: { color: "#c6dafc" } } } },
    ]);
    start();
    zoomTo("center", { padding: 40 });
    return remove;
  }, [graph, setEntities, start, zoomTo]);

  useEffect(() => {
    graph.updateSettings({ renderer });
  }, [graph, renderer]);

  const zoomToScale = (scale: number): void => {
    const { width, height } = graph.cameraService.getCameraState();
    graph.cameraService.zoom(width / 2, height / 2, scale);
  };

  return (
    <ThemeProvider theme="light">
      <Flex direction="column" style={{ height: "100vh" }}>
        <Flex direction="column" gap={2} style={{ padding: 16 }}>
          <Text variant="header-1">Child components, anchor classes, the HTML handover and the minimap</Text>
          <Text variant="body-1">
            The blue button is a child scene component of each block: click it to toggle the block&apos;s running tag,
            hover it to see its hover rule. OUT anchors are a square anchor class. With HTML on, the detailed level
            shows HTML blocks after a short &quot;loading&quot;; the scene draws each block until its view is ready,
            zooming out draws the blocks again in the same frame, and the HTML button reaches the same component.
          </Text>
          <Flex alignItems="center" gap={3} wrap>
            <SegmentedRadioGroup
              options={[
                { value: "canvas", content: "Canvas" },
                { value: "webgl", content: "WebGL" },
              ]}
              value={renderer}
              onUpdate={setRenderer}
            />
            <SegmentedRadioGroup
              options={[
                { value: "on", content: "HTML on" },
                { value: "off", content: "HTML off" },
              ]}
              value={html}
              onUpdate={setHtml}
            />
            {LEVEL_SCALES.map(({ level: target, scale }) => (
              <Button key={target} view={level === target ? "action" : "normal"} onClick={() => zoomToScale(scale)}>
                Zoom to {target} ({scale})
              </Button>
            ))}
          </Flex>
          <Text variant="body-1" color="secondary">
            graph.scene.$renderer: <b>{rendererState}</b> · graph.scene.$level: <b>{level}</b>
          </Text>
        </Flex>
        <div style={{ flex: 1, position: "relative", minHeight: 400 }}>
          <GraphCanvas graph={graph} className="graph-canvas" renderBlock={html === "on" ? renderBlock : undefined} />
        </div>
      </Flex>
    </ThemeProvider>
  );
};

const meta: Meta = {
  title: "Canvas/SceneInteraction",
  component: SceneInteractionApp,
  parameters: { layout: "fullscreen" },
};

export default meta;

export const SceneInteraction: StoryFn = () => <SceneInteractionApp />;
```

Run: `pnpm run build`, then
`pnpm --dir apps/storybook exec eslint --fix src/stories/canvas/sceneInteraction/sceneInteraction.stories.tsx` and
`pnpm --dir apps/storybook run typecheck` (it resolves `@gravity-ui/graph` through the build: Opus M7)
Expected: no errors.

- [ ] **Step 2: Browser check (controller)**

Start Storybook from this worktree (`pnpm --dir apps/storybook exec storybook dev -p 6017`; port 6017, as plan 3a's
check) and open `Canvas/SceneInteraction`. On Canvas and on WebGL:
- schematic: the run buttons draw over the bodies and under the anchors; hovering a button lightens it and the cursor
  becomes a pointer; the block stays hovered while the pointer is on its button or an anchor (В1: with HTML on, its
  wrapper keeps the `graph-tag-hovered` class);
  clicking the button turns the block's border green and does not select the block, clicking again restores it; OUT
  anchors are squares, IN anchors dots;
- minimalistic: no buttons; a click where a button was selects the block; anchors as on schematic (stock: none);
- detailed with HTML on: "Loading…" first while the scene's block shows under it, then the HTML takes the block; a
  click on the HTML button toggles the HTML view's border green and back (one event source, D4; the border reads the
  tag's style); zoom out with the level buttons and with the
  wheel: no frame without blocks (record a screen capture if in doubt);
- detailed with HTML off: the scene's detailed look (body, button, no title), no anchors, and a click where an anchor
  was hits the block (D4);
- the minimap shows the six blocks, a running block's green border one frame after the click, and does not flicker on
  pans;
- the console has no errors and no warnings.

- [ ] **Step 3: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `docs(storybook): child components, anchor classes, the HTML handover and the minimap`).

---

### Task 12: Docs and the migration guide

Every user-facing change of Tasks 2–10 is documented, with code examples that compile. Folds in Opus M6 (the
`renderAnchor` mentions in docs), M14 (spec text), M15 (the `transparentToEvents` wording) and D3 (the export
limitation).

**Files:**
- Modify: `packages/graph/docs/components/block-component.md`, `components/anchors.md`,
  `components/canvas-graph-component.md`, `system/event-model.md`, `system/scene.md`, `system/tags-and-styles.md`,
  `system/component-lifecycle.md`, `react/usage.md`, `migration-guides/v1-to-v2.md`.
- Modify: `docs/superpowers/specs/2026-11-10-v2-scene-core-design.md` (never committed: the spec text of Step 4).
- Create: `.superpowers/sdd/2026-11-15-scene-blocks-3b/t12-scripts/doc-examples.tsx` (scratch, never committed): every
  new TypeScript example of these pages.

- [ ] **Step 1: Component pages**

`components/block-component.md`:
- the class diagram (`:37`): `#renderAnchor(anchor)` becomes `#getAnchorClass(anchor)`, and add `+delegateRender(request)`,
  `+isHeldByHtml()`, `+isRenderDelegated()`;
- "Hidden blocks": the first bullet becomes "A block an HTML view holds (`delegateRender`, used by graph-react's
  `GraphBlock`) hides its element, its anchors' and its children's elements while the scene is at the detailed level
  and a holding view asks for `canvasVisible: false`; it keeps its hit box, view data and tags.
  `setRenderDelegated(true)` is the low-level switch without the level rule. `isRenderDelegated()` covers both; the
  `hidden` field no longer tells." Add after the bullets:

  ```markdown
  ### The handover to HTML

  An HTML view calls `delegateRender({ canvasVisible })` once its HTML has mounted and calls the returned function
  when it unmounts. While a view holds the block and the scene is at the detailed level (`isHeldByHtml()`), the block
  and its children are hit on every level: events on the HTML bubble to the graph root, and GraphLayer targets the
  component under the pointer, so a click on an anchor's HTML is the graph's `click` on that anchor. While a holding
  view asks for `canvasVisible: false` (any view that does), the scene draws nothing of the block; connections stay.
  Zooming out of the detailed level draws the block in the frame that hides the HTML. In React, `GraphBlock` does
  this: `autoHideCanvas` (default) hands the block over once mounted; `autoHideCanvas={false} canvasVisible={!ready}`
  keeps the scene drawing until the view is ready.
  ```

- "Anchors" (`:260`): the `renderAnchor` bullet becomes "`getAnchorClass(anchor)` returns the class of one anchor's
  component (default `Anchor`); the block creates it with the anchor's data, its port and the class's `SIZE` and
  `LINE_WIDTH`, keyed by the anchor's id. It is a pure function of the anchor and the block's data: the block reads it
  in its update after that data changed (a move excepted) and swaps the components when a class changes."
- a new section "Child components" before "Events":

  ````markdown
  ## Child components

  A scene component returned from a block's `updateChildren()` is a child component: it draws in a child element of
  the block's element, at the block's origin (its primitives are in the block's frame), and is hit where it draws. It
  is a target of the pointer of its own, and the cursor follows it. Its events walk up to the block (D5): the block's
  listeners see the child's `click`, `mouseenter` and `mouseleave` with `detail.target` the child and, on hover events,
  `detail.relatedTarget` the other side of the change. A child that stops an event keeps it from the block. Keep the
  anchors in the list: return `[...yours, ...super.updateChildren()]` (yours under the anchors) or the other way
  round.

  `hoveredTag` is written by components on themselves, for styles only. The library `Block` tags itself while the
  pointer is on it or on any of its descendants, as CSS `:hover`; override `isHoveredBy(target)` to change that, for
  example `return target === this;` for a block that is not hovered over its children. A custom child tags itself
  only if it does so, as the `CloseButton` below does while it is the target.

  ```typescript
  import { CanvasBlock, SceneComponent, pointerTargetAfter } from "@gravity-ui/graph";
  import type { ChildDescriptor, TGraphComponentProps, TScenePrimitive } from "@gravity-ui/graph";

  class CloseButton extends SceneComponent<object, TGraphComponentProps & { blockId: string }> {
    public static override entityType = "closeButton";
    public override readonly cursor = "pointer";

    public override getEntityId(): string {
      return this.props.blockId;
    }

    protected override willMount(): void {
      super.willMount();
      // Hovered while it is the pointer's target: its own choice (D5).
      const follow = (event: Event): void => this.setHoveredTag(pointerTargetAfter(event) === this);
      this.addEventListener("mouseenter", follow);
      this.addEventListener("mouseleave", follow);
      this.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        this.context.graph.api.deleteSelected();
      });
    }

    protected override getViewData(): object {
      return {};
    }

    protected override minimalistic(): readonly TScenePrimitive[] {
      return [];
    }

    protected override schematic(): readonly TScenePrimitive[] {
      return [{ kind: "rect", part: "button", x: 170, y: 8, width: 24, height: 24 }];
    }
  }

  class ToolbarBlock extends CanvasBlock {
    protected override updateChildren(): ChildDescriptor[] {
      return [CloseButton.create({ blockId: String(this.props.id) }, { key: "close" }), ...super.updateChildren()];
    }
  }
  ```

  - Levels: a child is hit on the levels its look is drawn on (`minimalistic()` returning `[]` above keeps it unhit
    there), on every level while an HTML view holds its block, and on the levels `static hitLevels` declares, if any.
  - A child without a look has no hit box until it declares one: override `getHitRect()` (a hit region of the block's
    own look) and declare `static hitLevels` where that look is shown; without a declaration it is not hit, and
    development builds warn.
  - Its look is restyled by rules on its class (`hoveredTag` for hover), hidden with its block, and counted in its
    block's sub-order width (many children with looks on one block can make WebGL fall back).
  - Children nest to any depth: a child's own children are nested in its element. The scene keeps the nesting, so a
    child's subtree draws after it and moves with it, and hiding a child, or giving it an element `dim` or `opacity`,
    applies to everything nested in it. Child keys must differ from the block's anchor ids; development builds report
    two children with one key.
  ````

  (`graph.api.deleteSelected()` deletes the selection; any action of the application fits there.)

`components/anchors.md`:
- "Levels": "The stock anchor is drawn on the schematic level only. It is hit there, and on every level while an HTML
  view holds its block (React draws anchors at the detailed level, and a click on that HTML is the graph's click on the
  anchor). At the detailed level without an HTML view it is not hit: the block under it is. A subclass is hit on the
  levels its own look is drawn on, or on those its `static hitLevels` declares."
- "Lazy creation": the first sentence adds "on the levels its anchor class's `static CREATION_LEVELS` lists (schematic
  and detailed by default); a class whose look draws at the minimalistic level declares it there, and development
  builds warn when it does not".
- "Custom anchors" (`:50`) becomes:

  ````markdown
  **Custom anchors.** Override `Block.getAnchorClass(anchor)` to return another `Anchor` class, per anchor. The block
  creates the component with the anchor's data, its port and the class's statics: `SIZE` (default 18), `LINE_WIDTH`
  (default 2), `LOOK_EXTENT` (default 11.5, the stock dot and ring) and `CREATION_LEVELS`. A class describes its look
  with level methods (prototype methods, not instance properties); its view data carries its block's (`view.block`).
  A look that reaches farther than `LOOK_EXTENT` from the anchor's point declares its own:
  `public static override LOOK_EXTENT = 40;`. An anchor class has no props of its own: read what it needs from the
  anchor (`this.props.type`, `this.props.index`), from its block's data in a method of its own, and show states with
  tags. The class may follow the block's data (`this.state.meta`): the block asks again after that data changes.

  ```typescript
  import { Anchor, CanvasBlock } from "@gravity-ui/graph";
  import type { TAnchor, TAnchorClass, TScenePrimitive } from "@gravity-ui/graph";

  class SquareAnchor extends Anchor {
    public static override SIZE = 14;
    public static override LOOK_EXTENT = 10;

    protected override schematic(): readonly TScenePrimitive[] {
      return [{ kind: "rect", part: "anchor", x: -7, y: -7, width: 14, height: 14 }];
    }
  }

  class SquareOutBlock extends CanvasBlock {
    protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
      return anchor.type === "OUT" ? SquareAnchor : Anchor;
    }
  }
  ```
  ````

`components/canvas-graph-component.md`:
- the class diagram (`:25`): remove `#eventedArea()`;
- §5 "Evented Areas" (`:343-360`): replace by "Evented areas were removed in v2. A clickable region of a block is a
  child component (see [Block component](block-component.md#child-components)); a hit region without a look declares
  `getHitRect()`.";
- in §3 "Mouse Event Handling", add a subsection "Transparent components":

  ````markdown
  #### Transparent components

  `static transparentToEvents = true` lets pointer events pass through a component that has a hit box: the pointer's
  target, hover (`hoveredTag`), the cursor and `graph.getElementOverPoint()` skip it for the component under it. Its
  hit box stays: it counts in the usable rect, and `getElementsOverPoint()` and `getElementsOverRect()` return it.
  Override `isTransparentToEvents()` to decide per instance. A component that must stay out of every hit query keeps
  `onHitBox() { return false; }`.

  ```typescript
  import { GraphComponent } from "@gravity-ui/graph";

  /** Reserves usable-rect space under a layer's HTML panel; never the pointer's target. */
  class Reserver extends GraphComponent {
    public static override transparentToEvents = true;
  }
  ```
  ````

- [ ] **Step 2: System pages**

`system/event-model.md`: replace the "Evented Areas" paragraph (`:108-112`) by:
"**Child components.** A scene component returned from another one's `updateChildren()` is a hit-test target of its
own, ordered with its parent in the scene (children above their parent, in the pre-order of their nesting). Its
events bubble to its parent through the parent walk. See
[Block component](../components/block-component.md#child-components).
**The model (D5).** A component the pointer is on handles its event and lets it go on, or stops it. An event it
does not stop walks to its parent, its parent's parent and on; each ancestor can check `detail.target` and decide.
On a target change GraphLayer fires `mouseleave` and `mouseout` at the old target, then `mouseenter` and `mouseover`
at the new one, each walking the parent chain. Only the sides that exist get them: entering the graph sends no leave,
leaving it no enter. Their `detail.relatedTarget` names the other side of the change, none for the camera or
outside. The graph's own events (`graph.on`, `useGraphEvent`) are the same events with the same targets and
`relatedTarget`; the CursorLayer follows them. When what a still pointer hits changes, GraphLayer finds the target
again and fires the same leave and enter. It does so at the end of the frame, or at the release of a drag, after:
- a component hidden or unmounted (an unmounted target gets no event: the nearest graph component above it gets the
  leave in its place);
- a hit box that was set before moving, resizing, going or coming back (a block or an anchor moved through the API,
  a child's look); a component that mounts under the pointer is found at the next pointer move;
- a child's hit levels changing;
- an HTML hold taken or released;
- a level change.

A pointer that leaves the graph changes the target to none, and a camera move then finds no target
(`emulateMouseEventsOnCameraChange`).
**Hover styles.** `hoveredTag` is a styling tool that components put on themselves (`setHoveredTag`): the library
`Block` while the pointer is on it or a descendant, `Anchor`, connections and groups while they are the target. No
library code reads a tag to decide behaviour."
Add "Transparent components" (one paragraph, as in Step 1) and "Hit levels" ("a scene component is hit on the levels
where it is shown: its look's levels, or every level while an HTML view holds its block; `static hitLevels`
overrides"). In the TL;DR add "Pointer targeting skips components transparent to events and scene components the
level does not show."

`system/scene.md`:
- "`query` and `drawInterpreted`": `query(rect, options)` with `level`, `includeHidden` (views say `hidden: true`) and
  `entityTypes` (the element's `entityType`, the writer's `static entityType`); the minimap example becomes:

  ```ts
  const elements = graph.scene.query(rect, { level: "minimalistic", includeHidden: true, entityTypes: ["block"] });
  graph.scene.drawInterpreted(ctx, elements, k, { level: "minimalistic", skipText: true, drawHidden: true });
  ```

  and paragraphs on `revisionOf` ("steps at the end of each graph frame in which elements of that type changed, or
  style rows were rewritten; a layer that draws from `query()` redraws on it, the minimap with `"block"`") and on
  `onFrameEnd` ("runs after every layer and the scene updated; ReactLayer switches its HTML there");
- "`compareOrder`": add the hit-level rule (as in event-model) and "`getElementsOverRect()` leaves out what the level
  does not hit";
- a "Child elements" paragraph:
  - the sub-component defaults: nested in the parent's element, the parent's origin, the bounds as the hit box, the
    development error for duplicate keys;
  - the nesting in the store: `parent` is the owner and `nestedIn` the child element an element is nested in. The
    owner's draw list (`childrenOf`) is the pre-order of the nesting. Hidden, `dim` and `opacity` are derived down
    the chain; an export-only `dim` or `opacity` reaches direct children only (D3);
- a "Bounds and styles" note: "A style row that scales circles or widens strokes (the anchor hover ×1.8) grows the
  element's indexed bounds, so the Canvas 2D viewport query finds what it draws; the element's `bounds` stay the ones
  its component wrote. Limitation: `toImage()` resolves its own styles; geometry grown only by an export's rules is not
  indexed, so such an export can crop it. A `{ px }` width without `maxWorld` in a rule grows the bounds to its width
  at the minimum scale; development builds warn.";
- `:150` and `:172`: `renderAnchor` becomes `getAnchorClass` ("the search reads a block's anchor classes from
  `getAnchorClass`, as cached by its last update").

`system/tags-and-styles.md:311`: "Another shape needs an `Anchor` subclass with its own level methods, returned from
the block's `getAnchorClass(anchor)` (see [Anchors](../components/anchors.md))." In "Built-in tags", `hoveredTag`
(re-review 10) becomes:
- "a styling tool that components put on themselves (`GraphComponent.setHoveredTag`, D5). The library `Block` tags
  itself while the pointer is on it or on any of its descendants (CSS `:hover`; `isHoveredBy` decides). `Anchor`,
  connections and groups tag themselves while they are the pointer's target. A custom component tags itself only if it
  does so; nothing binds the tag to the pointer";
- "styling only: no library code reads `hoveredTag`, or any tag's membership, to decide behaviour. Events, targets,
  the cursor, hit-testing and menus come from the event model";
- "one indirect effect: a rule that gives a tagged component a `raise` changes the scene order, and the hit order
  follows it. So a `hoveredTag → raise` rule changes which component gets clicks where components overlap; the theme
  has no such rule. A `scale` (the anchor's ×1.8) changes the drawing and the culling bounds, not the hit box
  (spec §9)".

`system/component-lifecycle.md:134`: replace the sentence on evented areas with "Retained components draw clickable
regions as child components (see the block page)."

`react/usage.md`, "GraphBlock": add the handover paragraph ("`GraphBlock` hands its block over to HTML once React has
rendered it, while the scene is at the detailed level; `autoHideCanvas={false} canvasVisible={!ready}` keeps the scene
drawing until the view is ready. ReactLayer switches its HTML at the end of the graph frame, so zooming out draws the
canvas blocks in the frame that hides the HTML; a stopped graph does not switch it. Clicks on the HTML reach the graph's
events with the component under the pointer as the target.") and note that a new container's z-index rank arrives one
frame after it mounts (ledger `progress.md:94`).

- [ ] **Step 3: The migration guide**

In `migration-guides/v1-to-v2.md`, "Blocks in the scene":
- table "Removed `Block` members": replace the `renderAnchor()` row (`:1086`) by
  "| `renderAnchor(anchor)` returning a descriptor | `getAnchorClass(anchor)` returning an anchor class; size and line
  width are the class's `SIZE` and `LINE_WIDTH`; the key is the anchor's id. An anchor class takes no props of its own. |"
  and add
  "| `setRenderDelegated(true)` from an HTML view | `delegateRender({ canvasVisible })` (graph-react's `GraphBlock` does
  it): the scene hides the block only at the detailed level. `setRenderDelegated` remains, without the level rule. |"
  and
  "| reading `this.hidden` to know the block is handed to HTML | `isRenderDelegated()` (both writers), or
  `isShownOutsideScene()` to include views that keep the canvas drawing. |";
- "Anchors": add "**Anchor classes.** A `renderAnchor` override becomes `getAnchorClass`." with a before/after diff:

  ```diff
  - protected renderAnchor(anchor: TAnchor) {
  -   return MyAnchor.create({ ...anchor, zIndex: this.zIndex, size: 16, lineWidth: 2, shape: "square",
  -     port: this.getAnchorPort(anchor.id) }, { key: `${anchor.id}/${anchor.index}` });
  - }
  + protected override getAnchorClass(anchor: TAnchor): TAnchorClass {
  +   return anchor.type === "OUT" ? SquareAnchor : Anchor; // class SquareAnchor { static SIZE = 16; ... }
  + }
  ```

  and the recipe for anchors with props of their own (the reference consumer's case, facts §9):
  - a shape prop becomes one class per shape, chosen from the block's data (`this.state.meta`);
  - what the look reads (data types for its colour) comes from the block's view data (`view.block`);
  - what code outside the look reads (connection validation reading `isGraphEndpoint`, `dataTypes`) becomes a method of
    the anchor class that reads its block's data (`this.connectedState.block`, or the parent block component);
  - a state such as muted becomes a tag with a style rule;
  - a per-block size getter that returns a constant becomes the class's `SIZE`; a size that differs per block needs
    one class per size;
  - a key with the anchor's index (`${id}/${index}`) only changed component identity: the key is the anchor's id now,
    and development builds report two anchors with one id.
- a new subsection "### Evented areas are removed": "`eventedArea(fn, params)` and its hover tracking are gone. A
  clickable region becomes a child component: a `SceneComponent` returned from the block's `updateChildren()`, with its
  rect as its look (or `getHitRect()` without a look), its handlers as listeners, and the `hovered` state of the render
  callback as `hoveredTag` on the child, styled by rules on its class. To keep a region off a level, draw nothing
  there or declare `static hitLevels`; a region without a look must declare it." Then the event-order changes
  (re-review 8), each as a bullet:
  - **Handler order.** The owner's handlers ran before its areas' (`_fireEvent`). Now the child's handler runs first,
    then its parent's through bubbling.
  - **Stopping.** A child's `stopPropagation()` keeps the event from its parent: a button that stops its click no
    longer lets the block select.
  - **Overlaps.** A click went to every area under the pointer. Now it goes to the one topmost child.
  - **Outside the owner.** A child's hit box may lie outside its owner's, and takes events there.
  - **Hover events.** As for every event, `mouseenter` and `mouseleave` walk the parent chain from the target, so a
    block's listeners hear its children's hover too. Check `detail.target` and the new `detail.relatedTarget` to tell
    which. `Anchor` no longer stops its hover events, only its clicks and presses.

  The diff:

  ```diff
  - class TestBlock extends LegacyCanvasBlock {
  -   render() {
  -     super.render();
  -     this.eventedArea(() => ({ x: this.state.x, y: this.state.y, width: 50, height: 50 }), {
  -       key: "area1",
  -       click: () => onArea1(),
  -     });
  -   }
  - }
  + class Area1 extends SceneComponent<object, TGraphComponentProps & { blockId: string }> {
  +   public static override entityType = "area1";
  +   public override getEntityId(): string { return this.props.blockId; }
  +   protected override willMount(): void { super.willMount(); this.addEventListener("click", () => onArea1()); }
  +   protected override getViewData(): object { return {}; }
  +   protected override schematic(): readonly TScenePrimitive[] {
  +     return [{ kind: "rect", x: 0, y: 0, width: 50, height: 50 }];
  +   }
  + }
  + class TestBlock extends CanvasBlock {
  +   protected override updateChildren(): ChildDescriptor[] {
  +     return [Area1.create({ blockId: String(this.props.id) }, { key: "area1" }), ...super.updateChildren()];
  +   }
  + }
  ```

- a new subsection "### Hit levels and transparent components":
  - "A scene component is hit on the levels where it is shown: an element owner (a block) on every level; a child (an
    anchor, a child component) on the levels its look is drawn on, and on every level while an HTML view holds its
    block; a child without a look only on the levels its `static hitLevels` declares (required: without it the child
    is not hit, and development builds warn). `static hitLevels` overrides the rule in every case. The stock anchor at the detailed
    level without an HTML view is no longer hit (v1 drew no canvas anchor there but hit it): the block under it is.
    `getElementsOverRect()` leaves out what the level does not hit."
  - "`static transparentToEvents = true` is available for a component that keeps a hit box but must never be the
    pointer's target: `getElementOverPoint()` and the pointer skip it, while `getElementsOverPoint()`,
    `getElementsOverRect()` and the usable rect keep it. `onHitBox() { return false; }` keeps working and leaves the
    component out of every hit query; keep it where that is what you need.";
- a new subsection "### Events and hover (D5)":
  - "The event model is the component tree's: the component under the pointer handles an event and lets it go on, or
    stops it; an event it does not stop reaches its parent, and its parent's parent, and each can check
    `detail.target`. Hover events also carry `detail.relatedTarget`, the other side of the target change (none for
    the camera or outside), so a parent can tell whether the pointer stayed inside it.";
  - "The graph's events (`graph.on`, `useGraphEvent`) are unchanged, with `relatedTarget` added
    (`GraphMouseEvent.detail.relatedTarget`): menus and cursors that follow the target behave as before. Only the
    sides of a change that exist get events: entering the graph no longer sends the new target a `mouseleave`
    first.";
  - "**A removed hovered component** gets no event, as before. The nearest graph component above it gets the
    `mouseleave` in its place when the pointer is no longer on it, so a block whose hovered child is removed stops
    showing as hovered.";
  - "**A still pointer.** When what it hits changes, the target is found again at the end of the frame: a component
    hidden, shown or removed; a hit box that was set before moving, resizing, going or coming back (a block or an
    anchor moved through the API, a child's look); hit levels, an HTML hold or the scene level changing. Hover and
    cursor used to wait for the next pointer move there. The graph's `mouseenter` and `mouseleave` fire then as
    well, so menus, tooltips and other listeners that follow the target react without a pointer move. A component
    that mounts under the pointer is found at the next move, as before, and so are the anchors a pan creates. Camera
    moves keep the `emulateMouseEventsOnCameraChange` rule, and the emulation finds no target after the pointer left
    the graph.";
  - "`hoveredTag` is written by components on themselves, for styles only. The binding to the pointer's target is
    gone. The library `Block` tags itself while the pointer is on it or on a descendant (`isHoveredBy`); `Anchor`,
    connections and groups while they are the target. A custom component with a `static entityType` that relied on
    the binding tags itself now: call `this.setHoveredTag(pointerTargetAfter(event) === this)` from its
    `mouseenter`/`mouseleave` listeners, or `isWithinComponent(this, pointerTargetAfter(event))` for a CSS-like hover
    of itself and its descendants.";
  - "Visible change: a block stays hovered (`hoveredTag`, React's `graph-tag-hovered`) while the pointer is on its
    anchor or another child; the tag used to go away there.";
  - "`Anchor` now lets its `mouseenter`/`mouseleave` reach its block. A block listener that set a hover state on
    `mouseenter` and cleared it on `mouseleave` without checking `detail.target` now also hears its anchors': the
    state stays on over the anchor and goes off when the pointer leaves the block. Check `detail.target`, or
    `detail.relatedTarget` on leave, to keep the old behaviour.";
  - "No library code reads `hoveredTag` to decide behaviour. A rule that gives hovered components a `raise` changes
    the scene order, and so the hit order where components overlap; a `scale` changes the drawing, not the hit box.";
  - "**An overridden `dispatchEvent`.** The hover hook `onDispatchedEvent` runs in the parent walk (`_dipping`). A
    class that overrides `dispatchEvent` to fire its own listeners without the walk, as a block that keeps its events
    to itself does, skips its own hook too: the library `Block`'s hover then follows only what bubbles up from its
    anchors, so it is off over the body and stays on after the pointer leaves the body. Keep the stopping and call
    the hook first:"

    ```diff
      public override dispatchEvent(event: Event): boolean {
        if (!this.isInteractive()) return this._dipping(this, event);
    +   // Its own events reach the hover hook, as the parent walk would do (D5).
    +   this.onDispatchedEvent(event);
        if (this._hasListener(this, event.type)) this._fireEvent(this, event);
        return false;
      }
    ```

    "Routing through `super.dispatchEvent(event)` instead changes more than the hover: the events then walk on to the
    block's parents (the camera unsets the selection on a `click` that reaches it) unless a listener stops them.";
- a new subsection "### What D4 changes for anchors": the D4 consequences table of this plan's "Decisions applied",
  with its "Tested in" column dropped. Add: "`<GraphBlock autoHideCanvas={false}>` without `canvasVisible` now
  registers the view (the canvas stays drawn), so its anchors are hit through the HTML at the detailed level. A
  canvas-only graph that started connections from anchors at the detailed level starts them at the schematic level,
  or marks anchor ports `snappable`.";
- "Minimap, export and the canvas": the minimap bullet becomes "The minimap draws the scene's block elements with
  `graph.scene.query(rect, { level: "minimalistic", includeHidden: true, entityTypes: ["block"] })` and the
  interpreter, in the blocks list order, from a cached picture redrawn on `graph.scene.revisionOf("block")` and on
  block moves; it shows tags and styles one frame after the main view. `LegacyCanvasBlock`s draw with
  `renderMinimalisticBlock(ctx, { text: false })` and redraw it on every camera move.";
- the checklist at the top gains "Replace `renderAnchor` overrides by `getAnchorClass`; move evented areas to child
  components; read `isRenderDelegated()` instead of `hidden`."

- [ ] **Step 4: Spec text (M14)**

In `docs/superpowers/specs/2026-11-10-v2-scene-core-design.md`:
- §5.1: "sub-components at an offset in the parent's element" becomes "sub-components draw in child elements nested
  in their parent's element, to any depth, keyed by their parent's key plus a child sub-order (D2)";
  `transparentToEvents` lives on `GraphComponent`;
- §5.2: hover styling is each component's own (D5): the library `Block` shows as hovered while the pointer's target
  is it or one of its descendants, as CSS `:hover` (В1); anchors, connections and groups while they are the target; a
  custom component decides for itself (`setHoveredTag`). Events walk the parent chain with `relatedTarget`;
- §5.2: "evented areas … with a hitbox" becomes "child components with a hit box of their own, hit-tested globally";
- §3.1: `query(rect, options)`, `revisionOf(entityType)` and `onFrameEnd(listener)` are public scene API;
- §9: the hit rule of D4 ("hit where shown; `hitLevels` authoritative");
- §12: "block elements, in the blocks list order" (В2 (а)).

- [ ] **Step 5: Compile the examples**

Collect every new TypeScript example of Steps 1–3 into `t12-scripts/doc-examples.tsx` (the diffs' `+` sides as
classes, with `declare function onArea1(): void;`; the `dispatchEvent` recipe as the method of
`class KeepingBlock extends CanvasBlock`). Build the packages and compile:

```bash
pnpm run build
node_modules/.bin/tsc --ignoreConfig --strict --noImplicitOverride --noEmit --target es2022 --module esnext \
  --moduleResolution bundler --lib es2022,dom,dom.iterable --skipLibCheck --jsx react-jsx \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/t12-scripts/doc-examples.tsx
```

Expected: exit 0 (plan 3a Task 18 compiled its examples the same way, `t18-doc-examples.log`).

- [ ] **Step 6: Line lengths and leftovers**

Run (characters, not bytes):

```bash
python3 -I -c 'import sys
for path in sys.argv[1:]:
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        if len(line.rstrip("\n")) > 120: print(f"{path}:{n}")' \
  packages/graph/docs/components/*.md packages/graph/docs/system/*.md packages/graph/docs/react/usage.md \
  packages/graph/docs/migration-guides/v1-to-v2.md packages/graph-minimap/README.md
grep -rn "renderAnchor\|eventedArea\|EventedArea" packages/graph/docs packages/graph-minimap/README.md
```

Expected: no line this task touched is listed (pre-existing long lines and table rows may remain); the grep finds
only the migration guide's "before" sides and its "removed" statements. The controller records the tree hash (commit
message: `docs(graph): child components, anchor classes, the handover, hit levels, the minimap`).

---

### Task 13: Bench cases for the new paths, and a hover mode

The guarantee scene uses the stock anchor class and no children, so it cannot measure the new paths (Codex 10, Opus
I4). Two narrowly scoped cases are measured and reported, not gated:
- `--far-anchors`: an anchor class created at the minimalistic level, for every anchor of the scene (the worst case
  of В3 (а));
- `--child-looks N`: N chips with looks per block.

The new hover path is not covered by pan, zoom and drag (round-2 re-review 9; round 3's 7 and 8 check its route and
name its statistics): the hit test's level checks, D5's
dispatch with `relatedTarget`, the blocks' and anchors' own `hoveredTag` writes and their style rows. A `hover` mode
moves the pointer through the root's DOM listener, as a mouse does: body → anchor → body of one block, then the next
block. Task 14 gates it against HEAD.

**Files:**
- Modify: `scripts/bench/culling/scene/blocks.ts`, `scripts/bench/culling/scene/entry.ts`,
  `scripts/bench/culling/scene-run.mjs`, `scripts/bench/culling/README.md`.

- [ ] **Step 1: The bench classes**

In `scene/blocks.ts`:
- imports: add `Anchor` and `SceneComponent` to the `GRAPH` value import, and `ChildDescriptor`, `TAnchorClass`,
  `TGraphComponentProps`, `TSceneLevel` to its type import;
- after `SceneNirvanaBlock`:

```ts
/** `--far-anchors`: an anchor class created and drawn on the minimalistic level too (a 6 x 6 square there). */
class BenchFarAnchor extends Anchor {
  public static override CREATION_LEVELS: readonly TSceneLevel[] = ["minimalistic", "schematic", "detailed"];

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "anchor", x: -3, y: -3, width: 6, height: 6 }];
  }
}

class FarAnchorsBlock extends SceneNirvanaBlock {
  protected override getAnchorClass(): TAnchorClass {
    return BenchFarAnchor;
  }
}

/** `--child-looks N`: a 12 x 12 chip along the block's top edge, drawn on the schematic level. */
class BenchChip extends SceneComponent<{ index: number }, TGraphComponentProps & { id: string; index: number }> {
  public static override entityType = "benchChip";

  public override getEntityId(): string {
    return this.props.id;
  }

  protected override getViewData(): { index: number } {
    return { index: this.props.index };
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return [];
  }

  protected override schematic(view: { index: number }): readonly TScenePrimitive[] {
    return [{ kind: "rect", part: "chip", x: 8 + view.index * 16, y: 4, width: 12, height: 12 }];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return [];
  }
}

/** The number of chips of `ChildLooksBlock` (`--child-looks N`), set by `setupBlocks`. */
let childLooks = 0;

class ChildLooksBlock extends SceneNirvanaBlock {
  protected override updateChildren(): ChildDescriptor[] {
    const id = String(this.props.id);
    const chips = Array.from({ length: childLooks }, (_, index) =>
      BenchChip.create({ id: `${id}/${index}`, index }, { key: `chip${index}` })
    );
    return [...chips, ...super.updateChildren()];
  }
}

/** The block class of the "nirvana-like" blocks: the stock one unless a new-path case asks for another. */
function nirvanaBlockClass(options: { farAnchors?: boolean; childLooks?: number }): typeof SceneNirvanaBlock {
  if (options.farAnchors) return FarAnchorsBlock;
  if ((options.childLooks ?? 0) > 0) return ChildLooksBlock;
  return SceneNirvanaBlock;
}
```

- `setupBlocks`'s options gain `farAnchors?: boolean; childLooks?: number;`; before `new Graph(...)`, add
  `childLooks = options.childLooks ?? 0;`, and `blockComponents` becomes
  `options.look === "nirvana" ? { "nirvana-like": nirvanaBlockClass(options) } : {}`.

The default columns keep `SceneNirvanaBlock` (no `getAnchorClass` override), so the gated numbers take the stock path.

- [ ] **Step 1b: The hover mode**

In `scene/walk.ts`, add the stop type (round 3, findings 7 and 8):

```ts
/** One block of the hover path: client points of its body and of its OUT anchor, and the ids they must hit. */
export type THoverStop = {
  blockId: string;
  anchorId: string;
  body: { x: number; y: number };
  anchor: { x: number; y: number };
};
```

and `TColumn` gets:

```ts
  /** Blocks columns: one pointer move of the hover path (`--modes hover`), through the root's DOM listener. */
  hover?(step: number): void;
  /**
   * Blocks columns: sets the hover path before a hover run, from saved stops (checked again) or new ones, and returns
   * the stops. It throws unless all 30 stops hit their block at the body point and its anchor component at the
   * anchor point, so a run that would miss the anchors fails.
   */
  setHoverPath?(stops?: readonly THoverStop[]): THoverStop[];
  /** Blocks columns: the graph's `mouseenter` events since setup, one per target change. */
  hoverEnters?: { count: number };
  /** Blocks columns: `graph.scene.drawInterpreted` calls since setup (the minimap's redraws). */
  minimapDraws?: { count: number };
```

In `scene/blocks.ts` (`THoverStop` joins the `./walk` type import), `setupBlocks` builds them for its column, after
the graph started:

```ts
  // The minimap is the only caller of drawInterpreted on the bench page.
  const minimapDraws = { count: 0 };
  const drawInterpreted = graph.scene.drawInterpreted.bind(graph.scene);
  graph.scene.drawInterpreted = (...args: Parameters<typeof drawInterpreted>): void => {
    minimapDraws.count += 1;
    drawInterpreted(...args);
  };
  /** The blocks of the hover path: body, anchor, body each. */
  const HOVER_STOPS = 30;
  const toClient = (point: TPoint): TPoint => {
    const camera = graph.cameraService.getCameraState();
    return { x: point.x * camera.scale + camera.x, y: point.y * camera.scale + camera.y };
  };
  const toWorld = (point: TPoint): TPoint => {
    const camera = graph.cameraService.getCameraState();
    return { x: (point.x - camera.x) / camera.scale, y: (point.y - camera.y) / camera.scale };
  };
  /** Whether a stop's points hit what the path needs: its block's component, then its anchor's component. */
  const hitsItsTargets = (stop: THoverStop): boolean => {
    const state = graph.rootStore.blocksList.getBlockState(stop.blockId);
    const anchor = state?.getAnchorById(stop.anchorId)?.getViewComponent();
    if (!state || !anchor) return false;
    return (
      graph.getElementOverPoint(toWorld(stop.body)) === state.getViewComponent() &&
      graph.getElementOverPoint(toWorld(stop.anchor)) === anchor
    );
  };
  /**
   * New stops: the first 30 blocks of the viewport query with an OUT anchor whose body and anchor points both lie in
   * the client view (1600 x 1000 on the bench page) and hit their targets. The viewport query reaches past the view
   * (`getViewportRect`), and lazy anchors exist only for blocks the camera shows, so the filter comes before the count.
   */
  const findHoverStops = (): THoverStop[] => {
    const { width, height } = graph.cameraService.getCameraState();
    const inView = (point: TPoint): boolean => point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
    const stops: THoverStop[] = [];
    for (const view of graph.getElementsInViewport([CanvasBlock])) {
      if (stops.length === HOVER_STOPS) break;
      const state = view.connectedState;
      const out = state.$anchors.peek().find((anchor) => anchor.type === "OUT");
      if (!out) continue;
      const geometry = state.$geometry.peek();
      const stop: THoverStop = {
        blockId: String(state.id),
        anchorId: String(out.id),
        body: toClient({ x: geometry.x + geometry.width / 3, y: geometry.y + geometry.height / 2 }),
        anchor: toClient(view.getAnchorPort(out.id).getPoint()),
      };
      if (inView(stop.body) && inView(stop.anchor) && hitsItsTargets(stop)) stops.push(stop);
    }
    return stops;
  };
  let path: TPoint[] | undefined;
  const setHoverPath = (given?: readonly THoverStop[]): THoverStop[] => {
    const stops = given ? [...given] : findHoverStops();
    const missed = stops.filter((stop) => !hitsItsTargets(stop)).length;
    if (stops.length < HOVER_STOPS || missed > 0) {
      const want = `${HOVER_STOPS} must hit their block and anchor`;
      throw new Error(`hover path: ${stops.length} stops, ${missed} of them missing a target; ${want}`);
    }
    path = stops.flatMap((stop) => [stop.body, stop.anchor, stop.body]);
    return stops;
  };
  const hoverEnters = { count: 0 };
  graph.on("mouseenter", () => {
    hoverEnters.count += 1;
  });
  const hover = (step: number): void => {
    if (!path) throw new Error("hover: setHoverPath() runs before the first move");
    const point = path[step % path.length];
    root.dispatchEvent(new MouseEvent("mousemove", { clientX: point.x, clientY: point.y, bubbles: true }));
  };
```

and returns `hover`, `setHoverPath`, `hoverEnters` and `minimapDraws` with the column (`root` is the page's graph
root; it sits at the page origin, so client and root coordinates agree).

In `scene/entry.ts`, `THoverStop` joins `import type { TColumn, TQueryTiming } from "./walk";` (round 4's
re-review), and `run()`'s options gain `hoverPath?: readonly THoverStop[]`. After the view is centred
(`centerAt` and its two frames), a hover run sets its path,
`const hoverStops = options.mode === "hover" ? column.setHoverPath?.(options.hoverPath) : undefined;`, and
`entersBefore` (`column.hoverEnters?.count ?? 0`) and `drawsBefore` are read before the loop. The action gets
`else if (options.mode === "hover") column.hover?.(i);` before the drag branch. The result gets
`minimapDraws: (column.minimapDraws?.count ?? 0) - drawsBefore`,
`hoverEnters: (column.hoverEnters?.count ?? 0) - entersBefore` and `hoverPath: hoverStops`. The `actionMs` of a hover
step is the time GraphLayer takes to handle that `mousemove` (hit test, dispatch, tag writes).

In `scene-run.mjs`, the mode list accepts `hover` (the default stays `pan,zoom,drag`), with a new option after
`--minimap`:

```js
// --hover-path <file>: the hover mode's checked stops (3b Task 14). The first hover run writes them when the file does
// not exist; every later run, in either library tree and with or without --minimap, reads the same stops and checks
// them again.
const hoverPathFile = option("hover-path", undefined);
if (hoverPathFile === true) fail("--hover-path: give a file");
let hoverPath =
  hoverPathFile && fs.existsSync(hoverPathFile) ? JSON.parse(fs.readFileSync(hoverPathFile, "utf8")) : undefined;
```

The `window.bench.run` options pass `hoverPath`. After each run's result is stored:

```js
          if (mode === "hover") {
            // Every move of the path changes the target (body, anchor, body, the next body): fewer `mouseenter`
            // events than moves mean the run did not take the path it reports. `10` is the run's warmup.
            const moves = 10 + steps;
            if (result.hoverEnters < moves) fail(`hover: ${result.hoverEnters} target changes in ${moves} moves`);
            if (!hoverPath) {
              hoverPath = result.hoverPath;
              if (hoverPathFile) fs.writeFileSync(hoverPathFile, JSON.stringify(hoverPath, null, 2));
            }
          }
```

`results[mode]` gets `minimapDraws: []`, filled with `result.minimapDraws`, and the hover line prints
`minimap draws <sum>` (over the repeats) after `action`. The hover line's tick (`hover <ms>`) and `action` are means,
as for the other modes (`scene-run.mjs:414,416`); Task 14 gates them under those names.

- [ ] **Step 2: The options**

In `scene/entry.ts`, `setup`'s options gain `farAnchors?: boolean; childLooks?: number;` (documented as "Blocks
columns: Task 13's new-path cases") and pass them to `setupBlocks`.

In `scene-run.mjs`, after `--minimap`:

```js
// --far-anchors: the blocks columns' anchors use a class created and drawn at the minimalistic level (3b Task 13).
const farAnchors = Boolean(option("far-anchors", false));
// --child-looks <N>: every block of the blocks columns gets N child components with a look (3b Task 13).
const childLooksOption = option("child-looks", 0);
const childLooks = childLooksOption === true ? 4 : Number(childLooksOption);
if (!(Number.isInteger(childLooks) && childLooks >= 0)) fail(`--child-looks: "${childLooksOption}" is not a count`);
if (farAnchors && childLooks > 0) fail("--far-anchors and --child-looks measure one new path each: pass one");
```

(`fail` is a hoisted function declaration, `scene-run.mjs:106`), pass
`farAnchors, childLooks` in the `window.bench.setup` options, and add
`(farAnchors ? " far-anchors" : "") + (childLooks > 0 ? ` child-looks ${childLooks}` : "")` to the header line.

In `README.md`, document both options as report-only cases of plan 3b.

- [ ] **Step 3: Run them (controller, outside the sandbox, through the lock)**

Write `.superpowers/sdd/2026-11-15-scene-blocks-3b/t13-run.sh` (a bash script: the controller's shell is zsh, whose
`$extra` would not split `--child-looks 4` into two arguments):

```bash
#!/usr/bin/env bash
set -euo pipefail
ws=.superpowers/sdd/2026-11-15-scene-blocks-3b
run_case() {
  local name="$1"
  shift
  bash "$ws/with-chromium-lock.sh" "$ws/t13-bench-$name.log" \
    node scripts/bench/culling/scene-run.mjs --gpu --scenes guarantee --scales 0.038,0.3 --modes pan,zoom,drag \
    --renderers blocks,blocks-webgl --repeats 5 "$@"
}
run_case default
run_case far-anchors --far-anchors
run_case child-looks --child-looks 4
# The header line names the effective case: a run that silently measured the default fails here.
grep -q " far-anchors" "$ws/t13-bench-far-anchors.log"
grep -q " child-looks 4" "$ws/t13-bench-child-looks.log"
if grep -q " far-anchors\| child-looks" "$ws/t13-bench-default.log"; then exit 1; fi
```

Run: `bash .superpowers/sdd/2026-11-15-scene-blocks-3b/t13-run.sh`
Expected: exit 0: every run passed and each log's header names its case. Report, per case against the run without
options: mount, heap, the pan, zoom and drag
ticks at 0.038 (minimalistic: `--far-anchors` creates every anchor in view) and at 0.3 (schematic: the chips draw),
and whether WebGL fell back (`watchSceneLimits`). Compare `--far-anchors` with В3's estimate (+770 ms mount, +200 MB
for 40k anchor components, 1–3 ms per far-zoom pan) in the report. Nothing is gated.

- [ ] **Step 4: Leave the changes in the working tree**; the controller records the tree hash (commit message:
  `test(bench): a hover mode; report-only cases for minimalistic anchor classes and child looks`).

---

### Task 14: Final verification and the gates (controller)

**Files:** none changed; logs under `.superpowers/sdd/2026-11-15-scene-blocks-3b/`.

- [ ] **Step 1: The sandbox-safe checks**

Run, one after the other, each into its log (`ctl-final-<name>.log`, as `.superpowers/sdd/2026-11-12-scene-blocks/ctl-verify.sh`):
`pnpm run build`, `pnpm --dir packages/graph exec jest`, `pnpm --dir packages/graph-react exec jest`,
`pnpm run typecheck`, `pnpm run lint`, `pnpm run test:package-contract`.
Expected: every one exits 0. The graph jest count is Task 1's plus this plan's 74 new tests:
- Task 2: levels 2, anchorClass 8;
- Task 3: nested store 6, sceneChildren 19, EventedComponent 1 (two systems tests are replaced, not added;
  `graphEvents.test-d.ts` is a type test, checked by typecheck);
- Task 4: hitLevels 12;
- Task 5: transparent 3;
- Task 6: style and store 5;
- Task 8: handover 10;
- Task 9: query 7, style 1.

The graph-react count is Task 1's plus 5 (handover 4, ReactLayer 1).

- [ ] **Step 2: GPU checks and e2e (outside the sandbox, through the lock)**

```bash
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/ctl-final-slice.log node scripts/bench/culling/scene-slice.mjs
bash .superpowers/sdd/2026-11-15-scene-blocks-3b/with-chromium-lock.sh \
  .superpowers/sdd/2026-11-15-scene-blocks-3b/ctl-final-e2e.log \
  pnpm --filter @gravity-ui/graph-e2e exec playwright test --reporter=line
```

Expected: C1–C33 PASS. e2e passes 284:
- 289, less the 22 tests of the removed evented areas;
- plus 5 (children), 1 (handover), 7 (minimap scene), 1 (minimap text: 3 tests instead of 2) and 3 (connection
  editing under D4).

- [ ] **Step 3: The bench and its gates**

Run the two commands of Task 1, Step 2 (into `ctl-final-bench.log` and `ctl-final-bench-minimap.log`) and fill this
table from them and `baseline.txt`. Each metric is the statistic the runner prints (Global Constraints): a tick is a
mean over the measured steps of the 5 repeats; mount, heap and the bulk actions are medians of the 5 repeats.

| Column | Metric | Baseline (Task 1) | Final | Gate |
| --- | --- | --- | --- | --- |
| `blocks` | pan / zoom / drag tick ms (mean) | | | ≤ baseline + 5 % or + 0.3 ms |
| `blocks-webgl` | pan / zoom / drag tick ms (mean) | | | ≤ baseline + 5 % or + 0.3 ms |
| `blocks`, `blocks-webgl` | mount ms (median of 5) | | | ≤ baseline + 20 ms |
| `blocks`, `blocks-webgl` | heap MB (median of 5) | | | ≤ baseline + 2 MB |
| `blocks`, `blocks-webgl` | change-all, select-all, drag-start-1000 ms (median of 5) | | | ≤ baseline + 10 ms |
| `blocks --minimap` | pan tick ms (mean) | | | ≤ baseline `--minimap` pan |
| `blocks --minimap` | zoom / drag tick ms (mean) | | | ≤ baseline `--minimap` + 5 % or + 0.3 ms |
| `blocks-webgl --minimap` | pan tick ms (mean) | | | ≤ baseline `--minimap` pan |
| `blocks-webgl --minimap` | zoom / drag tick ms (mean) | | | ≤ baseline `--minimap` + 5 % or + 0.3 ms |
| `blocks-default` | pan tick ms (mean) / mount ms (median of 5) | | | ≤ baseline + 5 % / + 20 ms |

Then the hover A/B (re-review 9). HEAD has no hover mode, so run this tree's `scripts/bench/culling` against both
library trees, interleaved as plan 3a Task 17h's A/B: HEAD `a614f42e` in a separate worktree, with this tree's bench
scripts copied in. Task 13's new-path classes override methods HEAD never calls, and esbuild strips the types, so the
scripts build there; if they do not, drop the two classes from the copy, since they are not part of the hover run.
Start without `.superpowers/sdd/2026-11-15-scene-blocks-3b/hover-path.json`. Run, per tree, twice each and
alternating, HEAD first, `--gpu --scenes guarantee --scales 0.3 --modes hover --renderers blocks,blocks-webgl
--repeats 5 --hover-path .superpowers/sdd/2026-11-15-scene-blocks-3b/hover-path.json`, and once more per tree with
`--minimap`. The scale 0.3 is schematic, where the anchors are shown and hit. The first run writes the checked stops
to `hover-path.json`; every later run, in both trees and with the minimap, reads the same stops and checks them
again. A run fails when a stop does not hit its block and its anchor component, or when its moves changed the target
fewer times than they were made (round 3, finding 7). A tree's value below is the mean of its two runs' printed
means, each over 5 repeats of 40 measured moves. Fill:

| Column | Metric | HEAD | Final | Gate |
| --- | --- | --- | --- | --- |
| `blocks`, `blocks-webgl` | hover action ms per move (mean) | | | ≤ HEAD + 0.3 ms |
| `blocks`, `blocks-webgl` | hover tick ms (mean) | | | ≤ HEAD + 5 % or + 0.3 ms |
| `blocks --minimap`, `blocks-webgl --minimap` | hover action and tick ms (means) | | | as the two rows above |
| `blocks --minimap`, `blocks-webgl --minimap` | minimap draws during the hover path (sum over the repeats) | 0 | | 0 (the stock theme has no hover rule that changes a block's look) |

The hover rows are gates, not reports.

Expected: every gate holds. On a failure: stop, run the interleaved A/B against `a614f42e` (Global Constraints), and
report the per-tick split before any change. Task 13's new-path numbers are reported beside the table, marked "not
gated".

- [ ] **Step 4: Report**

Write the results, the tree hash and the open items into `progress.md` and report to the user: the numbers table
and Task 13's report-only numbers, the hover A/B, the e2e and slice counts, the red-first records of Tasks 3 (C31), 4,
8 (the e2e and C33) and 10, and the spec text of Task 12 Step 4.

---

## Self-review notes

- **Spec coverage:**

  | Spec | Where |
  | --- | --- |
  | §5.1 sub-components: child elements keyed by the parent's key plus a sub-order | Task 3 (any scene component, nested to any depth), plan 3a (anchors) |
  | §5.1 an element owner without primitives keeps a key, a hit box, events and the usable rect | Task 3 (test, Opus M13) |
  | §5.1 `transparentToEvents` | Task 5 |
  | §5.2 `getAnchorClass(anchor)` | Task 2 |
  | §5.2 sub-components with a hit box, events and state | Tasks 3, 4, 7 (D2 replaces evented areas; В1 hover) |
  | §5.2 the handover on `Block` | Task 8 |
  | §9 one order key for drawing and hit-testing sub-components | Task 3 (the store's pre-order of the nesting; children are global hit targets) |
  | §9 hit shapes separate from bounds; the hover scale culled by bounds | Task 3 (`getHitRect`), Task 6 (styled bounds), plan 3a (anchor hit boxes) |
  | §9 hit-testability follows the level; components without primitives declare theirs | Task 4 (D4, settled item 10) |
  | §10 what `delegateRender` hides: body, parts, anchors, children | Task 8 |
  | §10 HTML above the whole scene | unchanged; Task 12 docs |
  | §10 the detailed level without React | plan 3a (`detailed()`, schematic fallback); Task 11 check |
  | §10 the handover after the HTML mounted; `canvasVisible` | Task 8 (core, graph-react, red-first frame-output e2e, C33) |
  | §10 a delegated block keeps view data and tags current | Task 8 test |
  | §10 React z-index rank | plan 3a; the one-frame-late rank documented (Task 12) |
  | §12 the minimap on `query()`, minimalistic primitives, no text, computed styles | Tasks 9, 10 |
  | §12 no block API only for the minimap | Task 10 (`getSceneElementView` loses its only caller) |
  | §13 GPU checks | C30 (anchor classes), C31 (nesting), C32 (children), C33 (handover) |

- **Re-review findings** (`codex-plan-rereview.md`), all applied:

  | Finding | Where |
  | --- | --- |
  | 1 Critical: nested subtree order | Task 3. The store keeps the nesting (`up`, `kids`), and the owner's draw list is its pre-order. A reorder moves the subtree and a late child lands after its parent's descendants; tests cover several levels, a reorder and a late grandchild. No limit beyond the sub-order width; no ties beyond equal sibling orders, which keep the add order as before (settled item 8). |
  | 2 nested hidden and element styles | Task 3. `isDrawnHidden`, the query and the WebGL backend walk the nesting; `applyChildStyle` composes with the scene parent's drawn row. Store, component and GPU (C31) tests cover nested hide; Task 4 covers nested delegation |
  | 3 two D4 holes | Task 8 (`autoHideCanvas={false}` without `canvasVisible` registers the view; core and graph-react tests); Task 4 (look-less children are hit only where declared, with a warning; test) |
  | 4 `revisionOf` and owner-caused child changes | Task 9 (hidden, order and zIndex updates step the nested types; hide and raise tests; child-only changes still step only the child) |
  | 5 connection snapping | Task 4 header (corrected claim), the D4 consequences table, e2e for a plain anchor, a block-to-anchor-point drop and snappable ports |
  | 6 hover under a stationary pointer | Settled item 11; Task 3 (unmount, hidden, a child's look), Task 4 (the level), Task 8 (hold release) tests; the retarget waits for the hit test's queue |
  | 7 the minimap text test, red first | Task 10 (each redraw changes the scene; characterization and regression groups, the latter run red before Step 2); Task 8 Step 1 (the frame-output e2e runs red before the fix) |
  | 8 the migration guide's event order | Task 12 (handler order, stopping, overlaps, outside the owner, hover dispatch in general) |
  | 9 the story's running state | Task 11 (the HTML border reads `--graph-block-border-color`; the check observes it) |
  | 10 bench loops | Task 13 (a bash script with argument arrays; the logs' headers are checked) |
  | В2 suggestion: a mixed legacy/scene overlap | Task 10 (characterization test in both list orders) |

- **Re-review of round 2** (`codex-plan-rereview2.md`, ruled on in `plan-fix3-brief.md`), all applied:

  | Finding | Where |
  | --- | --- |
  | 1 composed rows | Task 3 Step 2: entries count their dependents; a row is freed only when no element and no composed row uses it, then its own parent row is reconsidered; `stylesWith` keeps one pass in map order (argued there, tested after a re-link); the plan's `a11` test is unchanged and now passes by design |
  | 2 graph bus vs CSS hover | superseded by D5: the bus keeps target semantics by decision, and `hoveredTag` is written by components, not derived from enter/leave |
  | 3 `childOrder` in nested revisions | Task 9 (`childOrder` joins `hidden`, `order`, `zIndex`; a test with two subtrees of the same types) |
  | 4 capture | Task 3 Step 7 (the position is kept during a capture; the request waits; the release always retargets); tests in Task 3 (a move during a capture) and Task 8 (a hold released during a drag, then `mouseup` and the release with no `mousemove`) |
  | 5 hit rect geometry | Task 3 Step 5 (`lastHitRect`: any change of the automatic rect requests a retarget); a still-pointer test where the child's look moves away |
  | 6 `levelsOf` | Task 3 Step 2 (`levelMaskOfPrimitives` in the literal and the `TNode.levels` JSDoc) |
  | 7 hold-release test | Task 8 Step 2 (the log is cleared after the first move; the expectations follow D5: the anchor's leave, its bubbling to the block, the block's enter) |
  | 8 root exit | Task 3 Step 7 (`onRootLeave`: a target change to none, deferred to the release under a capture); a test leaving the root straight from a child |
  | 9 hover performance | Task 13 (a `hover` mode through the root's DOM listener), Task 14 (an interleaved A/B against HEAD, gated: action ≤ HEAD + 0.3 ms, tick ≤ HEAD + 5 % or + 0.3 ms, minimap draws 0) |
  | 10 docs | Task 12 (`tags-and-styles.md` and the migration guide: `hoveredTag` as D5's styling tool written by components; required `hitLevels` for look-less children) |
  | 11 GPU checks red first | Task 3 Step 9 (C31 before the backend fix), Task 8 Step 1 (C33 with a hold that runs on the tree before the fix) |

- **Re-review of round 3** (`codex-plan-rereview3.md`, ruled on in `plan-fix4-brief.md`), all applied:

  | Finding | Where |
  | --- | --- |
  | 1 `relatedTarget` on the bus | Task 3 Step 7 (`dispatchNativeEvent` carries it; `graphEvents.ts`'s public `GraphMouseEvent` types it); Step 3's bus test checks both sides; `graphEvents.test-d.ts` is the tsc check |
  | 2 the missing side | Task 3 Step 7 (`dispatchHoverEvent` sends nothing to a side that does not exist); the bus test and the root-exit-and-back test. The first-entry expectations of Task 3's hover tests and Task 8 Step 2 were re-derived: they hold only with this dispatch (HEAD's helper logs a false leave first; Task 3 Step 3's red run lists it) |
  | 3 a removed child outside its owner | Task 3 Step 7 (`forgetComponent` keeps the nearest graph component above, `lostTargetOwner`; `onRootPointerMove` makes it the old side); a test with a chip outside its box, removed, the camera next |
  | 4 an anchor's manual hit box | Task 3 Step 5 (`GraphComponent.setHitBox` and `removeHitBox` ask for a retarget when a set box changes; a first box does not, so lazy anchors keep camera moves free of retargets); a test moving an anchor alone, then its block, through the API |
  | 5 camera emulation after a root exit | Task 3 Step 7 (`pointerInside` in `onCameraChangeEmulateMouseEvents`); a test with a root exit and a camera move, then an exit during a capture, its release and a camera move |
  | 6 an overridden `dispatchEvent` | Task 12 Step 3 (the recipe: call `onDispatchedEvent` before the own listeners); Task 3's regression test with such an override, adapted and not |
  | 7 hover A/B points | Task 13 Step 1b (stops filtered to the client view before the count; anchor components and both hit targets checked; the run fails otherwise, and when its moves changed the target fewer times than made); Task 14 (`--hover-path`: the same checked stops for HEAD, final and the minimap runs) |
  | 8 mean vs median | Global Constraints and Task 14: ticks and actions are gated as the runner's means, mount, heap and bulk actions as medians; `minimap draws` is a sum |
  | 9 wording | Task 12 Step 4 (the spec's hover is the library `Block`'s property; custom components decide); facts §10 (the hit-level hot path as `isHitOnLevel()` is) |

  Nirvana's border-hover change stays listed: the migration guide's `Anchor` bullet (Task 12 Step 3), the risks
  below and facts §11.

- **Narrow check of round 4** (`codex-plan-rereview4.md`: ready with fixes; choice (b) confirmed), both applied:

  | Item | Where |
  | --- | --- |
  | (a) the camera exemption missed Task 4's first hit mask | Task 4 Step 3 (`syncHitMask(written, initial)`: the first successful add, `adds === 0`, sets the mask without a request); Task 4's pan test (lazy anchors created by a same-level pan with emulation off leave the target the camera until the next move); Task 3 Step 5's note and settled item 11 |
  | Task 13's missing type import | Task 13 Step 1b: `THoverStop` joins `entry.ts`'s `./walk` type import |
  | consumer effect of (a) | settled item 11, the migration guide's still-pointer bullet, the risks below: bus listeners react to API geometry changes without a pointer move |

  Under D5 the "D4 consequences" table and the migration guide's event-order list still hold:
  - child handlers run before the parent's;
  - `stopPropagation` ends the walk;
  - an overlap picks one top target;
  - the bus's hover events report target changes, so Nirvana's hover menus behave as today.
  The list's hover-dispatch bullet now states D5's bubbling and `relatedTarget` instead of target-only delivery.

- **First-round findings** (`plan-fix1-brief.md` rulings): applied as listed in the round-1 hand-back. These items stay
  not applied, for the same reasons:
  - Codex 2 (export-only styled bounds) is a D3 limitation;
  - Codex 4 (a same-frame minimap) is answered by D1;
  - Codex 7 and 8, Opus I2's area parts, M9–M11 and M16 are moot with D2;
  - the ledger's `progress.md:94` rank is documented;
  - `deferred-minors.md:23`: exports stay conservative.

- **User answers applied:** D5 and its two refinements in Tasks 3, 4, 7, 8, 10, 11 and 12; В1 (б) through D5 (the
  library `Block`'s own CSS-like tag); В2 (а) in Task 10; В3 (а) in Task 2; В4 (а) in Task 8;
  В5 (а) in Tasks 4 and 12, with the D4 consequences table.

- **Ledger items folded in** (`.superpowers/sdd/2026-11-12-scene-blocks/`):

  | Ledger line | Item | Task |
  | --- | --- | --- |
  | `progress.md:196` | custom `LOOK_EXTENT` unknown before the first camera search | 2 (classes read in the block's own update, offscreen too) |
  | `progress.md:196`, `:184`; `deferred-minors.md:23` | `renderAnchor` runs twice per update until anchors exist; runs per anchor per export | 2 (`getAnchorClass` cached per data change, no descriptors or ports) |
  | `progress.md:184` | `LOOK_EXTENT` 11.5 exact for size 18 / lineWidth 2 only | 2 (`SIZE`, `LINE_WIDTH` on the class; docs) |
  | `progress.md:181,184`; `deferred-minors.md:24` | hover ×1.8 style scale outside element bounds | 6 |
  | `deferred-minors.md:10` | comment for a scene key without a stored element | 4 |
  | `progress.md:107` | minimap text flag ignored by `EtlBlock` | 10 (no code: `skipText`; the rewritten text spec checks it) |

- **Placeholder scan.** Every new module has complete code; edits name their files, the members they replace and the
  replacement. Task 12 gives the new paragraphs, examples and diffs; where it rewrites an existing paragraph it quotes
  the new sentences and names the old ones by section and line.
- **Type consistency.** These names are spelled the same in Shared names and every task:
  - store and scene: `levelMaskOfPrimitives`, `unionLevelMasks`, `TSceneElement.nestedIn`, `TSceneElement.entityType`,
    `TSceneChange.previousStyleId`, `TSceneStyleChange`, `styleGeometryKey`, `styleLookKey`, `onFrameEnd`,
    `TSceneQueryOptions` (`level`, `includeHidden`, `entityTypes`, `live`), `revisionOf`;
  - anchors and blocks: `TAnchorClass`, `SIZE`, `LINE_WIDTH`, `CREATION_LEVELS`, `creationLevelsOf`,
    `getAnchorClass`, `anchorLevelsOf`, `resetAnchorLevels`, `getAnchorLevels`, `THtmlViewRequest`
    (`canvasVisible`), `delegateRender`, `isHeldByHtml`;
  - components: `getChildComponents`, `getHitRect`, `readSceneOrigin`, `invalidateChildren`, `hitLevels`,
    `isHitOnLevel`, `isShownOutsideScene`, `isRenderDelegated`, `transparentToEvents`, `isTransparentToEvents`,
    `TGraphComponentProps` (exported);
  - events and hover: `onDispatchedEvent`, `TGraphHoverDetail`, `pointerTargetAfter`, `isWithinComponent`,
    `relatedTarget`, `setHoveredTag`, `isHoveredBy`, `requestRetarget` (GraphLayer's and GraphComponent's),
    `HitTest.hasPendingUpdates`, and GraphLayer's private `dispatchHoverEvent`, `lostTargetOwner`;
  - bench: `THoverStop` (imported by `blocks.ts` and `entry.ts`), `setHoverPath`, `hoverEnters`, `--hover-path`;
  - Task 4: `syncHitMask(written, initial)`.
  `readWrittenParent`, the fixed order span of round 1 and round 2's `$hoveredComponents` are gone.
- **Task order.** Each task consumes only what earlier tasks produce:
  - children, nesting, D5's events and tag writers, and `onFrameEnd` (3) need nothing new;
  - hit levels (4) use the mask helper of Task 2 and Task 3's nesting and retarget requests;
  - the evented-area removal and its e2e (7) rely on Tasks 3–4;
  - the handover (8) uses `onFrameEnd` and `requestRetarget` (3) and extends `isShownOutsideScene` (4);
  - revisions (9) step before the frame-end listeners and read the nesting (3);
  - the minimap (10) uses Task 9 and the handover in its e2e; the story (11) uses all of them; the bench cases (13)
    use Tasks 2–3.
  Every task ends with the three suites green, so a reviewer can stop after any task.
- **Risks** (facts §11):
  - the store's nesting rebuilds an owner's draw list on every structural change of its children: O(children of that
    owner), small for blocks; Task 13's child-looks case measures a block with four chips and its anchors;
  - the retarget runs at the frame's end or after the hit test's queue, and is skipped while a gesture holds the
    capture or the pointer is outside the root; camera moves keep the `emulateMouseEventsOnCameraChange` rule. Every
    change of a set hit box asks for it, so hover and cursor follow API moves under a still pointer at the frame's
    end (listed in the migration guide); a first box and a first hit mask do not, so lazy anchors created by a camera
    move do not retarget. The graph's `mouseenter` and `mouseleave` fire at such a retarget, so consumers that follow
    the bus react without a pointer move. In Nirvana, `useHoveredGraphComponent`
    (`GE/hooks/useHoveredGraphComponent.ts:104`) may reset or select its tracked block (the block menu, the resize
    layer), and `AnchorsTooltipLayer` (`AnchorsTooltipLayer.tsx:22,45`) may hide or show its tooltip, after an API
    geometry change under a still pointer;
  - a block's own `hoveredTag` changes its row when the pointer enters or leaves it. Rows that look the same step no
    revision, so the stock theme does not redraw the minimap on hover; a user rule for hovered blocks does, once per
    hover change. The row change itself, its binding and the renderer's style-id write still happen (Task 14 gates the
    hover path);
  - `Anchor` no longer stops its hover events: a consumer's block listener that ignores `detail.target` now hears its
    anchors' hover. Nirvana's block border is such a listener (an inference from `NirvanaBaseBlock.ts:230-243,373-410`):
    it stays on over the anchor, which is В1's behaviour; the migration guide says how to keep the old one. Its
    `dispatchEvent` override (`NirvanaBaseBlock.ts:127`) keeps the block's own events out of the hover hook, so its
    library hover tag needs the guide's recipe (Task 12 Step 3, tested in Task 3); this plan does not change Nirvana;
  - a child that stops a hover event keeps its block from following the pointer (D5: stopping ends the walk); the
    docs say to stop clicks, not hover events;
  - D4 moves the connection-editing e2e's anchor gestures to the schematic level (Task 4 Step 5); a test that depended
    on scale 1 is listed in that task's report;
  - children with looks count toward their owner's sub-order width (Task 13 reports WebGL fallbacks);
  - the minimap e2e counts `graph.scene.drawInterpreted` calls, assuming only the minimap calls it on those pages (the
    main view's interpreter draws through its own layer), as draft 1 checked;
  - removing `renderAnchor` breaks Nirvana's override; the migration recipe covers its props, size and keys (Task 12).

## Addendum (user, 2026-11-15): Task 3x

The user added a fix to this plan: after a block is removed and added back with the same id in one frame, retained
anchors stay bound to the old `AnchorState` (on HEAD `a614f42e` too). Task 3x runs right after Task 3. Its brief is
`.superpowers/sdd/2026-11-15-scene-blocks-3b/task-3x-brief.md`.

## Addendum (user, 2026-11-15): Task 3y

The user added a second fix: the rest of the same-frame re-add family (groups, connections, `ConnectionState` endpoint
reactivity, a block hidden before its replacement), all on HEAD `a614f42e` too. Task 3y runs after Task 4. Its brief is
`.superpowers/sdd/2026-11-15-scene-blocks-3b/task-3y-brief.md`.

## Addendum (user, 2026-11-16): Task 7x

The user chose a helper for the D5 hit target of every pointer event: `getEventTarget(event)` (option (b); native events stay
unchanged). Task 7x runs after Task 8. Its brief is `.superpowers/sdd/2026-11-15-scene-blocks-3b/task-7x-brief.md`.

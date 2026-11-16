## Decisions applied

**User decisions (2026-11-15, binding):**
- **D1. Minimap refresh.** «Это не обязательно, миникарта может обновляться в том же кадре - но не должна». The
  minimap may draw a change one frame late. A pointer drag redraws it in the same frame (`block-change` is
  synchronous); `api.updateBlock()` moves, list changes, usable-rect changes, tags and styles reach it one frame later
  (end-of-frame revisions, `onFrameEnd`, the hit test's low-priority queue). Corrected 2026-11-16 per the fix wave.
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
    `stopPropagation()` ends the walk. The hit target of every pointer event is `getEventTarget(event)` (user,
    2026-11-16, Task 7x: «Хелпер getEventTarget»). Hover events also carry `detail.target` and `detail.relatedTarget`;
    `click`, `mousedown` and `mouseup` stay native `MouseEvent`s. On a target change GraphLayer fires
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
- **D6. Minimap throttle** (user, 2026-11-16, «Реже, раз в ~100 мс»). During continuous changes, pointer drags
  included, the minimap redraws its cached picture at most once per ~100 ms; the final state is always drawn.
- **D7. Minimap cost** (user, 2026-11-16, «Принять цену»). One full minimap picture per isolated change, or per
  ~100 ms window, is accepted. Task 14 re-bases the `--minimap` drag, select-all and change-all gates to it.
- **D8. Press on a child** (user, 2026-11-16, «Как в DOM»). A press on a component that is not draggable drags its
  nearest draggable ancestor: a child button inside a block drags the block. The camera pans only when nothing in the
  chain is draggable. A component with its own gesture makes itself draggable (as `Anchor`) or prevents the graph's
  `mousedown`. A press taken by a drag reaches no component, as for a draggable target today; the click still does.
  Task 12x implements it.

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


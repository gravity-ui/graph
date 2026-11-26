# Event model

Graph input and model changes share the same subscription API. The name determines the event fields and available controls. For example, `pinch` exposes two pointers, `dragstart` accepts a claim, and `camera-change` exposes the proposed camera coordinates. In React, `useGraphEvent` runs the same handler synchronously. See [Event subscriptions](./events.md).

## Input ownership

The graph accepts a bubbling native `pointerdown` at its root. Document listeners follow an accepted pointer through movement, release and cancellation outside the root. The browser retains ownership of native clicks, keyboard activation and HTML control behaviour. Use a control's native `click` handler for its action and stop `pointerdown` at the control to keep the graph from starting a gesture there.

### Presses and drags

The graph hit-tests the press and records its scene path and scale level. Once a gesture is recognized, `graph.on` and `component.on` run its listeners synchronously. A single click in exclusive mode waits for confirmation before this dispatch. Graph capture runs first, then the target, its interactive ancestors, and graph bubble listeners. A listener can observe a child that stops propagation by subscribing on the graph with `{ capture: true }`.

`gesture.target` identifies the scene recipient that was hit, or the graph on the background. `currentTarget` identifies the recipient whose listener is running and becomes null after delivery. `gesture.point` supplies camera coordinates. `gesture.event` is the native PointerEvent and retains its DOM target. `stopPropagation()` ends the scene route. `preventDefault()` vetoes the graph's default action for this gesture.

```ts
graph.on("press", (gesture) => {
  if (editor.isEditing) gesture.preventDefault();
});
block.on("dragstart", (gesture) => {
  if (gesture.target !== block) return;
  gesture.claim({
    owner: "block tool",
    start: (_event, world) => beginPreview(world),
    move: (_event, world) => updatePreview(world),
    end: (_event, world) => commitPreview(world),
    cancel: () => discardPreview(),
  });
});
```

A move that reaches `dragThreshold` triggers arbitration. A single claim receives the press position, the crossing move, subsequent updates and a terminal end or cancellation. Competing claims suppress the drag. With no claimant, the graph can drag the nearest draggable component or pan the camera. Release after a recognised drag produces no activation. During a captured drag the start target remains hovered. Release schedules a hit test at the last physical position.

### Activation

A primary-button release on the press target within `clickTolerance` qualifies as an activation. Two activations of the same pointer type on the same target can form a pair within `doubleClickInterval` and `doubleClickDistance`. Each event carries its releasing PointerEvent. A native HTML `click` without a pointer sequence, including Enter and Space on a button, belongs entirely to the control.

| Graph setting | Single activation | Qualifying pair |
| --- | --- | --- |
| `clickPolicy: "immediate"` (default) | `click` on release | `click → click → dblclick` |
| `clickPolicy: "exclusive"` | `click` when the interval expires | Only `dblclick`, on the second release |

With `"exclusive"`, an incompatible next activation (for example, a tap on another block) confirms the preceding single before starting its own window. A delayed click uses the original target, point and scene level. Its handlers still run before the selection default and can call `preventDefault()`. A double-click alone leaves the selection intact. Removing the pending target or detaching the graph discards the pending click.

Touch and pen taps pair by pointer type and live scene target, even when the browser assigns a new pointer ID. A stationary touch or pen emits one `longpress` after `longPressDuration` (500 ms by default), carrying the original down event. Moving beyond `clickTolerance`, starting a drag, a second contact, releasing, cancellation or removal of the source cancels the timer. After a longpress the graph waits for release. Holding a mouse button keeps ordinary click and drag available.

The graph stylesheet suppresses native text selection on the scene surface. Text fields and editable HTML inside the graph retain native selection.

### Two-finger navigation

Set `settings.touchPolicy` before contact. With the default `"page"`, the host's CSS controls native scrolling and zoom. The graph can receive taps and holds. With `"editor"`, the graph reserves the surface for one-finger editing and two-finger navigation.

```ts
block.on("pinch", ({ phase, point, distance, preventDefault }) => {
  if (phase === "start") preventDefault();
  updateWidgetGesture(phase, point.canvas, distance);
});
```

A second finger can join a pending touch or a background camera pan. The nearest interactive ancestor shared by both touches receives `pinch`, or the graph receives it when they have separate scene paths. The target, route and scale filter stay fixed until `end` or `cancel`. Each event carries both pointers in down order, their midpoint as `point`, and their separation in CSS pixels as `distance`. A synchronous veto on `start` reserves navigation for the listener. Otherwise the camera applies translation and zoom together after `update` listeners. Lifting either finger leaves the other ready to pan from its current position. After a port or block has claimed a drag, only its initiating contact can move or finish it. A third finger or a mixed pen/touch pair cannot take over.

### The model: events walk up the component tree

A scene child is a hit target in its own right. Its gesture or hover notification can reach its parent. Use `gesture.target` for the hit and `instanceof` to narrow its type.

```ts
block.on("click", (gesture) => {
  if (gesture.target === block) showInspector(block);
});
```

### Hover

`graph.input.$hoveredComponent` publishes the current scene component. Mouse and pen move it. The old target receives `pointerleave` and `pointerout`, then the new target receives `pointerenter` and `pointerover`. Subscribe through `graph.on` or `component.on`. The event’s `target` is the side receiving the notification and `relatedTarget` is the opposite side, or undefined for the background or outside. `pointerPressed` describes the button state. A physical transition carries `cause: "pointer"` and `sourceEvent`. Scene and camera changes carry `cause: "scene"` with no physical sample.

During slow motion, the graph tests the latest pointer position once per graph frame. A jump over 48 CSS pixels or a path longer than 32 CSS pixels in 32 ms clears the old hover once. Both legs of a reversal count, including samples coalesced by the browser. On the minimalistic level, any movement defers hover. In both cases the graph tests the final position on the first ready frame after 60 ms of rest, even when the browser sends no further move. Presses still hit-test their own coordinates, and a connection drag can still look up its drop port.

Hover runs on the graph first. Unless a graph listener stops propagation or vetoes delivery, the same event then visits the component and its ancestors. Component hover dispatch follows the parent chain. Each component's `onDispatchedEvent` hook runs before its interactive listeners. A listener can stop the walk. Hover styling changes in one signal batch, so moving between a block and its anchor keeps the block highlighted.

**Retargeting under a still pointer.** When what a still pointer hits changes, PointerInput finds the target again and
fires the same leave and enter. It does so at the end of the graph frame, or once the hit test has indexed that
frame's hit boxes when they still wait in its queue, or at the release of a drag, after:

- a component hidden, shown or unmounted. An unmounted target gets no event: the nearest graph component above it
  becomes the old side of the next change, unless the pointer is on that one, so it gets the `pointerleave` once the
  pointer is no longer on it;
- a hit box that was set before moving, resizing, going or coming back (a block or an anchor moved through the API, a
  child's look). A component's first hit box asks nothing: a component that mounts under the pointer is found at the
  next pointer move;
- a child's hit levels changing;
- an HTML hold taken or released (`delegateRender`);
- a scene level change. This retargets even with `retargetHoverOnCameraChange` off: a wheel zoom from the
  minimalistic level into the schematic one over an anchor makes the anchor the target without a pointer move.

A hit box whose size follows the camera asks for no retarget: a connection stroke whose width is in screen pixels
calls `invalidateLine({ followsCamera: true })` (or `ConnectionLine.invalidate({ followsCamera: true })`) on zoom.
With `retargetHoverOnCameraChange` enabled, successive camera moves under a stationary pointer share one hit test on the first quiet graph frame. A pointer that leaves the graph changes the target to
none, and a camera move then finds no target. While graph-react's blocks list mounts the views of the detailed level,
a retarget waits for them, at most three graph frames.

#### Hover styles

`hoveredTag` is a styling tool that components put on themselves (`setHoveredTag`). The library `Block` does it while
the pointer is on it or on a descendant. `Anchor`, connections and groups do it while they are the target. No library
code reads a tag to decide behaviour. A graph `pointerenter` or `pointerleave` handler that calls `preventDefault()` keeps
that event from the components, so a component that writes `hoveredTag` from it keeps its old tag: a prevented
`pointerleave` leaves the block or anchor tagged.

#### Transparent components

`static transparentToEvents = true` lets pointer events pass through a component that has a hit box: the pointer's
target, its hover events, the cursor and `graph.getElementOverPoint()` skip it for the component under it. Its hit box
stays: it counts in the usable rect, and `getElementsOverPoint()` and `getElementsOverRect()` return it. See
[Transparent components](../components/canvas-graph-component.md#transparent-components).

#### Hit levels

A scene component is hit on the levels where it is shown:

- an element owner (a block) on every level;
- a child (an anchor, a child component) on the levels its look is drawn on, and wherever its block is shown outside
  the scene (at the detailed level while an HTML view holds the block, on every level after `setRenderDelegated(true)`);
- a child without a look only on the levels its class declares.

`static hitLevels` on a class overrides this rule for each of its components, a block included: its components are
hit on the declared levels only, even while an HTML view holds the block. `getElementOverPoint()`,
`getElementsOverPoint()` and `getElementsOverRect()` leave out what the level does not hit.

**Hidden components.** A scene component hidden for a reason other than the handover (`setVisibility(false, …)`, a
collapsed group, an `isSceneHidden()` override) is a barrier for its descendants: none of them is hit, on any level,
as under `display: none` in the DOM. A hidden child is not hit either. A hidden element owner (a block) is not hit
once its hit box is removed: `setVisibility(false, { removeHitbox: true })` removes it, and so does a collapsed group
(`setHiddenBlock`). With `removeHitbox: false` the owner keeps its hit box and stays a target. The handover is no such
reason: a block held by an HTML view or delegated with `setRenderDelegated(true)` is hit, and so are its children.


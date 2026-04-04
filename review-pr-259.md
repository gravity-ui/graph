# Code Review: PR #259 — feat(Groups): CollapsibleGroup

**PR:** https://github.com/gravity-ui/graph/pull/259  
**Branch:** `collapse_group` → `main`  
**Head SHA:** `6becd7ccfe5e56833aefe6d87de7dedee754405c`

---

## Summary

The PR adds a `CollapsibleGroup` feature: graph groups can collapse into a smaller visual representation (a pair of edge ports) while connections remain routed through those edge ports. Includes:

- `CollapsibleGroup` component (~580 lines) with `collapse()`/`expand()` methods
- Port delegation system (`PortState.delegate()`/`undelegate()`)
- `$hidden` computed on `ConnectionState` for auto-hiding connections to hidden blocks
- `EventedComponent` enhancements for hover tracking
- `Component.getState()` public accessor
- `GraphComponent.setRenderDelegated()` to hide canvas block while preserving hitbox
- Generic refactor of `GroupState<T>` and `GroupsListStore`
- 1023-line E2E suite
- Storybook story + docs

---

## Critical Issues (score ≥ 80)

### 1. External `collapsed: false` update is silently ignored — group stays collapsed permanently (score: 85)

`CollapsibleGroup.subscribeToGroup()` only handles the `if (group.collapsed)` branch. There is **no `else` branch** to handle a transition from `collapsed: true` → `collapsed: false` when triggered by an external `setGroups()` / `updateGroup()` call. The result: blocks remain hidden, edge ports remain delegated, and the hitbox remains at the collapsed rect. The only way to properly expand is to call `expand()` directly on the component instance — which external consumers have no way to do via the public data API.

This directly breaks the library's data-driven contract: `graph.setEntities({ groups: [...] })` with `collapsed: false` should be sufficient to expand a group.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/components/canvas/groups/CollapsibleGroup.ts#L207-L230

**Fix:** Add an `else` branch that calls `this.expand()` (or the equivalent inline logic) when `group.collapsed === false` and the current state is `collapsed: true`.

---

### 2. `Math.random()` in `mapToGroups` randomly resets collapsed state on every block drag (score: 100)

The story's `mapToGroups` callback includes:

```typescript
collapsed: !!(Math.floor(Math.random() * 10) % 2),
```

`mapToGroups` is invoked by `withBlockGrouping` every time any block moves (it runs inside a `computed` signal). This means dragging any block causes both groups to randomly collapse or expand on every mousemove tick. The comment directly below this line states `"collapsed is intentionally omitted"` — directly contradicting the code.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/stories/canvas/groups/collapsible.stories.tsx#L175-L185

**Fix:** Remove the `collapsed` line from the `mapToGroups` return value. The story should use a separate controlled signal (e.g. a `useState` toggle) to drive collapse state, not the grouping callback.

---

## Important Issues (score 75 — just below threshold, but worth addressing)

These were verified as real bugs. They fell just below the 80 threshold but are noted for completeness.

### 3. Base `Group` hitbox loses padding after `subscribeToGroup` refactor

The PR changes `Group.ts:subscribeToGroup()` from:
```typescript
this.updateHitBox(this.getRect(group.rect)); // applies 20px padding
```
to:
```typescript
this.updateHitBox(group.rect); // raw rect, no padding
```

`CollapsibleGroup` overrides `updateHitBox` to re-apply padding via `this.getRect()`, so it is unaffected. But the **base `Group` class has no such override**: its hitbox is now set to the raw block bounding box. Clicking anywhere in the 20px visual border around a base group will miss the hitbox.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/components/canvas/groups/Group.ts#L233-L240

### 4. Missing `unmount()` cleanup — collapsed group removal leaves stale port delegates

`CollapsibleGroup` has no `unmount()` override. When a collapsed group is removed (`setGroups([])`), `GraphComponent.unmount()` releases the edge ports, but `undelegatePorts()` is never called. Block ports that were delegated retain their `$delegate` signal reference pointing to orphaned `PortState` objects. If those blocks are later re-added in a fresh graph, their port `$point` resolves via the stale delegate, returning the old group-edge coordinates.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/components/canvas/groups/CollapsibleGroup.ts#L1-L30

### 5. Port positions jump 20px on first drag after collapse

In `collapse()`, `delegatePorts(nextRect)` is called while `state.collapsed` is still `false` (inside the `batch()`, before commit). So `this.getRect(nextRect)` applies padding, placing edge ports at padded rect edges. But `handleDrag()` calls `updateGroupPortPositions(newCollapsedRect)` with the raw unpadded rect directly — no `getRect()`. On first drag, ports snap 20px inward.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/components/canvas/groups/CollapsibleGroup.ts#L353-L380

### 6. `$hidden` uses explicitly `@deprecated` `$sourceBlock` / `$targetBlock`

The new `$hidden` computed signal in `ConnectionState` uses two fields that are annotated `/* @deprecated use $sourcePortState instead */` in the same file. New production code should use `$sourcePortState`/`$targetPortState` to derive block state.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/store/connection/ConnectionState.ts#L156-L160

### 7. `console.log` left in story event handler

```typescript
console.log("EMIT: group-collapse-change", { groupId, currentRect, nextRect });
```

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/stories/canvas/groups/collapsible.stories.tsx#L226-L230

### 8. `public _trackAreaHover()` / `public _clearAreaHover()` — contradictory visibility

Underscore prefix signals "internal" intent; `public` makes them part of the exported API surface. These are called only from `GraphLayer` and should be `protected` (or renamed without `_` if truly public). `EventedComponent` is exported from `src/index.ts`.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/components/canvas/EventedComponent/EventedComponent.ts#L112-L155

### 9. `as any` casts in `GraphPageObject.collectGraphEventDetails`

Three instances of `window.graph.on(eventName as any, handler)` in the page object. [CLAUDE.md](CLAUDE.md) states: *"Avoid `as any` at all costs. If type casting is necessary, use `as unknown as TargetType`."*

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/e2e/page-objects/GraphPageObject.ts#L238-L245

---

## API / DX / Integration Observations

These are not bugs per se but affect the quality of the integration with the library's existing patterns.

### Collapse state is not reactive to external data updates (also Critical Issue #1)

The library's primary API is data-driven: callers call `graph.setEntities()` or `graph.updateBlock()` and the graph reacts. `CollapsibleGroup` breaks this contract by only responding to `collapse()`/`expand()` imperative calls for the expand direction. The [CLAUDE.md](CLAUDE.md) architecture section documents the expected data flow: `Store Signal Update → Scheduler → render()`. The missing `else` in `subscribeToGroup` means the signal → render pipeline is broken for expand.

### `getCollapseRect` API lacks type information

`TCollapsibleGroup.getCollapseRect` is typed as:
```typescript
getCollapseRect?: (group: TCollapsibleGroup, rect: TRect) => TRect;
```
The callback receives the group object and current expanded rect, which is good. However there is no documentation on what happens if `getCollapseRect` is omitted vs. returns `undefined` — whether the default rect is used or collapsing is blocked. A JSDoc comment on the field would clarify the contract.

### `subscribeToGroup` cleanup leak

`CollapsibleGroup.subscribeToGroup()` calls `super.subscribeToGroup()` (subscribes to `$state`) and then subscribes again via `this.subscribeSignal(this.groupState.$state, ...)`. The second subscription's cleanup function is never captured or returned. If `subscribeToGroup` is re-called (e.g. during reattachment), duplicate subscriptions accumulate.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/components/canvas/groups/CollapsibleGroup.ts#L207-L230

### No cycle detection in `PortState.delegate()`

If `portA.delegate(portB)` and `portB.delegate(portA)` are called, the `$point` computed creates a circular dependency. `@preact/signals-core` throws a runtime error in this case. A guard or at minimum a JSDoc warning would prevent this foot-gun.

https://github.com/gravity-ui/graph/blob/6becd7ccfe5e56833aefe6d87de7dedee754405c/src/store/connection/port/Port.ts#L195-L202

---

## Type Safety

Several methods added/modified by the PR are missing explicit return types ([CLAUDE.md](CLAUDE.md): *"Always specify return types for functions explicitly"*):

- `EventedComponent.willRender()` → `: void`
- `EventedComponent.didRender()` → `: void`
- `Component.getState()` → `: State`
- `GroupsListStore.setGroups<T>()` → `: void`
- `GroupsListStore.getOrCreateGroupState<T>()` → `: GroupState<T>`
- `GroupState.fromTGroup<T>()` → `: GroupState<T>`

Also: `GroupsList.ts` uses `return this.$groupsMap.value.get(id) as GroupState<T>` which should be `as unknown as GroupState<T>` per CLAUDE.md type casting rules.

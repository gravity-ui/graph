# HitTest: Replace resetUsableRect with markPendingUpdate

**Date:** 2026-05-07  
**Status:** Approved

## Problem

`setEntities()` calls `hitTest.resetUsableRect()` which clears `usableRectTracker` and zeroes `$usableRect`. The intent is to make `isUnstable = true` so that `waitUsableRectUpdate` waits for new block positions to arrive before resolving (e.g., for `zoomToViewPort`).

The bug: after clearing the tracker, the library expects block components to re-send their hitbox positions via `setHitBox`. But `HitBox.update()` has an early-exit guard:

```typescript
if (minX === this.minX && minY === this.minY && maxX === this.maxX && maxY === this.maxY && !force) return;
```

If blocks haven't changed position (same data passed to `setEntities`), `hitTest.update()` is never called, the hitboxes never re-register in `usableRectTracker`, `$usableRect` stays `{0,0,0,0}`, and `waitUsableRectUpdate` never resolves.

## Root Cause

The "zero usableRect = unstable" heuristic is fragile. It conflates two separate concerns:
- *Is the usableRect value currently correct?*
- *Are entities currently being replaced?*

## Solution

Replace `resetUsableRect()` (called from `setEntities`) with an explicit `$pendingEntitiesUpdate` signal. Don't touch `usableRectTracker` at all — its data stays valid until new hitboxes naturally supersede it.

## Architecture

### Scheduler timing (why this works)

Within a single RAF tick, `GlobalScheduler` runs priority queues in order:
- `MEDIUM` — component tree traversal (block rendering, `setHitBox` calls)
- `LOWEST` — `processQueue` debounce

This guarantees: by the time `processQueue` runs, all blocks have already registered their hitboxes in the current frame.

When `markPendingUpdate()` explicitly calls `processQueue()`, it schedules a LOWEST-priority run. If blocks render first (MEDIUM) and call `setHitBox`, they reset the debounce `frameCounter` to 0. LOWEST still fires in the same tick (counter goes 0→1, threshold is 1). So all hitboxes are processed before the flag clears.

If blocks don't re-render (same positions), no `setHitBox` is called, the frameCounter isn't reset, and processQueue fires in the next LOWEST slot — still correctly clears the flag with valid tracker data.

### Changes to `HitTest`

**1. New signal:**
```typescript
private readonly $pendingEntitiesUpdate = signal(false);
```

**2. New public method:**
```typescript
public markPendingUpdate(): void {
  this.$pendingEntitiesUpdate.value = true;
  this.processQueue(); // ensure it runs even if no hitboxes changed
}
```

**3. `processQueue` callback — clear flag at end:**
```typescript
this.updateUsableRect();
this.emit("update", this);
this.$pendingEntitiesUpdate.value = false;
```

**4. `isUnstable` — add flag:**
```typescript
return hasProcessingQueue || hasZeroUsableRect || this.$pendingEntitiesUpdate.value;
```

**5. `waitUsableRectUpdate` — subscribe to both signals:**

The current implementation only subscribes to `$usableRect`. If usableRect doesn't change (blocks didn't move), the subscriber never fires after the flag clears. Fix: subscribe to `$pendingEntitiesUpdate` as well.

```typescript
if (this.isUnstable) {
  const check = () => {
    if (!this.isUnstable) { cleanup(); callback(this.$usableRect.value); }
  };
  const unsubRect    = this.$usableRect.subscribe(check);
  const unsubPending = this.$pendingEntitiesUpdate.subscribe(check);
  const cleanup      = () => { unsubRect(); unsubPending(); };
  return cleanup;
}
```

Note: Preact signals call subscribers immediately on subscribe. The immediate calls during `isUnstable = true` are no-ops. The flag-clearing call resolves correctly.

**6. `clear()` — reset flag:**
```typescript
this.$pendingEntitiesUpdate.value = false;
```
Prevents `waitUsableRectUpdate` from hanging after a full graph clear.

### Changes to `graph.ts`

```typescript
// Before:
this.hitTest.resetUsableRect();

// After:
this.hitTest.markPendingUpdate();
```

`resetUsableRect()` stays in the class but is no longer called from core code.

## Scenario Coverage

| Scenario | Flow |
|---|---|
| Same blocks, same positions | `markPendingUpdate` → processQueue scheduled → LOWEST fires → empty queue → flag clears → callback resolves with existing correct usableRect |
| Same blocks, new positions | blocks call `setHitBox` → queue updated → processQueue processes new coords → flag clears |
| New blocks (different IDs) | old unmount → `queue(null)`, new mount → `queue(bbox)` → processQueue handles both → flag clears |
| Empty graph | `hasGraphElements() = false` → `waitUsableRectUpdate` resolves immediately (unchanged) |

## What Is NOT Changed

- `HitBox.update()` early-exit logic — no longer needed to change
- `usableRectTracker` — never cleared on `setEntities`, always contains valid data
- `resetUsableRect()` public method — kept for backward compatibility, just not called from `setEntities`
- `isUnstable` zero-rect heuristic — kept for initial load case (no blocks yet registered)

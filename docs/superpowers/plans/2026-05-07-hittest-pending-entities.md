# HitTest: pendingEntitiesUpdate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `resetUsableRect()` mechanism in `setEntities()` with an explicit `$pendingEntitiesUpdate` signal that makes `waitUsableRectUpdate` wait correctly without clearing the `usableRectTracker`.

**Architecture:** Add a `$pendingEntitiesUpdate` signal to `HitTest`. `setEntities()` calls `markPendingUpdate()` (sets the signal, schedules `processQueue`). When `processQueue` finishes, it clears the signal. `isUnstable` and `waitUsableRectUpdate` both check the signal. The `usableRectTracker` is never cleared by `setEntities`, so blocks that didn't move don't need to re-register.

**Tech Stack:** TypeScript, `@preact/signals-core`, custom RAF-based scheduler (`src/utils/utils/schedule.ts`).

---

## File Map

| File | Change |
|---|---|
| `src/services/HitTest.ts` | Add `$pendingEntitiesUpdate`, `markPendingUpdate()`, update `processQueue`, `isUnstable`, `waitUsableRectUpdate`, `clear()` |
| `src/graph.ts` | Replace `hitTest.resetUsableRect()` with `hitTest.markPendingUpdate()` |
| `src/services/HitTest.test.ts` | New file — unit tests for `HitTest` in isolation |

---

### Task 1: Write failing tests for `markPendingUpdate`

Tests go in a new file. They use a minimal mock for `Graph` (only the two properties that `hasGraphElements()` accesses) so the test has no framework dependencies.

**Files:**
- Create: `src/services/HitTest.test.ts`

- [ ] **Step 1: Create the test file with a graph mock and the three failing tests**

```typescript
import { HitTest, HitBox } from "./HitTest";
import { Graph } from "../graph";

function makeHitTest(hasBlocks = false): HitTest {
  const mockGraph = {
    rootStore: {
      blocksList: { $blocks: { value: hasBlocks ? [{}] : [] } },
      connectionsList: { $connections: { value: [] } },
    },
  } as unknown as Graph;
  return new HitTest(mockGraph);
}

describe("HitTest.markPendingUpdate", () => {
  it("makes isUnstable true immediately after call", () => {
    const ht = makeHitTest(true);
    expect(ht.isUnstable).toBe(false);
    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);
  });

  it("isUnstable becomes false after processQueue flushes", () => {
    const ht = makeHitTest(true);
    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);
    // flush() synchronously executes the debounced callback
    (ht as unknown as { processQueue: { flush(): void } }).processQueue.flush();
    expect(ht.isUnstable).toBe(false);
  });

  it("waitUsableRectUpdate resolves when flag clears, even if usableRect did not change", () => {
    const ht = makeHitTest(true);
    // Seed a non-zero usableRect so the zero-rect heuristic doesn't interfere
    const fakeHitBox = {
      affectsUsableRect: true,
      destroyed: false,
      minX: 0, minY: 0, maxX: 100, maxY: 100, x: 0, y: 0,
    } as unknown as HitBox;
    (ht as unknown as { usableRectTracker: { add(h: HitBox): void; toJSON(): object } })
      .usableRectTracker.add(fakeHitBox);
    (ht as unknown as { updateUsableRect(): void }).updateUsableRect();

    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);

    let called = false;
    ht.waitUsableRectUpdate(() => { called = true; });
    expect(called).toBe(false); // still waiting

    (ht as unknown as { processQueue: { flush(): void } }).processQueue.flush();
    expect(called).toBe(true); // resolved after flag cleared
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm test -- HitTest.test --no-coverage
```

Expected: 3 failures — `markPendingUpdate is not a function` / `isUnstable` doesn't behave as expected.

---

### Task 2: Add `$pendingEntitiesUpdate` signal and `markPendingUpdate()` to `HitTest`

**Files:**
- Modify: `src/services/HitTest.ts`

- [ ] **Step 1: Add the private signal field after `$usableRect`**

In [src/services/HitTest.ts](src/services/HitTest.ts) after line 60:
```typescript
public readonly $usableRect = signal<TRect>({ x: 0, y: 0, width: 0, height: 0 });

// Explicit pending flag set by setEntities; cleared when processQueue completes.
// Avoids the "zero usableRect = unstable" heuristic for entity replacement.
private readonly $pendingEntitiesUpdate = signal(false);
```

- [ ] **Step 2: Add the `markPendingUpdate` public method** after the `resetUsableRect` method (around line 189):

```typescript
/**
 * Mark hitTest as pending an entity update (called by setEntities).
 * Makes isUnstable = true until processQueue completes.
 * Does NOT clear usableRectTracker — existing data stays valid.
 */
public markPendingUpdate(): void {
  this.$pendingEntitiesUpdate.value = true;
  this.processQueue(); // schedule even if no hitboxes change
}
```

- [ ] **Step 3: Run the tests — first test should pass, other two still fail**

```bash
npm test -- HitTest.test --no-coverage
```

Expected: test 1 passes ("makes isUnstable true immediately"), tests 2 and 3 still fail.

---

### Task 3: Update `processQueue` to clear the flag, update `isUnstable`

**Files:**
- Modify: `src/services/HitTest.ts`

- [ ] **Step 1: Update `processQueue` — add flag reset at the end of the callback**

In [src/services/HitTest.ts](src/services/HitTest.ts) the `processQueue` callback currently ends at:
```typescript
      this.queue.clear();
      this.updateUsableRect();
      this.emit("update", this);
```

Add one line after `emit`:
```typescript
      this.queue.clear();
      this.updateUsableRect();
      this.emit("update", this);
      this.$pendingEntitiesUpdate.value = false;
```

- [ ] **Step 2: Update `isUnstable` getter to include the pending flag**

Current return statement (around line 96):
```typescript
    return hasProcessingQueue || hasZeroUsableRect;
```

Replace with:
```typescript
    return hasProcessingQueue || hasZeroUsableRect || this.$pendingEntitiesUpdate.value;
```

Also update the early-return branch above it:
```typescript
    if (hasZeroUsableRect && !this.hasGraphElements()) {
      return hasProcessingQueue;
    }
```

Replace with:
```typescript
    if (hasZeroUsableRect && !this.hasGraphElements()) {
      return hasProcessingQueue || this.$pendingEntitiesUpdate.value;
    }
```

- [ ] **Step 3: Run the tests — first two should now pass, third still fails**

```bash
npm test -- HitTest.test --no-coverage
```

Expected: tests 1 and 2 pass, test 3 fails (`called` is still `false`).

---

### Task 4: Fix `waitUsableRectUpdate` to subscribe to both signals

**Files:**
- Modify: `src/services/HitTest.ts`

The current implementation only subscribes to `$usableRect`. If `usableRect` doesn't change after `markPendingUpdate` (blocks didn't move), the subscriber never fires.

- [ ] **Step 1: Replace the `isUnstable` branch inside `waitUsableRectUpdate`**

Current code (around lines 215–225):
```typescript
    if (this.isUnstable) {
      const removeListener = this.$usableRect.subscribe(() => {
        if (!this.isUnstable) {
          removeListener();
          callback(this.$usableRect.value);
          return;
        }
        return;
      });
      return removeListener;
    }
```

Replace with:
```typescript
    if (this.isUnstable) {
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        unsubRect();
        unsubPending();
      };
      const check = () => {
        if (!this.isUnstable) {
          cleanup();
          callback(this.$usableRect.value);
        }
      };
      const unsubRect = this.$usableRect.subscribe(check);
      const unsubPending = this.$pendingEntitiesUpdate.subscribe(check);
      return cleanup;
    }
```

Note: Preact signals call subscribers **immediately** on `subscribe()`. Both `check()` calls during `isUnstable = true` are no-ops. When `$pendingEntitiesUpdate` later becomes `false`, `check()` fires and `isUnstable` is `false` → callback resolves.

- [ ] **Step 2: Run the tests — all three should pass now**

```bash
npm test -- HitTest.test --no-coverage
```

Expected: all 3 tests pass.

---

### Task 5: Reset flag in `clear()` and update `setEntities`

**Files:**
- Modify: `src/services/HitTest.ts`
- Modify: `src/graph.ts`

- [ ] **Step 1: Add flag reset to `HitTest.clear()`**

Current `clear()` (around line 173):
```typescript
  public clear(): void {
    this.processQueue.cancel();
    this.queue.clear();
    this.interactiveTree.clear();
    this.usableRectTracker.clear();
    this.updateUsableRect();
  }
```

Add one line at the end:
```typescript
  public clear(): void {
    this.processQueue.cancel();
    this.queue.clear();
    this.interactiveTree.clear();
    this.usableRectTracker.clear();
    this.updateUsableRect();
    this.$pendingEntitiesUpdate.value = false;
  }
```

This prevents `waitUsableRectUpdate` from hanging after a full graph clear.

- [ ] **Step 2: Replace `resetUsableRect` call in `graph.ts`**

In [src/graph.ts](src/graph.ts) around line 307–311:
```typescript
    // Reset usableRect so that waitUsableRectUpdate (used by zoomToViewPort)
    // treats hitTest as unstable and waits for new block components to register
    // their hitboxes. Without this, a stale usableRect can make hitTest appear
    // stable, causing the zoom callback to fire immediately with wrong data.
    this.hitTest.resetUsableRect();
```

Replace with:
```typescript
    // Mark hitTest as pending so waitUsableRectUpdate (used by zoomToViewPort)
    // waits for block components to settle. Unlike resetUsableRect, this does not
    // clear usableRectTracker, so blocks that haven't moved don't need to re-register.
    this.hitTest.markPendingUpdate();
```

- [ ] **Step 3: Run all tests**

```bash
npm test --no-coverage
```

Expected: all tests pass including existing graph tests.

---

### Task 6: Add integration test for `setEntities` + `waitUsableRectUpdate`

This test verifies the original bug is fixed: `waitUsableRectUpdate` resolves after `setEntities` with unchanged block positions.

**Files:**
- Modify: `src/graph.test.ts`

- [ ] **Step 1: Add the integration test**

Append to `src/graph.test.ts`:

```typescript
describe("setEntities + waitUsableRectUpdate (pendingEntitiesUpdate fix)", () => {
  function makeBlock(id: string, x = 0, y = 0): TBlock {
    return { id, is: "Block", x, y, width: 100, height: 50, selected: false, name: id, anchors: [] };
  }

  it("resolves waitUsableRectUpdate after setEntities with same block positions", (done) => {
    const node = document.createElement("div");
    const block = makeBlock("b1", 10, 20);
    const graph = new Graph({ blocks: [block], connections: [] }, node);
    graph.start();

    // Wait for initial hitboxes to settle
    graph.hitTest.waitUsableRectUpdate(() => {
      // Call setEntities with the exact same block (same position)
      graph.setEntities({ blocks: [block], connections: [] });

      // Must resolve after setEntities even though usableRect doesn't change
      graph.hitTest.waitUsableRectUpdate((rect) => {
        expect(rect.width).toBeGreaterThan(0);
        done();
      });
    });
  }, 5000);

  it("resolves waitUsableRectUpdate after setEntities with new blocks", (done) => {
    const node = document.createElement("div");
    const graph = new Graph({ blocks: [makeBlock("b1")], connections: [] }, node);
    graph.start();

    graph.hitTest.waitUsableRectUpdate(() => {
      graph.setEntities({ blocks: [makeBlock("b2", 200, 200)], connections: [] });

      graph.hitTest.waitUsableRectUpdate((rect) => {
        expect(rect.x).toBeGreaterThanOrEqual(200);
        done();
      });
    });
  }, 5000);
});
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test --no-coverage
```

Expected: all tests pass including the two new integration tests.

- [ ] **Step 3: Commit**

```bash
git add src/services/HitTest.ts src/services/HitTest.test.ts src/graph.ts src/graph.test.ts docs/superpowers/specs/2026-05-07-hittest-pending-entities-design.md docs/superpowers/plans/2026-05-07-hittest-pending-entities.md
git commit -m "fix(hit-test): replace resetUsableRect with markPendingUpdate in setEntities

The old approach zeroed usableRectTracker to signal instability, but
HitBox.update() skips re-registration when coordinates haven't changed,
causing waitUsableRectUpdate to never resolve for unchanged block positions.

New approach: explicit \$pendingEntitiesUpdate signal set by markPendingUpdate(),
cleared by processQueue. usableRectTracker is never cleared on setEntities."
```

---

## Self-Review

**Spec coverage:**
- ✓ `$pendingEntitiesUpdate` signal — Task 2
- ✓ `markPendingUpdate()` method — Task 2
- ✓ `processQueue` clears flag — Task 3
- ✓ `isUnstable` includes flag — Task 3
- ✓ `waitUsableRectUpdate` subscribes to both signals — Task 4
- ✓ `clear()` resets flag — Task 5
- ✓ `setEntities` uses `markPendingUpdate` — Task 5
- ✓ `resetUsableRect` kept but not called — Tasks 2/5

**No placeholders:** confirmed — every step has exact code.

**Type consistency:** `$pendingEntitiesUpdate` is used consistently across all tasks. `processQueue` accessed via cast in tests (it's `protected`).

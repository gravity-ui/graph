import { Graph } from "../graph";

import { HitBox, HitTest } from "./HitTest";

function makeHitTest(hasBlocks = false): HitTest {
  const mockGraph = {
    rootStore: {
      blocksList: { $blocks: { value: hasBlocks ? [{}] : [] } },
      connectionsList: { $connections: { value: [] } },
    },
  } as unknown as Graph;
  return new HitTest(mockGraph);
}

const STUB_BBOX = { minX: 0, minY: 0, maxX: 100, maxY: 100, x: 0, y: 0 };

/** Build a fake HitBox stub with sane defaults (a no-op updateRect and a 0..100 bbox). */
function makeHitBox(overrides: Partial<HitBox> = {}): HitBox {
  return {
    affectsUsableRect: true,
    destroyed: false,
    ...STUB_BBOX,
    updateRect(_bbox: unknown): void {
      // no-op stub
    },
    ...overrides,
  } as unknown as HitBox;
}

function seedUsableRect(ht: HitTest): void {
  (ht as unknown as { usableRectTracker: { add(h: HitBox): void } }).usableRectTracker.add(makeHitBox());
  (ht as unknown as { updateUsableRect(): void }).updateUsableRect();
}

/**
 * Trigger processQueue by queueing a fake hitbox update and flushing.
 * This mirrors real production code: hitbox updates always precede processQueue.
 */
function triggerProcessQueue(ht: HitTest): void {
  ht.update(makeHitBox(), { ...STUB_BBOX });
  (ht as unknown as { processQueue: { flush(): void } }).processQueue.flush();
}

/**
 * Trigger a re-entrant, two-batch processQueue run: processing the first hitbox queues a second
 * hitbox update, which schedules another processQueue batch. This mirrors real rendering where
 * a component's hitbox registration triggers further hitbox updates. The dead spot appears here:
 * the first batch clears `$pendingEntitiesUpdate` while a second batch is still scheduled, so the
 * graph is still unstable purely because of the queue; the second batch then drains and stabilizes
 * the graph WITHOUT changing `$usableRect` or `$pendingEntitiesUpdate` (both already final).
 */
function triggerReentrantProcessQueue(ht: HitTest): void {
  let reentered = false;
  const second = makeHitBox();
  const first = makeHitBox({
    updateRect(_bbox: unknown): void {
      if (!reentered) {
        reentered = true;
        // Re-entrant update while processQueue is running → schedules a second batch.
        ht.update(second, { ...STUB_BBOX });
      }
    },
  });

  ht.update(first, { ...STUB_BBOX });
  const pq = (ht as unknown as { processQueue: { flush(): void; isScheduled(): boolean } }).processQueue;
  pq.flush(); // batch #1: re-enters, schedules batch #2, clears pending while still scheduled
  pq.flush(); // batch #2: drains the queue and stabilizes via the "update" event, not a signal
}

describe("HitTest.markPendingUpdate", () => {
  it("makes isUnstable true immediately after call", () => {
    const ht = makeHitTest(true);
    // Seed non-zero usableRect so zero-rect heuristic doesn't interfere
    seedUsableRect(ht);
    expect(ht.isUnstable).toBe(false);
    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);
  });

  it("isUnstable becomes false after processQueue flushes with a hitbox update", () => {
    const ht = makeHitTest(true);
    seedUsableRect(ht);
    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);
    // processQueue fires naturally when hitbox updates arrive; simulate that here
    triggerProcessQueue(ht);
    expect(ht.isUnstable).toBe(false);
  });

  it("waitUsableRectUpdate resolves when flag clears, even if usableRect did not change", () => {
    const ht = makeHitTest(true);
    seedUsableRect(ht);

    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);

    let called = false;
    ht.waitUsableRectUpdate(() => {
      called = true;
    });
    expect(called).toBe(false); // still waiting

    // processQueue fires when hitbox updates arrive (simulated here)
    triggerProcessQueue(ht);
    expect(called).toBe(true); // resolved after flag cleared
  });

  // Regression: with a re-entrant second processQueue batch, the graph becomes stable only once
  // the queue drains — an event NOT reflected by the $usableRect / $pendingEntitiesUpdate signals.
  // Subscribing the stability check to those two signals alone leaves the callback hanging forever
  // (the "graph flies off-screen on open" bug). The fix also re-checks on the "update" event.
  it("waitUsableRectUpdate resolves when the graph stabilizes via a re-entrant queue drain", () => {
    const ht = makeHitTest(true);
    seedUsableRect(ht);

    ht.markPendingUpdate();
    expect(ht.isUnstable).toBe(true);

    let called = false;
    ht.waitUsableRectUpdate(() => {
      called = true;
    });
    expect(called).toBe(false); // deferred: still unstable

    triggerReentrantProcessQueue(ht);

    expect(ht.isUnstable).toBe(false); // graph did stabilize
    expect(called).toBe(true); // ...and the callback must have fired
  });
});

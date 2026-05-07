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

function seedUsableRect(ht: HitTest): void {
  const fakeHitBox = {
    affectsUsableRect: true,
    destroyed: false,
    minX: 0, minY: 0, maxX: 100, maxY: 100, x: 0, y: 0,
  } as unknown as HitBox;
  (ht as unknown as { usableRectTracker: { add(h: HitBox): void } }).usableRectTracker.add(fakeHitBox);
  (ht as unknown as { updateUsableRect(): void }).updateUsableRect();
}

/**
 * Trigger processQueue by queueing a fake hitbox update and flushing.
 * This mirrors real production code: hitbox updates always precede processQueue.
 */
function triggerProcessQueue(ht: HitTest): void {
  const fakeHitBox = {
    affectsUsableRect: true,
    destroyed: false,
    minX: 0, minY: 0, maxX: 100, maxY: 100, x: 0, y: 0,
    updateRect(_bbox: unknown): void {
      // no-op for test fake
    },
  } as unknown as HitBox;
  ht.update(fakeHitBox, { minX: 0, minY: 0, maxX: 100, maxY: 100, x: 0, y: 0 });
  (ht as unknown as { processQueue: { flush(): void } }).processQueue.flush();
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
    ht.waitUsableRectUpdate(() => { called = true; });
    expect(called).toBe(false); // still waiting

    // processQueue fires when hitbox updates arrive (simulated here)
    triggerProcessQueue(ht);
    expect(called).toBe(true); // resolved after flag cleared
  });
});

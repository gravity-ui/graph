import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Concrete overlap scenario for z-index and hit-test ordering.
 *
 * World layout:
 *
 *  y=50   ┌──────B──────┐
 *  y=100  ┌──A──┐       │          ┌──C──┐
 *         │     │ (B∩A) │          │     │
 *  y=150  │     ├───────┼──────────┤     │  ← A→C connection at y=150
 *         │     │       │          │     │
 *  y=200  └─────┘       └──────────┘─────┘
 *         x=50  x=150   x=300      x=400 x=550
 *
 * B overlaps:
 *   - A's right side at x=150..200
 *   - Connection A→C from x=200..300 at y=150
 *
 * Overlap test point: (250, 150) — inside B AND on the A→C connection line
 *
 * Tests validate:
 *   1. Click A → A renders above B
 *   2. Click B → B renders above A
 *   3. Hover/click at (250,150): B occludes the connection — B is hit, not A→C
 *   4. Drag B over C → B renders above C
 */

const BLOCK_A = {
  id: "block-a",
  is: "Block" as const,
  x: 50,
  y: 100,
  width: 150,
  height: 100,
  name: "A",
  anchors: [],
  selected: false,
};
const BLOCK_B = {
  id: "block-b",
  is: "Block" as const,
  x: 150,
  y: 50,
  width: 150,
  height: 150,
  name: "B",
  anchors: [],
  selected: false,
};
const BLOCK_C = {
  id: "block-c",
  is: "Block" as const,
  x: 400,
  y: 100,
  width: 150,
  height: 100,
  name: "C",
  anchors: [],
  selected: false,
};

const CONN_AC = { id: "conn-ac", sourceBlockId: "block-a", targetBlockId: "block-c" };

test.describe("Z-Index and hit-test: overlap scenario", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [BLOCK_A, BLOCK_B, BLOCK_C],
      connections: [CONN_AC],
      settings: { canDrag: "all", dragThreshold: 0 },
    });
  });

  test("clicking A brings it above B", async () => {
    const blockA = graphPO.getBlockCOM("block-a");
    const blockB = graphPO.getBlockCOM("block-b");

    await blockA.click();
    await graphPO.waitForFrames(3);

    expect(await blockA.getCombinedZIndex()).toBeGreaterThan(await blockB.getCombinedZIndex());
  });

  test("clicking B brings it above A", async () => {
    const blockA = graphPO.getBlockCOM("block-a");
    const blockB = graphPO.getBlockCOM("block-b");

    // First bring A on top
    await blockA.click();
    await graphPO.waitForFrames(3);
    expect(await blockA.getCombinedZIndex()).toBeGreaterThan(await blockB.getCombinedZIndex());

    // Now click B — B should take the top spot
    await blockB.click();
    await graphPO.waitForFrames(3);

    expect(await blockB.getCombinedZIndex()).toBeGreaterThan(await blockA.getCombinedZIndex());
  });

  test("B occludes connection A→C: clicking at overlap point (250, 150) selects B, not the connection", async () => {
    const blockB = graphPO.getBlockCOM("block-b");

    // (250, 150) is inside B and lies on the A→C connection line.
    // Since blocks have a higher zIndex than connections, B should win the hit test.
    await graphPO.click(250, 150);
    await graphPO.waitForFrames(3);

    expect(await blockB.isSelected()).toBe(true);
  });

  test("dragging B over C: B renders above C", async () => {
    const blockB = graphPO.getBlockCOM("block-b");
    const blockC = graphPO.getBlockCOM("block-c");

    // Drag B so it overlaps C; drag triggers updateChildZIndex which brings B to front
    const cCenter = await blockC.getWorldCenter();
    await blockB.dragTo(cCenter);

    expect(await blockB.getCombinedZIndex()).toBeGreaterThan(await blockC.getCombinedZIndex());
  });
});

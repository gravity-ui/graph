import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Drag and Drop", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    // Initialize graph with test blocks positioned around center (where camera focuses)
    await graphPO.initialize({
      blocks: [
        {
          id: "block-1",
          is: "Block",
          x: 300,
          y: 200,
          width: 200,
          height: 100,
          name: "Block 1",
          anchors: [],
          selected: false,
        },
        {
          id: "block-2",
          is: "Block",
          x: 600,
          y: 300,
          width: 200,
          height: 100,
          name: "Block 2",
          anchors: [],
          selected: false,
        },
        {
          id: "block-3",
          is: "Block",
          x: 300,
          y: 500,
          width: 200,
          height: 100,
          name: "Block 3",
          anchors: [],
          selected: false,
        },
      ],
      connections: [],
      settings: {
        canDrag: "all", // Enable drag for all blocks
        dragThreshold: 0, // Disable threshold for precise drag testing
      },
    });
  });

  test("should drag block to new position", async () => {
    // Get block COM
    const block1 = graphPO.getBlockCOM("block-1");

    const initialGeometry = await block1.getGeometry();

    // Select block first
    await block1.click();

    // Drag block to new world position (also in visible area)
    const newWorldPos = { x: 700, y: 400 };
    await block1.dragTo(newWorldPos);

    const finalGeometry = await block1.getGeometry();

    // Position should have changed
    expect(finalGeometry.x).not.toBe(initialGeometry.x);
    expect(finalGeometry.y).not.toBe(initialGeometry.y);

    // Calculate center of final block
    const finalCenter = {
      x: finalGeometry.x + finalGeometry.width / 2,
      y: finalGeometry.y + finalGeometry.height / 2,
    };

    // Center should be close to target position (within 35 pixels tolerance)
    expect(Math.abs(finalCenter.x - newWorldPos.x)).toBeLessThan(35);
    expect(Math.abs(finalCenter.y - newWorldPos.y)).toBeLessThan(35);
  });

  test("should drag multiple selected blocks together", async ({ page }) => {
    // Get block COMs
    const block1 = graphPO.getBlockCOM("block-1");
    const block2 = graphPO.getBlockCOM("block-2");

    // Select two blocks
    await block1.click();

    await block2.click({ ctrl: true });

    // Verify both are selected
    let selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toHaveLength(2);

    const initialGeometry1 = await block1.getGeometry();
    const initialGeometry2 = await block2.getGeometry();

    // Calculate initial relative distance
    const initialDeltaX = initialGeometry2.x - initialGeometry1.x;
    const initialDeltaY = initialGeometry2.y - initialGeometry1.y;

    // Drag first block to a different position (move both X and Y)
    // Block-1 center is at (400, 250), move to (500, 350)
    await block1.dragTo({ x: 500, y: 350 });

    const finalGeometry1 = await block1.getGeometry();
    const finalGeometry2 = await block2.getGeometry();

    // Both blocks should have moved
    expect(finalGeometry1.x).not.toBe(initialGeometry1.x);
    expect(finalGeometry1.y).not.toBe(initialGeometry1.y);
    expect(finalGeometry2.x).not.toBe(initialGeometry2.x);
    expect(finalGeometry2.y).not.toBe(initialGeometry2.y);

    // Relative distance should be preserved (within tolerance)
    const finalDeltaX = finalGeometry2.x - finalGeometry1.x;
    const finalDeltaY = finalGeometry2.y - finalGeometry1.y;

    expect(Math.abs(finalDeltaX - initialDeltaX)).toBeLessThan(5);
    expect(Math.abs(finalDeltaY - initialDeltaY)).toBeLessThan(5);
  });

  test("should maintain block selection after drag", async () => {
    // Get block COM
    const block1 = graphPO.getBlockCOM("block-1");

    // Select a block
    await block1.click();

    // Verify it's selected
    let selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toContain("block-1");

    // Drag the block
    await block1.dragTo({ x: 300, y: 250 });

    // Block should still be selected after drag
    selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toContain("block-1");
  });

  test("should drag block with different zoom levels", async () => {
    // Get block and camera COMs
    const block1 = graphPO.getBlockCOM("block-1");
    const camera = graphPO.getCamera();

    // Select block first
    await block1.click();

    // Zoom in
    await camera.zoomToScale(0.8);

    const targetPos = { x: 350, y: 250 };

    // Drag block at this zoom level
    await block1.dragTo(targetPos);

    const finalGeometry = await block1.getGeometry();

    // Calculate center of final block
    const finalCenter = {
      x: finalGeometry.x + finalGeometry.width / 2,
      y: finalGeometry.y + finalGeometry.height / 2,
    };

    // Center should reach approximately target position (within 20 pixels tolerance)
    expect(Math.abs(finalCenter.x - targetPos.x)).toBeLessThan(20);
    expect(Math.abs(finalCenter.y - targetPos.y)).toBeLessThan(20);
  });
});

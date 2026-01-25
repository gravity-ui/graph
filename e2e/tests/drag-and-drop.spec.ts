import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Drag and Drop", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    // Initialize graph with test blocks
    await graphPO.initialize({
      blocks: [
        {
          id: "block-1",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Block 1",
          anchors: [],
          selected: false,
        },
        {
          id: "block-2",
          is: "Block",
          x: 400,
          y: 200,
          width: 200,
          height: 100,
          name: "Block 2",
          anchors: [],
          selected: false,
        },
        {
          id: "block-3",
          is: "Block",
          x: 100,
          y: 400,
          width: 200,
          height: 100,
          name: "Block 3",
          anchors: [],
          selected: false,
        },
      ],
      connections: [],
    });
  });

  test("should drag block to new position", async () => {
    const initialGeometry = await graphPO.blocks.getGeometry("block-1");

    // Drag block to new world position
    const newWorldPos = { x: 500, y: 300 };
    await graphPO.blocks.dragTo("block-1", newWorldPos);

    // Wait for update
    await graphPO.page.waitForTimeout(100);

    const finalGeometry = await graphPO.blocks.getGeometry("block-1");

    // Position should have changed
    expect(finalGeometry.x).not.toBe(initialGeometry.x);
    expect(finalGeometry.y).not.toBe(initialGeometry.y);

    // Should be close to target position (within 10 pixels tolerance)
    expect(Math.abs(finalGeometry.x - newWorldPos.x)).toBeLessThan(10);
    expect(Math.abs(finalGeometry.y - newWorldPos.y)).toBeLessThan(10);
  });

  test("should drag multiple selected blocks together", async ({ page }) => {
    // Select two blocks
    await graphPO.blocks.click("block-1");
    await graphPO.waitForFrames(2);
    
    await graphPO.blocks.click("block-2", { shift: true });
    await graphPO.waitForFrames(2);

    // Verify both are selected
    let selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toHaveLength(2);

    const initialGeometry1 = await graphPO.blocks.getGeometry("block-1");
    const initialGeometry2 = await graphPO.blocks.getGeometry("block-2");

    // Calculate initial relative distance
    const initialDeltaX = initialGeometry2.x - initialGeometry1.x;
    const initialDeltaY = initialGeometry2.y - initialGeometry1.y;

    // Drag first block
    await graphPO.blocks.dragTo("block-1", { x: 200, y: 200 });
    await page.waitForTimeout(100);

    const finalGeometry1 = await graphPO.blocks.getGeometry("block-1");
    const finalGeometry2 = await graphPO.blocks.getGeometry("block-2");

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
    // Select a block
    await graphPO.blocks.click("block-1");
    await graphPO.page.waitForTimeout(50);

    // Verify it's selected
    let selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toContain("block-1");

    // Drag the block
    await graphPO.blocks.dragTo("block-1", { x: 300, y: 250 });
    await graphPO.page.waitForTimeout(100);

    // Block should still be selected after drag
    selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toContain("block-1");
  });

  test("should drag block with different zoom levels", async () => {
    // Zoom in
    await graphPO.camera.zoomToScale(0.8);
    await graphPO.page.waitForTimeout(100);

    const initialGeometry = await graphPO.blocks.getGeometry("block-1");
    const targetPos = { x: 350, y: 250 };

    // Drag block at this zoom level
    await graphPO.blocks.dragTo("block-1", targetPos);
    await graphPO.page.waitForTimeout(100);

    const finalGeometry = await graphPO.blocks.getGeometry("block-1");

    // Should reach approximately target position
    expect(Math.abs(finalGeometry.x - targetPos.x)).toBeLessThan(10);
    expect(Math.abs(finalGeometry.y - targetPos.y)).toBeLessThan(10);
  });
});

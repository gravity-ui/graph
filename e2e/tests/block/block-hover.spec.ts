import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.describe("Block Hover", () => {
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
      ],
      connections: [],
    });
  });

  test("should change cursor from auto to pointer when hovering over block and back to auto", async ({
    page,
  }) => {
    // Get block COM
    const block1 = graphPO.getBlockCOM("block-1");

    // Step 1: Check initial cursor state (should be auto)
    const initialCursor = await graphPO.getCursor();

    expect(initialCursor).toBe("auto");

    // Step 2: Hover over the block
    await block1.hover();

    // Wait for cursor layer to process the hover event
    await graphPO.waitForFrames(5);

    // Check cursor is now pointer
    const hoverCursor = await graphPO.getCursor();

    expect(hoverCursor).toBe("pointer");

    // Step 3: Move mouse away from block to empty space
    await graphPO.hover(10, 10); // Hover at empty area far from blocks

    // Wait for cursor layer to process the movement
    await graphPO.waitForFrames(5);

    // Check cursor is back to auto
    const afterCursor = await graphPO.getCursor();

    expect(afterCursor).toBe("auto");
  });
});

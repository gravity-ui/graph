import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Block Click Selection", () => {
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

  test("should select block on click", async () => {
    // Click on block-1
    await graphPO.blocks.click("block-1");

    // Check if block is selected
    const isSelected = await graphPO.blocks.isSelected("block-1");
    await graphPO.page.pause();
    expect(isSelected).toBe(true);

    // Check selected blocks list
    const selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toContain("block-1");
    expect(selectedBlocks).toHaveLength(1);
  });

  test("should deselect block when clicking on empty space", async () => {
    // Select block first
    await graphPO.blocks.click("block-1");
    
    // Verify it's selected
    let selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toContain("block-1");

    // Click on empty space (top-left corner)
    await graphPO.page.mouse.click(10, 10);
    await graphPO.waitForFrames(2);

    // Check that no blocks are selected
    selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toHaveLength(0);
  });

  test("should select multiple blocks with Shift+Click", async () => {
    // Select first block
    await graphPO.blocks.click("block-1");
    await graphPO.waitForFrames(2);

    // Click second block with Shift modifier
    await graphPO.blocks.click("block-2", { shift: true });

    // Check that both blocks are selected
    const selectedBlocks = await graphPO.blocks.getSelected();
    expect(selectedBlocks).toHaveLength(2);
    expect(selectedBlocks).toContain("block-1");
    expect(selectedBlocks).toContain("block-2");
  });
});

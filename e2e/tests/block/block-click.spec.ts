import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

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
    // Get block COM
    const block1 = graphPO.getBlockCOM("block-1");

    // Click on block
    await block1.click();

    // Check if block is selected
    const isSelected = await block1.isSelected();
    expect(isSelected).toBe(true);

    // Check selected blocks list
    const selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toContain("block-1");
    expect(selectedBlocks).toHaveLength(1);
  });

  test("should deselect block when clicking on empty space", async () => {
    // Get block COM
    const block1 = graphPO.getBlockCOM("block-1");

    // Select block first
    await block1.click();

    // Verify it's selected
    let selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toContain("block-1");

    // Click on empty space (top-left corner)
    await graphPO.page.mouse.click(10, 10);
    await graphPO.waitForFrames(2);

    // Check that no blocks are selected
    selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toHaveLength(0);
  });

  test("should select multiple blocks with Ctrl+Click", async () => {
    // Get block COMs
    const block1 = graphPO.getBlockCOM("block-1");
    const block2 = graphPO.getBlockCOM("block-2");

    // Select first block
    await block1.click();

    // Click second block with Ctrl modifier (Cmd on Mac)
    await block2.click({ ctrl: true });

    // Check that both blocks are selected
    const selectedBlocks = await graphPO.getSelectedBlocks();
    expect(selectedBlocks).toHaveLength(2);
    expect(selectedBlocks).toContain("block-1");
    expect(selectedBlocks).toContain("block-2");
  });
});

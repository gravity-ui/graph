import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Selection Test", () => {
  test("test selection programmatically", async ({ page }) => {
    const graphPO = new GraphPageObject(page);

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
      ],
      connections: [],
    });

    // Try selecting programmatically first
    await page.evaluate(() => {
      const blockState = window.graph.blocks.getBlockState("block-1");
      console.log("BlockState exists:", !!blockState);
      console.log("SelectionService:", window.graph.selectionService);
      
      // Try to select the block using correct API
      window.graph.selectionService.select("block", ["block-1"], 0); // ESelectionStrategy.REPLACE = 0
    });

    await page.waitForTimeout(200);

    const isSelected = await graphPO.blocks.isSelected("block-1");
    console.log("Is block selected after programmatic selection:", isSelected);

    expect(isSelected).toBe(true);
  });
});

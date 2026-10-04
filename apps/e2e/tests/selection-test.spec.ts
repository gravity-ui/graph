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

      // Try to select the block using correct API
      const { ESelectionStrategy } = window.GraphModule;
      window.graph.selectionService.select("block", ["block-1"], ESelectionStrategy.REPLACE);
    });

    await page.waitForTimeout(200);

    // Get block COM
    const block1 = graphPO.block("block-1");
    const isSelected = await block1.isSelected();

    expect(isSelected).toBe(true);
  });
  test("an empty selectable-entity patch disables rectangle selection", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({
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
    async function selectRectangle() {
      await page.keyboard.down("Control");
      try {
        await graph.drag({ x: 80, y: 80 }, { x: 320, y: 220 });
      } finally {
        await page.keyboard.up("Control");
      }
    }
    await selectRectangle();
    expect(await graph.getSelectedBlockIds()).toEqual(["block-1"]);
    await graph.evaluate((instance) => {
      instance.selectionService.select("block", [], window.GraphModule.ESelectionStrategy.REPLACE);
      instance.setConstants({ selectionLayer: { SELECTABLE_ENTITY_TYPES: [] } });
    });
    await selectRectangle();
    expect(await graph.getSelectedBlockIds()).toEqual([]);
  });
});

import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.describe("Blocks in the scene: hit order", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [
        {
          id: "lower",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Lower",
          anchors: [{ id: "out", blockId: "lower", type: "OUT" }],
        },
        { id: "upper", is: "Block", x: 220, y: 140, width: 200, height: 100, name: "Upper", anchors: [] },
      ],
      connections: [],
    });
  });

  test("a click in the overlap selects the block drawn on top", async () => {
    await graphPO.clickAt({ x: 260, y: 170 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["upper"]);
  });

  test("a block raised by selection stays on top after deselection", async () => {
    await graphPO.evaluate((graph) => graph.api.selectBlocks(["lower"], true));
    await graphPO.evaluate((graph) => graph.api.selectBlocks(["lower"], false));
    await graphPO.waitForFrames(3);
    await graphPO.clickAt({ x: 260, y: 170 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["lower"]);
  });

  test("an anchor of the lower block under the upper block is not hit", async () => {
    // The OUT anchor of "lower" is at (300, 188), under "upper".
    await graphPO.clickAt({ x: 300, y: 188 });
    expect(await graphPO.getSelectedBlockIds()).toEqual(["upper"]);
  });
});

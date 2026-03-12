import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCK_1 = {
  id: "block-1",
  is: "Block" as const,
  x: 200,
  y: 200,
  width: 200,
  height: 100,
  name: "Block 1",
  anchors: [],
  selected: false,
};

/**
 * Regression test for https://github.com/gravity-ui/graph/issues/265
 *
 * On touchend events, event.touches is empty (the finger was lifted),
 * so getCoord() crashes with "Cannot read properties of undefined (reading 'pageX')"
 * when trying to access event.touches[0].pageX.
 */
test.describe("Touch tap", () => {
  test.use({ hasTouch: true });

  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [BLOCK_1],
      connections: [],
    });
  });

  test("should not throw when tapping the canvas (regression: touches[0] undefined on touchend)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    // Get screen coordinates of the block center
    const { viewportX, viewportY } = await page.evaluate(() => {
      const geo = window.graph.blocks.getBlockState("block-1")!.$geometry.value;
      const [sx, sy] = window.graph.cameraService.getAbsoluteXY(
        geo.x + geo.width / 2,
        geo.y + geo.height / 2
      );
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        viewportX: sx + rect.left,
        viewportY: sy + rect.top,
      };
    });

    // Simulate a touch tap (touchstart + touchend)
    // On touchend, event.touches is empty — this triggers the bug
    await page.touchscreen.tap(viewportX, viewportY);
    await graphPO.waitForFrames(3);

    expect(errors).toHaveLength(0);
  });

  test("should select block on touch tap", async ({ page }) => {
    const { viewportX, viewportY } = await page.evaluate(() => {
      const geo = window.graph.blocks.getBlockState("block-1")!.$geometry.value;
      const [sx, sy] = window.graph.cameraService.getAbsoluteXY(
        geo.x + geo.width / 2,
        geo.y + geo.height / 2
      );
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        viewportX: sx + rect.left,
        viewportY: sy + rect.top,
      };
    });

    await page.touchscreen.tap(viewportX, viewportY);
    await graphPO.waitForFrames(3);

    const isSelected = await page.evaluate(() => {
      return window.graph.blocks.getBlockState("block-1")?.selected ?? false;
    });

    expect(isSelected).toBe(true);
  });
});

import { expect, test } from "@playwright/test";
import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

test.describe("GraphTooltip e2e", () => {
  let graphPO: ReactGraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new ReactGraphPageObject(page);
    await graphPO.initializeWithCustomChildren({
      blocks: [
        {
          id: "block-1",
          is: "Block",
          x: 120,
          y: 120,
          width: 220,
          height: 110,
          name: "Block 1",
          anchors: [],
          selected: false,
        },
      ],
      connections: [],
      children: [
        {
          type: "graph-tooltip",
          hoverEnterTimeoutMs: 0,
          hoverLeaveTimeoutMs: 0,
        },
      ],
    });
  });

  test("calls content resolver for hovered block", async ({ page }) => {
    await page.locator('[data-testid="block-block-1"]').hover();
    await expect.poll(async () => graphPO.getTooltipLastTargetId()).toBe("block-1");
  });

  test("keeps resolver target after camera changes", async ({ page }) => {
    await page.locator('[data-testid="block-block-1"]').hover();
    await expect.poll(async () => graphPO.getTooltipLastTargetId()).toBe("block-1");

    await page.evaluate(() => {
      (window as any).graph.cameraService.move(120, 0);
    });
    await page.waitForTimeout(220);

    await expect.poll(async () => graphPO.getTooltipLastTargetId()).toBe("block-1");
  });
});

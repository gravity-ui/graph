import { expect, test } from "@playwright/test";
import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

test.describe("useHoveredGraphComponent e2e", () => {
  let graphPO: ReactGraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new ReactGraphPageObject(page);
    await graphPO.initializeWithHoveredHook({
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
      hoverEnterTimeoutMs: 150,
      hoverLeaveTimeoutMs: 150,
    });
  });

  test("tracks hover with enter/leave debounce", async ({ page }) => {
    await page.locator('[data-testid="block-block-1"]').hover();
    await expect(page.locator('[data-testid="hovered-state"]')).toHaveAttribute("data-hovered-id", "");

    await page.waitForTimeout(220);
    await expect.poll(async () => graphPO.getHookHoveredId()).toBe("block-1");

    await page.mouse.move(10, 10);
    await expect.poll(async () => graphPO.getHookHoveredId()).toBe("block-1");

    await page.waitForTimeout(220);
    await expect.poll(async () => graphPO.getHookHoveredId()).toBe("");
  });

  test("keeps hovered component while lock target is hovered", async ({ page }) => {
    await page.locator('[data-testid="block-block-1"]').hover();
    await page.waitForTimeout(220);
    await expect.poll(async () => graphPO.getHookHoveredId()).toBe("block-1");

    await graphPO.lockHoverByLockTarget();
    await graphPO.emitMouseLeaveFromLockTarget();
    await page.waitForTimeout(220);

    await expect.poll(async () => graphPO.getHookHoveredId()).toBe("block-1");

    await graphPO.unlockHoverByBody();
    await page.waitForTimeout(220);
    await expect.poll(async () => graphPO.getHookHoveredId()).toBe("");
  });
});

import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph-playwright";

test("installed uikit kit follows the uikit theme", async ({ page }) => {
  await page.goto("/");

  const root = page.locator("#react-root");
  await expect(root).toHaveAttribute("data-state", "ready");

  const graph = new GraphPO(page.locator("#react-shell"));
  await graph.waitForReady();

  const token = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".graph-canvas") ?? document.body)
      .getPropertyValue("--g-color-base-float")
      .trim()
  );
  await expect.poll(() => graph.evaluate((g) => g.graphColors.block.background)).toBe(token);
});

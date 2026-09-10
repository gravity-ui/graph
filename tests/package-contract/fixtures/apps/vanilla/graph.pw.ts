import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed vanilla entrypoints load with public styles", async ({ page }) => {
  await page.goto("/");

  // Use an application-owned wrapper to make sure consumers do not need to
  // depend on internal Graph markup or CSS selectors.
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();

  const canvas = page.locator("#graph canvas.layer").first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS("position", "absolute");
});

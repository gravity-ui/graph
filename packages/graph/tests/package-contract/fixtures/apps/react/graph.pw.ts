import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed React entrypoint renders with public styles", async ({ page }) => {
  await page.goto("/");

  const root = page.locator("#react-root");
  await expect(root).toHaveAttribute("data-state", "ready");
  await expect(root.locator(".graph-wrapper")).toHaveCSS("position", "relative");

  const graph = new GraphPO(page.locator("#react-shell"));
  await graph.waitForReady();

  await expect(page.getByTestId("react-block-react-source")).toHaveText("React source");
});

import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph-playwright";

test("installed layer applies theme CSS variables to the consumer graph", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await new GraphPO(page.locator("#graph-shell")).waitForReady();
  const root = page.locator("#graph");
  await expect(root).toHaveAttribute("data-css-variables-ready", "true");
  await expect(root).toHaveAttribute("data-block-background", "rgb(240, 241, 242)");
  await expect(root).toHaveAttribute("data-grid-size", "20");
  await expect(root.locator(".css-variables-layer > .graph-theme")).toHaveCount(1);

  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(root).toHaveAttribute("data-block-background", "rgb(30, 31, 32)");
  await expect(root).toHaveAttribute("data-grid-size", "32");
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("installed ELK hook lays out blocks and connection points", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#elk-root")).toHaveAttribute("data-state", "ready");
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();

  const source = await graph.block("source").getGeometry();
  const target = await graph.block("target").getGeometry();
  expect(target.x).toBeGreaterThan(source.x + source.width);
  const connection = await graph.connection("source-to-target").getState();
  expect(connection && "points" in connection && Array.isArray(connection.points)).toBe(true);
  expect(errors).toEqual([]);
});

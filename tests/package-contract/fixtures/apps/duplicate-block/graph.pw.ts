import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

test("Alt-drag of an installed DuplicateBlockLayer adds a copy of the block", async ({ page }) => {
  await page.goto("/");
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();
  await expect(page.locator("#graph")).toHaveAttribute("data-duplicate-block-ready", "true");

  const source = graph.block("source");
  const before = await source.getGeometry();
  const center = await source.getCenter();

  await page.keyboard.down("Alt");
  await graph.drag(center, { x: center.x, y: center.y + 300 });
  await page.keyboard.up("Alt");

  await expect(page.locator("#graph")).toHaveAttribute("data-duplicate-start", "source");
  await expect(page.locator("#graph")).toHaveAttribute("data-duplicate-items", "1");
  expect(await source.getGeometry()).toEqual(before);
  const copies = await graph.evaluate((instance) =>
    instance.rootStore.blocksList.$blocks.value
      .filter((block) => !["source", "other"].includes(String(block.id)))
      .map((block) => ({ name: block.$state.value.name, y: block.y }))
  );
  expect(copies).toHaveLength(1);
  expect(copies[0].name).toBe("Source");
  expect(copies[0].y).toBeGreaterThan(200);
});

import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph-playwright";

test("installed public styles contain layers and preserve application positioning", async ({ page }) => {
  await page.goto("/");

  // Use an application-owned wrapper to make sure consumers do not need to
  // depend on internal Graph markup or CSS selectors.
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();

  const canvas = page.locator("#graph canvas.layer").first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS("position", "absolute");

  const root = page.locator("#graph");
  await page.addStyleTag({ content: "#graph { padding: 16px; border-width: 8px; }" });

  const expectCanvasFitsRoot = async () => {
    const paddingBox = await root.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x + element.clientLeft,
        y: rect.y + element.clientTop,
        width: element.clientWidth,
        height: element.clientHeight,
      };
    });
    expect(await canvas.boundingBox()).toEqual(paddingBox);
  };

  await expect(root).toHaveCSS("position", "relative");
  await expectCanvasFitsRoot();

  const positionRule = "#graph { position: absolute; left: 40px; top: 40px; }";
  for (const content of [positionRule, `@layer app { ${positionRule} }`]) {
    const style = await page.addStyleTag({ content });
    await expect(root).toHaveCSS("position", "absolute");
    await expectCanvasFitsRoot();
    await style.evaluate((element) => element.parentNode?.removeChild(element));
  }
});

import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [{ id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] }];

test.describe("graph-uikit theme", () => {
  test("graph colors equal the light theme tokens", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });

    const colors = await graph.getGraphColors();
    expect(colors.block.background).toBe(await graph.readToken("--g-color-base-float"));
    expect(colors.block.selectedBorder).toBe(await graph.readToken("--g-color-line-brand"));
    expect(colors.canvas.layerBackground).toBe(await graph.readToken("--g-color-base-background"));
  });

  test("switching to dark re-reads the tokens", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    const light = (await graph.getGraphColors()).canvas.layerBackground;

    await graph.setTheme("dark");

    await expect
      .poll(async () => (await graph.getGraphColors()).canvas.layerBackground)
      .toBe(await graph.readToken("--g-color-base-background"));
    expect((await graph.getGraphColors()).canvas.layerBackground).not.toBe(light);
  });

  test("a scoped ThemeProvider is read from the graph root", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS }, { theme: "dark", scoped: true });

    expect((await graph.getGraphColors()).canvas.layerBackground).toBe(
      await graph.readToken("--g-color-base-background")
    );
    expect(await page.evaluate(() => document.body.className)).not.toContain("g-root_theme_dark");
  });
});

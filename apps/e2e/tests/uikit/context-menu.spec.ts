import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [{ id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] }];

// World points away from the block. The graph is fitted to the block (scale 1, block centered in the
// 1280x720 viewport), so both points land inside the viewport on screen.
const EMPTY_POINT = { x: 400, y: 300 };
const OTHER_EMPTY_POINT = { x: -300, y: -200 };

test.describe("graph-uikit context menu", () => {
  test("right click on a block opens the menu and runs the action", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.camera().zoomToScale(0.5);

    await graph.block("a").click({ button: "right" });
    await expect(graph.contextMenu()).toContainText("menu:block");

    await graph.contextMenu().getByText("menu:block").click();
    await expect(graph.contextMenu()).toHaveCount(0);
    expect(await page.evaluate(() => window.uikitMenuActions)).toEqual(["block"]);
  });

  test("right click on empty canvas opens the canvas menu; Escape closes it", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });

    await graph.clickAt(EMPTY_POINT, { button: "right" });
    await expect(graph.contextMenu()).toContainText("menu:canvas");

    await page.keyboard.press("Escape");
    await expect(graph.contextMenu()).toHaveCount(0);
  });

  test("outside click closes the menu", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.clickAt(EMPTY_POINT, { button: "right" });
    await expect(graph.contextMenu()).toBeVisible();

    await graph.clickAt(OTHER_EMPTY_POINT);

    await expect(graph.contextMenu()).toHaveCount(0);
  });
});

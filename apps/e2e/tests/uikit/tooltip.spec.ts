import { expect, test } from "@playwright/test";

import type { TBlock, TConnection } from "@gravity-ui/graph";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [
  { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] },
  { id: "b", is: "Block", name: "B", x: 500, y: 0, width: 200, height: 100, anchors: [] },
];
const CONNECTIONS: TConnection[] = [{ id: "a:b", sourceBlockId: "a", targetBlockId: "b" }];

test.describe("graph-uikit tooltip", () => {
  test("shows on a canvas block and on a React block", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, connections: CONNECTIONS });

    await graph.camera().zoomToScale(0.5);
    await graph.block("a").hover();
    await expect(graph.tooltip()).toHaveText("tooltip:block:a");

    await graph.hoverAt({ x: 350, y: 300 });
    await expect(graph.tooltip()).toHaveCount(0);

    await graph.camera().zoomToScale(1);
    await graph.block("b").hover();
    await expect(graph.tooltip()).toHaveText("tooltip:block:b");
  });

  test("follows the camera", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, connections: CONNECTIONS });
    await graph.camera().zoomToScale(0.5);
    await graph.block("a").hover();
    await expect(graph.tooltip()).toBeVisible();
    await graph.waitForFrames(3);
    const readTooltipX = async (): Promise<number> => (await graph.tooltip().boundingBox())?.x ?? 0;
    const before = await readTooltipX();

    // A block is 100px wide on screen at scale 0.5 and the pointer rests on its center: a pan below 50px keeps
    // the pointer over the block, so the tooltip is repositioned rather than closed by a hover change.
    await graph.camera().panBy(40, 0);

    await expect.poll(readTooltipX).toBeGreaterThan(before + 25);
  });

  test("connection tooltip appears near the pointer", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, connections: CONNECTIONS });
    await graph.camera().zoomToScale(0.5);

    await graph.connection("a:b").hover();

    await expect(graph.tooltip()).toHaveText("tooltip:connection:a:b");
  });

  test("hides while the pointer is pressed", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS, connections: CONNECTIONS }, { mode: "edit" });
    await graph.camera().zoomToScale(0.5);
    await graph.block("a").hover();
    await expect(graph.tooltip()).toBeVisible();

    await page.mouse.down();
    await expect(graph.tooltip()).toHaveCount(0);
    await page.mouse.up();
  });
});

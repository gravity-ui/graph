import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [
  { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] },
  { id: "b", is: "Block", name: "B", x: 400, y: 0, width: 200, height: 100, anchors: [] },
];

test.describe("graph-uikit LOD", () => {
  test("canvas on schematic level, uikit Box on detailed level", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });

    await graph.camera().zoomToScale(0.5);
    await expect(graph.surfaces()).toHaveCount(0);

    await graph.camera().zoomToScale(1);
    await expect(graph.surfaces()).toHaveCount(BLOCKS.length);
  });

  test("selection adds the selected surface class", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.camera().zoomToScale(1);

    await graph.block("a").click();

    await expect(page.locator(".graph-uikit-block__surface_selected")).toHaveCount(1);
  });

  test("hovering a canvas block sets the kit and block hover state", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.camera().zoomToScale(0.5);

    await graph.block("a").hover();

    await expect.poll(() => graph.getHoveredKind()).toBe("block");
    await expect.poll(() => graph.isCanvasBlockHovered("a")).toBe(true);
  });
});

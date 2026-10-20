import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [
  { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] },
  { id: "b", is: "Block", name: "B", x: 600, y: 300, width: 200, height: 100, anchors: [] },
];

test.describe("graph-uikit toolbar", () => {
  test("zoom in and zoom out change the scale by the multiplicative step", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.camera().zoomToScale(0.5);

    await graph.toolbar().getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => graph.getCameraScale()).toBeCloseTo(0.55, 2);

    await graph.toolbar().getByRole("button", { name: "Zoom out" }).click();
    await expect.poll(() => graph.getCameraScale()).toBeCloseTo(0.5, 2);
  });

  test("1:1 resets the scale and then disables itself", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.camera().zoomToScale(0.5);

    const reset = graph.toolbar().getByRole("button", { name: "Actual size" });
    await reset.click();

    await expect.poll(() => graph.getCameraScale()).toBeCloseTo(1, 2);
    await expect(reset).toBeDisabled();
  });

  test("fit selection is disabled until something is selected", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    const fitSelection = graph.toolbar().getByRole("button", { name: "Fit selection" });

    await expect(fitSelection).toBeDisabled();
    await graph.block("a").click();
    await expect(fitSelection).toBeEnabled();

    await graph.camera().zoomToScale(0.2);
    await fitSelection.click();
    await expect.poll(() => graph.getCameraScale()).toBeGreaterThan(0.2);
  });

  test("fit to viewport frames all blocks", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: BLOCKS });
    await graph.camera().zoomToScale(1);

    await graph.toolbar().getByRole("button", { name: "Fit to viewport" }).click();

    await expect.poll(() => graph.getCameraScale()).toBeLessThan(1);
  });
});

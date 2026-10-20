import { expect, test } from "@playwright/test";

import type { TBlock } from "@gravity-ui/graph";

import { UikitPageObject } from "./UikitPageObject";

const BLOCKS: TBlock[] = [
  { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] },
  { id: "b", is: "Block", name: "B", x: 600, y: 300, width: 200, height: 100, anchors: [] },
];

/** Far apart on purpose: the bounding box (2600x1500) does not fit a 1280x720 viewport at scale 1. */
const FAR_BLOCKS: TBlock[] = [
  { id: "a", is: "Block", name: "A", x: 0, y: 0, width: 200, height: 100, anchors: [] },
  { id: "b", is: "Block", name: "B", x: 2400, y: 1400, width: 200, height: 100, anchors: [] },
];
const FAR_BLOCKS_SIZE = { width: 2600, height: 1500 };

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
    // A single 200x100 block fits the viewport at any size above 200x100, so the fit is clamped to scaleMax (1).
    await expect.poll(() => graph.getCameraScale()).toBeCloseTo(1, 2);
  });

  test("fit to viewport frames all blocks", async ({ page }) => {
    const graph = new UikitPageObject(page);
    await graph.open({ blocks: FAR_BLOCKS });
    await graph.camera().zoomToScale(1);
    await expect.poll(() => graph.getCameraScale()).toBeCloseTo(1, 2);

    // `zoomTo("center")` fits the raw bounding box of the blocks, scale = min(width / 2600, height / 1500),
    // clamped to the camera bounds. For the default 1280x720 viewport that is min(0.49, 0.48) = 0.48.
    const viewport = await graph.getBounds();
    const expectedScale = Math.min(viewport.width / FAR_BLOCKS_SIZE.width, viewport.height / FAR_BLOCKS_SIZE.height, 1);

    await graph.toolbar().getByRole("button", { name: "Fit to viewport" }).click();

    // 5% tolerance: block hit boxes may extend the fitted rect by a few pixels.
    await expect.poll(async () => (await graph.getCameraScale()) / expectedScale).toBeCloseTo(1, 1);

    const { x, y, scale } = await graph.camera().getState();
    for (const id of ["a", "b"]) {
      const block = await graph.block(id).getGeometry();
      expect(block.x * scale + x, `${id} left`).toBeGreaterThanOrEqual(-1);
      expect(block.y * scale + y, `${id} top`).toBeGreaterThanOrEqual(-1);
      expect((block.x + block.width) * scale + x, `${id} right`).toBeLessThanOrEqual(viewport.width + 1);
      expect((block.y + block.height) * scale + y, `${id} bottom`).toBeLessThanOrEqual(viewport.height + 1);
    }
  });
});

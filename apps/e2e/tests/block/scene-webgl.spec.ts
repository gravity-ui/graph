import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { GraphConfig } from "../../page-objects/GraphPageObject";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * The scene's WebGL backend in a real browser: blocks and anchors draw through it, and a change after the first frame
 * (selection, raise) goes through `applyMany`. A backend failure falls back to Canvas2D silently, with the same picture,
 * so the renderer state is checked after every step.
 */

/** Schematic: from SCALES[1] (0.225) to SCALES[2] (0.7); anchors draw there. */
const SCALE = 0.5;

const CONFIG: GraphConfig = {
  blocks: [
    { id: "lower", is: "Block", x: 100, y: 100, width: 200, height: 100, name: "L", anchors: [] },
    { id: "upper", is: "Block", x: 220, y: 140, width: 200, height: 100, name: "U", anchors: [] },
    {
      id: "solo",
      is: "Block",
      x: 600,
      y: 100,
      width: 200,
      height: 100,
      name: "S",
      anchors: [{ id: "out", blockId: "solo", type: "OUT" }],
    },
  ],
  connections: [],
  settings: { renderer: "webgl", useBlocksAnchors: true },
};

const LOWER_BODY: [number, number, number] = [208, 32, 32];
const UPPER_BODY: [number, number, number] = [32, 80, 208];

type TWorldRect = { x: number; y: number; width: number; height: number };

async function hasWebGL2(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")));
}

async function rendererState(page: Page): Promise<string> {
  return page.evaluate(() => window.graph.scene.$renderer.value);
}

/** Counts the screen pixels of a world rect within `tolerance` of `rgb` on every channel, and the pixels checked. */
async function countColor(
  page: Page,
  rect: TWorldRect,
  rgb: [number, number, number],
  tolerance: number
): Promise<{ matched: number; total: number }> {
  const clip = await page.evaluate((world) => {
    const { scale, x, y } = window.graph.cameraService.getCameraState();
    const origin = window.graph.getGraphCanvas()?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      x: Math.round(origin.left + world.x * scale + x),
      y: Math.round(origin.top + world.y * scale + y),
      width: Math.max(1, Math.round(world.width * scale)),
      height: Math.max(1, Math.round(world.height * scale)),
    };
  }, rect);
  const png = await page.screenshot({ clip, scale: "css" });
  return page.evaluate(
    async ({ base64, target, within }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { matched: 0, total: 0 };
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let matched = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (target.every((value, k) => Math.abs(value - data[i + k]) <= within)) matched++;
      }
      return { matched, total: data.length / 4 };
    },
    { base64: png.toString("base64"), target: rgb, within: tolerance }
  );
}

/** The anchor's port point in world units: the anchor component is created lazily, the port always exists. */
async function anchorPoint(page: Page, blockId: string, anchorId: string): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ block, anchor }) => {
      const component = window.graph.rootStore.blocksList.getBlockState(block)?.getViewComponent();
      if (!component) throw new Error(`no block ${block}`);
      return component.getAnchorPort(anchor).getPoint();
    },
    { block: blockId, anchor: anchorId }
  );
}

test.describe("Scene blocks with the WebGL renderer", () => {
  test("draws blocks and a selected anchor's ring through WebGL, and a selection raise after the first frame", async ({
    page,
  }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize(CONFIG);
    test.skip(!(await hasWebGL2(page)), "Headless Chromium has no WebGL2");

    await page.evaluate(
      ({ scale, lower, upper }) => {
        const { CanvasBlock, defineTag } = window.GraphModule;
        const graph = window.graph;
        const lowerTag = defineTag("e2e-lower");
        const upperTag = defineTag("e2e-upper");
        const color = (rgb: number[]): string => `rgb(${rgb.join(", ")})`;
        graph.scene.styles.add([
          { target: CanvasBlock, tags: [lowerTag], style: { parts: { body: { color: color(lower) } } } },
          { target: CanvasBlock, tags: [upperTag], style: { parts: { body: { color: color(upper) } } } },
        ]);
        graph.scene.tags.add(lowerTag, { block: ["lower"] });
        graph.scene.tags.add(upperTag, { block: ["upper"] });
        graph.cameraService.set({ scale, x: 0, y: 0 });
      },
      { scale: SCALE, lower: LOWER_BODY, upper: UPPER_BODY }
    );
    await expect.poll(() => rendererState(page), { timeout: 10_000 }).toBe("webgl");
    await graphPO.waitForFrames(3);
    expect(await page.evaluate(() => window.graph.scene.$level.value)).toBe("schematic");

    // A block body with the theme's colour, in its lower left part (the title is centred at the top).
    const body = await page.evaluate(() => window.graph.graphColors.block.background);
    expect(body).toBe("#e0e0e0");
    const soloBody = { x: 620, y: 160, width: 30, height: 20 };
    const plain = await countColor(page, soloBody, [224, 224, 224], 3);
    expect(plain.matched).toBe(plain.total);

    // The overlap of "lower" and "upper": "upper" comes later and draws on top.
    const overlap = { x: 235, y: 150, width: 40, height: 20 };
    const before = await countColor(page, overlap, UPPER_BODY, 6);
    expect(before.matched).toBe(before.total);

    // The ring of a selected anchor: right of the OUT point, outside the block, between radius 6.5 and 11.5.
    const out = await anchorPoint(page, "solo", "out");
    const ringArea = { x: out.x - 14, y: out.y - 14, width: 28, height: 28 };
    const ring = (await page.evaluate(() => window.graph.graphColors.anchor.selectedBorder)).toLowerCase();
    expect(ring).toBe("#ffcc00");
    const ringColor: [number, number, number] = [255, 204, 0];
    expect((await countColor(page, ringArea, ringColor, 40)).matched).toBe(0);
    await page.evaluate(() => window.graph.api.setAnchorSelection("solo", "out", true));
    await graphPO.waitForFrames(3);
    expect(await rendererState(page)).toBe("webgl");
    const selected = await countColor(page, ringArea, ringColor, 40);
    // The ring is about 2.5 CSS px wide at this scale: some 60 px of a 14 x 14 px area.
    expect(selected.matched).toBeGreaterThan(20);

    // Selecting "lower" raises it above "upper" (an update after the first frame, through applyMany).
    await page.evaluate(() => window.graph.api.selectBlocks(["lower"], true));
    await graphPO.waitForFrames(3);
    expect(await rendererState(page)).toBe("webgl");
    const after = await countColor(page, overlap, LOWER_BODY, 6);
    expect(after.matched).toBe(after.total);
    const stillPlain = await countColor(page, soloBody, [224, 224, 224], 3);
    expect(stillPlain.matched).toBe(stillPlain.total);
    expect(await rendererState(page)).toBe("webgl");
  });
});

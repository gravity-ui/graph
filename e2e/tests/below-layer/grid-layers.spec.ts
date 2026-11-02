import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { TBlock } from "../../../src/components/canvas/blocks/Block";
import { BelowLayerProbe } from "../../page-objects/BelowLayerProbe";
import type { TWorldPoint } from "../../page-objects/BelowLayerProbe";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const DARK = 0.5;
const LIGHT = 0.1;
const BELOW_LAYER_BACKGROUND: [number, number, number] = [255, 0, 255];
const ZOOM_ANCHOR: TWorldPoint = { x: 1000, y: 0 };
/** World steps of the default layers; node (step, 0) belongs to exactly one layer */
const PROBE_STEPS = [16, 80, 400, 2000];

function createBlock(id: string, x: number, y: number): TBlock {
  return { id, is: "Block", x, y, width: 100, height: 100, name: id, anchors: [], selected: false };
}

/** With the 400px gap the usable rect is [-600, 2600] × [-600, 600] */
const BASE_BLOCKS = [createBlock("left", -200, -200), createBlock("right", 2100, 100)];

async function setupGrid(page: Page): Promise<{ graphPO: GraphPageObject; probe: BelowLayerProbe }> {
  const graphPO = new GraphPageObject(page);
  await graphPO.initialize({ blocks: BASE_BLOCKS, connections: [] });
  await graphPO.evaluate((graph) => {
    graph.setColors({
      canvas: {
        dots: "#000000",
        layerBackground: "#ffffff",
        belowLayerBackground: "#ff00ff",
        border: "#ffffff",
      },
    });
  });
  await graphPO.waitForFrames(3);
  return { graphPO, probe: new BelowLayerProbe(graphPO) };
}

test.use({ viewport: { width: 2560, height: 1440 } });

for (const dpr of [1, 2]) {
  test.describe(`BelowLayer grid layers at DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test("shows the coarsest layer when zoomed out and the finest when zoomed in", async ({ page }) => {
      const { graphPO, probe } = await setupGrid(page);
      // Dots keep their configured size at every scale, so the darkness assertions stay about layer visibility
      await graphPO.evaluate((graph) => {
        graph.setConstants({ system: { GRID_DOT_SCALE_LIMIT: 0 } });
      });

      await probe.setCamera(0.01, ZOOM_ANCHOR);
      expect(await probe.nodeDarkness({ x: 2000, y: 0 })).toBeGreaterThanOrEqual(DARK);
      expect(await probe.nodeDarkness({ x: 400, y: 0 })).toBeLessThanOrEqual(LIGHT);

      await probe.setCamera(1, ZOOM_ANCHOR);
      expect(await probe.nodeDarkness({ x: 16, y: 0 })).toBeGreaterThanOrEqual(DARK);
    });

    test("keeps dots on world nodes far from the origin", async ({ page }) => {
      const { graphPO, probe } = await setupGrid(page);
      await graphPO.setEntities({ blocks: [createBlock("far", 99950, 99950)], connections: [] });
      await graphPO.waitForFrames(5);
      await probe.setCamera(1, { x: 100200, y: 100000 });

      // Step 80 is drawn with a pattern tile, step 400 is drawn directly
      for (const point of [
        { x: 100080, y: 100000 },
        { x: 100400, y: 100000 },
      ]) {
        const offset = await probe.findDotCenter(point);
        expect(Math.abs(offset.x), `x offset at (${point.x}, ${point.y})`).toBeLessThanOrEqual(1);
        expect(Math.abs(offset.y), `y offset at (${point.x}, ${point.y})`).toBeLessThanOrEqual(1);
      }
    });
  });
}

test.describe("BelowLayer grid layers behavior at DPR 2", () => {
  test.use({ deviceScaleFactor: 2 });

  test("fades layers in smoothly while zooming with the mouse wheel and keeps coarse layers", async ({ page }) => {
    test.slow();
    const { graphPO, probe } = await setupGrid(page);
    // This test checks opacity fading and layer persistence at a constant dot size;
    // dot shrinking below GRID_DOT_SCALE_LIMIT is covered by its own test
    await graphPO.evaluate((graph) => {
      graph.setConstants({ system: { GRID_DOT_SCALE_LIMIT: 0 } });
    });
    await probe.setCamera(0.01, ZOOM_ANCHOR);
    const anchor = await probe.worldToScreen(ZOOM_ANCHOR);
    const samples = PROBE_STEPS.map((step) => ({ step, point: { x: step, y: 0 }, values: [] as number[] }));

    for (let tick = 0; tick < 80; tick += 1) {
      const { scale } = await graphPO.camera().getState();
      for (const sample of samples) {
        // Closer than 4 px to the coarser dot at (0, 0) the probe would read that dot instead
        if (sample.step * scale >= 4) {
          sample.values.push(await probe.nodeDarkness(sample.point));
        }
      }
      if (scale >= 0.999) {
        break;
      }
      // 20 wheel lines is the largest single-event step (×1.17), as with a real mouse wheel notch
      await graphPO.camera().emulateZoom(-320, anchor);
    }

    expect((await graphPO.camera().getState()).scale).toBeGreaterThanOrEqual(0.999);

    for (const { step, values } of samples) {
      expect(values.length, `samples for step ${step}`).toBeGreaterThan(1);
      expect(values[values.length - 1], `final darkness for step ${step}`).toBeGreaterThanOrEqual(DARK);
      for (let index = 1; index < values.length; index += 1) {
        const label = `step ${step}, sample ${index}`;
        expect(values[index], label).toBeGreaterThanOrEqual(values[index - 1] - 0.05);
        expect(Math.abs(values[index] - values[index - 1]), label).toBeLessThanOrEqual(0.5);
      }
    }

    const coarsest = samples[samples.length - 1].values;
    const firstDark = coarsest.findIndex((value) => value >= DARK);
    expect(firstDark).toBeGreaterThanOrEqual(0);
    expect(coarsest.slice(firstDark).every((value) => value >= DARK)).toBe(true);
  });

  test("keeps the dot size constant in screen pixels", async ({ page }) => {
    const { probe } = await setupGrid(page);
    const node = { x: 80, y: 0 };
    const expectedDiameter = 2.4 * 2; // default dotSize of step 5 × DPR

    await probe.setCamera(0.5, ZOOM_ANCHOR);
    const atHalf = await probe.dotDiameter(node);
    await probe.setCamera(1, ZOOM_ANCHOR);
    const atOne = await probe.dotDiameter(node);

    expect(Math.abs(atHalf - atOne)).toBeLessThanOrEqual(1);
    expect(Math.abs(atOne - expectedDiameter)).toBeLessThanOrEqual(1);
  });

  test("shrinks dots with the world below GRID_DOT_SCALE_LIMIT", async ({ page }) => {
    const { probe } = await setupGrid(page);
    // Node (2000, 0) belongs to the coarsest layer (step 125, dotSize 3.6, opacity 1 at both scales)
    const node = { x: 2000, y: 0 };

    await probe.setCamera(0.125, ZOOM_ANCHOR);
    const atLimit = await probe.dotDiameter(node);
    await probe.setCamera(0.0625, ZOOM_ANCHOR);
    const atHalf = await probe.dotDiameter(node);

    expect(Math.abs(atLimit - 3.6 * 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(atHalf - 3.6 * 0.5 * 2)).toBeLessThanOrEqual(1);
    expect(atHalf).toBeLessThan(atLimit);
  });

  test("renders crisp dots without blur around them", async ({ page }) => {
    const { probe } = await setupGrid(page);
    await probe.setCamera(0.5, ZOOM_ANCHOR);
    const node = { x: 80, y: 0 };
    const radiusPx = (2.4 * 2) / 2;

    expect(await probe.nodeDarkness(node)).toBeGreaterThanOrEqual(0.9);

    const darkness = await probe.readDarknessWindow(node, 8);
    darkness.values.forEach((value, index) => {
      const x = darkness.originX + (index % darkness.size) + 0.5;
      const y = darkness.originY + Math.floor(index / darkness.size) + 0.5;
      if (Math.hypot(x - darkness.expectedX, y - darkness.expectedY) >= radiusPx + 2) {
        expect(value, `pixel (${x}, ${y})`).toBeLessThanOrEqual(LIGHT);
      }
    });
  });

  test("clips dots to the usable rect", async ({ page }) => {
    const { probe } = await setupGrid(page);
    await probe.setCamera(0.5, ZOOM_ANCHOR);

    expect(await probe.nodeDarkness({ x: 800, y: 400 })).toBeGreaterThanOrEqual(DARK);
    expect(await probe.readRgb({ x: 800, y: 800 })).toEqual(BELOW_LAYER_BACKGROUND);
  });

  test("replaces the whole layer stack via setConstants", async ({ page }) => {
    const { graphPO, probe } = await setupGrid(page);
    await graphPO.evaluate((graph) => {
      graph.setConstants({ system: { GRID_LAYERS: [{ step: 2, dotSize: 4 }] } });
    });
    await probe.setCamera(1, ZOOM_ANCHOR);

    expect(await probe.nodeDarkness({ x: 64, y: 0 })).toBeGreaterThanOrEqual(DARK);
    expect(await probe.nodeDarkness({ x: 48, y: 0 })).toBeLessThanOrEqual(LIGHT);
  });

  test("recolors dots after setColors without moving the camera", async ({ page }) => {
    const { graphPO, probe } = await setupGrid(page);
    await probe.setCamera(0.5, ZOOM_ANCHOR);
    await graphPO.evaluate((graph) => {
      graph.setColors({ canvas: { dots: "#ff0000" } });
    });
    await graphPO.waitForFrames(3);

    // (2000, 0) is drawn directly, (80, 0) is drawn with a pattern tile
    for (const point of [
      { x: 2000, y: 0 },
      { x: 80, y: 0 },
    ]) {
      const [red, green, blue] = await probe.readRgb(point);
      expect(red, `red at (${point.x}, ${point.y})`).toBeGreaterThanOrEqual(200);
      expect(green, `green at (${point.x}, ${point.y})`).toBeLessThanOrEqual(60);
      expect(blue, `blue at (${point.x}, ${point.y})`).toBeLessThanOrEqual(60);
    }
  });

  test("draws no dots for an empty or invalid layer stack", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    const { graphPO, probe } = await setupGrid(page);
    await probe.setCamera(0.5, ZOOM_ANCHOR);
    // Positive control: the default stack draws a dot here before it is replaced
    expect(await probe.nodeDarkness({ x: 2000, y: 0 })).toBeGreaterThanOrEqual(DARK);

    for (const layers of [[], [{ step: 0, dotSize: 2 }]]) {
      await graphPO.evaluate((graph, nextLayers) => {
        graph.setConstants({ system: { GRID_LAYERS: nextLayers } });
      }, layers);
      await graphPO.waitForFrames(3);
      expect(await probe.nodeDarkness({ x: 2000, y: 0 })).toBeLessThanOrEqual(LIGHT);
    }
    expect(errors).toEqual([]);
  });
});

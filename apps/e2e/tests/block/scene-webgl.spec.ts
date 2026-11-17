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
  test("batches effect paths by their visible bounds at the current zoom", async ({ page }) => {
    const graph = new GraphPageObject(page);
    await graph.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "WebGL2 unavailable");
    const row = await page.evaluate(() => {
      const { defineConnectionEffect, lineSegment } = window.GraphModule;
      const { scene, cameraService } = window.graph;
      cameraService.set({ scale: 1, x: 0, y: 0 });
      const styleId = scene.store.defineStyle({});
      const glow = defineConnectionEffect({
        extraWidth: 8,
        fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return vec4(color.rgb, 0.5); }",
      });
      for (let i = 0; i < 8; i++) {
        scene.store.add({
          id: `effect-${i}`,
          x: 100 + i * 90,
          y: 0,
          zIndex: 200,
          bounds: { minX: -810, minY: -710, maxX: 810, maxY: 1210 },
          primitives: [
            {
              kind: "path",
              part: "glow",
              minScale: 0.07,
              segments: new Float32Array(lineSegment({ x: 0, y: 100 }, { x: 0, y: 400 })),
              stroke: { color: i % 2 === 0 ? "#ff0000" : "#0000ff", width: 16 },
              effect: glow.use([]),
            },
          ],
        });
        scene.store.setStyle(`effect-${i}`, styleId);
      }
      return styleId;
    });
    await expect.poll(() => rendererState(page)).toBe("webgl");
    const levels = (): Promise<number | undefined> =>
      page.evaluate(() => window.graph.scene.layer.getBackend()?.stats.translucentLevels);
    await expect.poll(levels).toBe(1);

    await graph.evaluate((g) => g.cameraService.set({ scale: 0.1, x: 0, y: 0 }));
    await expect.poll(levels).toBeGreaterThan(1);
    const pixel = await page.evaluate(() => {
      const { scene, scheduler } = window.graph;
      scene.layer.performRender();
      scheduler.performUpdate();
      const gl = scene.layer.getBackend()?.canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 unavailable");
      const rgba = new Uint8Array(4);
      const dpr = gl.drawingBufferWidth / window.graph.cameraService.getCameraState().width;
      gl.readPixels(
        Math.floor(14 * dpr),
        gl.drawingBufferHeight - Math.floor(21 * dpr),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rgba
      );
      return Array.from(rgba);
    });
    expect(Math.abs(pixel[0] - 64)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixel[2] - 128)).toBeLessThanOrEqual(2);

    await graph.evaluate((g) => g.cameraService.set({ scale: 0.065, x: 0, y: 0 }));
    await expect.poll(levels).toBe(0);

    await graph.evaluate((g) => g.cameraService.set({ scale: 1, x: 0, y: 0 }));
    await expect.poll(levels).toBe(1);

    // A stylesheet can re-use a row id while changing visibility of every element that uses it.
    await page.evaluate((id) => {
      window.graph.scene.store.replaceStyles(new Map([[id, { parts: { glow: { visible: false } } }]]));
    }, row);
    await expect.poll(levels).toBe(0);
  });

  test("draws a filled arrow triangle in scene order", async ({ page }) => {
    const graphPO = new GraphPageObject(page);
    await graphPO.initialize({ ...CONFIG, blocks: [] });
    test.skip(!(await hasWebGL2(page)), "Headless Chromium has no WebGL2");

    await page.evaluate((scale) => {
      const graph = window.graph;
      graph.cameraService.set({ scale, x: 0, y: 0 });
      graph.scene.store.add({
        id: "arrow-pixel-test",
        zIndex: 100,
        x: 100,
        y: 100,
        bounds: { minX: 0, minY: 0, maxX: 80, maxY: 80 },
        primitives: [
          { kind: "rect", x: 0, y: 0, width: 80, height: 80, fill: "#0020c0" },
          { kind: "polygon", points: new Float32Array([0, 0, 80, 40, 0, 80]), fill: "#ff0000" },
        ],
      });
    }, SCALE);
    await expect.poll(() => rendererState(page), { timeout: 10_000 }).toBe("webgl");
    await graphPO.waitForFrames(3);

    const inside = { x: 110, y: 120, width: 8, height: 8 };
    const outside = { ...inside, x: 156 };
    const opaque = await countColor(page, inside, [255, 0, 0], 3);
    expect(opaque.matched).toBe(opaque.total);
    const background = await countColor(page, outside, [0, 32, 192], 3);
    expect(background.matched).toBe(background.total);

    await page.evaluate(() => {
      const { store } = window.graph.scene;
      const element = store.get("arrow-pixel-test");
      if (!element) throw new Error("missing triangle");
      store.update(element.id, {
        primitives: element.primitives.map((primitive) =>
          primitive.kind === "polygon" ? { ...primitive, fill: "rgba(255, 0, 0, 0.5)" } : primitive
        ),
      });
    });
    await graphPO.waitForFrames(3);
    expect(await rendererState(page)).toBe("webgl");
    const translucent = await countColor(page, inside, [128, 16, 96], 3);
    expect(translucent.matched).toBe(translucent.total);
  });

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

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

type TEffectTestWindow = Window & {
  sceneEffectTest: { setFirstTint(tint: readonly number[]): void; toggleFirst(active: boolean): void };
};

async function linePixels(page: Page): Promise<number[][]> {
  const png = await page.screenshot({ clip: { x: 250, y: 100, width: 1, height: 121 }, scale: "css" });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    ctx.drawImage(image, 0, 0);
    return [0, 120].map((y) => Array.from(ctx.getImageData(0, y, 1, 1).data.slice(0, 3)));
  }, png.toString("base64"));
}

test("tagged effects on stock connections keep independent uniforms and a plain Canvas stroke", async ({ page }) => {
  const graph = new GraphPageObject(page);
  const blocks = [100, 220].flatMap((y, i) =>
    [50, 530].map((x, side) => ({
      id: `${i}-${side}`,
      is: "Block",
      name: "Stage",
      x,
      y: y - 20,
      width: 60,
      height: 40,
      anchors: [],
    }))
  );
  await graph.initialize({
    blocks,
    connections: [0, 1].map((i) => ({
      id: `line-${i}`,
      sourceBlockId: `${i}-0`,
      targetBlockId: `${i}-1`,
      styles: { background: "#0000ff", selectedBackground: "#ff00ff" },
    })),
    settings: { renderer: "canvas", useBezierConnections: false, showConnectionArrows: false },
  });
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement("canvas").getContext("webgl2")))),
    "WebGL2 unavailable"
  );

  await page.evaluate(() => {
    const { BlockConnection, defineConnectionEffect, defineTag } = window.GraphModule;
    const { scene, cameraService } = window.graph;
    cameraService.set({ x: 0, y: 0, scale: 1 });
    const first = defineTag("first-tint");
    const second = defineTag("second-tint");
    const red = defineConnectionEffect({
      fragment: `vec4 effect(ConnectionFragment f, vec4 color) {
        return f.selected > 0.5 ? f.selectionColor : vec4(u_tint, color.a);
      }`,
      uniforms: { tint: { type: "vec3", value: [1, 0, 0] } },
    });
    const green = red.clone();
    green.uniforms.tint.value = [0, 1, 0];
    scene.styles.add([
      { target: BlockConnection, tags: [first], style: { parts: { line: { effect: red.use([]), width: 8 } } } },
      { target: BlockConnection, tags: [second], style: { parts: { line: { effect: green.use([]), width: 8 } } } },
    ]);
    scene.tags.set(first, { connection: ["line-0"] });
    scene.tags.set(second, { connection: ["line-1"] });
    (window as unknown as TEffectTestWindow).sceneEffectTest = {
      setFirstTint: (tint) => {
        red.uniforms.tint.value = tint;
      },
      toggleFirst: (active) => {
        if (active) scene.tags.set(first, { connection: ["line-0"] });
        else {
          scene.tags.clear(first);
          // Make the backend replace its style texture while the effect's path group is idle.
          for (let i = 0; i < 20; i++) scene.store.defineStyle({ parts: { line: { width: i } } });
        }
      },
    };
  });

  const blue = [0, 0, 255];
  const green = [0, 255, 0];
  await expect.poll(() => linePixels(page)).toEqual([blue, blue]);
  await graph.evaluate((each) => each.updateSettings({ renderer: "webgl" }));
  await expect.poll(() => linePixels(page)).toEqual([[255, 0, 0], green]);

  // A static effect's uniform changes without changing the graph, its camera, or the style row.
  await page.evaluate(() => (window as unknown as TEffectTestWindow).sceneEffectTest.setFirstTint([1, 1, 0]));
  await expect.poll(() => linePixels(page)).toEqual([[255, 255, 0], green]);
  await page.evaluate(() => (window as unknown as TEffectTestWindow).sceneEffectTest.toggleFirst(false));
  await expect.poll(() => linePixels(page)).toEqual([blue, green]);
  await page.evaluate(() => (window as unknown as TEffectTestWindow).sceneEffectTest.toggleFirst(true));
  await expect.poll(() => linePixels(page)).toEqual([[255, 255, 0], green]);
  await graph.evaluate((each) => each.api.selectConnections(["line-0"], true));
  await expect.poll(() => linePixels(page)).toEqual([[255, 0, 255], green]);
});

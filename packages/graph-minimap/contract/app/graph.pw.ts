import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph-playwright";

test("installed minimap shares the core layer and moves the consumer camera", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const graph = new GraphPO(page.locator("#graph-shell"));
  await graph.waitForReady();
  const root = page.locator("#graph");
  await expect(root).toHaveAttribute("data-minimap-ready", "true");
  const minimap = root.locator("canvas.graph-minimap");
  await expect(minimap).toBeVisible();
  await expect(minimap).toHaveCSS("width", "180px");
  await expect(minimap).toHaveCSS("height", "120px");
  await expect(minimap).toHaveCSS("background-color", "rgb(211, 211, 211)");
  await page.addStyleTag({
    content: ".layer.graph-minimap { background: rgb(40, 50, 60); border: 3px solid rgb(10, 20, 30); }",
  });
  await expect(minimap).toHaveCSS("background-color", "rgb(40, 50, 60)");
  await expect(minimap).toHaveCSS("border-top-width", "3px");
  const camera = graph.camera();
  const before = await camera.getState();
  await graph.evaluate((g) => {
    g.on("press", () => { document.documentElement.dataset.scenePressed = "true"; });
  });
  await minimap.click({ position: { x: 160, y: 100 } });
  await expect.poll(async () => (await camera.getState()).x).not.toBe(before.x);
  await expect.poll(async () => (await camera.getState()).y).not.toBe(before.y);
  expect(await page.locator("html").getAttribute("data-scene-pressed")).toBeNull();
  expect(errors).toEqual([]);
});

for (const active of [false, true]) {
  test(`detaching the minimap cancels its ${active ? "active" : "pending"} drag`, async ({ page }) => {
    await page.goto("/");
    const graph = new GraphPO(page.locator("#graph-shell"));
    await graph.waitForReady();
    const map = page.locator("canvas.graph-minimap");
    const box = await map.boundingBox();
    if (!box) throw new Error("Missing minimap");
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    if (active) await page.mouse.move(box.x + 50, box.y + 40);
    const camera = await graph.camera().getState();
    await graph.evaluate((g) => {
      const layer = g.layers.getLayers().find((item) => item.getCanvas()?.matches(".graph-minimap"));
      if (!layer) throw new Error("Missing minimap layer");
      g.detachLayer(layer);
      g.attachLayer(layer);
    });
    await page.mouse.move(box.x + 110, box.y + 80);
    await page.mouse.up();
    expect(await graph.camera().getState()).toEqual(camera);
    await map.click({ position: { x: 150, y: 90 } });
    expect(await graph.camera().getState()).not.toEqual(camera);
  });
}

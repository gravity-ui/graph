import { expect, test, type Locator } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

// Inspect the rendered overlay, not private layer state. Rulers use gray/white;
// the configured crosshair is red and therefore distinguishable from its labels.
async function readOverlay(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    if (!context) throw new Error("DevTools canvas context is missing.");
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let visible = 0;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0) visible++;
      if (pixels[i] > 200 && pixels[i + 1] < 30 && pixels[i + 2] < 30 && pixels[i + 3] > 0) red++;
    }
    return { visible, red, image: element.toDataURL() };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await new GraphPO(page.locator("#graph-shell")).waitForReady();
  await expect(page.locator("#graph")).toHaveAttribute("data-devtools-ready", "true");
});

test("installed styles and ruler drawing respond to props and camera changes", async ({ page }) => {
  const graph = new GraphPO(page.locator("#graph-shell"));
  const canvas = page.locator("canvas.devtools-layer-canvas");
  const horizontal = page.locator(".devtools-ruler-bg-h");
  const vertical = page.locator(".devtools-ruler-bg-v");
  await expect(horizontal).toHaveCSS("height", "32px");
  await expect(vertical).toHaveCSS("width", "32px");
  await expect(vertical).toHaveCSS("top", "32px");
  await expect.poll(async () => (await readOverlay(canvas)).visible).toBeGreaterThan(100);
  const beforePan = (await readOverlay(canvas)).image;
  await graph.camera().panBy(37, 53);
  await expect.poll(async () => (await readOverlay(canvas)).image).not.toBe(beforePan);
  const beforeZoom = (await readOverlay(canvas)).image;
  await graph.camera().zoomToScale(2);
  await expect.poll(async () => (await readOverlay(canvas)).image).not.toBe(beforeZoom);

  await page.getByRole("button", { name: "Change appearance" }).click();
  await expect(horizontal).toHaveCSS("height", "40px");
  await expect(vertical).toHaveCSS("top", "40px");
  await expect(horizontal).toHaveCSS("background-color", "rgb(20, 30, 40)");
  await expect(horizontal).toHaveCSS("backdrop-filter", "blur(2px)");
  await page.getByRole("button", { name: "Toggle rulers" }).click();
  await expect(horizontal).toBeHidden();
  await expect(vertical).toBeHidden();
  await expect.poll(async () => (await readOverlay(canvas)).visible).toBe(0);
  await page.getByRole("button", { name: "Toggle rulers" }).click();
  await expect(horizontal).toBeVisible();
  await expect.poll(async () => (await readOverlay(canvas)).visible).toBeGreaterThan(100);
});

test("crosshair follows the pointer, hides over rulers and respects visibility", async ({ page }) => {
  const root = page.locator("#graph");
  const canvas = root.locator("canvas.devtools-layer-canvas");
  await root.hover({ position: { x: 300, y: 250 } });
  await expect.poll(async () => (await readOverlay(canvas)).red).toBeGreaterThan(100);
  const firstPosition = (await readOverlay(canvas)).image;
  await root.hover({ position: { x: 450, y: 350 } });
  await expect.poll(async () => (await readOverlay(canvas)).image).not.toBe(firstPosition);
  await expect.poll(async () => (await readOverlay(canvas)).red).toBeGreaterThan(100);
  await root.hover({ position: { x: 10, y: 10 } });
  await expect.poll(async () => (await readOverlay(canvas)).red).toBe(0);
  await root.hover({ position: { x: 300, y: 250 } });
  await expect.poll(async () => (await readOverlay(canvas)).red).toBeGreaterThan(100);
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await readOverlay(canvas)).red).toBe(0);

  await page.getByRole("button", { name: "Toggle crosshair" }).click();
  await root.hover({ position: { x: 300, y: 250 } });
  await new GraphPO(page.locator("#graph-shell")).waitForFrames(2);
  await expect.poll(async () => (await readOverlay(canvas)).red).toBe(0);
  await page.getByRole("button", { name: "Toggle crosshair" }).click();
  await root.hover({ position: { x: 300, y: 250 } });
  await expect.poll(async () => (await readOverlay(canvas)).red).toBeGreaterThan(100);
});

test("detaching and adding DevTools removes its DOM and restores a working layer", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const graph = new GraphPO(page.locator("#graph-shell"));
  const root = page.locator("#graph");
  const canvas = root.locator("canvas.devtools-layer-canvas");
  for (let cycle = 0; cycle < 2; cycle++) {
    await root.hover({ position: { x: 300, y: 250 } });
    await expect.poll(async () => (await readOverlay(canvas)).red).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Detach DevTools" }).click();
    await expect(canvas).toHaveCount(0);
    await expect(root.locator(".devtools-layer-html")).toHaveCount(0);
    await root.hover({ position: { x: 400, y: 300 } });
    await graph.camera().panBy(20, 30);
    await page.getByRole("button", { name: "Add DevTools" }).click();
    await expect(canvas).toHaveCount(1);
    await expect(root.locator(".devtools-ruler-bg")).toHaveCount(2);
  }
  await root.hover({ position: { x: 300, y: 250 } });
  await expect.poll(async () => (await readOverlay(canvas)).red).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

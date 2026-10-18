import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

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
  await minimap.click({ position: { x: 160, y: 100 } });
  await expect.poll(async () => (await camera.getState()).x).not.toBe(before.x);
  await expect.poll(async () => (await camera.getState()).y).not.toBe(before.y);
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";
import type { GraphEventMap } from "@gravity-ui/graph";
import { GraphPO } from "@gravity-ui/graph-playwright";

test("installed React entrypoint renders with public styles", async ({ page }) => {
  await page.goto("/");

  const root = page.locator("#react-root");
  await expect(root).toHaveAttribute("data-state", "ready");
  await expect(root.locator(".graph-wrapper")).toHaveCSS("position", "relative");

  const graph = new GraphPO(page.locator("#react-shell"));
  await graph.waitForReady();

  await expect(page.getByTestId("react-block-react-source")).toHaveText("React source");
  await expect(page.getByTestId("react-portal")).toHaveText("Shared core layer");
});

test("a React press handler vetoes camera pan on the same press delivered to the block and graph", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("#react-root");
  const graph = new GraphPO(page.locator("#react-shell"));
  await graph.waitForReady();
  await expect(root).toHaveAttribute("data-state", "ready");
  await graph.evaluate((g) => {
    const block = g.blocks.getBlockState("react-source")?.getViewComponent();
    if (!block) throw new Error("Expected the mounted block");
    let received: GraphEventMap["press"] | undefined;
    block.on("press", (event) => {
      if (event.target === block && event.currentTarget === block) received = event;
    });
    g.on("press", (event) => {
      const samePress = event === received && event.currentTarget === g && event.event.isTrusted;
      document.documentElement.dataset.pressResult = samePress && event.defaultPrevented ? "vetoed" : "unhandled";
    });
  });

  const camera = await graph.camera().getState();
  const block = graph.block("react-source");
  const center = await block.getCenter();
  await block.dragTo({ x: center.x + 60, y: center.y }, { button: "middle" });

  await expect(page.locator("html")).toHaveAttribute("data-press-result", "vetoed");
  expect(await graph.camera().getState()).toEqual(camera);
  expect(await block.getCenter()).toEqual(center);
});

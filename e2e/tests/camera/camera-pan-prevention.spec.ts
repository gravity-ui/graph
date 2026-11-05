import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

function block(id: string, x: number, y: number) {
  return { id, is: "Block", x, y, width: 200, height: 100, name: id, anchors: [], selected: false };
}

// https://github.com/gravity-ui/graph/issues/405: the camera is created on the first frame after start, so
// listeners and layers added later subscribe to the graph "mousedown" after it. Chromium calls the listeners of
// a plain EventTarget in registration order, even with `capture: true`. Blocks are not draggable by default
// (`canDrag: none`), so pressing one pans the camera unless a listener prevents the press.
test.describe("Preventing the graph mousedown stops the camera pan", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [block("block-1", 0, 0), block("block-2", 400, 0)],
      connections: [],
      settings: { canCreateNewConnections: true },
    });
  });

  test("by a listener added after the graph started", async () => {
    await graphPO.evaluate((graph) => {
      graph.on("mousedown", (event) => event.preventDefault());
    });
    const cameraBefore = await graphPO.camera().getState();
    const from = await graphPO.block("block-1").getCenter();

    await graphPO.drag(from, { x: from.x + 150, y: from.y + 100 });

    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
  });

  test("by NewBlockLayer on Alt + drag of a non-draggable block", async ({ page }) => {
    await graphPO.evaluate((graph) => {
      graph.addLayer(window.GraphModule.NewBlockLayer, {});
    });
    const cameraBefore = await graphPO.camera().getState();
    const from = await graphPO.block("block-1").getCenter();

    await page.keyboard.down("Alt");
    await graphPO.drag(from, { x: from.x + 150, y: from.y + 300 });
    await page.keyboard.up("Alt");

    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
    const copies = await graphPO.evaluate((graph) =>
      graph.rootStore.blocksList.$blocks.value
        .map((state) => state.asTBlock())
        .filter(({ id }) => id !== "block-1" && id !== "block-2")
    );
    expect(copies).toHaveLength(1);
    // The copy lands at the drop offset rather than on top of its source.
    expect(copies[0].y).toBeGreaterThan(200);
  });

  test("by ConnectionLayer on Shift + drag from a non-draggable block", async ({ page }) => {
    await graphPO.evaluate((graph) => {
      graph.addLayer(window.GraphModule.ConnectionLayer, {});
    });
    const cameraBefore = await graphPO.camera().getState();
    const from = await graphPO.block("block-1").getCenter();
    const to = await graphPO.block("block-2").getCenter();

    await page.keyboard.down("Shift");
    await graphPO.drag(from, to);
    await page.keyboard.up("Shift");

    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
  });
});

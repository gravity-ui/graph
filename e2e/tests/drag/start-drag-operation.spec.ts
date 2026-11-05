import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

function block(id: string, x: number, y: number) {
  return { id, is: "Block", x, y, width: 200, height: 100, name: id, anchors: [], selected: false };
}

type TEnterDetail = { target?: { props?: { id?: string } } };

test.describe("DragService.startDrag", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [block("block-1", 0, 0), block("block-2", 400, 0)],
      connections: [],
      settings: { canCreateNewConnections: true },
    });
  });

  async function toViewport(point: { x: number; y: number }): Promise<{ x: number; y: number }> {
    const bounds = await graphPO.page.locator("#root").boundingBox();
    if (!bounds) {
      throw new Error("Graph root is not visible");
    }
    const [x, y] = await graphPO.evaluate(
      (graph, worldPoint) => graph.cameraService.getAbsoluteXY(worldPoint.x, worldPoint.y),
      point
    );
    return { x: bounds.x + x, y: bounds.y + y };
  }

  test("keeps the component passed in options as the event target until the drag ends", async () => {
    await graphPO.evaluate((graph) => {
      graph.on("mousedown", (event) => {
        const component = graph.blocks.getBlockState("block-1")?.getViewComponent();
        const target: unknown = event.detail.target;
        if (component && target === component) {
          event.preventDefault();
          graph.dragService.startDrag({}, { component, autopanning: false });
        }
      });
    });
    const entered = await graphPO.events.listen<TEnterDetail>("mouseenter");
    const readEnteredIds = () => entered.analyze((events) => events.map((event) => event.detail?.target?.props?.id));
    const from = await graphPO.block("block-1").getCenter();
    const to = await graphPO.block("block-2").getCenter();

    await graphPO.drag(from, to);

    expect(await readEnteredIds()).not.toContain("block-2");

    // The capture is released with the mouseup, so the hover follows the cursor again
    await graphPO.hoverAt({ x: to.x + 30, y: to.y + 20 });

    expect(await readEnteredIds()).toContain("block-2");
  });

  test("is cancelled by graph.dragService.cancel(): a ConnectionLayer drag creates no connection", async ({ page }) => {
    await graphPO.evaluate((graph) => {
      graph.addLayer(window.GraphModule.ConnectionLayer, {});
      graph.keyboardService.onPress("Escape", () => graph.dragService.cancel());
    });
    const cancelled = await graphPO.events.listen("connection-create-cancel");
    const dropped = await graphPO.events.listen("connection-create-drop");
    const from = await toViewport(await graphPO.block("block-1").getCenter());
    const to = await toViewport(await graphPO.block("block-2").getCenter());

    await page.keyboard.down("Shift");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
    await graphPO.waitForFrames(1);
    await page.keyboard.press("Escape");
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await graphPO.waitForFrames(2);

    expect(await cancelled.analyze((events) => events.length)).toBe(1);
    expect(await dropped.analyze((events) => events.length)).toBe(0);
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(false);
    expect(await graphPO.evaluate((graph) => graph.getCursorLayer().isAuto())).toBe(true);
  });
});

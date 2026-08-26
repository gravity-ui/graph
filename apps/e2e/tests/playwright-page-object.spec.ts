import { expect, test } from "@playwright/test";
import { GraphPO } from "@gravity-ui/graph/playwright";

import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Public Playwright page objects", () => {
  let graph: GraphPO;

  test.beforeEach(async ({ page }) => {
    const harness = new GraphPageObject(page);
    await harness.initialize({
      blocks: [
        {
          id: "block-1",
          is: "Block",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          name: "Block 1",
          anchors: [],
        },
        {
          id: "block-2",
          is: "Block",
          x: 400,
          y: 200,
          width: 200,
          height: 100,
          name: "Block 2",
          anchors: [],
        },
      ],
      connections: [
        {
          id: "connection-1",
          sourceBlockId: "block-1",
          targetBlockId: "block-2",
        },
      ],
      settings: {
        canDrag: "all",
      },
    });

    // The public PO intentionally receives an application-owned wrapper,
    // rather than relying on the graph's internal CSS classes.
    graph = new GraphPO(page.locator("body"));
    await graph.waitForReady();
  });

  test("finds and interacts with blocks through an ancestor locator", async () => {
    const block = graph.block("block-1");

    expect(await block.exists()).toBe(true);
    expect(await block.getState()).toMatchObject({ id: "block-1", name: "Block 1" });

    await block.click();

    expect(await block.isSelected()).toBe(true);
    expect(await graph.getSelectedBlockIds()).toEqual(["block-1"]);
  });

  test("exposes connection and camera page objects", async () => {
    const connection = graph.connection("connection-1");
    expect(await connection.exists()).toBe(true);
    expect(await connection.getState()).toMatchObject({
      sourceBlockId: "block-1",
      targetBlockId: "block-2",
    });

    await graph.camera().zoomToScale(0.75);
    expect((await graph.camera().getState()).scale).toBeCloseTo(0.75);
  });

  test("drags a block center to the requested world coordinate", async () => {
    const block = graph.block("block-1");

    await block.dragTo({ x: 500, y: 350 }, { steps: 1 });

    expect(await block.getCenter()).toEqual({ x: 500, y: 350 });
  });
});

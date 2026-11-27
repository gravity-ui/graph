import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

test.describe("Block Hover", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    // Initialize graph with test blocks
    await graphPO.initialize({
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
      connections: [],
    });
  });

  test("should change cursor from auto to pointer when hovering over block and back to auto", async ({ page }) => {
    // Get block COM
    const block1 = graphPO.block("block-1");

    // Step 1: Check initial cursor state (should be auto)
    const initialCursor = await graphPO.getCursor();

    expect(initialCursor).toBe("auto");

    // Step 2: Hover over the block
    await block1.hover();

    // Wait for cursor layer to process the hover event
    await graphPO.waitForFrames(5);

    // Check cursor is now pointer
    const hoverCursor = await graphPO.getCursor();

    expect(hoverCursor).toBe("pointer");

    // Step 3: Move mouse away from block to empty space
    await graphPO.hoverAt({ x: 10, y: 10 }); // Hover at empty area far from blocks

    // Wait for cursor layer to process the movement
    await graphPO.waitForFrames(5);

    // Check cursor is back to auto
    const afterCursor = await graphPO.getCursor();

    expect(afterCursor).toBe("auto");
  });

  test("keeps the source hovered when the mouse crosses the drag threshold outside the graph", async ({ page }) => {
    await page.addStyleTag({ content: "#root { margin-left: 100px; width: 400px; }" });
    await graphPO.waitForFrames(2);
    const callbacks = await page.evaluateHandle(() => {
      const graph = window.graph;
      // Put the left edge of block-1 at the left edge of the graph.
      graph.cameraService.set({ x: -100, y: 0, scale: 1 });
      const block = graph.blocks.getBlockState("block-1")?.getViewComponent();
      if (!block) throw new Error("Missing source block");
      const overSource = () => graph.input.$hoveredComponent.peek() === block;
      const observed: { start?: boolean; firstMove?: boolean } = {};
      block.on("dragstart", ({ claim }) =>
        claim({
          owner: "test",
          autopanning: false,
          start: () => {
            observed.start = overSource();
          },
          move: () => {
            observed.firstMove ??= overSource();
          },
        })
      );
      return observed;
    });

    const left = await page.locator("#root").evaluate((root) => root.getBoundingClientRect().left);
    await page.mouse.move(left + 4, 150);
    await page.mouse.down();
    await page.mouse.move(left - 11, 150);
    await page.mouse.up();

    expect(await callbacks.jsonValue()).toEqual({ start: true, firstMove: true });
    expect(await graphPO.evaluate((graph) => graph.input.$hoveredComponent.peek() === undefined)).toBe(true);
    await callbacks.dispose();
  });
});

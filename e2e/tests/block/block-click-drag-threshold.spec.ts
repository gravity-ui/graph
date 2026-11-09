import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCK = {
  id: "block-1",
  is: "Block" as const,
  x: 200,
  y: 200,
  width: 200,
  height: 100,
  name: "Block 1",
  anchors: [],
  selected: false,
};

// The default dragThreshold is 5 px. A click used to need less than 3 px of movement, and the threshold
// was measured from the first mousemove, so a press that moved between them was neither a click nor a drag.
test.describe("A press on a block is either a click or a drag", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [BLOCK],
      connections: [],
      settings: { canDrag: "all" },
    });
  });

  /** Viewport coordinates of a world point */
  async function toViewport(point: { x: number; y: number }): Promise<{ x: number; y: number }> {
    return graphPO.evaluate((graph, { x, y }) => {
      const [screenX, screenY] = graph.cameraService.getAbsoluteXY(x, y);
      const rect = graph.getGraphCanvas().getBoundingClientRect();
      return { x: screenX + rect.left, y: screenY + rect.top };
    }, point);
  }

  /** Presses at the world point and releases it after a single mousemove by the given screen offset */
  async function pressAndMove(point: { x: number; y: number }, dx: number, dy: number): Promise<void> {
    const { x, y } = await toViewport(point);
    const { mouse } = graphPO.page;
    await mouse.move(x, y);
    await mouse.down();
    await mouse.move(x + dx, y + dy);
    await mouse.up();
    await graphPO.waitForFrames(2);
  }

  test("a press that jitters less than the threshold selects the block and does not move it", async () => {
    const block = graphPO.block(BLOCK.id);

    await pressAndMove(await block.getCenter(), 4, 0);

    expect(await block.isSelected()).toBe(true);
    expect(await block.getGeometry()).toMatchObject({ x: BLOCK.x, y: BLOCK.y });
  });

  test("a press that moves by the threshold at once drags the block and does not select it", async () => {
    const block = graphPO.block(BLOCK.id);

    await pressAndMove(await block.getCenter(), 5, 0);

    const geometry = await block.getGeometry();
    expect(geometry.x).toBeGreaterThan(BLOCK.x);
    expect(geometry.y).toBe(BLOCK.y);
    expect(await block.isSelected()).toBe(false);
  });

  test("a press on the empty canvas that jitters less than the threshold clears the selection", async () => {
    const block = graphPO.block(BLOCK.id);
    await block.click();
    expect(await block.isSelected()).toBe(true);
    const cameraBefore = await graphPO.camera().getState();

    await pressAndMove({ x: BLOCK.x - 100, y: BLOCK.y - 100 }, 3, 3);

    expect(await block.isSelected()).toBe(false);
    expect(await graphPO.camera().getState()).toMatchObject({ x: cameraBefore.x, y: cameraBefore.y });
  });
});

import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

/**
 * Layout:
 *
 *   [block-1  200x100]   [block-2  200x100]
 *   x=100,y=100           x=400,y=100
 *
 * Connection: block-1 → block-2
 *
 * Tests verify that setHiddenBlock (backed by GraphComponent.setVisibility)
 * correctly toggles canvas rendering and hitbox presence.
 */

const BLOCKS = [
  {
    id: "block-1",
    is: "Block",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
  },
  {
    id: "block-2",
    is: "Block",
    x: 400,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 2",
    anchors: [],
    selected: false,
  },
];

const CONNECTIONS = [{ id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-2" }];

test.describe("Block visibility (setHiddenBlock → setVisibility)", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({ blocks: BLOCKS, connections: CONNECTIONS });
  });

  // ---------------------------------------------------------------------------
  // Default state
  // ---------------------------------------------------------------------------

  test("block is rendered by default", async () => {
    const isRendered = await graphPO.evaluateInGraph((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false;
    });

    expect(isRendered).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Hiding
  // ---------------------------------------------------------------------------

  test("setHiddenBlock(true) stops canvas rendering", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(3);

    const isRendered = await graphPO.evaluateInGraph((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? true;
    });

    expect(isRendered).toBe(false);
  });

  test("setHiddenBlock(true) removes hitbox — clicking block area does not select it", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(3);

    // Click the center of block-1 — hitbox is gone, so it should not get selected
    await graphPO.click(200, 150);

    const selected = await graphPO.getSelectedBlocks();
    expect(selected).not.toContain("block-1");
  });

  test("block store data (geometry) is preserved while hidden", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(2);

    const geometry = await graphPO.getBlockCOM("block-1").getGeometry();

    expect(geometry.x).toBe(100);
    expect(geometry.y).toBe(100);
    expect(geometry.width).toBe(200);
    expect(geometry.height).toBe(100);
  });

  test("connection data is preserved while source block is hidden", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(2);

    const exists = await graphPO.hasConnectionBetween("block-1", "block-2");
    expect(exists).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Restoring
  // ---------------------------------------------------------------------------

  test("setHiddenBlock(false) restores canvas rendering", async () => {
    await graphPO.evaluateInGraph((graph) => {
      const view = graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent();
      view?.setHiddenBlock(true);
      view?.setHiddenBlock(false);
    });
    await graphPO.waitForFrames(3);

    const isRendered = await graphPO.evaluateInGraph((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false;
    });

    expect(isRendered).toBe(true);
  });

  test("setHiddenBlock(false) restores hitbox — block can be selected again", async () => {
    await graphPO.evaluateInGraph((graph) => {
      const view = graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent();
      view?.setHiddenBlock(true);
      view?.setHiddenBlock(false);
    });
    await graphPO.waitForFrames(3);

    await graphPO.getBlockCOM("block-1").click();

    const isSelected = await graphPO.getBlockCOM("block-1").isSelected();
    expect(isSelected).toBe(true);
  });

  test("setHiddenBlock(false) restores port positions", async () => {
    const portBefore = await graphPO.evaluateInGraph((graph) => {
      const port = graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.getOutputPort();
      return port ? { x: port.x, y: port.y } : null;
    });

    await graphPO.evaluateInGraph((graph) => {
      const view = graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent();
      view?.setHiddenBlock(true);
      view?.setHiddenBlock(false);
    });
    await graphPO.waitForFrames(3);

    const portAfter = await graphPO.evaluateInGraph((graph) => {
      const port = graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.getOutputPort();
      return port ? { x: port.x, y: port.y } : null;
    });

    expect(portAfter).not.toBeNull();
    expect(portAfter?.x).toBe(portBefore?.x);
    expect(portAfter?.y).toBe(portBefore?.y);
  });

  // ---------------------------------------------------------------------------
  // Move while hidden
  // ---------------------------------------------------------------------------

  test("block moved while hidden registers hitbox at new position after setHiddenBlock(false)", async () => {
    const block1COM = graphPO.getBlockCOM("block-1");
    const originalCenter = await block1COM.getWorldCenter(); // (200, 150)

    // Hide block-1
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(3);

    // Clicking original position must not select the hidden block
    await graphPO.click(originalCenter.x, originalCenter.y);
    expect(await block1COM.isSelected()).toBe(false);

    // Move block-1 to a new position while hidden (no force — hitbox stays removed)
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.updateXY(700, 300);
    });
    await graphPO.waitForFrames(3);

    // Clicking the NEW position must STILL not select the block — it is still hidden
    const newCenter = await block1COM.getWorldCenter(); // (800, 350)
    await graphPO.click(newCenter.x, newCenter.y);
    expect(await block1COM.isSelected()).toBe(false);

    // Restore visibility — hitbox must be registered at the NEW position
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(false);
    });
    await graphPO.waitForFrames(3);

    // Store geometry reflects the new position
    const geometry = await block1COM.getGeometry();
    expect(geometry.x).toBe(700);
    expect(geometry.y).toBe(300);

    // Clicking at the new center selects the block
    await graphPO.click(newCenter.x, newCenter.y);
    expect(await block1COM.isSelected()).toBe(true);

    // Clicking at the old position must NOT select the block (hitbox moved away)
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.setSelection(false);
    });
    await graphPO.waitForFrames(2);

    await graphPO.click(originalCenter.x, originalCenter.y);
    expect(await block1COM.isSelected()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Other block is unaffected
  // ---------------------------------------------------------------------------

  test("hiding one block does not affect the other block", async () => {
    await graphPO.evaluateInGraph((graph) => {
      graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.setHiddenBlock(true);
    });
    await graphPO.waitForFrames(3);

    const b2Rendered = await graphPO.evaluateInGraph((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-2")?.getViewComponent()?.isRendered() ?? false;
    });
    expect(b2Rendered).toBe(true);

    await graphPO.getBlockCOM("block-2").click();
    expect(await graphPO.getBlockCOM("block-2").isSelected()).toBe(true);
  });
});

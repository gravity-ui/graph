import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

const INITIAL_BLOCKS = [
  {
    id: "block-1",
    is: "Block" as const,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [],
    selected: false,
  },
  {
    id: "block-2",
    is: "Block" as const,
    x: 600,
    y: 600,
    width: 200,
    height: 100,
    name: "Block 2",
    anchors: [],
    selected: false,
  },
];

/**
 * A block placed far outside the initial bounding box.
 * Adding it causes the usable rect (and therefore minimap scale) to change,
 * which in turn changes the world coordinate that any given minimap pixel
 * corresponds to.
 */
const FAR_BLOCK = {
  id: "block-far",
  is: "Block" as const,
  x: 5000,
  y: 5000,
  width: 200,
  height: 100,
  name: "Far Block",
  anchors: [],
  selected: false,
};

test.describe("MiniMap – graph changes reflection", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);

    await graphPO.initialize({ blocks: INITIAL_BLOCKS, connections: [] });
    await minimapPO.addLayer({ location: "topLeft" });
  });

  test("adding a block far away should update minimap coordinate mapping", async () => {
    const camera = graphPO.getCamera();

    // Click at minimap center with initial blocks; record resulting camera position
    await minimapPO.clickAt(0.5, 0.5);
    const stateWithInitialBlocks = await camera.getState();

    // Add a block far outside the current bounding box –
    // this expands the usable rect and forces the minimap to rescale
    await graphPO.setEntities({
      blocks: [...INITIAL_BLOCKS, FAR_BLOCK],
      connections: [],
    });
    await graphPO.waitForFrames(5);

    // Click at the same relative position on the now-rescaled minimap
    await minimapPO.clickAt(0.5, 0.5);
    const stateAfterFarBlock = await camera.getState();

    // The minimap center now corresponds to a different world position because
    // the coordinate mapping changed — camera must have moved to a different place
    expect(Math.abs(stateAfterFarBlock.x - stateWithInitialBlocks.x)).toBeGreaterThan(10);
    expect(Math.abs(stateAfterFarBlock.y - stateWithInitialBlocks.y)).toBeGreaterThan(10);
  });

  test("removing all blocks should not crash minimap and interaction should still work", async () => {
    const camera = graphPO.getCamera();

    // Remove all blocks
    await graphPO.setEntities({ blocks: [], connections: [] });
    await graphPO.waitForFrames(5);

    // Minimap element must still be in the DOM
    expect(await minimapPO.exists()).toBe(true);

    // Clicking minimap should not throw and should change camera position
    const stateBefore = await camera.getState();
    await minimapPO.clickAt(0.5, 0.5);
    const stateAfter = await camera.getState();

    // Camera may or may not move (empty graph), but no error should occur
    // We just verify the page didn't crash (test would fail with an exception otherwise)
    expect(typeof stateAfter.x).toBe("number");
    expect(typeof stateAfter.y).toBe("number");
    // With no blocks the usable rect has a default extent so camera should move
    expect(stateAfter.x).not.toBeNaN();
    expect(stateAfter.y).not.toBeNaN();
    // Confirm state changed (minimap still routes clicks to camera.move)
    const moved = stateAfter.x !== stateBefore.x || stateAfter.y !== stateBefore.y;
    expect(moved).toBe(true);
  });

  test("camera pan should not break minimap click interaction", async () => {
    const camera = graphPO.getCamera();

    // Pan the camera significantly
    await camera.emulatePan(200, 150);

    // After pan the minimap's camera-frame border moved, but the coordinate
    // mapping (scale / relativeX / relativeY) is unchanged.
    // Clicking the minimap must still move the camera.
    const stateBefore = await camera.getState();
    await minimapPO.clickAt(0.2, 0.2);
    const stateAfter = await camera.getState();

    expect(stateAfter.x).not.toBe(stateBefore.x);
    expect(stateAfter.y).not.toBe(stateBefore.y);
  });

  test("camera zoom should not break minimap click interaction", async () => {
    const camera = graphPO.getCamera();

    // Zoom in
    await camera.emulateZoom(-300);

    const stateBefore = await camera.getState();
    await minimapPO.clickAt(0.8, 0.8);
    const stateAfter = await camera.getState();

    expect(stateAfter.x).not.toBe(stateBefore.x);
    expect(stateAfter.y).not.toBe(stateBefore.y);
  });

  test("moving a block should update minimap coordinate mapping", async () => {
    const camera = graphPO.getCamera();

    // Baseline: click center of minimap
    await minimapPO.clickAt(0.5, 0.5);
    const stateBaseline = await camera.getState();

    // Move block-2 far away, forcing usable rect to expand
    await graphPO.setEntities({
      blocks: [
        INITIAL_BLOCKS[0],
        { ...INITIAL_BLOCKS[1], x: 4000, y: 4000 },
      ],
      connections: [],
    });
    await graphPO.waitForFrames(5);

    // Click minimap center again – scale changed, so camera ends up elsewhere
    await minimapPO.clickAt(0.5, 0.5);
    const stateAfterMove = await camera.getState();

    expect(Math.abs(stateAfterMove.x - stateBaseline.x)).toBeGreaterThan(10);
    expect(Math.abs(stateAfterMove.y - stateBaseline.y)).toBeGreaterThan(10);
  });
});

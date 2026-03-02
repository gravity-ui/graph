import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

/**
 * Two blocks spread far apart so the minimap has a meaningful coordinate
 * system and clicking different corners produces noticeably different camera
 * positions.
 */
const BLOCKS = [
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

test.describe("MiniMap – mouse interactions", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);

    await graphPO.initialize({ blocks: BLOCKS, connections: [] });
    await minimapPO.addLayer({ location: "topLeft" });
  });

  test("should render minimap canvas in the DOM after adding layer", async () => {
    expect(await minimapPO.exists()).toBe(true);
  });

  test("clicking on minimap should move camera to corresponding world area", async () => {
    const camera = graphPO.getCamera();
    const stateBefore = await camera.getState();

    // Click on the bottom-right area of the minimap (far from current camera center)
    await minimapPO.clickAt(0.85, 0.85);

    const stateAfter = await camera.getState();

    // Camera position must have changed
    expect(stateAfter.x).not.toBe(stateBefore.x);
    expect(stateAfter.y).not.toBe(stateBefore.y);
  });

  test("clicking at different minimap positions should move camera to different world positions", async () => {
    const camera = graphPO.getCamera();

    // Click top-left of minimap → camera centers near the top-left world area
    await minimapPO.clickAt(0.1, 0.1);
    const stateTopLeft = await camera.getState();

    // Click bottom-right of minimap → camera centers near the bottom-right world area
    await minimapPO.clickAt(0.9, 0.9);
    const stateBottomRight = await camera.getState();

    // Camera positions must differ between the two clicks
    expect(Math.abs(stateBottomRight.x - stateTopLeft.x)).toBeGreaterThan(10);
    expect(Math.abs(stateBottomRight.y - stateTopLeft.y)).toBeGreaterThan(10);
  });

  test("clicking on minimap should not move camera when clicking same position twice", async () => {
    const camera = graphPO.getCamera();

    // First click establishes a camera position
    await minimapPO.clickAt(0.5, 0.5);
    const stateAfterFirst = await camera.getState();

    // Second click at the same position – camera should end up at the same place
    await minimapPO.clickAt(0.5, 0.5);
    const stateAfterSecond = await camera.getState();

    expect(Math.abs(stateAfterSecond.x - stateAfterFirst.x)).toBeLessThan(5);
    expect(Math.abs(stateAfterSecond.y - stateAfterFirst.y)).toBeLessThan(5);
  });

  test("dragging on minimap should move camera continuously", async () => {
    const camera = graphPO.getCamera();
    const stateBefore = await camera.getState();

    // Drag from center toward top-left within the minimap
    await minimapPO.dragFrom(0.5, 0.5, 0.1, 0.1);

    const stateAfter = await camera.getState();

    // Camera must have moved during the drag
    expect(stateAfter.x).not.toBe(stateBefore.x);
    expect(stateAfter.y).not.toBe(stateBefore.y);
  });

  test("drag in opposite directions should produce different camera positions", async () => {
    const camera = graphPO.getCamera();

    // Drag toward top-left
    await minimapPO.dragFrom(0.5, 0.5, 0.1, 0.1);
    const stateTopLeft = await camera.getState();

    // Drag back toward bottom-right from same starting point
    await minimapPO.dragFrom(0.5, 0.5, 0.9, 0.9);
    const stateBottomRight = await camera.getState();

    // The resulting camera positions must differ
    expect(Math.abs(stateBottomRight.x - stateTopLeft.x)).toBeGreaterThan(10);
    expect(Math.abs(stateBottomRight.y - stateTopLeft.y)).toBeGreaterThan(10);
  });
});

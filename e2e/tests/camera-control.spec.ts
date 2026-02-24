import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Camera Control", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

    // Initialize graph with test blocks and camera settings
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
          selected: false,
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
          selected: false,
        },
      ],
      connections: [],
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
      },
    });
  });

  test("should zoom in with mouse wheel and update camera scale", async () => {
    // Get camera COM
    const camera = graphPO.getCamera();

    // First zoom out to make room for zoom in
    await camera.emulateZoom(300); // Zoom out

    const initialCamera = await camera.getState();
    const initialScale = initialCamera.scale;

    // Now zoom in
    await camera.emulateZoom(-100); // Zoom in

    const newCamera = await camera.getState();

    // Scale should have increased
    expect(newCamera.scale).toBeGreaterThan(initialScale);
  });

  test("should zoom out with mouse wheel and update camera scale", async () => {
    // Get camera COM
    const camera = graphPO.getCamera();

    // First zoom in to make room for zoom out
    await camera.emulateZoom(-300); // Zoom in

    const initialCamera = await camera.getState();
    const initialScale = initialCamera.scale;

    // Now zoom out
    await camera.emulateZoom(100); // Zoom out

    const newCamera = await camera.getState();

    // Scale should have decreased
    expect(newCamera.scale).toBeLessThan(initialScale);
  });

  test("should pan camera with mouse drag", async () => {
    // Get camera COM
    const camera = graphPO.getCamera();

    const initialCamera = await camera.getState();

    // Pan camera by dragging
    await camera.emulatePan(100, 50);

    const newCamera = await camera.getState();

    // Camera position should have changed
    expect(newCamera.x).not.toBe(initialCamera.x);
    expect(newCamera.y).not.toBe(initialCamera.y);
  });

  test("should maintain world coordinates after zoom", async () => {
    // Get block and camera COMs
    const block1 = graphPO.getBlockCOM("block-1");
    const camera = graphPO.getCamera();

    const initialGeometry = await block1.getGeometry();

    // Zoom in multiple times using helper
    for (let i = 0; i < 3; i++) {
      await camera.emulateZoom(-100);
    }

    // Zoom out back
    for (let i = 0; i < 3; i++) {
      await camera.emulateZoom(100);
    }

    const finalGeometry = await block1.getGeometry();

    // World coordinates should remain the same
    expect(finalGeometry.x).toBe(initialGeometry.x);
    expect(finalGeometry.y).toBe(initialGeometry.y);
    expect(finalGeometry.width).toBe(initialGeometry.width);
    expect(finalGeometry.height).toBe(initialGeometry.height);
  });

  test("should transform screen coordinates correctly after zoom", async () => {
    // Get block and camera COMs
    const block1 = graphPO.getBlockCOM("block-1");
    const camera = graphPO.getCamera();

    // First zoom out to have room for zoom in
    await camera.emulateZoom(300);

    const initialCamera = await camera.getState();
    const blockGeometry = await block1.getGeometry();

    // Zoom in
    await camera.emulateZoom(-100);

    const newCamera = await camera.getState();
    const sameBlockGeometry = await block1.getGeometry();

    // World coordinates should be unchanged
    expect(sameBlockGeometry.x).toBe(blockGeometry.x);
    expect(sameBlockGeometry.y).toBe(blockGeometry.y);

    // Scale should have changed
    expect(newCamera.scale).toBeGreaterThan(initialCamera.scale);
  });

  test("should pan camera and maintain block world positions", async () => {
    // Get block and camera COMs
    const block1 = graphPO.getBlockCOM("block-1");
    const camera = graphPO.getCamera();

    const initialGeometry = await block1.getGeometry();
    const initialCamera = await camera.getState();

    // Pan by dragging using helper
    await camera.emulatePan(150, 100);

    const newCamera = await camera.getState();
    const finalGeometry = await block1.getGeometry();

    // Camera position should have changed
    expect(newCamera.x).not.toBe(initialCamera.x);
    expect(newCamera.y).not.toBe(initialCamera.y);

    // But block world position should remain the same
    expect(finalGeometry.x).toBe(initialGeometry.x);
    expect(finalGeometry.y).toBe(initialGeometry.y);
  });
});

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
    // First zoom out to make room for zoom in
    await graphPO.camera.emulateZoom(300); // Zoom out

    const initialCamera = await graphPO.camera.getState();
    const initialScale = initialCamera.scale;

    // Now zoom in
    await graphPO.camera.emulateZoom(-100); // Zoom in

    const newCamera = await graphPO.camera.getState();
    
    // Scale should have increased
    expect(newCamera.scale).toBeGreaterThan(initialScale);
  });

  test("should zoom out with mouse wheel and update camera scale", async () => {
    // First zoom in to make room for zoom out
    await graphPO.camera.emulateZoom(-300); // Zoom in

    const initialCamera = await graphPO.camera.getState();
    const initialScale = initialCamera.scale;

    // Now zoom out
    await graphPO.camera.emulateZoom(100); // Zoom out

    const newCamera = await graphPO.camera.getState();
    
    // Scale should have decreased
    expect(newCamera.scale).toBeLessThan(initialScale);
  });

  test("should pan camera with mouse drag", async () => {
    const initialCamera = await graphPO.camera.getState();

    // Pan camera by dragging
    await graphPO.camera.emulatePan(100, 50);

    const newCamera = await graphPO.camera.getState();

    // Camera position should have changed
    expect(newCamera.x).not.toBe(initialCamera.x);
    expect(newCamera.y).not.toBe(initialCamera.y);
  });

  test("should maintain world coordinates after zoom", async () => {
    const initialGeometry = await graphPO.blocks.getGeometry("block-1");

    // Zoom in multiple times using helper
    for (let i = 0; i < 3; i++) {
      await graphPO.camera.emulateZoom(-100);
    }

    // Zoom out back
    for (let i = 0; i < 3; i++) {
      await graphPO.camera.emulateZoom(100);
    }

    const finalGeometry = await graphPO.blocks.getGeometry("block-1");

    // World coordinates should remain the same
    expect(finalGeometry.x).toBe(initialGeometry.x);
    expect(finalGeometry.y).toBe(initialGeometry.y);
    expect(finalGeometry.width).toBe(initialGeometry.width);
    expect(finalGeometry.height).toBe(initialGeometry.height);
  });

  test("should transform screen coordinates correctly after zoom", async () => {
    // First zoom out to have room for zoom in
    await graphPO.camera.emulateZoom(300);

    const initialCamera = await graphPO.camera.getState();
    const blockGeometry = await graphPO.blocks.getGeometry("block-1");

    // Zoom in
    await graphPO.camera.emulateZoom(-100);

    const newCamera = await graphPO.camera.getState();
    const sameBlockGeometry = await graphPO.blocks.getGeometry("block-1");

    // World coordinates should be unchanged
    expect(sameBlockGeometry.x).toBe(blockGeometry.x);
    expect(sameBlockGeometry.y).toBe(blockGeometry.y);

    // Scale should have changed
    expect(newCamera.scale).toBeGreaterThan(initialCamera.scale);
  });

  test("should pan camera and maintain block world positions", async () => {
    const initialGeometry = await graphPO.blocks.getGeometry("block-1");
    const initialCamera = await graphPO.camera.getState();

    // Pan by dragging using helper
    await graphPO.camera.emulatePan(150, 100);

    const newCamera = await graphPO.camera.getState();
    const finalGeometry = await graphPO.blocks.getGeometry("block-1");

    // Camera position should have changed
    expect(newCamera.x).not.toBe(initialCamera.x);
    expect(newCamera.y).not.toBe(initialCamera.y);

    // But block world position should remain the same
    expect(finalGeometry.x).toBe(initialGeometry.x);
    expect(finalGeometry.y).toBe(initialGeometry.y);
  });
});

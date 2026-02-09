import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Debug Modifier Keys", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);

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
    });

    // Add event listeners to log all click events
    await page.evaluate(() => {
      // Override applyEventToTargetComponent to log events
      const graphLayer = window.graph.getGraphLayer();
      const originalApply = graphLayer.applyEventToTargetComponent.bind(graphLayer);
      graphLayer.applyEventToTargetComponent = function(event: MouseEvent, target: any) {
        console.log("applyEventToTargetComponent:", {
          eventType: event.type,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          target: target?.constructor?.name,
        });
        return originalApply(event, target);
      };

      // Log canvas clicks with capture to see original event
      const canvas = window.graph.getGraphCanvas();
      canvas.addEventListener("click", (e: MouseEvent) => {
        console.log("Canvas click (original):", {
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
        });
      }, { capture: true });
    });
  });

  test("should log modifier keys on click", async ({ page }) => {
    // Listen to console logs
    page.on("console", (msg) => {
      console.log("Browser console:", msg.text());
    });

    // Click with Meta key
    await graphPO.blocks.click("block-1", { ctrl: true });

    // Wait for event processing
    await graphPO.waitForFrames(2);

    // Check selection
    const selectedBlocks = await graphPO.blocks.getSelected();
    console.log("Selected blocks:", selectedBlocks);
  });

  test("should test drag coordinates after zoomToBlocks", async ({ page }) => {
    // Zoom to blocks to ensure they're visible
    await graphPO.camera.zoomToBlocks(["block-1", "block-2"]);
    await graphPO.waitForFrames(3);

    // Get camera state after zoom
    const cameraStateAfterZoom = await graphPO.camera.getState();
    console.log("Camera state after zoom:", cameraStateAfterZoom);

    // Get initial geometry
    const initialGeometry = await graphPO.blocks.getGeometry("block-1");
    console.log("Initial geometry:", initialGeometry);

    // Calculate screen position of block center after zoom
    const fromScreen = {
      x: (initialGeometry.x + initialGeometry.width / 2 - cameraStateAfterZoom.x) * cameraStateAfterZoom.scale,
      y: (initialGeometry.y + initialGeometry.height / 2 - cameraStateAfterZoom.y) * cameraStateAfterZoom.scale,
    };
    console.log("From screen (after zoom):", fromScreen);

    // Select block first
    await graphPO.blocks.click("block-1");
    await graphPO.waitForFrames(2);

    // Target position in world coordinates
    const targetWorld = { x: 500, y: 300 };
    console.log("Target world:", targetWorld);

    // Calculate screen position of target
    const toScreen = {
      x: (targetWorld.x - cameraStateAfterZoom.x) * cameraStateAfterZoom.scale,
      y: (targetWorld.y - cameraStateAfterZoom.y) * cameraStateAfterZoom.scale,
    };
    console.log("To screen:", toScreen);

    // Perform drag
    await graphPO.blocks.dragTo("block-1", targetWorld);

    // Check final position
    const finalGeometry = await graphPO.blocks.getGeometry("block-1");
    console.log("Final geometry:", finalGeometry);
    console.log("Difference X:", Math.abs(finalGeometry.x - targetWorld.x));
    console.log("Difference Y:", Math.abs(finalGeometry.y - targetWorld.y));
  });
});

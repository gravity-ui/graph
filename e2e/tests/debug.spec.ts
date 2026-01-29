import { test } from "@playwright/test";
import { GraphPageObject } from "../page-objects/GraphPageObject";

test.describe("Debug Coordinates", () => {
  test("debug block coordinates and hit test", async ({ page }) => {
    const graphPO = new GraphPageObject(page);

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
      ],
      connections: [],
    });

    // Get debug info
    const debugInfo = await page.evaluate(() => {
      const blockState = window.graph.blocks.getBlockState("block-1");
      const geometry = blockState.$geometry.value;
      const camera = window.graph.cameraService.getCameraState();
      
      const worldCenterX = geometry.x + geometry.width / 2;
      const worldCenterY = geometry.y + geometry.height / 2;
      
      const screenX = worldCenterX * camera.scale + camera.x;
      const screenY = worldCenterY * camera.scale + camera.y;

      // Test hit detection
      const elementsAtPoint = window.graph.getElementsOverPoint({ x: worldCenterX, y: worldCenterY });

      return {
        blockGeometry: geometry,
        cameraState: { x: camera.x, y: camera.y, scale: camera.scale },
        worldCenter: { x: worldCenterX, y: worldCenterY },
        screenCenter: { x: screenX, y: screenY },
        canvasBounds: {
          width: camera.width,
          height: camera.height,
        },
        elementsAtWorldCenter: elementsAtPoint.map((el: any) => el.id || el.constructor.name),
      };
    });

    console.log("Debug Info:", JSON.stringify(debugInfo, null, 2));

    // Try clicking
    await page.mouse.click(debugInfo.screenCenter.x, debugInfo.screenCenter.y);
    await page.waitForTimeout(200);

    const isSelected = await graphPO.blocks.isSelected("block-1");
    console.log("Is block selected:", isSelected);

    // Check what element is at click position
    const elementAtClick = await page.evaluate((coords) => {
      const point = window.graph.getPointInCameraSpace({
        pageX: coords.screenX + window.scrollX,
        pageY: coords.screenY + window.scrollY,
        target: window.graph.getGraphCanvas(),
      } as any);
      
      const elements = window.graph.getElementsOverPoint(point);
      return elements.map((el: any) => el.id || el.constructor.name);
    }, { screenX: debugInfo.screenCenter.x, screenY: debugInfo.screenCenter.y });

    console.log("Elements at click position:", elementAtClick);

    // Take screenshot
    await page.screenshot({ path: "test-results/debug-screenshot.png" });
  });
});

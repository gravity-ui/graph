import { test, expect } from "@playwright/test";

import { ECameraScaleLevel } from "../../../src/services/camera/cameraScaleEnums";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCK = {
  id: "block-1",
  is: "Block" as const,
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  name: "Block 1",
  anchors: [],
  selected: false,
};

test.describe("getCameraBlockScaleLevel setting", () => {
  test.describe("default strategy", () => {
    let graphPO: GraphPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);
      await graphPO.initialize({ blocks: [BLOCK], connections: [] });
    });

    test("settings hook should reference the exported defaultGetCameraBlockScaleLevel", async ({
      page,
    }) => {
      const same = await page.evaluate(() => {
        const { defaultGetCameraBlockScaleLevel } = window.GraphModule;
        return (
          window.graph.rootStore.settings.$settings.value.getCameraBlockScaleLevel ===
          defaultGetCameraBlockScaleLevel
        );
      });
      expect(same).toBe(true);
    });

    test("should map camera scale to Minimalistic / Schematic / Detailed using block SCALES", async () => {
      const camera = graphPO.getCamera();

      await camera.zoomToScale(0.05);
      await graphPO.waitForFrames(3);
      let level = await graphPO.page.evaluate(() =>
        window.graph.cameraService.getCameraBlockScaleLevel(),
      );
      expect(level).toBe(ECameraScaleLevel.Minimalistic);

      await camera.zoomToScale(0.3);
      await graphPO.waitForFrames(3);
      level = await graphPO.page.evaluate(() => window.graph.cameraService.getCameraBlockScaleLevel());
      expect(level).toBe(ECameraScaleLevel.Schematic);

      await camera.zoomToScale(0.85);
      await graphPO.waitForFrames(3);
      level = await graphPO.page.evaluate(() => window.graph.cameraService.getCameraBlockScaleLevel());
      expect(level).toBe(ECameraScaleLevel.Detailed);
    });
  });

  test.describe("custom strategy (defined in browser)", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/base.html");
      await page.waitForFunction(() => window.graphLibraryLoaded === true);

      await page.evaluate(() => {
        const { Graph, ECameraScaleLevel } = window.GraphModule;
        const rootEl = document.getElementById("root");
        if (!rootEl) {
          throw new Error("Root element not found");
        }
        const blocks = [
          {
            id: "block-1",
            is: "Block" as const,
            x: 100,
            y: 100,
            width: 200,
            height: 100,
            name: "Block 1",
            anchors: [],
            selected: false,
          },
        ];
        const graph = new Graph(
          {
            blocks,
            connections: [],
            settings: {
              getCameraBlockScaleLevel: () => ECameraScaleLevel.Detailed,
            },
          },
          rootEl,
        );
        graph.start();
        graph.zoomTo("center");
        window.graph = graph;
        window.graphInitialized = true;
      });

      await page.waitForFunction(() => window.graphInitialized === true);
      const graphPO = new GraphPageObject(page);
      await graphPO.waitForFrames(3);
    });

    test("should return Detailed at low scale when default would be Minimalistic", async ({ page }) => {
      const graphPO = new GraphPageObject(page);
      const camera = graphPO.getCamera();

      await camera.zoomToScale(0.05);
      await graphPO.waitForFrames(3);

      const level = await page.evaluate(() => window.graph.cameraService.getCameraBlockScaleLevel());
      expect(level).toBe(ECameraScaleLevel.Detailed);

      const notDefault = await page.evaluate(() => {
        const { defaultGetCameraBlockScaleLevel } = window.GraphModule;
        return (
          window.graph.rootStore.settings.$settings.value.getCameraBlockScaleLevel !==
          defaultGetCameraBlockScaleLevel
        );
      });
      expect(notDefault).toBe(true);
    });
  });
});

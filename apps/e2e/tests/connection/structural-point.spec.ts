import { test, expect } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`Structural point hit testing at DPR ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });

    for (const scale of [0.75, 1.5]) {
      test(`finds a connection by world coordinates at scale ${scale}`, async ({ page }) => {
        const graph = new GraphPageObject(page);
        await graph.initialize({
          blocks: [
            {
              id: "source",
              is: "Block",
              x: 100,
              y: 100,
              width: 100,
              height: 100,
              name: "Source",
              anchors: [],
              selected: false,
            },
            {
              id: "target",
              is: "Block",
              x: 500,
              y: 100,
              width: 100,
              height: 100,
              name: "Target",
              anchors: [],
              selected: false,
            },
          ],
          connections: [{ sourceBlockId: "source", targetBlockId: "target" }],
          settings: { useBezierConnections: true },
        });
        await graph.evaluate((instance, cameraScale) => {
          instance.cameraService.set({ x: 37.5, y: -12.25, scale: cameraScale });
        }, scale);
        await graph.waitForFrames(3);

        const hits = await graph.evaluate((instance) => {
          const point = { x: 350, y: 150 };
          return {
            top: instance.getElementOverPoint(point)?.getEntityId(),
            all: instance.getElementsOverPoint(point).map((element) => element.getEntityId()),
            miss: instance.getElementOverPoint({ x: 350, y: 200 })?.getEntityId() ?? null,
          };
        });

        expect(hits).toEqual({ top: "source:target", all: ["source:target"], miss: null });
      });
    }
  });
}

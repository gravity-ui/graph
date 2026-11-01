import { expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

const NEAR = "Near label";
const FAR = "Far label";

test("connection labels follow the setting and the viewport", async ({ page }) => {
  const graph = new GraphPageObject(page);
  await page.goto("/base.html");
  await page.waitForFunction(() => window.graphLibraryLoaded === true);
  await page.evaluate(
    ([nearLabel, farLabel]) => {
      // Record every text drawn on any canvas.
      const texts: string[] = [];
      (window as unknown as { drawnTexts: string[] }).drawnTexts = texts;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
        texts.push(String(text));
        return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
      };

      const { Graph } = window.GraphModule;
      const root = document.getElementById("root");
      if (!(root instanceof HTMLDivElement)) throw new Error("Root not found");
      const target = new Graph(
        {
          connections: [
            { id: "near", label: nearLabel, sourcePortId: "near-source", targetPortId: "near-target" },
            { id: "far", label: farLabel, sourcePortId: "far-source", targetPortId: "far-target" },
          ],
          settings: { useBezierConnections: false, showConnectionLabels: true },
        },
        root
      );
      const place = (id: string, x: number, y: number) => {
        const state = target.connections.getConnectionState(id);
        if (!state) throw new Error(`Connection ${id} not found`);
        state.$sourcePortState.value.updatePort({ x, y, lookup: false });
        state.$targetPortState.value.updatePort({ x: x + 400, y, lookup: false });
      };
      place("near", 100, 100);
      place("far", 50_000, 50_000);
      target.cameraService.set({ x: 0, y: 0, scale: 1 });
      target.start();
      window.graph = target;
    },
    [NEAR, FAR]
  );
  await graph.waitForFrames(3);

  /** Labels drawn in the next frames. */
  const labels = async (): Promise<string[]> => {
    await page.evaluate(() => {
      (window as unknown as { drawnTexts: string[] }).drawnTexts.length = 0;
      window.graph.cameraService.move(1, 0);
    });
    await graph.waitForFrames(3);
    const texts = await page.evaluate(() => (window as unknown as { drawnTexts: string[] }).drawnTexts.slice());
    return [...new Set(texts.filter((text) => text === NEAR || text === FAR))];
  };

  // Only the connection in the viewport draws its label.
  expect(await labels()).toEqual([NEAR]);

  await graph.evaluate((target) => target.updateSettings({ showConnectionLabels: false }));
  expect(await labels()).toEqual([]);

  await graph.evaluate((target) => target.updateSettings({ showConnectionLabels: true }));
  expect(await labels()).toEqual([NEAR]);

  // Moving to the far connection swaps the labels.
  await graph.evaluate((target) => target.cameraService.set({ x: -49_900, y: -49_900, scale: 1 }));
  await graph.waitForFrames(3);
  expect(await labels()).toEqual([FAR]);

  // Zoomed out below the label threshold, no label is drawn.
  await graph.evaluate((target) => target.cameraService.set({ x: 0, y: 0, scale: 0.1 }));
  await graph.waitForFrames(3);
  expect(await labels()).toEqual([]);
});

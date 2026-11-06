import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

const BLOCKS = [
  {
    id: "near",
    is: "Block" as const,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    name: "Near Block",
    anchors: [],
    selected: false,
  },
  {
    id: "far",
    is: "Block" as const,
    x: 10000,
    y: 10000,
    width: 200,
    height: 100,
    name: "Far Block",
    anchors: [],
    selected: false,
  },
];

const NAMES = BLOCKS.map((block) => block.name);

test.describe("MiniMap – block text", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    await graphPO.initialize({ blocks: BLOCKS, connections: [] });
    // The main camera shows only the near block, close enough for the main view to draw names.
    await page.evaluate(() => window.graph.cameraService.set({ scale: 0.5, x: 100, y: 100 }));
    await graphPO.waitForFrames(3);
    await minimapPO.addLayer({ location: "topLeft" });
    // Record the text the minimap draws.
    await page.evaluate(() => {
      const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      const texts: string[] = [];
      (window as unknown as { minimapTexts: string[] }).minimapTexts = texts;
      const fillText = ctx.fillText.bind(ctx);
      ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
        texts.push(String(text));
        return maxWidth === undefined ? fillText(text, x, y) : fillText(text, x, y, maxWidth);
      };
    });
  });

  /** Redraws the minimap by nudging the main camera and returns the block names it drew. */
  async function minimapNames(page: import("@playwright/test").Page): Promise<string[]> {
    await page.evaluate(() => {
      (window as unknown as { minimapTexts: string[] }).minimapTexts.length = 0;
      window.graph.cameraService.move(1, 0);
    });
    await graphPO.waitForFrames(3);
    const texts = await page.evaluate(() => (window as unknown as { minimapTexts: string[] }).minimapTexts.slice());
    return texts.filter((text) => NAMES.some((name) => text.includes(name.split(" ")[0])));
  }

  test("draws the same text whether or not the main camera has shown a block", async ({ page }) => {
    const before = await minimapNames(page);

    // The main camera visits the far block close up, then returns.
    await page.evaluate(() => window.graph.cameraService.set({ scale: 0.5, x: -4900, y: -4900 }));
    await graphPO.waitForFrames(3);
    await page.evaluate(() => window.graph.cameraService.set({ scale: 0.5, x: 100, y: 100 }));
    await graphPO.waitForFrames(3);
    const after = await minimapNames(page);

    // The minimap's rule: it draws block bodies without names.
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });

  test("does not follow the main camera's level of detail", async ({ page }) => {
    for (const scale of [0.05, 0.2, 0.5, 1]) {
      await page.evaluate((value) => window.graph.cameraService.set({ scale: value, x: 100, y: 100 }), scale);
      await graphPO.waitForFrames(3);
      expect(await minimapNames(page)).toEqual([]);
    }
  });
});

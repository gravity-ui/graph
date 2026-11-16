import type { TBlockView, TScenePrimitive } from "@gravity-ui/graph";
import { Page, expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

/**
 * The fixture blocks ("Text") add a name to their minimalistic look with no scale threshold, so the interpreter would
 * draw it at the minimap's scale (about 0.018 here): only the minimap's own rule (`skipText`) keeps it off. Stock
 * titles have `minScale` 0.125 and would prove nothing.
 */
const BLOCKS = [
  { id: "near", is: "Text", x: 0, y: 0, width: 200, height: 100, name: "Near Block", anchors: [] },
  { id: "far", is: "Text", x: 10000, y: 10000, width: 200, height: 100, name: "Far Block", anchors: [] },
];

/** D6: a change reaches the minimap at most about 100 ms after it; this covers it at any frame rate. */
const D6_SETTLE_MS = 150;

type TTextWindow = { texts: { text: string; minimap: boolean }[]; minimapDraws: number; calls: number };

test.describe("MiniMap – block text", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  async function settle(page: Page): Promise<void> {
    await page.evaluate((delay) => new Promise((resolve) => setTimeout(resolve, delay)), D6_SETTLE_MS);
    await graphPO.waitForFrames(2);
  }

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    await graphPO.initialize({ blocks: [], connections: [] });
    await page.evaluate((blocks) => {
      const { CanvasBlock } = window.GraphModule;
      class TextBlock extends CanvasBlock {
        protected override minimalistic(view: TBlockView): readonly TScenePrimitive[] {
          const name: TScenePrimitive = {
            kind: "text",
            text: view.name,
            family: "sans-serif",
            size: 12,
            cameraAware: { maxWorld: 40 },
            lineHeight: 14,
            color: "#000000",
            x: 0,
            y: 0,
            width: 200,
          };
          return [...this.schematic(view), name];
        }
      }
      window.graph.updateSettings({ blockComponents: { Text: TextBlock } });
      window.graph.setEntities({ blocks, connections: [] });
      const w = window as unknown as TTextWindow;
      w.texts = [];
      w.minimapDraws = 0;
      w.calls = 0;
      // Every 2D context: the minimap draws its blocks into an offscreen picture canvas.
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (
        this: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth?: number
      ): void {
        const canvas = this.canvas;
        const minimap = canvas.classList.contains("graph-minimap") || !canvas.isConnected;
        w.texts.push({ text: String(text), minimap });
        if (maxWidth === undefined) fillText.call(this, text, x, y);
        else fillText.call(this, text, x, y, maxWidth);
      };
      const scene = window.graph.scene;
      const draw = scene.drawInterpreted.bind(scene);
      scene.drawInterpreted = (ctx, elements, scale, options): void => {
        w.minimapDraws++;
        draw(ctx, elements, scale, options);
      };
      // The main camera shows the near block close enough for the main view to draw its name.
      window.graph.cameraService.set({ scale: 0.5, x: 100, y: 100 });
    }, BLOCKS);
    await graphPO.waitForFrames(3);
    await minimapPO.addLayer({ location: "topLeft" });
  });

  /**
   * Redraws the minimap without a camera move, with a change of the scene on every call (re-review 7): the selection
   * moves to the other block, and the far block moves to a new place. Returns what was drawn.
   */
  async function redraw(page: Page): Promise<{ names: string[]; draws: number; mainNames: string[] }> {
    await page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      w.texts = [];
      w.minimapDraws = 0;
      w.calls += 1;
      window.graph.api.selectBlocks([w.calls % 2 === 1 ? "near" : "far"], true);
    });
    await settle(page);
    await page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      window.graph.api.updateBlock({ id: "far", x: 10000 + 10 * w.calls });
    });
    await settle(page);
    return page.evaluate(() => {
      const w = window as unknown as TTextWindow;
      const isName = (text: string): boolean => text.includes("Near") || text.includes("Far");
      return {
        names: w.texts.filter((entry) => entry.minimap && isName(entry.text)).map((entry) => entry.text),
        mainNames: w.texts.filter((entry) => !entry.minimap && isName(entry.text)).map((entry) => entry.text),
        draws: w.minimapDraws,
      };
    });
  }

  for (const cameraAwareText of [true, false]) {
    test(`draws block bodies without names (cameraAwareText ${cameraAwareText})`, async ({ page }) => {
      await page.evaluate((value) => window.graph.updateSettings({ cameraAwareText: value }), cameraAwareText);
      await settle(page);
      const result = await redraw(page);
      // The redraw happened, the patch sees text (the main view's name), and the minimap drew none.
      expect(result.draws).toBeGreaterThan(0);
      expect(result.mainNames.length).toBeGreaterThan(0);
      expect(result.names).toEqual([]);
    });
  }

  test("does not follow the main camera's level of detail", async ({ page }) => {
    for (const scale of [0.05, 0.2, 0.5, 1]) {
      await page.evaluate((value) => window.graph.cameraService.set({ scale: value, x: 100, y: 100 }), scale);
      await graphPO.waitForFrames(3);
      const result = await redraw(page);
      expect(result.draws).toBeGreaterThan(0);
      expect(result.names).toEqual([]);
    }
  });
});

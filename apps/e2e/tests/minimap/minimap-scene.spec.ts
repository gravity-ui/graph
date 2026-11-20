import { Page, expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

const block = (id: string, x: number, y: number, anchors = false) => ({
  id,
  is: "Block" as const,
  x,
  y,
  width: 200,
  height: 100,
  name: id,
  anchors: anchors ? [{ id: "out", blockId: id, type: "OUT" }] : [],
});

type TMinimapWindow = { minimapDraws: string[][]; minimapX: Record<string, number>[] };

/** The element ids of every `drawInterpreted` call so far: only the minimap calls it on these pages. */
const draws = (page: Page): Promise<string[][]> =>
  page.evaluate(() => (window as unknown as TMinimapWindow).minimapDraws.slice());

/** The minimap canvas pixel at a world point, as [r, g, b, a]. */
const minimapPixel = (page: Page, x: number, y: number): Promise<number[]> =>
  page.evaluate(
    ({ wx, wy }) => {
      const layer = (window as unknown as { minimapLayer: Record<string, number> }).minimapLayer;
      const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
      const dpr = window.graph.layers.getDPR();
      const px = Math.round((wx - layer.relativeX) * layer.scale * dpr);
      const py = Math.round((wy - layer.relativeY) * layer.scale * dpr);
      return Array.from((canvas.getContext("2d") as CanvasRenderingContext2D).getImageData(px, py, 1, 1).data);
    },
    { wx: x, wy: y }
  );

const isRed = (pixel: number[]): boolean => pixel[0] > 200 && pixel[1] < 60 && pixel[2] < 60;

/**
 * D6: a block-element or list change is drawn on the minimap at most about 100 ms after it (in the next frame after a
 * quiet period). The waits are in time, not frames: the frame rate differs between machines (60 or 120 Hz).
 */
const D6_SETTLE_MS = 150;
/** D6: a settled picture and a whole quiet period after it: the next change is isolated. */
const D6_QUIET_MS = 250;

async function waitForMinimap(page: Page, graphPO: GraphPageObject, ms = D6_SETTLE_MS): Promise<void> {
  await page.evaluate((delay) => new Promise((resolve) => setTimeout(resolve, delay)), ms);
  await graphPO.waitForFrames(2);
}

test.describe("MiniMap – scene elements", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    await graphPO.initialize({
      blocks: [block("block-1", 0, 0, true), block("block-2", 600, 400), block("over", 100, 0)],
      connections: [],
    });
    await page.evaluate(() => {
      const w = window as unknown as TMinimapWindow;
      w.minimapDraws = [];
      w.minimapX = [];
      const scene = window.graph.scene;
      const draw = scene.drawInterpreted.bind(scene);
      scene.drawInterpreted = (ctx, elements, scale, options): void => {
        w.minimapDraws.push(elements.map((element) => element.id));
        w.minimapX.push(Object.fromEntries(elements.map((element) => [element.id, element.x])));
        draw(ctx, elements, scale, options);
      };
    });
    await minimapPO.addLayer({ location: "topLeft" });
  });

  test("draws block elements only, in the blocks' list order", async ({ page }) => {
    const last = (await draws(page)).at(-1) ?? [];
    expect(last.length).toBeGreaterThan(0);
    expect(last.every((id) => id.startsWith("block\u0000"))).toBe(true);
    expect(last).toEqual(["block\u0000block-1", "block\u0000block-2", "block\u0000over"]);
  });

  test("keeps the list order where blocks overlap, and shows a style rule, without a camera move", async ({ page }) => {
    await page.evaluate(() => {
      const { CanvasBlock, selectedTag } = window.GraphModule;
      window.graph.scene.styles.add([
        { target: CanvasBlock, tags: [selectedTag], style: { parts: { body: { color: "#ff0000" } } } },
      ]);
      // block-1 (x 0..200) and over (x 100..300) overlap at x 100..200; the selection raises block-1 in the main view.
      window.graph.api.selectBlocks(["block-1"], true);
    });
    await waitForMinimap(page, graphPO);
    // block-1's own part: the rule's red; the overlap: "over", drawn after block-1 in the list, keeps its colour.
    expect(isRed(await minimapPixel(page, 50, 50))).toBe(true);
    expect(isRed(await minimapPixel(page, 150, 50))).toBe(false);
  });

  test("shows an isolated selection's style rule at most one frame after the main view", async ({ page }) => {
    await page.evaluate(() => {
      const { CanvasBlock, selectedTag } = window.GraphModule;
      window.graph.scene.styles.add([
        { target: CanvasBlock, tags: [selectedTag], style: { parts: { body: { color: "#ff0000" } } } },
      ]);
    });
    // D6: the rule's own picture is drawn, and no picture follows for a whole period: the selection is isolated.
    await waitForMinimap(page, graphPO, D6_QUIET_MS);
    expect(isRed(await minimapPixel(page, 50, 50))).toBe(false);
    // The selection and the frame count in one task. The main view draws it in the first graph frame, whose end steps
    // the block revision; after a quiet period the minimap draws it in the second (D6). The pixel is read at the end of
    // that second frame.
    const pixel = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const { schedule, ESchedulerPriority } = window.GraphModule;
          const layer = (window as unknown as { minimapLayer: Record<string, number> }).minimapLayer;
          window.graph.api.selectBlocks(["block-1"], true);
          schedule(
            () => {
              const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
              const dpr = window.graph.layers.getDPR();
              const px = Math.round((50 - layer.relativeX) * layer.scale * dpr);
              const py = Math.round((50 - layer.relativeY) * layer.scale * dpr);
              const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
              resolve(Array.from(ctx.getImageData(px, py, 1, 1).data));
            },
            { priority: ESchedulerPriority.LOWEST, frameInterval: 2, once: true }
          );
        })
    );
    expect(isRed(pixel)).toBe(true);
  });

  test("keeps a block handed to HTML on the minimap, drawn", async ({ page }) => {
    const state = await page.evaluate(() => {
      const { CanvasBlock } = window.GraphModule;
      window.graph.scene.styles.add([{ target: CanvasBlock, style: { parts: { body: { color: "#ff0000" } } } }]);
      window.graph.cameraService.set({ scale: 1, x: 0, y: 0 });
      const view = window.graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent();
      view?.delegateRender({ canvasVisible: false });
      return { delegated: view?.isRenderDelegated() ?? false };
    });
    await waitForMinimap(page, graphPO);
    // The main scene no longer shows it; the minimap draws its body, the rule's red, where only block-1 is.
    const inScene = await page.evaluate(() =>
      window.graph.scene.query({ x: 0, y: 0, width: 50, height: 50 }).some((e) => e.id === "block\u0000block-1")
    );
    expect(state.delegated).toBe(true);
    expect(inScene).toBe(false);
    expect(isRed(await minimapPixel(page, 50, 50))).toBe(true);
  });

  test("keeps a block hidden by a collapsed group on the minimap, drawn", async ({ page }) => {
    const hidden = await page.evaluate(async () => {
      const { CanvasBlock, CollapsibleGroup, BlockGroups } = window.GraphModule;
      const graph = window.graph;
      graph.scene.styles.add([{ target: CanvasBlock, style: { parts: { body: { color: "#ff0000" } } } }]);
      graph.addLayer(BlockGroups, { draggable: false });
      graph.api.updateBlock({ id: "over", group: "group-1" });
      graph.rootStore.groupsList.setGroups([
        { id: "group-1", rect: { x: 80, y: -20, width: 240, height: 140 }, component: CollapsibleGroup },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 100));
      for (const layer of graph.layers.getLayers()) {
        const group = (layer as unknown as { $?: Record<string, unknown> }).$?.["group-1"];
        if (group instanceof CollapsibleGroup) group.collapse();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return graph.rootStore.blocksList.getBlockState("over")?.getViewComponent()?.isHiddenForOtherReason() ?? false;
    });
    await waitForMinimap(page, graphPO);
    const inScene = await page.evaluate(() =>
      window.graph.scene.query({ x: 250, y: 40, width: 20, height: 20 }).some((e) => e.id === "block\u0000over")
    );
    expect(hidden).toBe(true);
    expect(inScene).toBe(false);
    // Where only "over" is (x 200..300): its body, the rule's red.
    expect(isRed(await minimapPixel(page, 250, 50))).toBe(true);
  });

  test("draws a block subclass with an entityType of its own, and follows its changes", async ({ page }) => {
    await page.evaluate(() => {
      const { CanvasBlock } = window.GraphModule;
      class CustomBlock extends CanvasBlock {
        public static override entityType = "custom";
      }
      window.graph.updateSettings({ blockComponents: { Custom: CustomBlock } });
      window.graph.setEntities({
        blocks: [
          { id: "block-1", is: "Block", x: 0, y: 0, width: 200, height: 100, name: "1", anchors: [] },
          { id: "custom-1", is: "Custom", x: 300, y: 0, width: 200, height: 100, name: "C", anchors: [] },
          { id: "block-2", is: "Block", x: 600, y: 400, width: 200, height: 100, name: "2", anchors: [] },
        ],
        connections: [],
      });
    });
    await waitForMinimap(page, graphPO);
    expect((await draws(page)).at(-1)).toEqual(["block\u0000block-1", "custom\u0000custom-1", "block\u0000block-2"]);
    // A move inside the bounds: only its own revision (type "custom") tells the minimap.
    await page.evaluate(() => window.graph.api.updateBlock({ id: "custom-1", x: 320 }));
    await waitForMinimap(page, graphPO);
    const last = await page.evaluate(() => (window as unknown as TMinimapWindow).minimapX.at(-1));
    expect(last?.["custom\u0000custom-1"]).toBe(320);
  });

  test("redraws its blocks after a selection, without a camera move", async ({ page }) => {
    await waitForMinimap(page, graphPO);
    const before = (await draws(page)).length;
    await page.evaluate(() => window.graph.api.selectBlocks(["block-1"], true));
    await waitForMinimap(page, graphPO);
    expect((await draws(page)).length).toBeGreaterThan(before);
  });

  test("does not redraw its blocks for a camera move or an anchor's hover", async ({ page }) => {
    // D6: a picture that waits from the setup is drawn first; after it, the counts below cover whole periods.
    await waitForMinimap(page, graphPO);
    const before = (await draws(page)).length;
    await page.evaluate(() => window.graph.cameraService.move(10, 0));
    await graphPO.waitForFrames(4);
    const anchorRevision = await page.evaluate(() => {
      // The anchor's own hover event, as GraphLayer dispatches it to a target: the anchor and its block tag themselves.
      const start = window.graph.scene.revisionOf("anchor").value;
      const state = window.graph.rootStore.blocksList.getBlockState("block-1");
      const anchor = state?.getAnchorById("out")?.getViewComponent();
      anchor?.dispatchEvent(new CustomEvent("mouseenter", { detail: { target: anchor, relatedTarget: undefined } }));
      return { exists: anchor !== undefined, start };
    });
    await waitForMinimap(page, graphPO);
    // The hover changed the scene: the anchor's own revision stepped (the theme's hover rule), so the check is not idle.
    expect(anchorRevision.exists).toBe(true);
    expect(await page.evaluate(() => window.graph.scene.revisionOf("anchor").value)).toBeGreaterThan(
      anchorRevision.start
    );
    expect((await draws(page)).length).toBe(before);
  });

  test("keeps the list order between a LegacyCanvasBlock and a scene block where they overlap", async ({ page }) => {
    const overlap = async (order: string[]): Promise<{ legacyOnly: boolean; shared: boolean }> => {
      await page.evaluate((ids) => {
        const { CanvasBlock, LegacyCanvasBlock } = window.GraphModule;
        window.graph.updateSettings({ blockComponents: { Legacy: LegacyCanvasBlock } });
        const all = {
          legacy: { id: "legacy", is: "Legacy", x: 0, y: 0, width: 200, height: 100, name: "L", anchors: [] },
          scene: { id: "scene", is: "Block", x: 100, y: 0, width: 200, height: 100, name: "S", anchors: [] },
        };
        window.graph.scene.styles.add([{ target: CanvasBlock, style: { parts: { body: { color: "#ff0000" } } } }]);
        window.graph.setEntities({ blocks: ids.map((id) => all[id as keyof typeof all]), connections: [] });
      }, order);
      await waitForMinimap(page, graphPO);
      return {
        legacyOnly: isRed(await minimapPixel(page, 50, 50)),
        shared: isRed(await minimapPixel(page, 150, 50)),
      };
    };
    // The legacy block draws the theme's colour, the scene block the rule's red: the later one in the list is on top.
    expect(await overlap(["legacy", "scene"])).toEqual({ legacyOnly: false, shared: true });
    expect(await overlap(["scene", "legacy"])).toEqual({ legacyOnly: false, shared: false });
  });

  test("draws a LegacyCanvasBlock with renderMinimalisticBlock, and again on every camera move", async ({ page }) => {
    const calls = await page.evaluate(async () => {
      const { LegacyCanvasBlock } = window.GraphModule;
      const original = LegacyCanvasBlock.prototype.renderMinimalisticBlock;
      let count = 0;
      LegacyCanvasBlock.prototype.renderMinimalisticBlock = function (
        this: InstanceType<typeof LegacyCanvasBlock>,
        ctx: CanvasRenderingContext2D,
        options?: { text?: boolean }
      ): void {
        count++;
        original.call(this, ctx, options);
      };
      window.graph.updateSettings({ blockComponents: { Legacy: LegacyCanvasBlock } });
      window.graph.setEntities({
        blocks: [{ id: "legacy", is: "Legacy", x: 300, y: 300, width: 200, height: 100, name: "Legacy", anchors: [] }],
        connections: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const afterMount = count;
      window.graph.cameraService.move(10, 0);
      await new Promise((resolve) => setTimeout(resolve, 200));
      LegacyCanvasBlock.prototype.renderMinimalisticBlock = original;
      return { afterMount, afterMove: count };
    });
    expect(calls.afterMount).toBeGreaterThan(0);
    expect(calls.afterMove).toBeGreaterThan(calls.afterMount);
  });
});

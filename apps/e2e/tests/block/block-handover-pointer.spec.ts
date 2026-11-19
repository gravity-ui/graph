import { test, expect } from "@playwright/test";

import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

/**
 * The handover to HTML under a still pointer (Task 8). block-1 (x 100..300, y 100..200) has an OUT anchor on its right
 * edge. The pointer rests on the anchor while the camera zooms across the detailed level; each zoom keeps the anchor
 * under the pointer. The graph's bus (`graph.on`) reports the pointer's target: at the detailed level the anchor is
 * hit through the block's HTML view (D4), at schematic through its scene look, at minimalistic not at all.
 */

const BLOCKS = [
  {
    id: "block-1",
    is: "Block" as const,
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 1",
    anchors: [{ id: "out", blockId: "block-1", type: "OUT" }],
  },
];

/** Where the anchor rests on the canvas, in canvas pixels. */
const SCREEN = { x: 400, y: 300 };

type THandoverWindow = {
  /** Puts the anchor's point at SCREEN at this scale. */
  lookAt(scale: number): void;
  /** "anchor", "block" or "other". */
  nameOf(target: unknown): string;
  /** The bus's hover events since the last `takeLog()`. */
  takeLog(): string[];
  anchorPoint(): { x: number; y: number };
};

test.describe("The handover under a still pointer on an anchor", () => {
  let graphPO: ReactGraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new ReactGraphPageObject(page);
    await graphPO.initialize({ blocks: BLOCKS, connections: [], settings: { useBlocksAnchors: true } });
    await page.evaluate(
      ({ screen }) => {
        const graph = window.graph;
        const view = () => graph.rootStore.blocksList.getBlockState("block-1")?.getViewComponent();
        const anchorPoint = (): { x: number; y: number } => {
          const block = view();
          const anchor = block?.connectedState.$anchors.value[0];
          if (!block || !anchor) throw new Error("no block-1 or its anchor");
          return block.getConnectionAnchorPosition(anchor);
        };
        const log: string[] = [];
        const nameOf = (target: unknown): string => {
          const state = graph.rootStore.blocksList.getBlockState("block-1");
          if (target !== undefined && target === state?.getAnchorById("out")?.getViewComponent()) return "anchor";
          return target !== undefined && target === state?.getViewComponent() ? "block" : "other";
        };
        graph.on("mouseenter", (event) => {
          log.push(`enter:${nameOf(event.detail.target)}`);
        });
        graph.on("mouseleave", (event) => {
          log.push(`leave:${nameOf(event.detail.target)}`);
        });
        const handover: THandoverWindow = {
          lookAt: (scale) => {
            const point = anchorPoint();
            graph.cameraService.set({ scale, x: screen.x - point.x * scale, y: screen.y - point.y * scale });
          },
          nameOf,
          takeLog: () => log.splice(0),
          anchorPoint,
        };
        (window as unknown as { handover: THandoverWindow }).handover = handover;
      },
      { screen: SCREEN }
    );
  });

  /** Moves the pointer onto the anchor at this scale and checks the bus made it the target. */
  async function restOnAnchor(scale: number): Promise<void> {
    await graphPO.page.evaluate((s) => (window as unknown as { handover: THandoverWindow }).handover.lookAt(s), scale);
    await graphPO.waitForFrames(5);
    const rect = await graphPO.page.evaluate(() => {
      const { left, top } = window.graph.getGraphCanvas().getBoundingClientRect();
      return { left, top };
    });
    await graphPO.page.mouse.move(rect.left + SCREEN.x - 20, rect.top + SCREEN.y - 20);
    await graphPO.page.mouse.move(rect.left + SCREEN.x, rect.top + SCREEN.y);
    await graphPO.waitForFrames(3);
    const hovered = await graphPO.page.evaluate(() => {
      const handover = (window as unknown as { handover: THandoverWindow }).handover;
      const log = handover.takeLog();
      return { log, target: handover.nameOf(window.graph.getGraphLayer().$hoveredComponent.value) };
    });
    expect(hovered.target).toBe("anchor");
    expect(hovered.log).toContain("enter:anchor");
  }

  test("entering detailed keeps the anchor the target: no leave and enter while the HTML views mount", async () => {
    await restOnAnchor(0.5);
    await graphPO.page.evaluate(() => (window as unknown as { handover: THandoverWindow }).handover.lookAt(1));
    await graphPO.waitForFrames(10);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(1);
    const after = await graphPO.page.evaluate(() => {
      const handover = (window as unknown as { handover: THandoverWindow }).handover;
      const view = window.graph.rootStore.blocksList.getBlockState("block-1")?.getViewComponent();
      return {
        held: view?.isHeldByHtml(),
        target: handover.nameOf(window.graph.getGraphLayer().$hoveredComponent.value),
        log: handover.takeLog(),
      };
    });
    expect(after).toEqual({ held: true, target: "anchor", log: [] });
  });

  test("keeps the same bounce phase across the scene and HTML with a fixed anchor", async ({ page }) => {
    const lookAt = async (scale: number) => {
      await page.evaluate((s) => (window as unknown as { handover: THandoverWindow }).handover.lookAt(s), scale);
      await graphPO.waitForFrames(5);
    };
    const sceneY = () =>
      page.evaluate(() => {
        const graph = window.graph;
        const block = graph.rootStore.blocksList.getBlockState("block-1")?.getViewComponent();
        return block && graph.scene.store.get(block.getSceneElementId())?.y;
      });
    const htmlPosition = () =>
      page.locator(".graph-block-wrapper").evaluate((wrapper) => {
        const element = wrapper.querySelector(".graph-block-anchor");
        if (!element) throw new Error("The block's HTML anchor is missing");
        const anchor = element.getBoundingClientRect();
        return {
          y: wrapper.getBoundingClientRect().y,
          anchorX: anchor.x + anchor.width / 2,
          anchorY: anchor.y + anchor.height / 2,
        };
      });

    await page.addStyleTag({ content: '[data-testid="block-block-1"] { transform: rotate(30deg) scale(2); }' });
    await lookAt(1);
    const rest = await htmlPosition();
    await page.evaluate(() => {
      const { scene } = window.graph;
      scene.clock.now = () => 0;
      const { CanvasBlock, hoveredTag } = window.GraphModule;
      scene.styles.add([{ target: CanvasBlock, tags: [hoveredTag], style: { motion: "bounce" } }]);
    });
    await restOnAnchor(0.5);
    await page.evaluate(() => {
      window.graph.scene.clock.now = () => 0.15;
    });
    await expect.poll(sceneY).toBeCloseTo(BLOCKS[0].y - 8);

    await lookAt(1);
    const moving = await htmlPosition();
    expect(moving.y).toBeCloseTo(rest.y - 8);
    expect(moving.anchorX).toBeCloseTo(rest.anchorX);
    expect(moving.anchorY).toBeCloseTo(rest.anchorY);

    await page.evaluate(() => {
      window.graph.scene.clock.now = () => 0.225;
    });
    const offset = -8 * Math.sin(0.75 * Math.PI);
    await expect.poll(async () => (await htmlPosition()).y).toBeCloseTo(rest.y + offset);
    await lookAt(0.5);
    await expect.poll(sceneY).toBeCloseTo(BLOCKS[0].y + offset);
  });

  for (const [level, scale, target, log] of [
    ["schematic", 0.5, "anchor", []],
    ["minimalistic", 0.1, "block", ["leave:anchor", "enter:block"]],
  ] as const) {
    test(`leaving detailed for ${level}: the frame that hides the HTML keeps no held hit`, async () => {
      await restOnAnchor(1);
      // The zoom and the graph frame after it, in one task: no other frame runs in between.
      const frame = await graphPO.page.evaluate((s) => {
        const graph = window.graph;
        const handover = (window as unknown as { handover: THandoverWindow }).handover;
        handover.lookAt(s);
        graph.scheduler.performUpdate();
        // React unmounts the view later; the frame's end hid its layer.
        const html = document.querySelector("[data-testid='block-block-1']");
        return {
          htmlHidden: html === null || html.closest(".layer-hidden") !== null,
          hit: handover.nameOf(graph.getElementOverPoint(handover.anchorPoint())),
          target: handover.nameOf(graph.getGraphLayer().$hoveredComponent.value),
        };
      }, scale);
      expect(frame).toEqual({ htmlHidden: true, hit: target, target });
      await graphPO.waitForFrames(10);
      expect(await graphPO.getRenderedHtmlBlockCount()).toBe(0);
      const later = await graphPO.page.evaluate(() => {
        const handover = (window as unknown as { handover: THandoverWindow }).handover;
        return {
          target: handover.nameOf(window.graph.getGraphLayer().$hoveredComponent.value),
          log: handover.takeLog(),
        };
      });
      expect(later).toEqual({ target, log: [...log] });
    });
  }
});

import { test, expect } from "@playwright/test";

import { ReactGraphPageObject } from "../../page-objects/ReactGraphPageObject";

/**
 * Layout:
 *
 *   [block-1  200x100]   [block-2  200x100]
 *   x=100,y=100           x=400,y=100
 *
 * Connection: block-1 → block-2
 *
 * ReactLayer activates HTML block rendering at the detailed scene level (camera scale >= 0.7 by default).
 * GraphBlock hands the block over with `delegateRender` once its HTML mounted; the core hides it only at the
 * detailed level, and ReactLayer switches its HTML at the graph frame's end.
 *
 * Expected behaviour:
 *  - Low zoom  (< 0.7): canvas renders, no HTML blocks in DOM, blocks selectable.
 *  - High zoom (>= 0.7): HTML blocks in DOM, canvas blocks NOT rendered (isRendered=false),
 *                         but hitbox preserved so blocks remain selectable.
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
    anchors: [],
  },
  {
    id: "block-2",
    is: "Block" as const,
    x: 400,
    y: 100,
    width: 200,
    height: 100,
    name: "Block 2",
    anchors: [],
  },
];

const CONNECTIONS = [{ id: "conn-1", sourceBlockId: "block-1", targetBlockId: "block-2" }];

test.describe("Block renderDelegated — React HTML layer", () => {
  let graphPO: ReactGraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new ReactGraphPageObject(page);
    await graphPO.initialize({ blocks: BLOCKS, connections: CONNECTIONS });
  });

  // ---------------------------------------------------------------------------
  // Low zoom — canvas mode
  // ---------------------------------------------------------------------------

  test("at low zoom: no HTML blocks in DOM", async () => {
    await graphPO.camera().zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    const count = await graphPO.getRenderedHtmlBlockCount();
    expect(count).toBe(0);
  });

  test("at low zoom: canvas blocks are rendered", async () => {
    await graphPO.camera().zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    const { b1, b2 } = await graphPO.evaluate((graph) => {
      const store = graph.rootStore;
      return {
        b1: store.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false,
        b2: store.blocksList.$blocksMap.value.get("block-2")?.getViewComponent()?.isRendered() ?? false,
      };
    });

    expect(b1).toBe(true);
    expect(b2).toBe(true);
  });

  test("at low zoom: blocks are selectable via canvas hitbox", async () => {
    await graphPO.camera().zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    await graphPO.block("block-1").click();
    expect(await graphPO.block("block-1").isSelected()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // High zoom — React mode
  // ---------------------------------------------------------------------------

  test("at high zoom: HTML blocks appear in DOM", async () => {
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);
    expect(await graphPO.isHtmlBlockRendered("block-1")).toBe(true);
    expect(await graphPO.isHtmlBlockRendered("block-2")).toBe(true);
  });

  test("at high zoom: canvas blocks are NOT rendered (delegated to React)", async () => {
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    const { b1, b2 } = await graphPO.evaluate((graph) => {
      const store = graph.rootStore;
      return {
        b1: store.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? true,
        b2: store.blocksList.$blocksMap.value.get("block-2")?.getViewComponent()?.isRendered() ?? true,
      };
    });

    expect(b1).toBe(false);
    expect(b2).toBe(false);
  });

  test("at high zoom: hitbox preserved — blocks remain selectable", async () => {
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    await graphPO.block("block-1").click();
    expect(await graphPO.block("block-1").isSelected()).toBe(true);
  });

  test("at high zoom: connections are preserved", async () => {
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Zoom transition
  // ---------------------------------------------------------------------------

  test("zooming out unmounts HTML blocks and restores canvas rendering", async () => {
    const camera = graphPO.camera();

    // Activate React mode
    await camera.zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);

    // Return to canvas mode
    await camera.zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(0);

    const b1Rendered = await graphPO.evaluate((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false;
    });
    expect(b1Rendered).toBe(true);
  });

  test("zooming in mounts HTML blocks and suppresses canvas rendering", async () => {
    const camera = graphPO.camera();

    // Start in canvas mode
    await camera.zoomToScale(0.3);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(0);

    // Activate React mode
    await camera.zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);

    const b1Rendered = await graphPO.evaluate((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? true;
    });
    expect(b1Rendered).toBe(false);
  });

  test("zooming out leaves no frame without block-1, whichever rAF callback changes the camera", async ({ page }) => {
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);
    await page.evaluate(() => {
      const graph = window.graph;
      /** What shows block-1 now: its HTML (not in a hidden layer) and the scene canvas at its centre (alpha > 0). */
      (window as unknown as { shown(): { html: boolean; canvas: boolean } }).shown = () => {
        const html = document.querySelector("[data-testid='block-block-1']");
        const geometry = graph.rootStore.blocksList.getBlockState("block-1")?.$geometry.value;
        const canvas = graph.scene.layer.getCanvas();
        const ctx = canvas?.getContext("2d");
        const camera = graph.cameraService.getCameraState();
        const dpr = graph.layers.getDPR();
        let drawn = false;
        if (geometry && ctx) {
          const x = ((geometry.x + geometry.width / 2) * camera.scale + camera.x) * dpr;
          const y = ((geometry.y + geometry.height / 2) * camera.scale + camera.y) * dpr;
          drawn = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] > 0;
        }
        return { html: html !== null && html.closest(".layer-hidden") === null, canvas: drawn };
      };
    });
    type TShownWindow = { shown(): { html: boolean; canvas: boolean } };

    // Ordering 1: the camera changes right before the graph frame (one task: the change, then the frame).
    const first = await graphPO.evaluate((graph) => {
      const shown = (window as unknown as TShownWindow).shown;
      const { width, height } = graph.cameraService.getCameraState();
      graph.cameraService.zoom(width / 2, height / 2, 0.3);
      const beforeFrame = shown();
      graph.scheduler.performUpdate();
      return { beforeFrame, afterFrame: shown() };
    });
    expect(first.beforeFrame.html || first.beforeFrame.canvas).toBe(true);
    expect(first.afterFrame).toEqual({ html: false, canvas: true });

    // Back to detailed, then ordering 2: the camera changes in a rAF callback after the graph's own frame callback,
    // so the browser paints that frame before the graph draws again.
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    const second = await page.evaluate(
      () =>
        new Promise<{ html: boolean; canvas: boolean }>((resolve) => {
          requestAnimationFrame(() => {
            const graph = window.graph;
            const { width, height } = graph.cameraService.getCameraState();
            graph.cameraService.zoom(width / 2, height / 2, 0.3);
            resolve((window as unknown as TShownWindow).shown());
          });
        })
    );
    expect(second.html || second.canvas).toBe(true);
    await graphPO.waitForFrames(1);
    expect(await page.evaluate(() => (window as unknown as TShownWindow).shown())).toEqual({
      html: false,
      canvas: true,
    });
  });

  test("every browser frame paints block-1 on zoom-out, before or after the graph's rAF task", async ({ page }) => {
    type TShown = { html: boolean; canvas: boolean };
    /** One sample: what shows block-1, the graph frames ended so far, and the rAF time of the frame (a task: none). */
    type TSample = { shown: TShown; frameEnds: number; frame?: number };
    type TFrameProbe = { sample(frame?: number): TSample; zoomOut(): void };
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);
    await page.evaluate(() => {
      const graph = window.graph;
      let frameEnds = 0;
      graph.scene.onFrameEnd(() => {
        frameEnds += 1;
      });
      const shown = (): TShown => {
        const html = document.querySelector("[data-testid='block-block-1']");
        const geometry = graph.rootStore.blocksList.getBlockState("block-1")?.$geometry.value;
        const ctx = graph.scene.layer.getCanvas()?.getContext("2d");
        const camera = graph.cameraService.getCameraState();
        const dpr = graph.layers.getDPR();
        let drawn = false;
        if (geometry && ctx) {
          const x = ((geometry.x + geometry.width / 2) * camera.scale + camera.x) * dpr;
          const y = ((geometry.y + geometry.height / 2) * camera.scale + camera.y) * dpr;
          drawn = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data[3] > 0;
        }
        return { html: html !== null && html.closest(".layer-hidden") === null, canvas: drawn };
      };
      const probe: TFrameProbe = {
        sample: (frame) => ({ shown: shown(), frameEnds, frame }),
        zoomOut: () => {
          const { width, height } = graph.cameraService.getCameraState();
          graph.cameraService.zoom(width / 2, height / 2, 0.3);
        },
      };
      (window as unknown as { frameProbe: TFrameProbe }).frameProbe = probe;
    });

    // Ordering A: the camera changes in a task between two frames (as a wheel event does), so before the graph's rAF
    // task of the next frame. A rAF callback registered in that task runs after the graph's (registered a frame
    // earlier): it sees what that frame paints.
    const before = await page.evaluate(
      () =>
        new Promise<{ change: TSample; painted: TSample }>((resolve) => {
          setTimeout(() => {
            const probe = (window as unknown as { frameProbe: TFrameProbe }).frameProbe;
            probe.zoomOut();
            const change = probe.sample();
            requestAnimationFrame((time) => resolve({ change, painted: probe.sample(time) }));
          }, 0);
        })
    );
    // Exactly one graph frame ran between the change and the paint, and that frame shows the block on the canvas.
    expect(before.painted.frameEnds).toBe(before.change.frameEnds + 1);
    expect(before.painted.shown).toEqual({ html: false, canvas: true });

    // Back to detailed. Ordering B: the camera changes in a rAF callback that runs after the graph's in the same
    // frame. A callback registered right after it samples that frame's paint (no graph frame in between); one
    // registered inside it samples the next frame's, after the graph's frame.
    await graphPO.camera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);
    const after = await page.evaluate(
      () =>
        new Promise<{ change: TSample; painted: TSample; next: TSample }>((resolve) => {
          setTimeout(() => {
            const probe = (window as unknown as { frameProbe: TFrameProbe }).frameProbe;
            let change: TSample | undefined;
            let painted: TSample | undefined;
            requestAnimationFrame((time) => {
              probe.zoomOut();
              change = probe.sample(time);
              requestAnimationFrame((nextTime) => {
                if (change && painted) resolve({ change, painted, next: probe.sample(nextTime) });
              });
            });
            requestAnimationFrame((time) => {
              painted = probe.sample(time);
            });
          }, 0);
        })
    );
    expect(after.painted.frame).toBe(after.change.frame);
    expect(after.painted.frameEnds).toBe(after.change.frameEnds);
    // The frame the change lands in keeps the HTML: its graph frame already ran, and the switch waits for the next.
    // (Its canvas still holds the frame before, which did not draw the block.)
    expect(after.painted.shown.html).toBe(true);
    expect(after.next.frame).toBeGreaterThan(after.change.frame ?? Infinity);
    expect(after.next.frameEnds).toBe(after.change.frameEnds + 1);
    expect(after.next.shown).toEqual({ html: false, canvas: true });
  });

  test("connection persists across zoom level transitions", async () => {
    const camera = graphPO.camera();

    await camera.zoomToScale(0.3);
    await graphPO.waitForFrames(3);
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);

    await camera.zoomToScale(1.0);
    await graphPO.waitForFrames(3);
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);

    await camera.zoomToScale(0.3);
    await graphPO.waitForFrames(3);
    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
  });
});

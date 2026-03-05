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
 * ReactLayer activates HTML block rendering when camera scale >= activationScale (0.7 by default).
 * When active, GraphBlock calls setRenderDelegated(true) on the canvas component, which calls
 * GraphComponent.setVisibility(false, { removeHitbox: false }).
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
    selected: false,
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
    selected: false,
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
    await graphPO.getCamera().zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    const count = await graphPO.getRenderedHtmlBlockCount();
    expect(count).toBe(0);
  });

  test("at low zoom: canvas blocks are rendered", async () => {
    await graphPO.getCamera().zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    const { b1, b2 } = await graphPO.evaluateInGraph((graph) => {
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
    await graphPO.getCamera().zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    await graphPO.getBlockCOM("block-1").click();
    expect(await graphPO.getBlockCOM("block-1").isSelected()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // High zoom — React mode
  // ---------------------------------------------------------------------------

  test("at high zoom: HTML blocks appear in DOM", async () => {
    await graphPO.getCamera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);
    expect(await graphPO.isHtmlBlockRendered("block-1")).toBe(true);
    expect(await graphPO.isHtmlBlockRendered("block-2")).toBe(true);
  });

  test("at high zoom: canvas blocks are NOT rendered (delegated to React)", async () => {
    await graphPO.getCamera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    const { b1, b2 } = await graphPO.evaluateInGraph((graph) => {
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
    await graphPO.getCamera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    await graphPO.getBlockCOM("block-1").click();
    expect(await graphPO.getBlockCOM("block-1").isSelected()).toBe(true);
  });

  test("at high zoom: connections are preserved", async () => {
    await graphPO.getCamera().zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    expect(await graphPO.hasConnectionBetween("block-1", "block-2")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Zoom transition
  // ---------------------------------------------------------------------------

  test("zooming out unmounts HTML blocks and restores canvas rendering", async () => {
    const camera = graphPO.getCamera();

    // Activate React mode
    await camera.zoomToScale(1.0);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);

    // Return to canvas mode
    await camera.zoomToScale(0.3);
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(0);

    const b1Rendered = await graphPO.evaluateInGraph((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? false;
    });
    expect(b1Rendered).toBe(true);
  });

  test("zooming in mounts HTML blocks and suppresses canvas rendering", async () => {
    const camera = graphPO.getCamera();

    // Start in canvas mode
    await camera.zoomToScale(0.3);
    await graphPO.waitForFrames(5);
    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(0);

    // Activate React mode
    await camera.zoomToScale(1.0);
    await graphPO.waitForFrames(5);

    expect(await graphPO.getRenderedHtmlBlockCount()).toBe(2);

    const b1Rendered = await graphPO.evaluateInGraph((graph) => {
      return graph.rootStore.blocksList.$blocksMap.value.get("block-1")?.getViewComponent()?.isRendered() ?? true;
    });
    expect(b1Rendered).toBe(false);
  });

  test("connection persists across zoom level transitions", async () => {
    const camera = graphPO.getCamera();

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

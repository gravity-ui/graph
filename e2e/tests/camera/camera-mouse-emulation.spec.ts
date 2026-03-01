import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCK_1 = {
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

const BLOCK_2 = {
  id: "block-2",
  is: "Block" as const,
  x: 500,
  y: 100,
  width: 200,
  height: 100,
  name: "Block 2",
  anchors: [],
  selected: false,
};

test.describe("Camera mouse event emulation (emulateMouseEventsOnCameraChange)", () => {
  test.describe("setting = false (default) — no emulation", () => {
    let graphPO: GraphPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);
      await graphPO.initialize({
        blocks: [BLOCK_1, BLOCK_2],
        connections: [],
        settings: {
          canDragCamera: true,
          canZoomCamera: true,
          // emulateMouseEventsOnCameraChange NOT set → defaults to false
        },
      });
    });

    test("should NOT fire mouseenter when trackpad pans a block under the static cursor", async () => {
      const camera = graphPO.getCamera();
      await camera.zoomToCenter();
      await graphPO.waitForFrames(3);

      const canvasBounds = await camera.getCanvasBounds();
      const screenCenterX = canvasBounds.x + canvasBounds.width / 2;
      const screenCenterY = canvasBounds.y + canvasBounds.height / 2;

      // Park mouse at canvas center (empty space) to establish lastMouseCanvasX/Y in GraphLayer
      await graphPO.page.mouse.move(screenCenterX, screenCenterY);
      await graphPO.waitForFrames(3);

      const listener = await graphPO.listenGraphEvents("mouseenter");

      await camera.panWorldPointUnderCursor(
        BLOCK_1.x + BLOCK_1.width / 2,
        BLOCK_1.y + BLOCK_1.height / 2,
        screenCenterX,
        screenCenterY
      );
      await graphPO.waitForFrames(5);

      const count = await listener.analyze((events) =>
        events.filter((e) => e.detail?.target?.props?.id).length
      );
      expect(count).toBe(0);
    });
  });

  test.describe("setting = true — emulation enabled", () => {
    let graphPO: GraphPageObject;

    test.beforeEach(async ({ page }) => {
      graphPO = new GraphPageObject(page);
      await graphPO.initialize({
        blocks: [BLOCK_1, BLOCK_2],
        connections: [],
        settings: {
          canDragCamera: true,
          canZoomCamera: true,
          emulateMouseEventsOnCameraChange: true,
        },
      });
    });

    test("should fire mouseenter on block when trackpad pans block under static cursor", async () => {
      const camera = graphPO.getCamera();
      await camera.zoomToCenter();
      await graphPO.waitForFrames(3);

      const canvasBounds = await camera.getCanvasBounds();
      const screenCenterX = canvasBounds.x + canvasBounds.width / 2;
      const screenCenterY = canvasBounds.y + canvasBounds.height / 2;

      await graphPO.page.mouse.move(screenCenterX, screenCenterY);
      await graphPO.waitForFrames(3);

      const listener = await graphPO.listenGraphEvents("mouseenter");

      await camera.panWorldPointUnderCursor(
        BLOCK_1.x + BLOCK_1.width / 2,
        BLOCK_1.y + BLOCK_1.height / 2,
        screenCenterX,
        screenCenterY
      );
      await graphPO.waitForFrames(5);

      const enterIds = await listener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(enterIds).toContain(BLOCK_1.id);
    });

    test("should fire mouseleave on block when trackpad pans block away from cursor", async () => {
      const block1 = graphPO.getBlockCOM("block-1");
      const camera = graphPO.getCamera();

      // Hover over block-1 to make it the current GraphLayer target
      await block1.hover({ waitFrames: 3 });
      await graphPO.waitForFrames(3);

      // Move mouse explicitly to block-1 center
      const block1Center = await block1.getWorldCenter();
      const blockScreenPos = await graphPO.page.evaluate(({ wx, wy }) => {
        const [sx, sy] = window.graph.cameraService.getAbsoluteXY(wx, wy);
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        return { x: sx + rect.left, y: sy + rect.top };
      }, { wx: block1Center.x, wy: block1Center.y });

      await graphPO.page.mouse.move(blockScreenPos.x, blockScreenPos.y);
      await graphPO.waitForFrames(2);

      const listener = await graphPO.listenGraphEvents("mouseleave");

      await camera.trackpadPan(400, 0);
      await graphPO.waitForFrames(5);

      const leaveIds = await listener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(leaveIds).toContain(BLOCK_1.id);
    });

    test("should fire mouseenter then mouseleave as trackpad pans block through cursor", async () => {
      const camera = graphPO.getCamera();
      await camera.zoomToCenter();
      await graphPO.waitForFrames(3);

      const canvasBounds = await camera.getCanvasBounds();
      const screenCenterX = canvasBounds.x + canvasBounds.width / 2;
      const screenCenterY = canvasBounds.y + canvasBounds.height / 2;

      await graphPO.page.mouse.move(screenCenterX, screenCenterY);
      await graphPO.waitForFrames(3);

      const enterListener = await graphPO.listenGraphEvents("mouseenter");
      const leaveListener = await graphPO.listenGraphEvents("mouseleave");

      // Phase 1: pan block-1 under cursor → mouseenter
      await camera.panWorldPointUnderCursor(
        BLOCK_1.x + BLOCK_1.width / 2,
        BLOCK_1.y + BLOCK_1.height / 2,
        screenCenterX,
        screenCenterY
      );
      await graphPO.waitForFrames(5);

      // Phase 2: pan camera so block-1 leaves cursor → mouseleave
      await camera.trackpadPan(400, 0);
      await graphPO.waitForFrames(5);

      const enterIds = await enterListener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );
      const leaveIds = await leaveListener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );

      expect(enterIds).toContain(BLOCK_1.id);
      expect(leaveIds).toContain(BLOCK_1.id);
    });

    test("should NOT fire block events when cursor is parked over empty canvas space during pan", async () => {
      const camera = graphPO.getCamera();
      await camera.zoomToCenter();
      await graphPO.waitForFrames(3);

      const canvasBounds = await camera.getCanvasBounds();

      // Park cursor in the top-left corner of the canvas — far from any block
      const emptyAreaX = canvasBounds.x + 10;
      const emptyAreaY = canvasBounds.y + 10;
      await graphPO.page.mouse.move(emptyAreaX, emptyAreaY);
      await graphPO.waitForFrames(3);

      const enterListener = await graphPO.listenGraphEvents("mouseenter");
      const leaveListener = await graphPO.listenGraphEvents("mouseleave");

      // Pan camera — cursor stays over empty space, no block should enter/leave
      await camera.trackpadPan(40, 0);
      await graphPO.waitForFrames(5);

      const enterCount = await enterListener.analyze((events) =>
        events.filter((e) => Boolean(e.detail?.target?.props?.id)).length
      );
      const leaveCount = await leaveListener.analyze((events) =>
        events.filter((e) => Boolean(e.detail?.target?.props?.id)).length
      );

      expect(enterCount).toBe(0);
      expect(leaveCount).toBe(0);
    });

    test("cursor should change to pointer when trackpad pans block under static cursor", async () => {
      const camera = graphPO.getCamera();
      await camera.zoomToCenter();
      await graphPO.waitForFrames(3);

      const canvasBounds = await camera.getCanvasBounds();
      const screenCenterX = canvasBounds.x + canvasBounds.width / 2;
      const screenCenterY = canvasBounds.y + canvasBounds.height / 2;

      await graphPO.page.mouse.move(screenCenterX, screenCenterY);
      await graphPO.waitForFrames(3);

      const cursorBefore = await graphPO.getCursor();
      expect(cursorBefore).toBe("auto");

      await camera.panWorldPointUnderCursor(
        BLOCK_1.x + BLOCK_1.width / 2,
        BLOCK_1.y + BLOCK_1.height / 2,
        screenCenterX,
        screenCenterY
      );

      // Wait for cursor layer debounce to settle
      await graphPO.waitForFrames(10);

      const cursorAfter = await graphPO.getCursor();
      expect(cursorAfter).toBe("pointer");
    });

    test("cursor should revert to auto when trackpad pans block away from cursor", async () => {
      const block1 = graphPO.getBlockCOM("block-1");
      const camera = graphPO.getCamera();

      // Hover over block-1 → cursor becomes pointer
      await block1.hover({ waitFrames: 3 });
      await graphPO.waitForFrames(5);

      const cursorOnBlock = await graphPO.getCursor();
      expect(cursorOnBlock).toBe("pointer");

      // Trackpad-pan block-1 far away from cursor
      await camera.trackpadPan(400, 0);

      // Wait for cursor layer debounce
      await graphPO.waitForFrames(10);

      const cursorAfterPan = await graphPO.getCursor();
      expect(cursorAfterPan).toBe("auto");
    });

    test("should correctly switch hover when trackpad pans from block-1 to block-2", async () => {
      const camera = graphPO.getCamera();
      await camera.zoomToCenter();
      await graphPO.waitForFrames(3);

      const canvasBounds = await camera.getCanvasBounds();
      const screenCenterX = canvasBounds.x + canvasBounds.width / 2;
      const screenCenterY = canvasBounds.y + canvasBounds.height / 2;

      await graphPO.page.mouse.move(screenCenterX, screenCenterY);
      await graphPO.waitForFrames(3);

      const enterListener = await graphPO.listenGraphEvents("mouseenter");
      const leaveListener = await graphPO.listenGraphEvents("mouseleave");

      // Pan block-1 under cursor
      await camera.panWorldPointUnderCursor(
        BLOCK_1.x + BLOCK_1.width / 2,
        BLOCK_1.y + BLOCK_1.height / 2,
        screenCenterX,
        screenCenterY
      );
      await graphPO.waitForFrames(5);

      // Pan block-2 under cursor (block-1 leaves, block-2 enters)
      await camera.panWorldPointUnderCursor(
        BLOCK_2.x + BLOCK_2.width / 2,
        BLOCK_2.y + BLOCK_2.height / 2,
        screenCenterX,
        screenCenterY
      );
      await graphPO.waitForFrames(5);

      const enterIds = await enterListener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );
      const leaveIds = await leaveListener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );

      expect(enterIds).toContain(BLOCK_1.id);
      expect(enterIds).toContain(BLOCK_2.id);
      expect(leaveIds).toContain(BLOCK_1.id);
    });

    test("should fire mouseenter when pinch-zoom brings block under cursor", async () => {
      const camera = graphPO.getCamera();

      // Zoom out so block-1 is too small to be hit-tested
      await camera.zoomToScale(0.05);
      await graphPO.waitForFrames(3);

      // Move mouse over block-1's screen position to establish canvas coordinates
      const block1 = graphPO.getBlockCOM("block-1");
      const block1Center = await block1.getWorldCenter();
      await graphPO.hover(block1Center.x, block1Center.y, { waitFrames: 3 });

      const listener = await graphPO.listenGraphEvents("mouseenter");

      // Position mouse over block-1's screen position before zooming
      const mouseScreenPos = await graphPO.page.evaluate(() => {
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        const geo = window.graph.blocks.getBlockState("block-1")!.$geometry.value;
        const [sx, sy] = window.graph.cameraService.getAbsoluteXY(
          geo.x + geo.width / 2,
          geo.y + geo.height / 2
        );
        return { x: sx + rect.left, y: sy + rect.top };
      });

      await graphPO.page.mouse.move(mouseScreenPos.x, mouseScreenPos.y);

      // Zoom in 25 steps — block-1 grows until it covers the cursor hit area
      for (let i = 0; i < 25; i++) {
        await graphPO.page.mouse.wheel(0, -100);
        await graphPO.waitForFrames(1);
      }
      await graphPO.waitForFrames(5);

      const enterIds = await listener.analyze((events) =>
        events.map((e) => e.detail?.target?.props?.id).filter(Boolean)
      );
      expect(enterIds).toContain(BLOCK_1.id);
    });
  });
});

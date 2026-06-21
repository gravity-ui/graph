import { test, expect } from "@playwright/test";
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

/**
 * Verifies camera routing for resolved wheel intent together with `MOUSE_WHEEL_BEHAVIOR`.
 *
 * We **simulate** intent in the page via `setResolveWheelIntentOverride` — this does
 * **not** validate how real browsers or vendors emit wheel events; it only checks that
 * Camera pan/zoom actions match the resolved intent.
 */
test.describe("MOUSE_WHEEL_BEHAVIOR for simulated wheel intents", () => {
  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [BLOCK],
      connections: [],
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
      },
    });
  });

  test("simulated zoom intent: vertical wheel changes scale", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);

    // Room below max scale so zoom-in can increase scale (same pattern as camera-control.spec).
    await camera.emulateZoom(300);
    await graphPO.waitForFrames(2);

    await camera.setResolveWheelIntentOverride("zoom");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeGreaterThan(before.scale);
  });

  test("simulated pan intent: vertical wheel pans (scale unchanged)", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);

    await camera.setResolveWheelIntentOverride("pan");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeCloseTo(before.scale, 10);
  });

  test("simulated zoom intent + MOUSE_WHEEL_BEHAVIOR scroll: override pan still pans", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);

    await graphPO.page.evaluate(() => {
      window.graph.setConstants({
        camera: { MOUSE_WHEEL_BEHAVIOR: "scroll" },
      });
    });

    await camera.setResolveWheelIntentOverride("pan");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeCloseTo(before.scale, 10);
  });

  test("simulated pan intent survives unrelated setConstants update", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);
    await camera.emulateZoom(300);
    await graphPO.waitForFrames(2);

    await graphPO.page.evaluate(() => {
      window.graph.setConstants({
        camera: { MOUSE_WHEEL_BEHAVIOR: "scroll" },
      });

      // Reproduces user flow: later partial constants update in another namespace.
      window.graph.setConstants({
        block: { WIDTH: 220 },
      });
    });

    await camera.setResolveWheelIntentOverride("pan");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeCloseTo(before.scale, 10);
  });
});

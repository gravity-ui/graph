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
 * Verifies `MOUSE_WHEEL_BEHAVIOR` (zoom vs scroll) together with the outcome of
 * `resolveWheelDevice` (trackpad vs mouse routing).
 *
 * We **simulate** device kind in the page via `setResolveWheelDeviceOverride` — this does
 * **not** validate how real browsers or vendors emit wheel events; it only checks that
 * camera routing matches the resolved device kind and `MOUSE_WHEEL_BEHAVIOR`.
 */
test.describe("MOUSE_WHEEL_BEHAVIOR for simulated wheel device kinds", () => {
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

  test("simulated mouse + MOUSE_WHEEL_BEHAVIOR zoom: vertical wheel changes scale", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);

    // Room below max scale so zoom-in can increase scale (same pattern as camera-control.spec).
    await camera.emulateZoom(300);
    await graphPO.waitForFrames(2);

    await camera.setResolveWheelDeviceOverride("mouse");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeGreaterThan(before.scale);
  });

  test("simulated trackpad: vertical wheel pans (scale unchanged)", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);

    await camera.setResolveWheelDeviceOverride("trackpad");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeCloseTo(before.scale, 10);
  });

  test("simulated mouse + MOUSE_WHEEL_BEHAVIOR scroll: vertical wheel pans (scale unchanged)", async () => {
    const camera = graphPO.getCamera();
    await camera.zoomToCenter();
    await graphPO.waitForFrames(3);

    await graphPO.page.evaluate(() => {
      window.graph.setConstants({
        camera: { MOUSE_WHEEL_BEHAVIOR: "scroll" },
      });
    });

    await camera.setResolveWheelDeviceOverride("mouse");

    const before = await camera.getState();
    await camera.emulateZoom(-100);
    const after = await camera.getState();

    expect(after.scale).toBeCloseTo(before.scale, 10);
  });
});

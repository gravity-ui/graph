import { GraphCameraPO } from "../../src/playwright";
import type { GraphPageObject } from "./GraphPageObject";

let cameraSignalListenerId = 0;

/**
 * Compatibility name used by the existing e2e suite. Common camera operations
 * come from the public GraphCameraPO; browser-device emulation stays test-only.
 */
export class GraphCameraComponentObject extends GraphCameraPO {
  constructor(private readonly graphPO: GraphPageObject) {
    super(graphPO);
  }

  private get page() {
    return this.graphPO.page;
  }

  /** Returns the committed state exposed by the library's camera signal. */
  async getSignalSnapshot(): Promise<{ x: number; y: number; scale: number }> {
    return this.graphPO.evaluate((graph) => {
      const { x, y, scale } = graph.$camera.value;
      return { x, y, scale };
    });
  }

  /**
   * Collects committed camera signal updates for library-internal assertions.
   * The public camera PO deliberately exposes only current camera state.
   */
  async collectSignalUpdates(): Promise<() => Promise<Array<{ x: number; y: number; scale: number }>>> {
    const key = `__cameraSignal_${cameraSignalListenerId++}`;

    await this.page.evaluate((storageKey) => {
      (window as any)[storageKey] = [];
      (window as any)[`${storageKey}_unsub`] = window.graph.$camera.subscribe((state) => {
        (window as any)[storageKey].push({ x: state.x, y: state.y, scale: state.scale });
      });
    }, key);

    return async () => {
      const json = await this.page.evaluate((storageKey) => {
        return JSON.stringify((window as any)[storageKey] ?? []);
      }, key);
      return JSON.parse(json) as Array<{ x: number; y: number; scale: number }>;
    };
  }

  /**
   * Forces `resolveWheelIntent` on graph settings for e2e.
   * Simulates a wheel intent (`pan` | `zoom`) in the page; it does not assert
   * real browser/vendor wheel payloads. Playwright cannot serialize functions from Node.
   */
  async setResolveWheelIntentOverride(intent: "pan" | "zoom"): Promise<void> {
    await this.page.evaluate((k) => {
      const { EWheelIntent } = window.GraphModule;
      window.graph.updateSettings({
        resolveWheelIntent: () => (k === "pan" ? EWheelIntent.Pan : EWheelIntent.Zoom),
      });
    }, intent);
  }

  /**
   * Emulate zoom with mouse wheel
   * @param deltaY - Positive = zoom out, Negative = zoom in
   * @param position - Optional position to zoom at (defaults to canvas center)
   */
  async emulateZoom(deltaY: number, position?: { x: number; y: number }): Promise<void> {
    const canvasBounds = await this.getBounds();

    // Use provided position or default to canvas center
    const mouseX = position?.x ?? canvasBounds.x + canvasBounds.width / 2;
    const mouseY = position?.y ?? canvasBounds.y + canvasBounds.height / 2;

    await this.page.mouse.move(mouseX, mouseY);

    // Playwright mouse.wheel() emits integer PIXEL deltas, which resolveWheelIntent
    // classifies as trackpad pan. LINE-mode events match a mechanical mouse wheel (I4 → zoom).
    const lineDeltaY = Math.max(1, Math.round(Math.abs(deltaY) / 16)) * (deltaY >= 0 ? 1 : -1);

    await this.page.evaluate(
      ({ lineDeltaY, mouseX, mouseY }) => {
        const root = document.getElementById("root");
        if (!root) {
          throw new Error("Graph root element not found");
        }

        root.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX: 0,
            deltaY: lineDeltaY,
            deltaMode: WheelEvent.DOM_DELTA_LINE,
            clientX: mouseX,
            clientY: mouseY,
            bubbles: true,
            cancelable: true,
          })
        );
      },
      { lineDeltaY, mouseX, mouseY }
    );

    // Wait for zoom to be processed
    await this.graphPO.waitForFrames(3);
  }

  /**
   * Pan the camera via trackpad wheel events so that the given world point ends up
   * under the mouse cursor.
   *
   * Camera pan handler applies move(-deltaX, -deltaY) via PAN_SPEED, so to shift the camera by
   * (dx, dy) screen pixels we pass wheel(dx, dy) directly. A non-zero deltaX helps
   * resolveWheelIntent classify as pan (horizontal scroll signal).
   *
   * Fires multiple small steps (≤8 px) to stay within Camera's edge-guard limits.
   *
   * @param worldX - Target world X coordinate to bring under cursor
   * @param worldY - Target world Y coordinate to bring under cursor
   * @param viewportX - Cursor viewport X (defaults to canvas center)
   * @param viewportY - Cursor viewport Y (defaults to canvas center)
   */
  async panWorldPointUnderCursor(
    worldX: number,
    worldY: number,
    viewportX?: number,
    viewportY?: number
  ): Promise<void> {
    const canvasBounds = await this.getBounds();
    const vx = viewportX ?? canvasBounds.x + canvasBounds.width / 2;
    const vy = viewportY ?? canvasBounds.y + canvasBounds.height / 2;

    const delta = await this.page.evaluate(
      ({ wx, wy, vx, vy }) => {
        const canvas = window.graph.getGraphCanvas();
        const rect = canvas.getBoundingClientRect();
        const [currentWX, currentWY] = window.graph.cameraService.getRelativeXY(vx - rect.left, vy - rect.top);
        const { scale } = window.graph.cameraService.getCameraState();
        return {
          dx: (wx - currentWX) * scale,
          dy: (wy - currentWY) * scale,
        };
      },
      { wx: worldX, wy: worldY, vx, vy }
    );

    await this.page.mouse.move(vx, vy);

    const STEP = 8;
    const steps = Math.ceil(Math.max(Math.abs(delta.dx), Math.abs(delta.dy)) / STEP);
    const stepDx = steps > 0 ? delta.dx / steps : 0;
    const stepDy = steps > 0 ? delta.dy / steps : 0;

    for (let i = 0; i < steps; i++) {
      const wheelDx = stepDx !== 0 ? stepDx : 0.1;
      await this.page.mouse.wheel(wheelDx, stepDy);
      await this.graphPO.waitForFrames(1);
    }
  }

  /**
   * Pan the camera via trackpad wheel events by the given screen-pixel amount.
   * Positive dx moves content to the left (camera right), positive dy moves content up.
   * Mouse must already be positioned on the canvas before calling.
   *
   * @param dx - Horizontal pan amount in screen pixels
   * @param dy - Vertical pan amount in screen pixels
   */
  async trackpadPan(dx: number, dy: number): Promise<void> {
    const STEP = 8;
    const totalSteps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / STEP);
    const stepDx = totalSteps > 0 ? dx / totalSteps : 0;
    const stepDy = totalSteps > 0 ? dy / totalSteps : 0;

    for (let moved = 0; moved < totalSteps; moved++) {
      const wheelDx = stepDx !== 0 ? -stepDx : -0.1;
      await this.page.mouse.wheel(wheelDx, -stepDy);
      await this.graphPO.waitForFrames(1);
    }
  }

  /**
   * Emulate camera pan with mouse drag
   * @param deltaX - Horizontal drag distance in pixels
   * @param deltaY - Vertical drag distance in pixels
   * @param startPosition - Optional start position (defaults to canvas center)
   */
  async emulatePan(deltaX: number, deltaY: number, startPosition?: { x: number; y: number }): Promise<void> {
    // Temporarily disable block dragging to prevent accidentally dragging blocks
    const previousCanDrag = await this.page.evaluate(() => {
      const currentSetting = window.graph.rootStore.settings.$canDrag.value;
      window.graph.updateSettings({ canDrag: window.GraphModule.ECanDrag.NONE });
      return currentSetting;
    });

    const canvasBounds = await this.getBounds();

    // Use provided position or default to canvas center
    const startX = startPosition?.x ?? canvasBounds.x + canvasBounds.width / 2;
    const startY = startPosition?.y ?? canvasBounds.y + canvasBounds.height / 2;

    // Perform drag operation
    await this.page.mouse.move(startX, startY);
    await this.graphPO.waitForFrames(1);

    await this.page.mouse.down();
    await this.graphPO.waitForFrames(1);

    await this.page.mouse.move(startX + deltaX, startY + deltaY, {
      steps: 10,
    });
    await this.graphPO.waitForFrames(2);

    await this.page.mouse.up();
    await this.graphPO.waitForFrames(2);

    // Restore previous canDrag setting
    await this.page.evaluate((canDrag) => {
      window.graph.updateSettings({ canDrag });
    }, previousCanDrag);
  }
}

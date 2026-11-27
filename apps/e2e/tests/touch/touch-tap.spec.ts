import { test, expect } from "@playwright/test";
import { GraphPageObject } from "../../page-objects/GraphPageObject";

const BLOCK_1 = {
  id: "block-1",
  is: "Block" as const,
  x: 200,
  y: 200,
  width: 200,
  height: 100,
  name: "Block 1",
  anchors: [],
};

/**
 * Regression test for https://github.com/gravity-ui/graph/issues/265
 *
 * The former touchend handler read coordinates from an empty touches array when the finger lifted.
 */
test.describe("Touch tap", () => {
  test.use({ hasTouch: true });

  let graphPO: GraphPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    await graphPO.initialize({
      blocks: [BLOCK_1],
      connections: [],
    });
  });

  test("releasing a tap on the canvas completes without a coordinate error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    // Get screen coordinates of the block center
    const { viewportX, viewportY } = await page.evaluate(() => {
      const geo = window.graph.blocks.getBlockState("block-1")!.$geometry.value;
      const [sx, sy] = window.graph.cameraService.getAbsoluteXY(geo.x + geo.width / 2, geo.y + geo.height / 2);
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        viewportX: sx + rect.left,
        viewportY: sy + rect.top,
      };
    });

    await page.touchscreen.tap(viewportX, viewportY);
    await graphPO.waitForFrames(3);

    expect(errors).toHaveLength(0);
  });

  test("pairs native taps across contact IDs and suppresses activation after a longpress", async ({ page }) => {
    const probe = await page.evaluateHandle(() => {
      const graph = window.graph;
      graph.updateSettings({ touchPolicy: "editor", longPressDuration: 80, doubleClickInterval: 2000 });
      const events: string[] = [];
      const ids: number[] = [];
      graph.on("click", ({ event, type }) => {
        events.push(type);
        ids.push(event.pointerId);
      });
      graph.on("dblclick", ({ type }) => events.push(type));
      graph.on("longpress", ({ type }) => events.push(type));
      return { events, ids };
    });
    await page.touchscreen.tap(50, 50);
    expect((await probe.jsonValue()).events).toEqual(["click"]);
    await page.touchscreen.tap(50, 50);
    const taps = await probe.jsonValue();
    expect(taps.events).toEqual(["click", "click", "dblclick"]);
    expect(new Set(taps.ids).size).toBe(2);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 3, x: 50, y: 50 }] });
    await expect.poll(async () => (await probe.jsonValue()).events.at(-1)).toBe("longpress");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await graphPO.waitForFrames(1);
    expect((await probe.jsonValue()).events).toEqual(["click", "click", "dblclick", "longpress"]);
  });

  test("holding the scene suppresses DOM selection while editable and surrounding text stays selectable", async ({
    page,
  }) => {
    const holds = await page.evaluateHandle(() => {
      const graph = window.graph;
      graph.updateSettings({ touchPolicy: "editor" });
      const events: string[] = [];
      graph.on("longpress", ({ type }) => events.push(type));
      const root = document.querySelector<HTMLElement>("#root")!;
      for (const [i, id] of ["scene-label", "editor", "outside"].entries()) {
        const el = document.createElement("span");
        el.id = id;
        el.textContent = "Example";
        el.style.cssText = `position:fixed;left:20px;top:${20 + i * 50}px;z-index:10000`;
        if (id === "editor") el.contentEditable = "true";
        (id === "outside" ? document.body : root).appendChild(el);
      }
      return events;
    });
    const cdp = await page.context().newCDPSession(page);
    const selectedText = () => page.evaluate(() => window.getSelection()?.toString());
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 35, y: 28 }] });
    await expect.poll(() => holds.jsonValue()).toEqual(["longpress"]);
    expect(await selectedText()).toBe("");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    // Desktop emulation does not draw the mobile OS selection handles. Exercise native word selection directly.
    await page.locator("#scene-label").dblclick();
    expect(await selectedText()).toBe("");
    for (const id of ["editor", "outside"]) {
      await page.locator(`#${id}`).dblclick();
      expect(await selectedText()).toBe("Example");
    }
  });

  test("should select block on touch tap", async ({ page }) => {
    const { viewportX, viewportY } = await page.evaluate(() => {
      const geo = window.graph.blocks.getBlockState("block-1")!.$geometry.value;
      const [sx, sy] = window.graph.cameraService.getAbsoluteXY(geo.x + geo.width / 2, geo.y + geo.height / 2);
      const canvas = window.graph.getGraphCanvas();
      const rect = canvas.getBoundingClientRect();
      return {
        viewportX: sx + rect.left,
        viewportY: sy + rect.top,
      };
    });

    await page.touchscreen.tap(viewportX, viewportY);
    await graphPO.waitForFrames(3);

    const isSelected = await page.evaluate(() => {
      return window.graph.blocks.getBlockState("block-1")?.selected ?? false;
    });

    expect(isSelected).toBe(true);
  });
});

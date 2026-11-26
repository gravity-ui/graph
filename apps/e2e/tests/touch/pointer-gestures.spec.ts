import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { ConnectionEditingPageObject } from "../connection-editing/ConnectionEditingPageObject";

type Point = { x: number; y: number };
test.use({ hasTouch: true });

// Send only the changed contact so touchEnd releases that finger while the other stays down.
function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", id: number, point: Point) {
  return cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ id, ...point }] });
}

async function editor(page: Page, touchPolicy: "editor" | "page" | "default" = "default") {
  const graph = new GraphPageObject(page);
  await graph.initialize({
    blocks: [
      {
        id: "source",
        is: "Block",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        name: "Source",
        anchors: [
          { id: "out", blockId: "source", type: "OUT" },
          { id: "in", blockId: "source", type: "IN" },
        ],
      },
      {
        id: "target",
        is: "Block",
        x: 480,
        y: 0,
        width: 200,
        height: 100,
        name: "Target",
        anchors: [{ id: "in", blockId: "target", type: "IN" }],
      },
    ],
    settings: {
      ...(touchPolicy === "default" ? {} : { touchPolicy }),
      useBlocksAnchors: true,
      dragThreshold: 5,
      canDrag: { default: "all", touch: "onlySelected" },
    },
  });
  await graph.evaluate((g) => g.cameraService.set({ x: 150, y: 280, scale: 0.5 }));
  const layer = new ConnectionEditingPageObject(page, graph);
  await layer.addLayer();
  await layer.recordEvents();
  const source = await layer.toViewport(await layer.getAnchorPoint("source", "out"));
  const target = await layer.toViewport(await layer.getAnchorPoint("target", "in"));
  const cdp = await page.context().newCDPSession(page);
  const trace = await page.evaluateHandle(() => {
    const g = window.graph;
    const block = g.blocks.getBlockState("source")!.getViewComponent();
    const log = {
      clicks: 0,
      hits: 0,
      commits: 0,
      downs: [] as number[],
      pinches: [] as {
        phase: string;
        target: string;
        ids: number[];
        trusted: boolean;
        center: Point;
        distance: number;
      }[],
    };
    document.addEventListener("pointerdown", (e) => log.downs.push(e.pointerId), true);
    g.$camera.subscribe(() => log.commits++);
    g.on("click", () => log.clicks++);
    g.on("pinch", (event) => {
      log.pinches.push({
        phase: event.phase,
        target: event.target === g ? "graph" : event.target === block ? "source" : "other",
        ids: event.pointers.map((p) => p.pointerId),
        trusted: event.event.isTrusted,
        center: event.point.canvas,
        distance: event.distance,
      });
    });
    g.getElementOverPoint = new Proxy(g.getElementOverPoint, {
      apply(method, receiver, args) {
        log.hits++;
        return Reflect.apply(method, receiver, args);
      },
    });
    return log;
  });
  return { graph, layer, source, target, cdp, trace };
}

test("touch pans over an unselected block and drags it after a tap while a mouse drags directly", async ({ page }) => {
  const { graph, layer, cdp } = await editor(page);
  const block = () =>
    graph.evaluate((g) => {
      const state = g.blocks.getBlockState("source")!;
      return { x: state.x, y: state.y, selected: state.selected };
    });
  const swipe = async (from: Point) => {
    const to = { x: from.x + 30, y: from.y + 10 };
    await touch(cdp, "touchStart", 1, from);
    await touch(cdp, "touchMove", 1, to);
    await touch(cdp, "touchEnd", 1, to);
  };
  const center = () => layer.toViewport({ x: 100, y: 50 });
  const initial = await graph.camera().getState();
  await swipe(await center());
  const panned = await graph.camera().getState();
  expect(panned).toMatchObject({ x: initial.x + 30, y: initial.y + 10, scale: initial.scale });
  expect(await block()).toEqual({ x: 0, y: 0, selected: false });

  const at = await center();
  await page.touchscreen.tap(at.x, at.y);
  expect(await block()).toMatchObject({ selected: true });
  await swipe(at);
  expect(await block()).toEqual({ x: 60, y: 20, selected: true });
  expect(await graph.camera().getState()).toEqual(panned);

  const other = await layer.toViewport({ x: 580, y: 50 });
  await page.mouse.move(other.x, other.y);
  await page.mouse.down();
  await page.mouse.move(other.x + 30, other.y + 10);
  await page.mouse.up();
  expect(await graph.evaluate((g) => g.blocks.getBlock("target"))).toMatchObject({ x: 540, y: 20 });
  expect(await graph.camera().getState()).toEqual(panned);
});

for (const liftFirst of [1, 2]) {
  test(`a second touch before the port drag starts pinches, then finger ${3 - liftFirst} pans without a jump`, async ({
    page,
  }) => {
    const { graph, layer, source, target, cdp, trace } = await editor(page);
    const a = { x: source.x + 4, y: source.y };
    const b = { x: target.x + 42, y: target.y + 16 };
    await touch(cdp, "touchStart", 1, source);
    await touch(cdp, "touchMove", 1, a);
    const before = await graph.camera().getState();
    await touch(cdp, "touchStart", 2, target);
    expect(await graph.camera().getState()).toEqual(before);
    const count = await trace.evaluate((log) => log.commits);
    await touch(cdp, "touchMove", 2, b);
    const zoomed = await graph.camera().getState();
    const startDistance = Math.hypot(target.x - a.x, target.y - a.y);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const worldX = ((a.x + target.x) / 2 - before.x) / before.scale;
    const worldY = ((a.y + target.y) / 2 - before.y) / before.scale;
    expect(zoomed.scale).toBeCloseTo((before.scale * distance) / startDistance, 5);
    expect(zoomed.x + worldX * zoomed.scale).toBeCloseTo((a.x + b.x) / 2, 2);
    expect(zoomed.y + worldY * zoomed.scale).toBeCloseTo((a.y + b.y) / 2, 2);
    expect(await trace.evaluate((log) => log.commits)).toBe(count + 1);

    await touch(cdp, "touchEnd", liftFirst, liftFirst === 1 ? a : b);
    expect(await graph.camera().getState()).toEqual(zoomed);
    const remaining = liftFirst === 1 ? b : a;
    const end = { x: remaining.x + 2, y: remaining.y };
    await touch(cdp, "touchMove", 3 - liftFirst, end);
    await touch(cdp, "touchEnd", 3 - liftFirst, end);
    expect(await graph.camera().getState()).toMatchObject({ x: zoomed.x + 2, y: zoomed.y, scale: zoomed.scale });
    const { downs, pinches, clicks } = await trace.jsonValue();
    expect(new Set(downs).size).toBe(2);
    expect(pinches.map(({ phase }) => phase)).toEqual(["start", "update", "end"]);
    for (const pinch of pinches) expect(pinch).toMatchObject({ target: "graph", ids: downs, trusted: true });
    expect(pinches[1].distance).toBeCloseTo(distance, 2);
    expect(pinches[1].center.x).toBeCloseTo((a.x + b.x) / 2, 2);
    expect(clicks).toBe(0);
    expect(await layer.getEventTypes()).toEqual([]);
    expect(await graph.getConnections()).toEqual([]);
  });
}

test("pinch retraces the capped scale and resumes from the committed camera after a veto", async ({ page }) => {
  const { graph, cdp } = await editor(page);
  const y = 420;
  const moveSecond = async (x: number) => {
    await touch(cdp, "touchMove", 2, { x, y });
    await graph.waitForFrames(1);
    return graph.camera().getState();
  };
  const initial = await graph.camera().getState();
  await touch(cdp, "touchStart", 1, { x: 50, y });
  await touch(cdp, "touchStart", 2, { x: 150, y });
  expect((await moveSecond(450)).scale).toBe(1);
  expect((await moveSecond(350)).scale).toBe(1);
  expect(await moveSecond(150)).toEqual(initial);

  await graph.evaluate((g) => {
    g.on("camera-change", (event) => event.preventDefault(), { once: true });
  });
  expect(await moveSecond(250)).toEqual(initial);
  const accepted = await moveSecond(252);
  expect(accepted.scale).toBeCloseTo(0.505, 5);
  // The midpoint was 150 at the veto and moved to 151. Only the final two pixels contribute.
  const anchor = (150 - initial.x) / initial.scale;
  expect(accepted.x + anchor * accepted.scale).toBeCloseTo(151, 2);
  await touch(cdp, "touchEnd", 2, { x: 252, y });
  await touch(cdp, "touchEnd", 1, { x: 50, y });
});

test("a captured port ignores a second finger through the owner's drop and the second lift", async ({ page }) => {
  const { graph, layer, source, target, cdp, trace } = await editor(page);
  await touch(cdp, "touchStart", 1, source);
  await touch(cdp, "touchMove", 1, { x: source.x + 14, y: source.y });
  const events = await layer.getEventTypes();
  expect(events).toContain("connection-create-start");
  const hits = await trace.evaluate((log) => log.hits);
  await touch(cdp, "touchStart", 2, target);
  const other = { x: target.x, y: target.y + 30 };
  await touch(cdp, "touchMove", 2, other);
  expect(await trace.evaluate((log) => log.hits)).toBe(hits);
  expect(await layer.getEventTypes()).toEqual(events);

  await touch(cdp, "touchMove", 1, target);
  await touch(cdp, "touchEnd", 1, target);
  const dropped = await layer.getEventTypes();
  expect(dropped.slice(-2)).toEqual(["connection-created", "connection-create-drop"]);
  expect(await graph.getConnections()).toMatchObject([{ sourceAnchorId: "out", targetAnchorId: "in" }]);
  const after = await trace.evaluate((log) => log.hits);
  await touch(cdp, "touchMove", 2, target);
  await touch(cdp, "touchEnd", 2, target);
  expect(await trace.jsonValue()).toMatchObject({ hits: after, clicks: 0, pinches: [] });
  expect(await layer.getEventTypes()).toEqual(dropped);
});

test("a captured background pan joins pinch and ignores extra touch and pen contacts", async ({ page }) => {
  const { graph, cdp, trace } = await editor(page);
  const origin = { x: 60, y: 420 };
  const first = { x: 90, y: 420 };
  const second = { x: 170, y: 420 };
  const initial = await graph.camera().getState();
  await touch(cdp, "touchStart", 1, origin);
  await touch(cdp, "touchMove", 1, first);
  const panned = await graph.camera().getState();
  expect(panned.x).toBe(initial.x + 30);
  await touch(cdp, "touchStart", 2, second);
  expect(await graph.camera().getState()).toEqual(panned);
  const hits = await trace.evaluate((log) => log.hits);
  const extra = { x: 300, y: 450 };
  await touch(cdp, "touchStart", 3, extra);
  await touch(cdp, "touchMove", 3, { x: extra.x + 25, y: extra.y });
  await touch(cdp, "touchEnd", 3, { x: extra.x + 25, y: extra.y });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...extra,
    pointerType: "pen",
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: extra.x + 15,
    y: extra.y,
    pointerType: "pen",
    buttons: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: extra.x + 15,
    y: extra.y,
    pointerType: "pen",
    button: "left",
    clickCount: 1,
  });
  expect(await trace.evaluate((log) => log.hits)).toBe(hits);
  expect(await graph.camera().getState()).toEqual(panned);

  const moved = { x: first.x - 20, y: first.y };
  await touch(cdp, "touchMove", 1, moved);
  await expect.poll(async () => (await graph.camera().getState()).scale).toBeCloseTo(panned.scale * 1.25, 5);
  await touch(cdp, "touchEnd", 1, moved);
  await touch(cdp, "touchEnd", 2, second);
  const log = await trace.jsonValue();
  expect(new Set(log.downs).size).toBe(4);
  expect(log.pinches.map((event) => event.phase)).toEqual(["start", "update", "end"]);
  expect(log.clicks).toBe(0);
});

test("a common block can veto the default camera and still receive the entire pinch", async ({ page }) => {
  const { graph, layer, source, cdp, trace } = await editor(page);
  const other = await layer.toViewport(await layer.getAnchorPoint("source", "in"));
  const phases = await page.evaluateHandle(() => {
    const seen: string[] = [];
    window.graph.blocks
      .getBlockState("source")!
      .getViewComponent()!
      .on("pinch", (event) => {
        seen.push(event.phase);
        if (event.phase === "start") event.preventDefault();
      });
    return seen;
  });
  const initial = await graph.camera().getState();
  await touch(cdp, "touchStart", 1, source);
  await touch(cdp, "touchStart", 2, other);
  const end = { x: other.x - 25, y: other.y };
  await touch(cdp, "touchMove", 2, end);
  await touch(cdp, "touchEnd", 2, end);
  await touch(cdp, "touchEnd", 1, source);
  expect(await phases.jsonValue()).toEqual(["start", "update", "end"]);
  expect((await trace.jsonValue()).pinches.map((event) => event.target)).toEqual(["source", "source", "source"]);
  expect(await graph.camera().getState()).toEqual(initial);
  expect(await layer.getEventTypes()).toEqual([]);
});

for (const policy of ["default", "page", "editor"] as const) {
  test(`a vertical swipe in ${policy} mode moves its owner`, async ({ page }) => {
    const { graph, layer, source, cdp } = await editor(page, policy);
    await page.addStyleTag({ content: "body { overflow: auto; min-height: 220vh; } #root { height: 70vh; }" });
    await graph.waitForFrames(3);
    const initial = await graph.camera().getState();
    // Start on a port in the embedded graph to verify that page scrolling cannot start a connection.
    const from =
      policy === "page"
        ? await layer.toViewport(await layer.getAnchorPoint("source", "out"))
        : { x: 50, y: source.y };
    await touch(cdp, "touchStart", 1, from);
    for (const offset of [20, 40, 80, 120]) {
      await touch(cdp, "touchMove", 1, { x: from.x, y: from.y - offset });
    }
    await touch(cdp, "touchEnd", 1, { x: from.x, y: from.y - 120 });
    if (policy === "page") {
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
      expect(await graph.camera().getState()).toEqual(initial);
    } else {
      expect(await graph.camera().getState()).toMatchObject({ x: initial.x, y: initial.y - 120, scale: initial.scale });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    expect(await layer.getEventTypes()).toEqual([]);
  });
}

for (const policy of ["default", "page", "editor"] as const) {
  test(`a minimap swipe follows the ${policy} touch policy and a tap navigates`, async ({ page }) => {
    const { graph, cdp } = await editor(page, policy);
    await page.addStyleTag({ content: "body { overflow: auto; min-height: 220vh; } #root { height: 70vh; }" });
    await page.evaluate(() => {
      window.graph.addLayer(window.GraphModule.MiniMapLayer, { location: "topLeft", width: 240, height: 180 });
    });
    const map = page.locator("canvas.graph-minimap");
    const box = await map.boundingBox();
    if (!box) throw new Error("Missing minimap");
    await graph.waitForFrames(3);
    const initial = await graph.camera().getState();
    const from = { x: box.x + 30, y: box.y + 150 };
    await touch(cdp, "touchStart", 1, from);
    const afterDown = await graph.camera().getState();
    for (const offset of [20, 40, 80, 120]) {
      await touch(cdp, "touchMove", 1, { x: from.x, y: from.y - offset });
    }
    await touch(cdp, "touchEnd", 1, { x: from.x, y: from.y - 120 });
    const afterSwipe = await graph.camera().getState();
    if (policy === "page") {
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
      expect(afterDown).toEqual(initial);
      expect(afterSwipe).toEqual(initial);
    } else {
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(afterSwipe).not.toEqual(afterDown);
    }
    await map.tap({ position: { x: 200, y: 120 } });
    expect(await graph.camera().getState()).not.toEqual(afterSwipe);
  });
}

import type { TBlock } from "@gravity-ui/graph";
import { Page, expect, test } from "@playwright/test";

import { GraphPageObject } from "../../page-objects/GraphPageObject";
import { MiniMapPageObject } from "./MiniMapPageObject";

/**
 * D6: the minimap draws its picture at most about once per 100 ms of the scene clock for every continuous change of
 * what it shows (block elements, the list, pointer drags, the usable rect). A change after a quiet period is drawn in
 * the next frame; a sooner change waits 100 ms from its arrival, and the changes meanwhile are drawn with it.
 *
 * These tests drive the scene clock themselves: every graph frame advances it by `dt` (10 ms unless a test says
 * otherwise), whatever the real frame rate, so their bounds hold on any machine.
 */
const PERIOD_MS = 100;
const DT_MS = 10;
/** Frames that cover a settled picture and a whole quiet period after it, on the driven clock. */
const QUIET_FRAMES = 25;

const block = (id: string, x: number, y: number): TBlock => ({
  id,
  is: "Block",
  x,
  y,
  width: 200,
  height: 100,
  name: id,
  anchors: [],
});

/** One minimap picture: the driven clock and frame when it was drawn, and the x of each block element it drew. */
type TPicture = { clock: number; frame: number; x: Record<string, number> };
type TThrottleWindow = {
  pictures: TPicture[];
  /** Graph frames that ended since the setup. */
  frame: number;
  /** The driven scene clock (ms) and its step per frame. */
  clock: number;
  dt: number;
  /** Listeners registered through `graph.scene.onFrameEnd` and not removed yet. */
  frameEndListeners: number;
  /** Calls `step(i)` at the end of each graph frame, i = 1, 2, ..., until it returns a value. */
  eachFrame<T>(step: (i: number) => T | undefined): Promise<T>;
};

const xOf = (picture: TPicture, id: string): number | undefined => picture.x[`block\u0000${id}`];

/** The gaps between consecutive pictures on the driven clock. */
function gaps(pictures: TPicture[]): number[] {
  return pictures.slice(1).map((picture, index) => picture.clock - pictures[index].clock);
}

async function runFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frames) => (window as unknown as TThrottleWindow).eachFrame((i) => (i >= frames ? true : undefined)),
    count
  );
}

async function pictures(page: Page): Promise<TPicture[]> {
  return page.evaluate(() => (window as unknown as TThrottleWindow).pictures.slice());
}

/** Drags from a world point by (dx, dy) screen pixels with the mouse, one step per graph frame. */
async function pointerDrag(page: Page, start: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  const steps = 30;
  const from = await page.evaluate((point) => window.graph.cameraService.getAbsoluteXY(point.x, point.y), start);
  const box = await page.locator("#root").boundingBox();
  if (!box) throw new Error("no root");
  const [x, y] = [box.x + from[0], box.y + from[1]];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await runFrames(page, 1);
  }
  await page.mouse.up();
}

/**
 * The world point the minimap's red blob (the selected block under a red rule) maps to through a click on it: the
 * camera centres on the clicked point by the mapping the minimap uses for clicks.
 */
async function clickRedBlob(page: Page, minimapPO: MiniMapPageObject): Promise<{ x: number; y: number }> {
  const blob = await page.evaluate(() => {
    const canvas = document.querySelector(".graph-minimap") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (minX === Infinity) throw new Error("no red blob on the minimap");
    return { x: (minX + maxX + 1) / 2 / width, y: (minY + maxY + 1) / 2 / height };
  });
  await minimapPO.clickAt(blob.x, blob.y);
  return page.evaluate(() => {
    const { x, y, width, height, scale } = window.graph.cameraService.getCameraState();
    return { x: (width / 2 - x) / scale, y: (height / 2 - y) / scale };
  });
}

/** World units per minimap CSS pixel for the current usable rect (its extent with the gap on both sides). */
async function worldPerMinimapPixel(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rect = window.graph.api.getUsableRect();
    const gap = window.graph.graphConstants.system.USABLE_RECT_GAP;
    return Math.max(rect.width + 2 * gap, rect.height + 2 * gap) / 200;
  });
}

test.describe("MiniMap – throttled picture (D6)", () => {
  let graphPO: GraphPageObject;
  let minimapPO: MiniMapPageObject;

  test.beforeEach(async ({ page }) => {
    graphPO = new GraphPageObject(page);
    minimapPO = new MiniMapPageObject(page, graphPO);
    // "over" moves inside the usable rect (x 0..800, y 0..500): block-1 and block-2 hold its corners.
    await graphPO.initialize({
      blocks: [block("block-1", 0, 0), block("block-2", 600, 400), block("over", 100, 0)],
      connections: [],
      settings: { canDrag: "all", dragThreshold: 0 },
    });
    await page.evaluate(() => {
      const w = window as unknown as TThrottleWindow;
      const { schedule, ESchedulerPriority, CanvasBlock, selectedTag } = window.GraphModule;
      const scene = window.graph.scene;
      w.pictures = [];
      w.frame = 0;
      w.clock = 1000;
      w.dt = 10;
      w.frameEndListeners = 0;
      // The driven scene clock: one step per frame, at the end of the frame (after the graph's frame task).
      (scene.clock as { now(): number }).now = (): number => w.clock / 1000;
      schedule(
        () => {
          w.frame += 1;
          w.clock += w.dt;
        },
        { priority: ESchedulerPriority.LOWEST, frameInterval: 1 }
      );
      w.eachFrame = <T>(step: (i: number) => T | undefined): Promise<T> =>
        new Promise<T>((resolve) => {
          let i = 0;
          const stop = schedule(
            () => {
              i += 1;
              const result = step(i);
              if (result === undefined) return;
              stop();
              resolve(result);
            },
            { priority: ESchedulerPriority.LOWEST, frameInterval: 1 }
          );
        });
      // Frame-end listeners through the public method: the minimap's must go when it detaches or unmounts.
      const onFrameEnd = scene.onFrameEnd.bind(scene);
      scene.onFrameEnd = (listener: () => void): (() => void) => {
        w.frameEndListeners += 1;
        const remove = onFrameEnd(listener);
        let removed = false;
        return (): void => {
          if (!removed) w.frameEndListeners -= 1;
          removed = true;
          remove();
        };
      };
      const draw = scene.drawInterpreted.bind(scene);
      scene.drawInterpreted = (ctx, elements, scale, options): void => {
        const x: Record<string, number> = {};
        for (const element of elements) x[element.id] = element.x;
        w.pictures.push({ clock: w.clock, frame: w.frame + 1, x });
        draw(ctx, elements, scale, options);
      };
      // The selected block is red: the tests find it on the minimap.
      scene.styles.add([
        { target: CanvasBlock, tags: [selectedTag], style: { parts: { body: { color: "#ff0000" } } } },
      ]);
    });
    await minimapPO.addLayer({ location: "topLeft" });
    await runFrames(page, QUIET_FRAMES);
  });

  test("draws a burst of API moves inside one period twice, a period apart, ending with the last state", async ({
    page,
  }) => {
    const before = (await pictures(page)).length;
    // Five moves on five consecutive frames: 40 ms on the driven clock, inside one period.
    const lastMoveAt = await page.evaluate(() => {
      const w = window as unknown as TThrottleWindow;
      let at = 0;
      return w.eachFrame((i) => {
        if (i > 5) return at;
        window.graph.api.updateBlock({ id: "over", x: 100 + i });
        at = w.clock;
        return undefined;
      });
    });
    await runFrames(page, QUIET_FRAMES);
    const drawn = (await pictures(page)).slice(before);
    // The first change after a quiet period at once; the others together, a whole period later.
    expect(drawn.length).toBe(2);
    expect(gaps(drawn)[0]).toBeGreaterThanOrEqual(PERIOD_MS);
    const last = drawn[drawn.length - 1];
    expect(xOf(last, "over")).toBe(105);
    // Applied in the frame after the move; drawn in the frame after the period's end.
    expect(last.clock - lastMoveAt).toBeLessThanOrEqual(PERIOD_MS + 2 * DT_MS);
  });

  test("never draws before the period ends, also after a long frame", async ({ page }) => {
    const before = (await pictures(page)).length;
    // A move after a quiet period (drawn at once), one more after that picture (it waits), then one frame of 60 ms.
    const waitingSince = await page.evaluate(() => {
      const w = window as unknown as TThrottleWindow;
      let since = 0;
      return w.eachFrame((i) => {
        if (i === 1) window.graph.api.updateBlock({ id: "over", x: 120 });
        if (i === 3) {
          window.graph.api.updateBlock({ id: "over", x: 140 });
          since = w.clock;
        }
        if (i === 5) w.dt = 60;
        if (i === 6) w.dt = 10;
        return i >= 30 ? since : undefined;
      });
    });
    const drawn = (await pictures(page)).slice(before);
    expect(drawn.length).toBe(2);
    expect(xOf(drawn[0], "over")).toBe(120);
    expect(xOf(drawn[1], "over")).toBe(140);
    // Not before the waiting move's period ends, whatever the length of the frames before it.
    expect(drawn[1].clock).toBeGreaterThanOrEqual(waitingSince + PERIOD_MS);
    expect(drawn[1].clock).toBeLessThanOrEqual(waitingSince + PERIOD_MS + 2 * DT_MS);
  });

  test("draws an isolated move in the next frame after a quiet period", async ({ page }) => {
    const before = (await pictures(page)).length;
    const moved = await page.evaluate(() => {
      const w = window as unknown as TThrottleWindow;
      let frame = 0;
      return w.eachFrame((i) => {
        if (i === 1) {
          window.graph.api.updateBlock({ id: "over", x: 150 });
          frame = w.frame;
        }
        return i >= 4 ? frame : undefined;
      });
    });
    const drawn = (await pictures(page)).slice(before);
    expect(drawn.map((picture) => xOf(picture, "over"))).toEqual([150]);
    // Applied in the next frame, whose end steps the revision; drawn in the frame after.
    expect(drawn[0].frame - moved).toBe(2);
  });

  test("draws a list change and the revision it steps as one picture", async ({ page }) => {
    const before = (await pictures(page)).length;
    await page.evaluate(() => {
      const graph = window.graph;
      const blocks = graph.rootStore.blocksList.$blocks.value.map((state) => state.asTBlock());
      graph.setEntities({ blocks: [...blocks, { ...blocks[2], id: "added", x: 300, y: 200 }], connections: [] });
    });
    await runFrames(page, QUIET_FRAMES);
    const drawn = (await pictures(page)).slice(before);
    expect(drawn.length).toBe(1);
    expect(xOf(drawn[0], "added")).toBe(300);
  });

  test("keeps the same picture through hidden-only scene updates", async ({ page }) => {
    const image = (): Promise<string> =>
      page.evaluate(() => (document.querySelector(".graph-minimap") as HTMLCanvasElement).toDataURL());
    const before = (await pictures(page)).length;
    const pixels = await image();
    await page.evaluate(() => {
      const w = window as unknown as TThrottleWindow;
      return w.eachFrame((i) => {
        if (i > 16) return true;
        window.graph.scene.store.update("block\u0000over", { hidden: i % 2 === 1 });
        return undefined;
      });
    });
    await runFrames(page, QUIET_FRAMES);
    // The minimap deliberately includes hidden blocks, including HTML handover and collapsed groups.
    expect(await image()).toBe(pixels);
    expect((await pictures(page)).length).toBe(before);
  });

  test("still refreshes paint and geometry mixed with hidden updates", async ({ page }) => {
    const before = (await pictures(page)).length;
    const pixels = await page.evaluate(() =>
      (document.querySelector(".graph-minimap") as HTMLCanvasElement).toDataURL()
    );
    await page.evaluate(() => {
      const { scene } = window.graph;
      scene.store.update("block\u0000over", { hidden: true });
      // A table-only rule change can repaint the picture without an element geometry update.
      scene.styles.add([{ target: window.GraphModule.CanvasBlock, style: { parts: { body: { color: "#0000ff" } } } }]);
      scene.store.update("block\u0000over", { hidden: false });
    });
    await runFrames(page, QUIET_FRAMES);
    expect((await pictures(page)).length).toBe(before + 1);
    expect(
      await page.evaluate(() => (document.querySelector(".graph-minimap") as HTMLCanvasElement).toDataURL())
    ).not.toBe(pixels);

    const painted = (await pictures(page)).length;
    await page.evaluate(() => {
      const scene = window.graph.scene;
      // A frame-end mutation belongs to the next revision, even when another hidden update follows it.
      const stop = scene.onFrameEnd(() => {
        stop();
        scene.store.update("block\u0000over", { x: 150 });
        scene.store.update("block\u0000over", { hidden: true });
      });
    });
    await runFrames(page, QUIET_FRAMES);
    const drawn = (await pictures(page)).slice(painted);
    expect(drawn.length).toBe(1);
    expect(xOf(drawn[0], "over")).toBe(150);
  });

  test("throttles a pointer drag inside the usable rect, and ends with its last position", async ({ page }) => {
    const before = (await pictures(page)).length;
    // From the part of "over" that block-1 does not cover.
    await pointerDrag(page, { x: 250, y: 50 }, 120, 80);
    await runFrames(page, QUIET_FRAMES);
    const drawn = (await pictures(page)).slice(before);
    const final = await page.evaluate(() => window.graph.rootStore.blocksList.getBlockState("over")?.$geometry.value.x);
    expect(final).toBeGreaterThan(100);
    // Pictures at least a period apart: at most one per period of the drag, the last one with the last position.
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...gaps(drawn))).toBeGreaterThanOrEqual(PERIOD_MS);
    expect(xOf(drawn[drawn.length - 1], "over")).toBe(final);
  });

  test("throttles a pointer drag that grows the usable rect; the picture and its mapping stay together", async ({
    page,
  }) => {
    await page.evaluate(() => window.graph.api.selectBlocks(["block-2"], true));
    await runFrames(page, QUIET_FRAMES);
    const before = (await pictures(page)).length;
    await pointerDrag(page, { x: 700, y: 450 }, 200, 150);
    await runFrames(page, QUIET_FRAMES);
    const drawn = (await pictures(page)).slice(before);
    const final = await page.evaluate(
      () => window.graph.rootStore.blocksList.getBlockState("block-2")?.$geometry.value
    );
    if (!final) throw new Error("no block-2");
    expect(final.x).toBeGreaterThan(600);
    expect(Math.min(...gaps(drawn))).toBeGreaterThanOrEqual(PERIOD_MS);
    expect(xOf(drawn[drawn.length - 1], "block-2")).toBe(final.x);
    // A click on the block in the picture centres the camera on it: the clicks use the picture's mapping.
    const tolerance = 3 * (await worldPerMinimapPixel(page));
    const clicked = await clickRedBlob(page, minimapPO);
    expect(Math.abs(clicked.x - (final.x + final.width / 2))).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(clicked.y - (final.y + final.height / 2))).toBeLessThanOrEqual(tolerance);
  });

  test("while a picture waits, clicks follow the picture shown, not the new bounds", async ({ page }) => {
    await page.evaluate(() => window.graph.api.selectBlocks(["block-2"], true));
    await runFrames(page, QUIET_FRAMES);
    // A move that grows the bounds after a quiet period: drawn at once, with its mapping.
    await page.evaluate(() => window.graph.api.updateBlock({ id: "block-2", x: 1600 }));
    await runFrames(page, 4);
    // The clock stops: the next move grows the bounds again and waits for good.
    await page.evaluate(() => {
      (window as unknown as TThrottleWindow).dt = 0;
      window.graph.api.updateBlock({ id: "block-2", x: 3200 });
    });
    await runFrames(page, 6);
    const shown = (await pictures(page)).at(-1);
    expect(shown && xOf(shown, "block-2")).toBe(1600);
    const tolerance = 3 * (await worldPerMinimapPixel(page));
    const waiting = await clickRedBlob(page, minimapPO);
    expect(Math.abs(waiting.x - 1700)).toBeLessThanOrEqual(tolerance);
    // The clock runs again: the waiting picture comes, with the new bounds and their mapping.
    await page.evaluate(() => {
      (window as unknown as TThrottleWindow).dt = 10;
    });
    await runFrames(page, QUIET_FRAMES);
    expect(xOf((await pictures(page)).at(-1) as TPicture, "block-2")).toBe(3200);
    const drawn = await clickRedBlob(page, minimapPO);
    expect(Math.abs(drawn.x - 3300)).toBeLessThanOrEqual(tolerance);
  });

  test("follows a block view type outside the setting only while such a view is on the list", async ({ page }) => {
    // "Outer" is in the setting, but its create() makes views of other classes, whose types the setting does not name.
    await page.evaluate(() => {
      const w = window as unknown as { outerType: number };
      const { CanvasBlock } = window.GraphModule;
      class Outside0 extends CanvasBlock {
        public static override entityType = "outside-0";
      }
      class Outside1 extends CanvasBlock {
        public static override entityType = "outside-1";
      }
      const views = [Outside0, Outside1];
      class Outer extends CanvasBlock {}
      w.outerType = 0;
      Object.defineProperty(Outer, "create", {
        value: (...args: unknown[]): unknown =>
          (views[w.outerType] as unknown as { create(...values: unknown[]): unknown }).create(...args),
      });
      window.graph.updateSettings({ blockComponents: { Outer } });
    });
    /** The list with or without "x", an Outer block inside the bounds. */
    const setX = (withX: boolean, outerType: number): Promise<void> =>
      page.evaluate(
        ({ add, type }) => {
          (window as unknown as { outerType: number }).outerType = type;
          const graph = window.graph;
          const blocks = graph.rootStore.blocksList.$blocks.value
            .map((state) => state.asTBlock())
            .filter((data) => data.id !== "x");
          const x = { id: "x", is: "Outer", x: 300, y: 200, width: 200, height: 100, name: "x", anchors: [] };
          graph.setEntities({ blocks: add ? [...blocks, x] : blocks, connections: [] });
        },
        { add: withX, type: outerType }
      );
    /** A scene element of `type` that no block view writes: only a followed type turns it into a picture. */
    const strayOf = (type: string): Promise<void> =>
      page.evaluate((entityType) => {
        window.graph.scene.store.add({
          id: `stray-${entityType}`,
          entityType,
          zIndex: 1,
          x: 5000,
          y: 5000,
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
          primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#000000" }],
        });
      }, type);
    const count = async (): Promise<number> => (await pictures(page)).length;

    await setX(true, 0);
    await runFrames(page, QUIET_FRAMES);
    expect(Object.keys((await pictures(page)).at(-1)?.x ?? {})).toContain("outside-0\u0000x");
    // The view is replaced by one of another type: removed, then added again.
    await setX(false, 0);
    await runFrames(page, QUIET_FRAMES);
    await setX(true, 1);
    await runFrames(page, QUIET_FRAMES);
    const drawn = Object.keys((await pictures(page)).at(-1)?.x ?? {});
    expect(drawn).toContain("outside-1\u0000x");
    expect(drawn).not.toContain("outside-0\u0000x");
    // A change of the obsolete type draws nothing; one of the current block's type does.
    let before = await count();
    await strayOf("outside-0");
    await runFrames(page, QUIET_FRAMES);
    expect(await count()).toBe(before);
    await page.evaluate(() => window.graph.api.updateBlock({ id: "x", x: 320 }));
    await runFrames(page, QUIET_FRAMES);
    expect(await count()).toBe(before + 1);
    expect((await pictures(page)).at(-1)?.x["outside-1\u0000x"]).toBe(320);
    // The block is removed: its type is no longer followed either.
    await setX(false, 1);
    await runFrames(page, QUIET_FRAMES);
    before = await count();
    await strayOf("outside-1");
    await runFrames(page, QUIET_FRAMES);
    expect(await count()).toBe(before);
  });

  test("keeps following a view's type when the setting stops naming it", async ({ page }) => {
    // A view of type "shared-setting" outside the setting ("Outer" makes it), then a setting class of the same type,
    // then that setting class replaced by one of another type, while the view stays on the list.
    await page.evaluate(() => {
      const { CanvasBlock } = window.GraphModule;
      class SharedView extends CanvasBlock {
        public static override entityType = "shared-setting";
      }
      class Outer extends CanvasBlock {}
      Object.defineProperty(Outer, "create", {
        value: (...args: unknown[]): unknown =>
          (SharedView as unknown as { create(...values: unknown[]): unknown }).create(...args),
      });
      const graph = window.graph;
      graph.updateSettings({ blockComponents: { Outer } });
      const blocks = graph.rootStore.blocksList.$blocks.value.map((state) => state.asTBlock());
      const x = { id: "x", is: "Outer", x: 310, y: 200, width: 200, height: 100, name: "x", anchors: [] };
      graph.setEntities({ blocks: [...blocks, x], connections: [] });
    });
    await runFrames(page, QUIET_FRAMES);
    expect((await pictures(page)).at(-1)?.x["shared-setting\u0000x"]).toBe(310);
    await page.evaluate(() => {
      const { CanvasBlock } = window.GraphModule;
      class SharedSetting extends CanvasBlock {
        public static override entityType = "shared-setting";
      }
      window.graph.updateSettings({ blockComponents: { Other: SharedSetting } });
    });
    // One more picture with the setting naming the view's type.
    await page.evaluate(() => window.graph.api.updateBlock({ id: "over", x: 130 }));
    await runFrames(page, QUIET_FRAMES);
    expect(xOf((await pictures(page)).at(-1) as TPicture, "over")).toBe(130);
    await page.evaluate(() => {
      const { CanvasBlock } = window.GraphModule;
      class DifferentSetting extends CanvasBlock {
        public static override entityType = "different-setting";
      }
      window.graph.updateSettings({ blockComponents: { Other: DifferentSetting } });
    });
    // A move inside the bounds that only the view's own type reports.
    await page.evaluate(() => window.graph.api.updateBlock({ id: "x", x: 320 }));
    await runFrames(page, QUIET_FRAMES);
    expect((await pictures(page)).at(-1)?.x["shared-setting\u0000x"]).toBe(320);
  });

  for (const how of ["detachLayer", "removeLayer", "stop"] as const) {
    test(`drops a waiting picture on ${how}`, async ({ page }) => {
      // A move after a quiet period (drawn at once), then one more inside the period: it is not drawn yet.
      const state = await page.evaluate((kind) => {
        const w = window as unknown as TThrottleWindow & {
          minimapLayer: Parameters<typeof window.graph.attachLayer>[0];
        };
        return w.eachFrame((i) => {
          if (i === 1) window.graph.api.updateBlock({ id: "over", x: 120 });
          if (i === 3) window.graph.api.updateBlock({ id: "over", x: 140 });
          if (i < 5) return undefined;
          const shown = w.pictures[w.pictures.length - 1].x["block\u0000over"];
          const listenersBefore = w.frameEndListeners;
          if (kind === "stop") window.graph.stop();
          else if (kind === "detachLayer") window.graph.detachLayer(w.minimapLayer);
          else window.graph.removeLayer(w.minimapLayer);
          return { shown, listenersBefore, listenersAfter: w.frameEndListeners, pictures: w.pictures.length };
        });
      }, how);
      expect(state.shown).toBe(120);
      // Its frame-end listener went with its other subscriptions.
      expect(state.listenersAfter).toBeLessThan(state.listenersBefore);
      // Three periods on the driven clock: nothing is drawn for the dropped wait.
      await runFrames(page, 3 * QUIET_FRAMES);
      expect((await pictures(page)).length).toBe(state.pictures);
      if (how === "removeLayer") return;
      // Attached or started again, it draws the current state.
      await page.evaluate((kind) => {
        const w = window as unknown as { minimapLayer: Parameters<typeof window.graph.attachLayer>[0] };
        if (kind === "stop") window.graph.start();
        else window.graph.attachLayer(w.minimapLayer);
      }, how);
      await runFrames(page, 3);
      const after = await pictures(page);
      expect(after.length).toBeGreaterThan(state.pictures);
      expect(xOf(after[after.length - 1], "over")).toBe(140);
    });
  }
});

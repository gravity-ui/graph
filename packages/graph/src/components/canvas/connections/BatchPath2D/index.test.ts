import type { TTileRect } from "../../../../lib/TileIndex";

import { BatchPath2DRenderer, TPathBounds } from "./index";

function createPath(end: number) {
  const path = new Path2D();
  path.moveTo(0, 0);
  path.lineTo(end, 0);
  return path;
}

function createItem(end: number, bounds?: TPathBounds) {
  const state: { end: number; visible: boolean; bounds: TPathBounds | undefined } = { end, visible: true, bounds };
  return {
    state,
    getPath: jest.fn(() => createPath(state.end)),
    getPathBounds: () => state.bounds,
    isPathVisible: () => state.visible,
    style: () => ({ type: "stroke" as const }),
  };
}

const viewport = (minX: number, maxX: number): TTileRect => ({ minX, minY: -10, maxX, maxY: 10 });

function createFixture(chunkSize = 100) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected canvas context");
  const stroke = jest.spyOn(ctx, "stroke");
  const schedule = jest.fn();
  const batch = new BatchPath2DRenderer(schedule, chunkSize);
  return {
    ctx,
    batch,
    schedule,
    /** Returns the line ends drawn by each stroke call. */
    render(rect?: TTileRect) {
      stroke.mockClear();
      batch.render(ctx, rect);
      return stroke.mock.calls.map(([path]) => {
        const events = (path as Path2D & { _path: { type: string; props: { x: number } }[] })._path;
        return events.filter((event) => event.type === "lineTo").map((event) => event.props.x);
      });
    },
  };
}

test("stable frames and camera moves reuse chunk paths; markDirty rebuilds only that chunk", () => {
  const { batch, render, schedule } = createFixture(2);
  const items = [10, 20, 30].map((end) => createItem(end, [0, 0, end, 0]));
  for (const item of items) batch.add(item, { zIndex: 0, group: "connections" });

  expect(render(viewport(0, 100))).toEqual([[10, 20], [30]]);
  expect(render(viewport(5, 105))).toEqual([[10, 20], [30]]);
  expect(items.map((item) => item.getPath.mock.calls.length)).toEqual([1, 1, 1]);

  schedule.mockClear();
  items[2].state.end = 35;
  items[2].state.bounds = [0, 0, 35, 0];
  batch.markDirty(items[2]);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(render(viewport(0, 100))).toEqual([[10, 20], [35]]);
  expect(items.map((item) => item.getPath.mock.calls.length)).toEqual([1, 1, 2]);
});

test("skips a chunk entirely outside the viewport without rebuilding it when it returns", () => {
  const { batch, render } = createFixture(2);
  const near = [createItem(10, [0, 0, 10, 0]), createItem(20, [0, 0, 20, 0])];
  const far = [createItem(1010, [1000, 0, 1010, 0]), createItem(1020, [1000, 0, 1020, 0])];
  const afterRender = jest.fn();
  for (const item of [...near, ...far]) batch.add({ ...item, afterRender }, { zIndex: 0, group: "connections" });

  expect(render(viewport(0, 100))).toEqual([[10, 20]]);
  expect(afterRender).toHaveBeenCalledTimes(2);
  expect(far.map((item) => item.getPath.mock.calls.length)).toEqual([0, 0]);

  expect(render(viewport(990, 1100))).toEqual([[1010, 1020]]);
  expect(render(viewport(0, 1100))).toEqual([
    [10, 20],
    [1010, 1020],
  ]);
  expect([...near, ...far].map((item) => item.getPath.mock.calls.length)).toEqual([1, 1, 1, 1]);
});

test("never culls a chunk with an item whose bounds are missing or invalid", () => {
  const { batch, render } = createFixture(2);
  const known = createItem(1010, [1000, 0, 1010, 0]);
  for (const bounds of [undefined, [NaN, 0, 1, 1] as const, [10, 0, 0, 0] as const]) {
    const fixture = createFixture(2);
    fixture.batch.add(createItem(1020, [1000, 0, 1020, 0]), { zIndex: 0, group: "connections" });
    fixture.batch.add(createItem(1030, bounds), { zIndex: 0, group: "connections" });
    expect(fixture.render(viewport(0, 100))).toEqual([[1020, 1030]]);
  }
  batch.add(known, { zIndex: 0, group: "connections" });
  expect(render(viewport(0, 100))).toEqual([]);
  expect(render()).toEqual([[1010]]);
});

test("semantic visibility applies after markDirty and keeps the first visible item's style", () => {
  const { batch, ctx, render } = createFixture(3);
  const calls: string[] = [];
  const first = createItem(10);
  const second = createItem(20);
  const upper = createItem(30);
  const makeCustom = (item: ReturnType<typeof createItem>, name: string, fillRule: CanvasFillRule) => ({
    ...item,
    style: () => {
      calls.push(`style:${name}`);
      return { type: "both" as const, fillRule };
    },
    afterRender: () => calls.push(`after:${name}`),
  });
  const upperCustom = makeCustom(upper, "upper", "nonzero");
  const firstCustom = makeCustom(first, "first", "nonzero");
  const secondCustom = makeCustom(second, "second", "evenodd");
  batch.add(upperCustom, { zIndex: 1, group: "connections" });
  batch.add(firstCustom, { zIndex: 0, group: "connections" });
  batch.add(secondCustom, { zIndex: 0, group: "connections" });
  const fill = jest.spyOn(ctx, "fill");
  expect(render()).toEqual([[10, 20], [30]]);
  expect(calls).toEqual(["style:first", "after:first", "after:second", "style:upper", "after:upper"]);

  calls.length = 0;
  fill.mockClear();
  first.state.visible = false;
  batch.markDirty(firstCustom);
  expect(render()).toEqual([[20], [30]]);
  expect(calls).toEqual(["style:second", "after:second", "style:upper", "after:upper"]);
  expect(fill.mock.calls.map(([, rule]) => rule)).toEqual(["evenodd", "nonzero"]);
  expect(upper.getPath).toHaveBeenCalledTimes(1);
});

test("update moves an item between groups and z-levels, and deleting it removes its path", () => {
  const { batch, render } = createFixture(100);
  const a = createItem(10);
  const b = createItem(20);
  batch.add(a, { zIndex: 0, group: "connections" });
  batch.add(b, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([[10, 20]]);

  batch.update(a, { zIndex: 1, group: "connections" });
  expect(render()).toEqual([[20], [10]]);
  batch.update(a, { zIndex: 1, group: "custom" });
  expect(render()).toEqual([[20], [10]]);
  batch.delete(a);
  expect(render()).toEqual([[20]]);
  batch.add(a, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([[20, 10]]);
});

test("afterRender runs only for items in the viewport, by their own report or by their bounds", () => {
  const { batch, render } = createFixture();
  const inside = { ...createItem(10, [0, 0, 10, 0]), afterRender: jest.fn() };
  const outside = { ...createItem(20, [500, 0, 520, 0]), afterRender: jest.fn() };
  const reportsOut = { ...createItem(30, [0, 0, 30, 0]), afterRender: jest.fn(), isInViewport: () => false };
  const reportsIn = { ...createItem(40, [900, 0, 940, 0]), afterRender: jest.fn(), isInViewport: () => true };
  const unknown = { ...createItem(50), afterRender: jest.fn() };
  for (const item of [inside, outside, reportsOut, reportsIn, unknown]) {
    batch.add(item, { zIndex: 0, group: "connections" });
  }

  // One chunk, drawn because some of its items are inside the viewport.
  expect(render(viewport(0, 100))).toEqual([[10, 20, 30, 40, 50]]);
  expect(inside.afterRender).toHaveBeenCalledTimes(1);
  expect(outside.afterRender).not.toHaveBeenCalled();
  expect(reportsOut.afterRender).not.toHaveBeenCalled();
  expect(reportsIn.afterRender).toHaveBeenCalledTimes(1);
  // Items without bounds are never culled.
  expect(unknown.afterRender).toHaveBeenCalledTimes(1);
});

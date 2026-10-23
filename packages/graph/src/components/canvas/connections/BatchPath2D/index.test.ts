import { BatchPath2DRenderer } from "./index";

const CanvasPath2D = globalThis.Path2D;

beforeAll(() => {
  // jest-canvas-mock ignores the source path; match the browser's copying constructor.
  globalThis.Path2D = class extends CanvasPath2D {
    constructor(source?: Path2D | string) {
      super(source);
      if (source instanceof CanvasPath2D) super.addPath(source);
    }
  };
});

afterAll(() => {
  globalThis.Path2D = CanvasPath2D;
});

function createPath(end: number) {
  const path = new Path2D();
  path.moveTo(0, 0);
  path.lineTo(end, 0);
  return path;
}

function createItem(end: number) {
  const state = { end, visible: true };
  return {
    state,
    getPath: jest.fn(() => createPath(state.end)),
    isPathVisible: () => state.visible,
    style: () => ({ type: "stroke" as const }),
  };
}

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
    render() {
      stroke.mockClear();
      batch.orderedPaths.get().forEach((group) => group.render(ctx));
      return stroke.mock.calls.flatMap(([path]) => {
        const events = (path as Path2D & { _path: { type: string; props: { x: number } }[] })._path;
        return events.filter((event) => event.type === "lineTo").map((event) => event.props.x);
      });
    },
  };
}

test("stable frames reuse visibility and paths; markDirty refreshes availability", () => {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected canvas context");
  let visible = true;
  const item = {
    isPathVisible: jest.fn(() => visible),
    getPath: jest.fn(() => new Path2D()),
    style: () => ({ type: "stroke" as const }),
  };
  const batch = new BatchPath2DRenderer(() => {});
  batch.add(item, { zIndex: 0, group: "connections" });
  for (let i = 0; i < 10; i++) batch.orderedPaths.get().forEach((group) => group.render(ctx));
  expect(item.isPathVisible).toHaveBeenCalledTimes(1);
  expect(item.getPath).toHaveBeenCalledTimes(1);
  visible = false;
  batch.markDirty(item);
  batch.orderedPaths.get().forEach((group) => group.render(ctx));
  expect(item.isPathVisible).toHaveBeenCalledTimes(2);
  expect(item.getPath).toHaveBeenCalledTimes(1);
  visible = true;
  batch.markDirty(item);
  batch.orderedPaths.get().forEach((group) => group.render(ctx));
  expect(item.getPath).toHaveBeenCalledTimes(2);
});

test("visibility transitions reset only their chunk without scheduling another frame", () => {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected canvas context");
  let visible = true;
  const affected = {
    isPathVisible: () => visible,
    getPath: jest.fn(() => new Path2D()),
    style: jest.fn(() => ({ type: "stroke" as const })),
    afterRender: jest.fn(),
  };
  const unaffected = {
    getPath: jest.fn(() => new Path2D()),
    style: () => ({ type: "stroke" as const }),
  };
  const schedule = jest.fn();
  const batch = new BatchPath2DRenderer(schedule, 1);
  batch.add(affected, { zIndex: 0, group: "connections" });
  batch.add(unaffected, { zIndex: 0, group: "connections" });
  const render = () => batch.orderedPaths.get().forEach((group) => group.render(ctx));
  render();
  schedule.mockClear();
  affected.style.mockClear();
  affected.afterRender.mockClear();

  visible = false;
  batch.invalidateVisibility(affected);
  render();
  expect(affected.style).not.toHaveBeenCalled();
  expect(affected.afterRender).not.toHaveBeenCalled();
  expect(unaffected.getPath).toHaveBeenCalledTimes(1);
  expect(schedule).not.toHaveBeenCalled();

  visible = true;
  batch.invalidateVisibility(affected);
  render();
  expect(affected.getPath).toHaveBeenCalledTimes(1);
  expect(unaffected.getPath).toHaveBeenCalledTimes(1);
  expect(schedule).not.toHaveBeenCalled();
});

test("visibility changes rebuild the drawn path while reusing unchanged geometry in the same chunk", () => {
  const { batch, render, schedule } = createFixture(3);
  const first = createItem(10);
  const initiallyHidden = createItem(20);
  const last = createItem(30);
  initiallyHidden.state.visible = false;
  for (const item of [first, initiallyHidden, last]) batch.add(item, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([10, 30]);
  expect(initiallyHidden.getPath).not.toHaveBeenCalled();
  schedule.mockClear();

  first.state.visible = false;
  batch.invalidateVisibility(first);
  expect(render()).toEqual([30]);
  expect(last.getPath).toHaveBeenCalledTimes(1);

  initiallyHidden.state.visible = true;
  batch.invalidateVisibility(initiallyHidden);
  expect(render()).toEqual([20, 30]);
  first.state.visible = true;
  batch.invalidateVisibility(first);
  expect(render()).toEqual([10, 20, 30]);
  for (const item of [first, initiallyHidden, last]) expect(item.getPath).toHaveBeenCalledTimes(1);
  expect(schedule).not.toHaveBeenCalled();
});

test("markDirty refreshes only the changed geometry and keeps hidden changes lazy until entry", () => {
  const { batch, render, schedule } = createFixture(3);
  const changed = createItem(10);
  const neighbor = createItem(20);
  for (const item of [changed, neighbor]) batch.add(item, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([10, 20]);
  schedule.mockClear();

  changed.state.end = 11;
  batch.markDirty(changed);
  expect(render()).toEqual([11, 20]);
  expect(changed.getPath).toHaveBeenCalledTimes(2);
  expect(neighbor.getPath).toHaveBeenCalledTimes(1);
  expect(schedule).toHaveBeenCalledTimes(1);

  changed.state.visible = false;
  batch.invalidateVisibility(changed);
  expect(render()).toEqual([20]);
  changed.state.end = 12;
  batch.markDirty(changed);
  expect(render()).toEqual([20]);
  expect(changed.getPath).toHaveBeenCalledTimes(2);
  changed.state.visible = true;
  batch.invalidateVisibility(changed);
  expect(render()).toEqual([12, 20]);
  expect(changed.getPath).toHaveBeenCalledTimes(3);
  expect(neighbor.getPath).toHaveBeenCalledTimes(1);
});

test.each([
  { zIndex: 0, group: "connections" },
  { zIndex: 0, group: "custom" },
  { zIndex: -1, group: "connections" },
])("update refreshes custom geometry with params %j without rebuilding a neighbor", (params) => {
  const { batch, render } = createFixture(3);
  const changed = createItem(10);
  const neighbor = createItem(20);
  for (const item of [changed, neighbor]) batch.add(item, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([10, 20]);

  changed.state.end = 11;
  batch.update(changed, params);
  expect(render()).toEqual(params.group === "custom" ? [20, 11] : [11, 20]);
  expect(changed.getPath).toHaveBeenCalledTimes(2);
  expect(neighbor.getPath).toHaveBeenCalledTimes(1);
});

test.each([null, undefined])("an empty custom path (%s) stays cached until markDirty", (empty) => {
  const { batch, render } = createFixture(3);
  const absent = createItem(10);
  const neighbor = createItem(20);
  let available = false;
  const getPath = jest.fn(() => (available ? createPath(10) : empty));
  const item = { ...absent, getPath };
  for (const member of [item, neighbor]) batch.add(member, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([20]);

  available = true;
  neighbor.state.visible = false;
  batch.invalidateVisibility(neighbor);
  expect(render()).toEqual([]);
  neighbor.state.visible = true;
  batch.invalidateVisibility(neighbor);
  expect(render()).toEqual([20]);
  expect(getPath).toHaveBeenCalledTimes(1);
  expect(neighbor.getPath).toHaveBeenCalledTimes(1);

  batch.markDirty(item);
  expect(render()).toEqual([10, 20]);
  expect(getPath).toHaveBeenCalledTimes(2);
  expect(neighbor.getPath).toHaveBeenCalledTimes(1);
});

test("deleting and adding the same custom item again discards its previous geometry", () => {
  const { batch, render } = createFixture(3);
  const removed = createItem(10);
  const neighbor = createItem(20);
  for (const item of [removed, neighbor]) batch.add(item, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([10, 20]);

  batch.delete(removed);
  removed.state.end = 11;
  expect(render()).toEqual([20]);
  batch.add(removed, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([20, 11]);
  expect(removed.getPath).toHaveBeenCalledTimes(2);
  expect(neighbor.getPath).toHaveBeenCalledTimes(1);
});

test("each custom path is captured before the next getPath mutates a shared path", () => {
  const { batch, render } = createFixture(3);
  const shared = createPath(10);
  const first = { getPath: () => shared, style: () => ({ type: "stroke" as const }) };
  const second = {
    getPath: () => {
      shared.lineTo(20, 0);
      return shared;
    },
    style: () => ({ type: "stroke" as const }),
  };
  for (const item of [first, second]) batch.add(item, { zIndex: 0, group: "connections" });

  expect(render()).toEqual([10, 10, 20]);
});

test("mutating a returned custom path does not change its cached snapshot until markDirty", () => {
  const { batch, render } = createFixture(3);
  const shared = createPath(10);
  const custom = { getPath: jest.fn(() => shared), style: () => ({ type: "stroke" as const }) };
  const neighbor = createItem(20);
  for (const item of [custom, neighbor]) batch.add(item, { zIndex: 0, group: "connections" });
  expect(render()).toEqual([10, 20]);

  shared.lineTo(11, 0);
  expect(render()).toEqual([10, 20]);
  neighbor.state.visible = false;
  batch.invalidateVisibility(neighbor);
  expect(render()).toEqual([10]);
  expect(custom.getPath).toHaveBeenCalledTimes(1);

  batch.markDirty(custom);
  expect(render()).toEqual([10, 11]);
  expect(custom.getPath).toHaveBeenCalledTimes(2);
});

test("custom styles and afterRender keep registration and z order with the first visible item's fill rule", () => {
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
  expect(render()).toEqual([10, 20, 30]);
  expect(calls).toEqual(["style:first", "after:first", "after:second", "style:upper", "after:upper"]);

  calls.length = 0;
  fill.mockClear();
  first.state.visible = false;
  batch.invalidateVisibility(firstCustom);
  expect(render()).toEqual([20, 30]);
  expect(calls).toEqual(["style:second", "after:second", "style:upper", "after:upper"]);
  expect(fill.mock.calls.map(([, rule]) => rule)).toEqual(["evenodd", "nonzero"]);
  expect(second.getPath).toHaveBeenCalledTimes(1);
  expect(upper.getPath).toHaveBeenCalledTimes(1);
});

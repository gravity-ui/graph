import { BatchPath2DRenderer } from "./index";

type Bounds = readonly [number, number, number, number];
type MockPath = Path2D & { _path: { type: string; props: { x: number } }[] };

const CanvasPath2D = globalThis.Path2D;
const paths: Path2D[] = [];

beforeAll(() => {
  // jest-canvas-mock ignores the source path; match the browser's copying constructor.
  globalThis.Path2D = class extends CanvasPath2D {
    constructor(source?: Path2D | string) {
      super(source);
      if (source instanceof CanvasPath2D) super.addPath(source);
      paths.push(this);
    }
  };
});

beforeEach(() => {
  paths.length = 0;
});

afterAll(() => {
  globalThis.Path2D = CanvasPath2D;
});

function countPathAdds() {
  return paths.reduce((count, path) => count + jest.mocked(path.addPath).mock.calls.length, 0);
}

function createItem(id: number) {
  const x = (id % 10) * 1000;
  const y = Math.floor(id / 10) * 1000;
  const state: { end: number; visible: boolean; bounds: Bounds | undefined } = {
    end: id + 1,
    visible: true,
    bounds: [x, y, x + 10, y + 10],
  };
  return {
    state,
    getPathBounds: () => state.bounds,
    getPath: jest.fn(() => {
      const path = new Path2D();
      path.moveTo(state.end - 1, 0);
      path.lineTo(state.end, 0);
      return path;
    }),
    isPathVisible: () => state.visible,
    style: () => ({ type: "stroke" as const }),
  };
}

function createFixture() {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected canvas context");
  const stroke = jest.spyOn(ctx, "stroke");
  const batch = new BatchPath2DRenderer(() => {}, 100);
  return {
    ctx,
    batch,
    render() {
      stroke.mockClear();
      batch.orderedPaths.get().forEach((group) => group.render(ctx));
      return stroke.mock.calls.map(([path]) =>
        (path as MockPath)._path.filter((event) => event.type === "lineTo").map((event) => event.props.x)
      );
    },
  };
}

function visibleEnds(items: { state: { visible: boolean; end: number } }[]) {
  return items
    .filter((item) => item.state.visible)
    .map((item) => item.state.end)
    .sort((a, b) => a - b);
}

test("a nearby visibility transition reuses geometry and rebuilds only a small part of an interleaved chunk", () => {
  const { batch, render } = createFixture();
  const items = Array.from({ length: 100 }, (_, index) => createItem(index));
  for (let index = 0; index < items.length; index++) {
    batch.add(items[(index * 37) % items.length], { zIndex: 0, group: "connections" });
  }
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  items[0].state.visible = false;
  batch.invalidateVisibility(items[0]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  for (const item of items) item.getPath.mockClear();
  const before = countPathAdds();

  items[1].state.visible = false;
  batch.invalidateVisibility(items[1]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  expect(countPathAdds() - before).toBeLessThan(40);
  for (const item of items) expect(item.getPath).not.toHaveBeenCalled();
});

test.each([true, false])(
  "one invalidation refreshes shared custom visibility in another region, initially visible: %s",
  (initiallyVisible) => {
    const { batch, render } = createFixture();
    const items = Array.from({ length: 100 }, (_, index) => createItem(index));
    const shared = { remoteVisible: initiallyVisible };
    items[99].isPathVisible = () => shared.remoteVisible;
    const expected = () => visibleEnds(items.filter((item) => item.isPathVisible()));
    for (const item of items) batch.add(item, { zIndex: 0, group: "connections" });
    render();
    items[0].state.visible = false;
    batch.invalidateVisibility(items[0]);
    expect(
      render()
        .flat()
        .sort((a, b) => a - b)
    ).toEqual(expected());

    shared.remoteVisible = !initiallyVisible;
    items[1].state.visible = false;
    batch.invalidateVisibility(items[1]);
    expect(
      render()
        .flat()
        .sort((a, b) => a - b)
    ).toEqual(expected());

    shared.remoteVisible = initiallyVisible;
    items[1].state.visible = true;
    batch.invalidateVisibility(items[1]);
    expect(
      render()
        .flat()
        .sort((a, b) => a - b)
    ).toEqual(expected());
  }
);

test("moving geometry between spatial regions removes its old path and updates only that item", () => {
  const { batch, render } = createFixture();
  const items = Array.from({ length: 100 }, (_, index) => createItem(index));
  for (const item of items) batch.add(item, { zIndex: 0, group: "connections" });
  render();
  items[0].state.visible = false;
  batch.invalidateVisibility(items[0]);
  render();
  for (const item of items) item.getPath.mockClear();

  const moved = items[1];
  moved.state.end = 1000;
  moved.state.bounds = [50_000, 50_000, 50_010, 50_010];
  batch.markDirty(moved);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  expect(moved.getPath).toHaveBeenCalledTimes(1);
  for (const item of items.filter((item) => item !== moved)) expect(item.getPath).not.toHaveBeenCalled();

  moved.state.visible = false;
  batch.invalidateVisibility(moved);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  moved.state.visible = true;
  batch.invalidateVisibility(moved);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  expect(moved.getPath).toHaveBeenCalledTimes(1);
});

test("missing, unknown and invalid custom bounds remain visible through spatial cache updates", () => {
  const { batch, render } = createFixture();
  const items = Array.from({ length: 100 }, (_, index) => createItem(index));
  const unsupported: (Bounds | undefined)[] = [
    undefined,
    [Number.NaN, 0, 10, 10],
    [0, 0, Number.POSITIVE_INFINITY, 10],
    [10, 0, 0, 10],
    [0, 10, 10, 0],
  ];
  unsupported.forEach((bounds, index) => {
    items[index + 1].state.bounds = bounds;
  });
  const noBounds = { ...items[6], getPathBounds: undefined };
  for (const item of items) batch.add(item === items[6] ? noBounds : item, { zIndex: 0, group: "connections" });
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));

  items[0].state.visible = false;
  batch.invalidateVisibility(items[0]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  items[99].state.visible = false;
  batch.invalidateVisibility(items[99]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));

  noBounds.state.visible = false;
  batch.invalidateVisibility(noBounds);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  items[2].state.bounds = [9000, 9000, 9010, 9010];
  items[2].state.end = 1000;
  batch.markDirty(items[2]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
});

test("adding and removing members after spatial activation preserves unchanged geometry", () => {
  const { batch, render } = createFixture();
  const items = Array.from({ length: 100 }, (_, index) => createItem(index));
  for (const item of items) batch.add(item, { zIndex: 0, group: "connections" });
  render();
  items[0].state.visible = false;
  batch.invalidateVisibility(items[0]);
  render();
  for (const item of items) item.getPath.mockClear();

  batch.delete(items[1]);
  const remaining = items.filter((_, index) => index !== 1);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(remaining));
  const added = createItem(100);
  batch.add(added, { zIndex: 0, group: "connections" });
  remaining.push(added);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(remaining));
  expect(added.getPath).toHaveBeenCalledTimes(1);
  items[0].state.visible = true;
  batch.invalidateVisibility(items[0]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(remaining));
  for (const item of items) expect(item.getPath).not.toHaveBeenCalled();
});

test("a chunk with entirely unknown bounds can acquire known geometry after spatial activation", () => {
  const { batch, render } = createFixture();
  const items = Array.from({ length: 100 }, (_, index) => createItem(index));
  for (const item of items) {
    item.state.bounds = undefined;
    batch.add(item, { zIndex: 0, group: "connections" });
  }
  render();
  items[0].state.visible = false;
  batch.invalidateVisibility(items[0]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));

  items[1].state.end = 1000;
  items[1].state.bounds = [1000, 1000, 1010, 1010];
  batch.markDirty(items[1]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
  items[2].state.visible = false;
  batch.invalidateVisibility(items[2]);
  expect(
    render()
      .flat()
      .sort((a, b) => a - b)
  ).toEqual(visibleEnds(items));
});

test("spatial caching preserves draw boundaries and custom hook order across chunks and z groups", () => {
  const { batch, ctx, render } = createFixture();
  const calls: string[] = [];
  const custom = (id: number) => ({
    ...createItem(id),
    style() {
      calls.push(`style:${id}`);
      return { type: "both" as const, fillRule: id === 1 ? ("evenodd" as const) : ("nonzero" as const) };
    },
    afterRender() {
      calls.push(`after:${id}`);
    },
  });
  const items = Array.from({ length: 120 }, (_, index) => custom(index));
  const upper = custom(120);
  batch.add(upper, { zIndex: 1, group: "connections" });
  for (const item of items) batch.add(item, { zIndex: 0, group: "connections" });
  expect(render().map((path) => path.length)).toEqual([100, 20, 1]);
  items[0].state.visible = false;
  batch.invalidateVisibility(items[0]);
  render();
  calls.length = 0;
  const fill = jest.spyOn(ctx, "fill");
  fill.mockClear();

  items[2].state.visible = false;
  batch.invalidateVisibility(items[2]);
  const drawn = render();
  expect(drawn.map((path) => path.length)).toEqual([98, 20, 1]);
  expect(drawn[0].sort((a, b) => a - b)).toEqual(visibleEnds(items.slice(0, 100)));
  expect(drawn[1].sort((a, b) => a - b)).toEqual(visibleEnds(items.slice(100)));
  expect(drawn[2]).toEqual([121]);
  expect(calls).toEqual([
    "style:1",
    ...items.slice(0, 100).flatMap((item, index) => (item.state.visible ? [`after:${index}`] : [])),
    "style:100",
    ...items.slice(100).map((_, index) => `after:${index + 100}`),
    "style:120",
    "after:120",
  ]);
  expect(fill.mock.calls.map(([, rule]) => rule)).toEqual(["evenodd", "nonzero", "nonzero"]);
});

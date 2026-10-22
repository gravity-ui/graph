import { BatchPath2DRenderer } from "./index";

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
  expect(affected.getPath).toHaveBeenCalledTimes(2);
  expect(unaffected.getPath).toHaveBeenCalledTimes(1);
  expect(schedule).not.toHaveBeenCalled();
});

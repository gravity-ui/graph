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

import { SceneStore } from "../../lib/scene/SceneStore";
import { parseColorAlpha } from "../../lib/scene/colorAlpha";
import { elementBounds } from "../../lib/scene/elementBounds";
import type { TScenePrimitive } from "../../lib/scene/types";

import { BlockOutlines, outlinePaths } from "./BlockOutlines";

it("shows a scale-gated outline when the entire block face first becomes visible", () => {
  const store = new SceneStore();
  const outlines = new BlockOutlines(store);
  store.subscribe((change) => outlines.changed(change));
  const primitives: TScenePrimitive[] = [
    { kind: "rect", part: "body", x: 0, y: 0, width: 120, height: 60, fill: "blue", minScale: 0.6 },
  ];
  store.add({ id: "one", entityType: "block", x: 0, y: 0, zIndex: 1, primitives, bounds: elementBounds(primitives) });
  store.setStyle("one", store.defineStyle({ outline: { color: "red", width: 3 } }));
  outlines.flush(0.5);
  expect(store.childrenOf("one")).toHaveLength(0);
  outlines.flush(0.6);
  expect(store.childrenOf("one")).toHaveLength(1);
  outlines.flush(0.59);
  expect(store.childrenOf("one")).toHaveLength(0);
});

it("moves an outlined block and its ports together without reading their shapes again", () => {
  const store = new SceneStore();
  const outlines = new BlockOutlines(store);
  store.subscribe((change) => outlines.changed(change));
  const width = jest.fn(() => 120);
  const primitives: TScenePrimitive[] = [
    {
      kind: "rect",
      part: "body",
      x: 0,
      y: 0,
      get width() {
        return width();
      },
      height: 60,
      fill: "blue",
    },
  ];
  const bounds = elementBounds(primitives);
  store.add({ id: "b", entityType: "block", x: 0, y: 0, zIndex: 1, primitives, bounds });
  const anchor: TScenePrimitive[] = [{ kind: "circle", cx: 0, cy: 0, r: 8, fill: "red" }];
  store.add({
    id: "a",
    parent: "b",
    entityType: "anchor",
    x: 0,
    y: 30,
    zIndex: 0,
    primitives: anchor,
    bounds: elementBounds(anchor),
  });
  store.setStyle("b", store.defineStyle({ outline: { color: "red", width: 3 } }));
  outlines.flush(1);
  const path = store.childrenOf("b").find(outlines.owns);
  if (!path) throw new Error("Missing selected block outline");
  const first = path.primitives;
  width.mockClear();
  store.update("b", { x: 90 });
  store.update("a", { x: 90 });
  outlines.flush(1);
  expect(path.x).toBe(90);
  expect(path.primitives).toBe(first);
  expect(width).not.toHaveBeenCalled();
  store.update("a", { y: 20 });
  outlines.flush(1);
  expect(path.primitives).not.toBe(first);
});

it("draws the halo from the same segments as the rim, with its strongest band next to the rim", () => {
  const shape = { x: 0, y: 0, width: 120, height: 60, circles: [], scaleDependent: false };
  const outline = { color: "#000", width: 2, halo: { color: "rgba(60,80,100,0.6)", width: 4 } };
  const paths = outlinePaths(shape, outline).filter((p) => p.kind === "path");
  expect(paths.map((p) => p.stroke.width)).toEqual([10, 6, 2]);
  expect(paths[0].segments).toBe(paths[2].segments);
  expect(paths[1].segments).toBe(paths[2].segments);
  expect(paths[2].stroke.color).toBe("#000");
  const [outer, inner] = paths.map((p) => parseColorAlpha(p.stroke.color ?? ""));
  expect(outer).toBeCloseTo(0.2);
  expect(1 - (1 - outer) * (1 - inner)).toBeCloseTo(0.4);
  expect(outlinePaths(shape, { ...outline, halo: { color: "#0000", width: 4 } })).toHaveLength(1);
});

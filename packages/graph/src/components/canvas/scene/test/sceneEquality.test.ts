import type { TScenePrimitive } from "../../../../lib/scene/types";
import { sameInputs, samePrimitives } from "../utils/sceneEquality";

describe("scene equality", () => {
  it("treats changed object identities and removed keys as new component inputs", () => {
    const meta = { color: "red" };
    expect(sameInputs({ meta, width: 2 }, { width: 2, meta })).toBe(true);
    expect(sameInputs({ meta }, { meta: { color: "red" } })).toBe(false);
    expect(sameInputs({ meta, width: undefined }, { meta })).toBe(false);
  });

  it("compares primitive lists by value down to stroke sizes, typed arrays and paths by identity", () => {
    const rect = (width: number, px = 3): TScenePrimitive => ({
      kind: "rect",
      x: 0,
      y: 0,
      width,
      height: 1,
      radius: [1, 2, 3, 4],
      border: { width: { px, maxWorld: 10 }, dash: [4, 4] },
    });
    expect(samePrimitives([rect(1)], [rect(1)])).toBe(true);
    expect(samePrimitives([rect(1)], [rect(1), rect(1)])).toBe(false);
    expect(samePrimitives([rect(1)], [rect(2)])).toBe(false);
    expect(samePrimitives([rect(1)], [rect(1, 4)])).toBe(false);
    const path = (segments: Float32Array): TScenePrimitive => ({ kind: "path", segments, stroke: { width: 1 } });
    const segments = new Float32Array(8);
    expect(samePrimitives([path(segments)], [path(segments)])).toBe(true);
    expect(samePrimitives([path(segments)], [path(new Float32Array(8))])).toBe(false);
  });
});

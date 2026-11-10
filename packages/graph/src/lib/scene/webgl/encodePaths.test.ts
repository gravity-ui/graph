import { dashFlow } from "../../../components/canvas/connections/effects";
import { lineSegment } from "../../../components/canvas/connections/geometry/segments";
import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";

import { PATH_ELEMENT_FLOATS, encodePaths } from "./encodePaths";

const straight = new Float32Array(lineSegment({ x: 0, y: 0 }, { x: 30, y: 0 }));
const curved = new Float32Array([0, 0, 0, 50, 50, 50, 50, 0]);

/** Slot 0 without a part, slot 5 for every part. */
const slotOf = (part: string | undefined): number => (part === undefined ? 0 : 5);

describe("encodePaths", () => {
  it("encodes a straight path as one line instance", () => {
    const out = encodePaths([{ kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } }], 4, 0, slotOf);
    expect(out.lines).toHaveLength(INSTANCE_FLOATS);
    expect(out.curves).toHaveLength(0);
    expect(Array.from(out.lineElements)).toEqual([4, 0, 0, 0, 0, 1e9, 0, 0]);
    expect(out.curveElements).toHaveLength(0);
    expect(out.lines[12]).toBe(2);
    expect(Array.from(out.lines.slice(8, 12))).toEqual([1, 0, 0, 1]);
  });

  it("emits element data for every curve piece with the sub of its path", () => {
    const out = encodePaths(
      [
        { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
        { kind: "path", segments: curved, stroke: { color: "#000", width: { px: 3, maxWorld: 10 } } },
      ],
      2,
      0,
      slotOf
    );
    expect(out.lines).toHaveLength(0);
    const pieces = out.curves.length / INSTANCE_FLOATS;
    expect(pieces).toBeGreaterThanOrEqual(1);
    expect(out.curveElements).toHaveLength(PATH_ELEMENT_FLOATS * pieces);
    expect(Array.from(out.curveElements.slice(0, 2))).toEqual([2, 1]);
    expect(out.curves[12]).toBe(3);
  });

  it("writes the stroke's part slot and the path's scale bounds", () => {
    const out = encodePaths(
      [
        {
          kind: "path",
          segments: straight,
          stroke: { color: "#f00", width: 2 },
          part: "stroke",
          minScale: 0.25,
          maxScale: 2,
        },
      ],
      3,
      0,
      slotOf
    );
    expect(Array.from(out.lineElements)).toEqual([3, 0, 5, 0, 0.25, 2, 0, 0]);
  });

  it("lists the effects of paths that have one", () => {
    const use = dashFlow.use({ pattern: [4, 2], speed: 1 });
    const out = encodePaths(
      [
        { kind: "path", segments: straight, stroke: { color: "#f00", width: 2, dash: [4, 2] }, effect: use },
        { kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } },
      ],
      0,
      0,
      slotOf
    );
    expect(out.effects).toEqual([use]);
    expect(out.lines.length / INSTANCE_FLOATS).toBe(2);
    expect(Array.from(out.lines.slice(16, 20))).toEqual([4, 2, 0, 0]);
  });

  it("encodes only the selected paths and keeps their index as sub", () => {
    const use = dashFlow.use({ pattern: [4, 2], speed: 1 });
    const out = encodePaths(
      [
        { kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } },
        { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
        { kind: "path", segments: straight, stroke: { color: "#0f0", width: 3 }, effect: use },
      ],
      7,
      0,
      slotOf,
      (primitive) => primitive.kind === "path" && primitive.effect !== undefined
    );
    expect(out.lines).toHaveLength(INSTANCE_FLOATS);
    expect(Array.from(out.lineElements.slice(0, 2))).toEqual([7, 2]);
    expect(out.lines[12]).toBe(3);
    expect(out.effects).toEqual([use]);
  });
});

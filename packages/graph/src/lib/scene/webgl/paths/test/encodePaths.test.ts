import { dashFlow } from "../../../../../components/canvas/connections/effects";
import { lineSegment } from "../../../../../components/canvas/connections/geometry/segments";
import { INSTANCE_FLOATS } from "../../../../../components/canvas/connections/webgl/encode";
import type { TScenePrimitive } from "../../../types";
import { USE_BASE_ALPHA } from "../../instances/tables";
import { CachedGeometryBounds } from "../../order/levelBounds";
import { createPathScratch, encodePaths } from "../encodePaths";
import { PATH_ELEMENT_FLOATS } from "../pathRecords";

const straight = new Float32Array(lineSegment({ x: 0, y: 0 }, { x: 30, y: 0 }));
const curved = new Float32Array([0, 0, 0, 50, 50, 50, 50, 0]);

/** Slot 0 without a part, slot 5 for every part. */
const slotOf = (part: string | undefined): number => (part === undefined ? 0 : 5);

describe("encodePaths", () => {
  it("retains translucent records when the next element reuses the encoder", () => {
    const primitives: TScenePrimitive[] = [
      { kind: "path", segments: straight, stroke: { color: "rgba(255,0,0,0.5)", width: 2 } },
      { kind: "path", segments: curved, stroke: { width: 3 } },
    ];
    const scratch = createPathScratch();
    const encode = (id: number, retain: boolean) =>
      encodePaths(primitives, id, 1, slotOf, undefined, id, undefined, { scratch, retain });
    const retained = encode(1, true);
    const expected = encodePaths(primitives, 1, 1, slotOf, undefined, 1);
    const borrowed = encode(2, false);
    const next = encode(3, false);
    for (const key of ["lines", "curves", "lineElements", "curveElements"] as const) {
      expect(borrowed[key].buffer).toBe(next[key].buffer);
      expect(retained[key].buffer).not.toBe(next[key].buffer);
      expect(retained[key]).toEqual(expected[key]);
    }
  });

  it("shares the cross-section at every corner of an explicitly closed solid stroke, including its seam", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 0, y: 40 },
    ];
    const segments = new Float32Array(points.flatMap((p, i) => lineSegment(p, points[(i + 1) % points.length])));
    const primitive = { kind: "path" as const, segments, stroke: { width: 4, color: "rgba(0,0,0,0.5)" } };
    const encode = (p: TScenePrimitive) => encodePaths([p], 0, 0, slotOf).lines;
    const joins = encode({ ...primitive, closed: true });
    const open = encode(primitive);
    const dashed = encode({ ...primitive, closed: true, stroke: { width: 4, dash: [4, 2] } });
    expect(joins).toHaveLength(4 * INSTANCE_FLOATS);
    for (let at = 0; at < joins.length; at += INSTANCE_FLOATS) {
      expect(Array.from(joins.subarray(at + 13, at + 16))).toEqual([-1, 1, -1]);
      expect(Array.from(open.subarray(at + 13, at + 16))).toEqual([0, 0, 0]);
      expect(dashed[at + 13]).toBe(240);
      expect(Array.from(joins.subarray(at + 8, at + 12))).toEqual(Array.from(open.subarray(at + 8, at + 12)));
    }
  });

  it("keeps finite joins and a bounded miter when a closed contour nearly reverses direction", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 40 },
    ];
    const segments = new Float32Array(points.flatMap((p, i) => lineSegment(p, points[(i + 1) % points.length])));
    const contour: TScenePrimitive = { kind: "path", closed: true, segments, stroke: { width: 4 } };
    const out = encodePaths([contour], 0, 6, slotOf);
    const slopes: number[] = [];
    for (const data of [out.lines, out.curves]) {
      expect(data.every(Number.isFinite)).toBe(true);
      for (let at = 0; at < data.length; at += INSTANCE_FLOATS) slopes.push(data[at + 14], data[at + 15]);
    }
    // This case exercises the cap in the shader instead of a regular miter.
    expect(Math.max(...slopes.map(Math.abs))).toBeGreaterThan(10);
    // At DPR 1 the shader's maximum reach is 10 * (2px half width + 1px AA).
    expect(new CachedGeometryBounds([contour]).at(() => 1, 1)).toEqual({ minX: -30, maxX: 130, minY: -30, maxY: 70 });
  });

  it("joins only the boundary pieces of a subdivided Bézier to the closing line", () => {
    const segments = new Float32Array([...curved, ...lineSegment({ x: 50, y: 0 }, { x: 0, y: 0 })]);
    const out = encodePaths([{ kind: "path", closed: true, segments, stroke: { width: 2 } }], 0, 6, slotOf);
    const end = out.curves.length - INSTANCE_FLOATS;
    expect(end).toBeGreaterThan(INSTANCE_FLOATS);
    expect(out.lines[13]).toBe(-1);
    expect(out.curves[14]).toBeCloseTo(-1);
    expect(out.curves[end + 15]).toBeCloseTo(1);
    expect(out.curves[INSTANCE_FLOATS + 13]).toBe(0);
    expect(out.curves[15]).toBe(0);
    expect(out.curves[end + 14]).toBe(0);
  });

  it("writes the level mask of a path", () => {
    const out = encodePaths(
      [{ kind: "path", segments: straight, stroke: { color: "#f00", width: 2 }, levelMask: 1 }],
      0,
      0,
      slotOf
    );
    expect(out.lineElements[6]).toBe(1);
  });

  it("encodes a straight path as one line instance", () => {
    const out = encodePaths([{ kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } }], 4, 0, slotOf);
    expect(out.lines).toHaveLength(INSTANCE_FLOATS);
    expect(out.curves).toHaveLength(0);
    expect(Array.from(out.lineElements)).toEqual([4, 0, 0, 0, 0, 1e9, 7, 0]);
    expect(out.curveElements).toHaveLength(0);
    expect(out.lines[12]).toBe(2);
    expect(Array.from(out.lines.slice(13, 16))).toEqual([0, 0, 0]);
    expect(Array.from(out.lines.slice(8, 12))).toEqual([1, 0, 0, 1]);
  });

  it("encodes an unset stroke colour as the base paint on every instance of the path", () => {
    const out = encodePaths(
      [
        { kind: "path", segments: straight, stroke: { width: 2 }, part: "stroke" },
        { kind: "path", segments: curved, stroke: { width: 2 }, part: "stroke" },
        { kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } },
      ],
      0,
      0,
      slotOf
    );
    const colors = (data: Float32Array): number[][] => {
      const out: number[][] = [];
      for (let at = 0; at < data.length; at += INSTANCE_FLOATS) out.push(Array.from(data.slice(at + 8, at + 12)));
      return out;
    };
    expect(colors(out.lines)).toEqual([
      [0, 0, 0, USE_BASE_ALPHA],
      [1, 0, 0, 1],
    ]);
    const curves = colors(out.curves);
    expect(curves.length).toBeGreaterThanOrEqual(1);
    for (const color of curves) expect(color).toEqual([0, 0, 0, USE_BASE_ALPHA]);
  });

  it("skips a path whose stroke width is unset: it draws nothing", () => {
    const out = encodePaths(
      [
        { kind: "path", segments: straight, stroke: { color: "#f00" }, part: "stroke" },
        { kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } },
      ],
      0,
      0,
      slotOf
    );
    expect(out.lines).toHaveLength(INSTANCE_FLOATS);
    expect(Array.from(out.lineElements.slice(0, 2))).toEqual([0, 1]);
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
    expect(Array.from(out.curveElements.slice(0, PATH_ELEMENT_FLOATS))).toEqual([2, 1, 0, 0, 0, 1e9, 15, 10]);
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
    expect(Array.from(out.lineElements)).toEqual([3, 0, 5, 0, 0.25, 2, 7, 0]);
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
    expect(Array.from(out.lines.slice(13, 16))).toEqual([30, 0, 30]);
    expect(Array.from(out.lines.slice(16, 20))).toEqual([4, 2, 0, 0]);
  });

  it("offsets the depth sub-order by the sub base and checks the budget", () => {
    const path: TScenePrimitive = { kind: "path", segments: straight, stroke: { color: "#f00", width: 2 } };
    expect(encodePaths([path], 0, 0, slotOf, () => true, 5).lineElements[1]).toBe(5);
    expect(() => encodePaths([path, path], 0, 0, slotOf, () => true, 31, 31)).toThrow(RangeError);
    expect(encodePaths([path, path], 0, 0, slotOf, () => true, 31).lineElements[PATH_ELEMENT_FLOATS + 1]).toBe(32);
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

import { bezierGeometry } from "../../../../components/canvas/connections/geometry";
import { INSTANCE_FLOATS } from "../../../../components/canvas/connections/webgl/encode";
import { bakeElementStyle } from "../../style";
import type { TScenePrimitive, TSceneStroke } from "../../types";
import { PATH_ELEMENT_FLOATS, encodePaths } from "../encodePaths";
import { OverviewCurveGroups, overviewCamera } from "../overviewCurves";
import { PathDrawIds } from "../pathDrawIds";

const frame = { width: 1600, height: 900, scale: 0.02, dpr: 2, x: 0, y: 0, dimColor: "", time: 0 };

function stock(x = 1000, dy = 4000, dx = 21000, direction: "horizontal" | "vertical" = "horizontal"): Float32Array {
  return bezierGeometry({
    source: { x, y: 1000 },
    target: { x: x + dx, y: 1000 + dy },
    bezierDirection: direction,
    sourceDelegated: false,
    targetDelegated: false,
    connection: { id: "c", sourceBlockId: "a", targetBlockId: "b" },
    points: [],
    useBezier: true,
  })!.segments;
}

function encoded(
  segments: Float32Array,
  stroke: TSceneStroke = { width: 20, color: "rgba(80,120,160,0.55)" },
  originalChords: 8 | 16 = 16
) {
  const primitive: TScenePrimitive = { kind: "path", part: "line", segments, stroke };
  return encodePaths([primitive], 17, 1, () => 3, undefined, 5, undefined, { overviewChords: originalChords });
}

function starts(elements: Float32Array): OverviewCurveGroups {
  const groups = new OverviewCurveGroups();
  groups.update(elements, { kind: "full" });
  return groups;
}

/** Independent barycentric reference of a GPU strip, evaluating both sides of each internal seam. */
function sample(
  paths: Float32Array,
  start: number,
  chords: number,
  u: number,
  v: number,
  device: number,
  merged: boolean
) {
  const segments = 4 * chords;
  const cell = Math.min(segments - 1, Math.floor(u * segments));
  const local = u * segments - cell;
  const vertex = (index: number, side: number) => {
    const original = merged ? Math.min(3, Math.floor(index / chords)) : Math.floor(cell / chords);
    const p = (start + original) * INSTANCE_FLOATS;
    const t = index / chords - original,
      a = 1 - t;
    const center = (axis: number) =>
      device *
      (a ** 3 * paths[p + axis] +
        3 * a * a * t * paths[p + 2 + axis] +
        3 * a * t * t * paths[p + 4 + axis] +
        t ** 3 * paths[p + 6 + axis]);
    const tangent = (axis: number) =>
      a * a * (paths[p + 2 + axis] - paths[p + axis]) +
      2 * a * t * (paths[p + 4 + axis] - paths[p + 2 + axis]) +
      t * t * (paths[p + 6 + axis] - paths[p + 4 + axis]);
    const dx = tangent(0),
      dy = tangent(1);
    const width = Math.max(0.5, (device * paths[p + 12]) / 2) + 1;
    const k = (side * width) / Math.hypot(dx, dy);
    return [center(0) - k * dy, center(1) + k * dx];
  };
  const vertices =
    local + v <= 1
      ? [vertex(cell, -1), vertex(cell, 1), vertex(cell + 1, -1)]
      : [vertex(cell, 1), vertex(cell + 1, -1), vertex(cell + 1, 1)];
  const weights = local + v <= 1 ? [1 - local - v, v, local] : [1 - local, 1 - v, local + v - 1];
  return [0, 1].map((axis) => vertices.reduce((sum, vertex, i) => sum + vertex[axis] * weights[i], 0));
}

describe("resident overview curve groups", () => {
  it("switches only in the certified device band with a well-conditioned camera", () => {
    expect(overviewCamera(frame)).toBe(true);
    for (const next of [{ scale: 0.04 }, { scale: 0.002 }, { x: 1e8 }, { width: 0 }, { dpr: Infinity }])
      expect(overviewCamera({ ...frame, ...next })).toBe(false);
    expect(overviewCamera({ ...frame, scale: 1 / 32 }, true)).toBe(true);
  });

  it.each([1 / 128, 1 / 16])("returns to detail once and waits for a deeper zoom at the %p boundary", (edge) => {
    const inside = edge * (edge === 1 / 128 ? 1.002 : 0.998);
    const outside = edge * (edge === 1 / 128 ? 0.998 : 1.002);
    let active = false;
    const zoom = (deviceScale: number) => {
      active = overviewCamera({ ...frame, scale: deviceScale / frame.dpr }, active);
      return active;
    };
    expect(zoom(inside)).toBe(false);
    expect(zoom(0.02)).toBe(true);
    expect(zoom(inside)).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect(zoom(outside)).toBe(false);
      expect(zoom(inside)).toBe(false);
    }
    expect(zoom(0.02)).toBe(true);
    expect(overviewCamera({ ...frame, x: 1e8 }, active)).toBe(false);
  });

  it("uses the minimum one-pixel drawing buffer on both axes", () => {
    expect(overviewCamera({ ...frame, dpr: 1, width: 0.1 })).toBe(false);
    expect(overviewCamera({ ...frame, dpr: 1, height: 0.1 })).toBe(false);
    expect(overviewCamera({ ...frame, dpr: 1, width: 1, height: 1 })).toBe(true);
  });

  it("retains exact records for custom segments, hard dashes, pixel width and width overrides", () => {
    const segments = stock();
    expect(encoded(segments).hasOverview).toBe(true);
    expect(encoded(segments.slice()).hasOverview).toBe(false);
    expect(encoded(segments, { width: 2, dash: [1, 1] }).hasOverview).toBe(false);
    const [path] = bakeElementStyle([{ kind: "path", part: "line", segments, stroke: { width: 2 } }], {
      parts: { line: { width: { px: 3, minWorld: 1, maxWorld: 20 } } },
    });
    expect(path.kind).toBe("path");
    if (path.kind === "path") expect(encoded(path.segments, path.stroke).hasOverview).toBe(false);
  });

  it("selects pairs from ordinary opaque stock curves that the existing bin submits with eight chords", () => {
    const mesh = encoded(stock(), { width: 2, color: "#def" }, 8);
    const groups = new OverviewCurveGroups(2);
    groups.update(mesh.curveElements, { kind: "full" });
    const ids = new PathDrawIds();
    const count = mesh.curves.length / INSTANCE_FLOATS;
    ids.update([{ first: 0, count }], [groups]);
    expect(ids.data.length).toBeLessThan(count);
  });

  it("bounds the complete translucent strip against canonical endpoints, interiors and both ends of every seam", () => {
    let groups = 0,
      worst = 0;
    for (const [x, dy, width, dx, direction] of [
      [0, 1000, 2, 21000, "horizontal"],
      [1000, 4000, 20, 21000, "horizontal"],
      [23000, -8000, 35, -21000, "horizontal"],
      [50000, 9000, 4, 21000, "vertical"],
    ] as const) {
      const mesh = encoded(stock(x, dy, dx, direction), { width, color: "rgba(20,30,40,.55)" });
      const flags = starts(mesh.curveElements).starts;
      for (let i = 0; i < flags.length; i++) {
        if (!flags[i]) continue;
        groups++;
        for (const device of [1 / 128, 0.04, 1 / 16])
          for (let t = 0; t <= 128; t++)
            for (const shift of [0, -1e-9])
              for (const side of [0, 0.25, 0.5, 0.75, 1]) {
                const u = Math.max(0, t / 128 + shift);
                const a = sample(mesh.curves, i, 16, u, side, device, false);
                const b = sample(mesh.curves, i, 4, u, side, device, true);
                worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
              }
      }
    }
    expect(groups).toBeGreaterThan(4);
    expect(worst).toBeLessThan(1 / 8);
  });

  it("drops truncated starts without a GPU write and recreates them on tail reuse", () => {
    const elements = new Float32Array(6 * PATH_ELEMENT_FLOATS);
    for (let i = 2; i < 6; i++) elements.set([1, 0, 2, 0, 0, 10, 7, -4 - (i - 2)], i * 8);
    const groups = starts(elements);
    expect(groups.count).toBe(1);
    groups.update(elements.subarray(0, 4 * PATH_ELEMENT_FLOATS), { kind: "none" });
    expect(groups.count).toBe(0);
    groups.update(elements.subarray(0, 0), { kind: "none" });
    groups.update(elements, { kind: "range", bytes: elements.byteLength, spans: [{ byteOffset: 0, data: elements }] });
    expect(groups.count).toBe(1);
  });

  it("preserves packed draw boundaries across local regrouping and consumers that skip an edit", () => {
    const elements = new Float32Array(16 * PATH_ELEMENT_FLOATS);
    for (const first of [4, 12]) {
      for (let i = 0; i < 4; i++) elements.set([first, 0, 0, 0, 0, 0, 0, -1 - i], (first + i) * PATH_ELEMENT_FLOATS);
    }
    const groups = starts(elements);
    const spans = [
      { first: 0, count: 4 },
      { first: 4, count: 4 },
      { first: 8, count: 2 },
      { first: 10, count: 0 },
      { first: 12, count: 4 },
    ];
    const active = new PathDrawIds();
    const lagging = new PathDrawIds();
    for (const ids of [active, lagging]) ids.updatePlan(spans, [groups]);
    const replaceOwner = (slot: number) => {
      const data = elements.subarray(slot * PATH_ELEMENT_FLOATS, (slot + 1) * PATH_ELEMENT_FLOATS);
      data[0] = 99;
      groups.update(elements, {
        kind: "range",
        bytes: data.byteLength,
        spans: [{ byteOffset: data.byteOffset, data }],
      });
    };

    replaceOwner(5);
    replaceOwner(5);
    expect(active.updatePlan(spans, [groups])).toEqual({
      byteOffset: 16,
      data: new Float32Array([4, 5, 6, 7, 8, 9, -13]),
    });
    expect(active.offset(10)).toBe(10);
    replaceOwner(13);
    for (const ids of [active, lagging]) {
      ids.updatePlan(spans, [groups]);
      expect(Array.from(ids.data)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15]);
      expect([ids.offset(4), ids.offset(8), ids.offset(10), ids.offset(14)]).toEqual([4, 8, 10, 14]);
    }
  });

  it("updates starts beside a local write across a 128-record chunk, removal and owner reuse", () => {
    const elements = new Float32Array(200 * PATH_ELEMENT_FLOATS);
    const add = (start: number, owner: number) => {
      for (let i = 0; i < 4; i++) elements.set([owner, 5, 3, 0, 0, 10, 7, -4 - i], (start + i) * PATH_ELEMENT_FLOATS);
    };
    add(126, 1);
    add(160, 2);
    const groups = starts(elements);
    expect(groups.count).toBe(2);
    const ids = new PathDrawIds();
    const spans = [
      { first: 126, count: 4 },
      { first: 160, count: 4 },
    ];
    ids.update(spans, [groups]);
    expect(Array.from(ids.data)).toEqual([-127, -161]);
    const refresh = (at: number) =>
      groups.update(elements, {
        kind: "range",
        bytes: 32,
        spans: [
          {
            byteOffset: at * 32,
            data: elements.subarray(at * 8, (at + 1) * 8),
          },
        ],
      });
    elements[128 * 8 + 1]++;
    refresh(128);
    expect(groups.count).toBe(1);
    ids.update(spans, [groups]);
    expect(Array.from(ids.data)).toEqual([126, 127, 128, 129, -161]);
    add(126, 3);
    for (let i = 126; i < 130; i++) refresh(i);
    expect(groups.count).toBe(2);
    elements.fill(0, 126 * 8, 130 * 8);
    for (let i = 126; i < 130; i++) refresh(i);
    expect(groups.count).toBe(1);
    const revision = groups.revision;
    refresh(180);
    expect(groups.revision).toBe(revision);
  });
});

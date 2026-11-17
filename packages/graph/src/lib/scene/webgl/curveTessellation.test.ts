import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";

import { InstanceRanges } from "./InstanceRanges";
import { canCoarsenCurves, createCurveBins, curveChords, partitionCurves } from "./curveTessellation";
import { PATH_ELEMENT_FLOATS } from "./encodePaths";

const gentle = [0, 0, 10, 0, 20, 0.5, 30, 1];
const moderate = [0, 0, 100, 0, 200, 15, 300, 30];
const sharp = [0, 0, 10, 0, 20, 4, 30, 8];

function path(points: number[], width = 2): Float32Array {
  const out = new Float32Array(INSTANCE_FLOATS);
  out.set(points);
  out[12] = width;
  return out;
}

/** Independent reference: affine interpolation in the actual strip's two triangles, not its centreline. */
function strip(s: Float32Array, chords: number, t: number, side: number, scale: number): number[] {
  const j = Math.min(chords - 1, Math.floor(t * chords));
  const u = t * chords - j;
  const v = (side + 1) / 2;
  const at = (time: number, sign: number): number[] => {
    const a = 1 - time;
    let dx = 3 * a * a * (s[2] - s[0]) + 6 * a * time * (s[4] - s[2]) + 3 * time * time * (s[6] - s[4]);
    let dy = 3 * a * a * (s[3] - s[1]) + 6 * a * time * (s[5] - s[3]) + 3 * time * time * (s[7] - s[5]);
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    const extent = Math.max((s[12] * scale) / 2, 0.5) + 1;
    return [
      (a ** 3 * s[0] + 3 * a * a * time * s[2] + 3 * a * time * time * s[4] + time ** 3 * s[6]) * scale -
        dy * sign * extent,
      (a ** 3 * s[1] + 3 * a * a * time * s[3] + 3 * a * time * time * s[5] + time ** 3 * s[7]) * scale +
        dx * sign * extent,
    ];
  };
  const vertices =
    u + v <= 1
      ? [at(j / chords, -1), at(j / chords, 1), at((j + 1) / chords, -1)]
      : [at(j / chords, 1), at((j + 1) / chords, -1), at((j + 1) / chords, 1)];
  const weights = u + v <= 1 ? [1 - u - v, v, u] : [1 - u, 1 - v, u + v - 1];
  return [0, 1].map((axis) => vertices.reduce((sum, point, k) => sum + point[axis] * weights[k], 0));
}

describe("resident curve tessellation", () => {
  it("certifies gentle and moderate pieces for eight chords, retaining sharper pieces at sixteen", () => {
    expect(curveChords(path(gentle), 0)).toBe(8);
    expect(curveChords(path(sharp), 0)).toBe(16);
    expect(curveChords(path(moderate), 0)).toBe(8);
  });

  it("keeps wide strokes, cusps, degenerate tangents and large or invalid coordinates at sixteen", () => {
    for (const data of [
      path(moderate, 100),
      path([0, 0, 1, 0, -1, 0, 0, 0]),
      path([0, 0, 0, 0, 10, 0, 20, 0]),
      path(gentle.map((value) => value + 1e8)),
      path([NaN, ...gentle.slice(1)]),
      path(gentle, Infinity),
    ])
      expect(curveChords(data, 0)).toBe(16);
  });

  it("bounds the whole triangle strip and its AA contours, including interior diagonal crossings", () => {
    let seed = 17;
    const random = (): number => (seed = (1664525 * seed + 1013904223) % 2 ** 32) / 2 ** 32;
    let accepted = 0;
    for (let k = 0; k < 200; k++) {
      const x = random() * 10000;
      const length = 10 + random() * 200;
      const rise = random() * 10;
      const s = path(
        [x, 0, x + length, random() * rise, x + 2 * length, rise, x + 3 * length, rise * 2],
        random() * 30
      );
      const chords = curveChords(s, 0);
      if (chords === 16) continue;
      accepted++;
      for (const scale of [0.01, 0.125]) {
        for (let i = 0; i <= 32; i++)
          for (let j = 0; j <= 8; j++) {
            const a = strip(s, 16, i / 32, j / 4 - 1, scale);
            const b = strip(s, chords, i / 32, j / 4 - 1, scale);
            expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThanOrEqual(0.125);
          }
      }
    }
    expect(accepted).toBeGreaterThan(50);
  });

  it("uses full detail beyond the device scale, for translated origins and imprecise camera projections", () => {
    const frame = { width: 1600, height: 1000, x: 0, y: 0, scale: 0.038, dpr: 2, time: 0, dimColor: "" };
    expect(canCoarsenCurves(frame, true)).toBe(true);
    expect(canCoarsenCurves({ ...frame, scale: 0.063 }, true)).toBe(false);
    expect(canCoarsenCurves({ ...frame, dpr: 4 }, true)).toBe(false);
    expect(canCoarsenCurves(frame, false)).toBe(false);
    expect(canCoarsenCurves({ ...frame, x: 1e8 }, true)).toBe(false);
    expect(canCoarsenCurves({ ...frame, scale: NaN }, true)).toBe(false);
  });

  it("keeps resident counts across a certificate change, updating only the edited instance", () => {
    const bins = createCurveBins();
    const elements = new Float32Array([0, 0, 0, 0, 0, 1e9, 7, 0]);
    partitionCurves(bins, path(gentle), elements);
    const resident = bins.map(() => new InstanceRanges(INSTANCE_FLOATS));
    const write = (): void =>
      bins.forEach((bin, i) => resident[i].set("edge", bin.paths.subarray(0, bin.count * INSTANCE_FLOATS)));
    write();
    for (const ranges of resident) ranges.takeUpload();
    const counts = bins.map((bin) => bin.count);
    partitionCurves(bins, path(sharp), elements, counts);
    expect(bins.map((bin) => bin.count)).toEqual(counts);
    expect(bins[0].paths[20]).toBe(16);
    write();
    expect(resident[0].takeUpload()).toMatchObject({ kind: "range", bytes: INSTANCE_FLOATS * 4 });
    expect(resident[1].takeUpload()).toEqual({ kind: "none" });
    partitionCurves(bins, path(gentle), elements, counts);
    expect(bins[0].paths[20]).toBe(8);
  });

  it("fills resident quotas without losing records, companion owners or overflow detail", () => {
    const paths = new Float32Array(INSTANCE_FLOATS * 4);
    [path(gentle), path(moderate), path(moderate, 100), path(moderate, 100)].forEach((data, i) =>
      paths.set(data, i * INSTANCE_FLOATS)
    );
    const elements = new Float32Array(PATH_ELEMENT_FLOATS * 4);
    for (let i = 0; i < 4; i++) {
      paths[i * INSTANCE_FLOATS + 8] = i + 1;
      elements.set([i + 1, 0, 0, 0, 0, 1e9, 7, 0], i * PATH_ELEMENT_FLOATS);
    }
    const bins = createCurveBins();
    partitionCurves(bins, paths, elements, [3, 1]);
    expect(bins.map((bin) => bin.count)).toEqual([3, 1]);
    const ids: number[] = [];
    for (const bin of bins)
      for (let i = 0; i < bin.count; i++) {
        const id = bin.paths[i * INSTANCE_FLOATS + 8];
        expect(bin.elements[i * PATH_ELEMENT_FLOATS]).toBe(id);
        ids.push(id);
      }
    expect(ids.sort()).toEqual([1, 2, 3, 4]);
    expect([bins[0].paths[20], bins[0].paths[2 * INSTANCE_FLOATS + 20]]).toEqual([8, 16]);
  });

  it("partitions full records with companion data, retaining dashed and pixel-width pieces", () => {
    const paths = new Float32Array(INSTANCE_FLOATS * 4);
    [path(gentle), path(moderate), path(gentle), path(gentle)].forEach((data, i) =>
      paths.set(data, i * INSTANCE_FLOATS)
    );
    paths[2 * INSTANCE_FLOATS + 16] = 2;
    const elements = new Float32Array(PATH_ELEMENT_FLOATS * 4);
    for (let i = 0; i < 4; i++) elements.set([i + 1, i, 0, 0, 0, 1e9, i === 3 ? 15 : 7, 0], i * PATH_ELEMENT_FLOATS);
    const bins = createCurveBins();
    partitionCurves(bins, paths, elements);
    expect(bins.map((bin) => bin.count)).toEqual([2, 2]);
    const expected = paths.slice(0, INSTANCE_FLOATS);
    expected[20] = 8;
    expect(bins[0].paths.slice(0, INSTANCE_FLOATS)).toEqual(expected);
    expect([bins[0].elements[0], bins[0].elements[8], bins[1].elements[0], bins[1].elements[8]]).toEqual([1, 2, 3, 4]);
    partitionCurves(bins, paths.subarray(0, INSTANCE_FLOATS), elements.subarray(0, PATH_ELEMENT_FLOATS));
    expect(bins.map((bin) => bin.count)).toEqual([1, 0]);
  });
});

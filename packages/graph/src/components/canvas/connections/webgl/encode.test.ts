import type { TLineStroke, TWebGLShape } from "../lines/types";

import { INSTANCE_FLOATS, countPieces, encodeShapes } from "./encode";

const shape = (segments: number[], stroke: Partial<TLineStroke> = {}): TWebGLShape => ({
  segments: new Float32Array(segments),
  stroke: { color: "#ff8000", width: 3, ...stroke },
});

function instance(out: Float32Array, index: number): number[] {
  return Array.from(out.subarray(index * INSTANCE_FLOATS, (index + 1) * INSTANCE_FLOATS));
}

test("an instance is 28 floats", () => {
  expect(INSTANCE_FLOATS).toBe(28);
});

test("writes one instance per cubic with the stroke: color, width, connection length, distances, dash", () => {
  const shapes = [
    shape([0, 0, 10, 0, 20, 0, 30, 0]),
    shape([0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60], {
      color: "rgba(0, 0, 255, 0.5)",
      dash: { pattern: [6, 4] },
    }),
  ];
  expect(countPieces(shapes)).toBe(3);
  const out = new Float32Array(3 * INSTANCE_FLOATS);
  expect(encodeShapes(shapes, out)).toBe(3);

  const first = instance(out, 0);
  expect(first.slice(0, 8)).toEqual([0, 0, 10, 0, 20, 0, 30, 0]);
  // Straight rgba in 0..1.
  expect(first.slice(8, 12).map((value) => Math.round(value * 255))).toEqual([255, 128, 0, 255]);
  // Width, a 30-long connection, the piece starts at 0 and is 30 long; no dash.
  expect(first.slice(12, 16)).toEqual([3, 30, 0, 30]);
  expect(first.slice(16, 20)).toEqual([0, 0, 0, 0]);

  const second = instance(out, 1);
  expect(second.slice(8, 12)).toEqual([0, 0, 1, 0.5]);
  // Two 30-unit segments: one connection of 60, repeated in both instances.
  expect(second.slice(12, 16)).toEqual([3, 60, 0, 30]);
  // A 2-number pattern leaves the second on/off pair at zero.
  expect(second.slice(16, 20)).toEqual([6, 4, 0, 0]);
  expect(instance(out, 2).slice(12, 20)).toEqual([3, 60, 30, 30, 6, 4, 0, 0]);
});

describe("dash patterns, normalized like canvas setLineDash", () => {
  const env = process.env.NODE_ENV;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
  });

  const dashOf = (pattern: readonly number[]): number[] => {
    const out = new Float32Array(INSTANCE_FLOATS);
    encodeShapes([shape([0, 0, 10, 0, 20, 0, 30, 0], { dash: { pattern } })], out);
    return Array.from(out.subarray(16, 20));
  };

  it("draws up to two on/off pairs and repeats an odd-length pattern", () => {
    expect(dashOf([5, 3, 1, 3])).toEqual([5, 3, 1, 3]);
    expect(dashOf([5])).toEqual([5, 5, 0, 0]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("draws the first four numbers of a longer pattern and warns once per pattern", () => {
    // [4, 2, 1] repeats to [4, 2, 1, 4, 2, 1].
    expect(dashOf([4, 2, 1])).toEqual([4, 2, 1, 4]);
    expect(dashOf([4, 2, 1])).toEqual([4, 2, 1, 4]);
    expect(dashOf([1, 2, 3, 4, 5, 6])).toEqual([1, 2, 3, 4]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/^\[@gravity-ui\/graph\] /);
    expect(warn.mock.calls[0][0]).toContain("[4, 2, 1]");
    expect(warn.mock.calls[0][0]).toContain("[4, 2, 1, 4]");
  });

  it("does not warn in a production build", () => {
    process.env.NODE_ENV = "production";
    expect(dashOf([7, 1, 7, 1, 7, 1])).toEqual([7, 1, 7, 1]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("draws an empty pattern or one with a negative or non-finite number solid", () => {
    expect(dashOf([])).toEqual([0, 0, 0, 0]);
    expect(dashOf([6, -4])).toEqual([0, 0, 0, 0]);
    expect(dashOf([6, Number.NaN])).toEqual([0, 0, 0, 0]);
  });
});

test("distances run on across the segments of one shape and start again with the next shape", () => {
  const shapes = [shape([0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60]), shape([0, 0, 10, 0, 20, 0, 30, 0])];
  const out = new Float32Array(3 * INSTANCE_FLOATS);
  encodeShapes(shapes, out);
  expect(instance(out, 0).slice(14, 16)).toEqual([0, 30]);
  // The second segment starts where the first ended.
  expect(instance(out, 1).slice(14, 16)).toEqual([30, 30]);
  expect(instance(out, 2).slice(14, 16)).toEqual([0, 30]);
});

test("leaves the effect params at zero without params", () => {
  const out = new Float32Array(2 * INSTANCE_FLOATS).fill(9);
  encodeShapes([shape([0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60])], out);
  expect(instance(out, 0).slice(20, 28)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect(instance(out, 1).slice(20, 28)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

test("writes a shape's params into every instance, missing ones as zero and at most eight", () => {
  const segments = [0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60];
  const shapes: TWebGLShape[] = [
    { ...shape(segments), params: [1, 2.5, -3] },
    { ...shape([0, 0, 10, 0, 20, 0, 30, 0]), params: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  ];
  const out = new Float32Array(3 * INSTANCE_FLOATS).fill(9);
  expect(encodeShapes(shapes, out)).toBe(3);
  expect(instance(out, 0).slice(20, 28)).toEqual([1, 2.5, -3, 0, 0, 0, 0, 0]);
  expect(instance(out, 1).slice(20, 28)).toEqual([1, 2.5, -3, 0, 0, 0, 0, 0]);
  expect(instance(out, 2).slice(20, 28)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  // The params stay inside their floats: the next instance starts with its own p0.
  expect(instance(out, 2).slice(0, 2)).toEqual([0, 0]);
});

test("a shape without segments writes nothing", () => {
  const shapes = [shape([])];
  expect(countPieces(shapes)).toBe(0);
  expect(encodeShapes(shapes, new Float32Array(0))).toBe(0);
});

function cubicAt(s: ArrayLike<number>, o: number, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * s[o] + b * s[o + 2] + c * s[o + 4] + d * s[o + 6],
    a * s[o + 1] + b * s[o + 3] + c * s[o + 5] + d * s[o + 7],
  ];
}

test("splits a strongly curved cubic into continuous pieces that follow it, with one connection length", () => {
  const segments = [0, 0, 0, 3000, 100, -3000, 100, 0];
  const shapes = [shape(segments)];
  const count = countPieces(shapes);
  expect(count).toBeGreaterThan(1);
  const out = new Float32Array(count * INSTANCE_FLOATS);
  expect(encodeShapes(shapes, out)).toBe(count);

  let total = 0;
  for (let k = 0; k < count; k++) {
    const base = k * INSTANCE_FLOATS;
    // Each piece is the original cubic over [k / count, (k + 1) / count].
    for (const t of [0, 0.5, 1]) {
      const [x, y] = cubicAt(out, base, t);
      const [ox, oy] = cubicAt(segments, 0, (k + t) / count);
      expect(x).toBeCloseTo(ox, 1);
      expect(y).toBeCloseTo(oy, 1);
    }
    if (k > 0) {
      const previous = (k - 1) * INSTANCE_FLOATS;
      expect(out[base + 14]).toBeCloseTo(out[previous + 14] + out[previous + 15], 2);
    }
    total += out[base + 15];
  }
  // Every piece carries the whole connection's length: the sum of the piece lengths.
  for (let k = 0; k < count; k++) expect(out[k * INSTANCE_FLOATS + 13]).toBeCloseTo(total, 1);
});

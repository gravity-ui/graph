import type { TLineInteraction, TLineStroke, TWebGLShape } from "../lines/types";

import { INSTANCE_ATTRIBUTES, INSTANCE_FLOATS, createEncodedChunk, encodeShapes, piecesAt } from "./encode";
import type { TInstances } from "./encode";

const shape = (segments: number[], stroke: Partial<TLineStroke> = {}): TWebGLShape => ({
  segments: new Float32Array(segments),
  stroke: { color: "#ff8000", width: 3, ...stroke },
});

function instance(instances: TInstances, index: number): number[] {
  return Array.from(instances.data.subarray(index * INSTANCE_FLOATS, (index + 1) * INSTANCE_FLOATS));
}

/** Encoded line instances whose floats start as `fill`, so tests see which ones the encoder writes. */
function filledChunk(instances: number, fill: number): ReturnType<typeof createEncodedChunk> {
  const out = createEncodedChunk();
  out.lines.data = new Float32Array(instances * INSTANCE_FLOATS).fill(fill);
  return out;
}

test("an instance is 32 floats, the interaction last at location 8", () => {
  expect(INSTANCE_FLOATS).toBe(32);
  expect(INSTANCE_ATTRIBUTES[INSTANCE_ATTRIBUTES.length - 1]).toEqual([8, 4, 28]);
});

test("writes one instance per cubic with the stroke: color, width, connection length, distances, dash", () => {
  const shapes = [
    shape([0, 0, 10, 0, 20, 0, 30, 0]),
    shape([0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60], {
      color: "rgba(0, 0, 255, 0.5)",
      dash: { pattern: [6, 4] },
    }),
  ];
  const out = createEncodedChunk();
  encodeShapes(shapes, 0, out);
  // Straight segments: line instances only.
  expect([out.lines.count, out.curves.count]).toEqual([3, 0]);

  const first = instance(out.lines, 0);
  expect(first.slice(0, 8)).toEqual([0, 0, 10, 0, 20, 0, 30, 0]);
  // Straight rgba in 0..1.
  expect(first.slice(8, 12).map((value) => Math.round(value * 255))).toEqual([255, 128, 0, 255]);
  // Width, a 30-long connection, the piece starts at 0 and is 30 long; no dash.
  expect(first.slice(12, 16)).toEqual([3, 30, 0, 30]);
  expect(first.slice(16, 20)).toEqual([0, 0, 0, 0]);

  const second = instance(out.lines, 1);
  expect(second.slice(8, 12)).toEqual([0, 0, 1, 0.5]);
  // Two 30-unit segments: one connection of 60, repeated in both instances.
  expect(second.slice(12, 16)).toEqual([3, 60, 0, 30]);
  // A 2-number pattern leaves the second on/off pair at zero.
  expect(second.slice(16, 20)).toEqual([6, 4, 0, 0]);
  expect(instance(out.lines, 2).slice(12, 20)).toEqual([3, 60, 30, 30, 6, 4, 0, 0]);
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
    const out = createEncodedChunk();
    encodeShapes([shape([0, 0, 10, 0, 20, 0, 30, 0], { dash: { pattern } })], 0, out);
    return instance(out.lines, 0).slice(16, 20);
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
  const out = createEncodedChunk();
  encodeShapes(shapes, 0, out);
  expect(instance(out.lines, 0).slice(14, 16)).toEqual([0, 30]);
  // The second segment starts where the first ended.
  expect(instance(out.lines, 1).slice(14, 16)).toEqual([30, 30]);
  expect(instance(out.lines, 2).slice(14, 16)).toEqual([0, 30]);
});

test("leaves the effect params at zero without params", () => {
  const out = filledChunk(2, 9);
  encodeShapes([shape([0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60])], 0, out);
  expect(instance(out.lines, 0).slice(20, 28)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect(instance(out.lines, 1).slice(20, 28)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

test("writes a shape's params into every instance, missing ones as zero and at most eight", () => {
  const segments = [0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60];
  const shapes: TWebGLShape[] = [
    { ...shape(segments), params: [1, 2.5, -3] },
    { ...shape([0, 0, 10, 0, 20, 0, 30, 0]), params: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  ];
  const out = filledChunk(3, 9);
  encodeShapes(shapes, 0, out);
  expect(out.lines.count).toBe(3);
  expect(instance(out.lines, 0).slice(20, 28)).toEqual([1, 2.5, -3, 0, 0, 0, 0, 0]);
  expect(instance(out.lines, 1).slice(20, 28)).toEqual([1, 2.5, -3, 0, 0, 0, 0, 0]);
  expect(instance(out.lines, 2).slice(20, 28)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  // The params stay inside their floats: the next instance starts with its own p0.
  expect(instance(out.lines, 2).slice(0, 2)).toEqual([0, 0]);
});

describe("the interaction floats: selection rgb, then hovered + 2 selected + 4 round(selection alpha * 255)", () => {
  const segments = [0, 0, 10, 0, 20, 0, 30, 0];

  /** The interaction floats of the shape's first line instance; the rgb in 0..255. */
  const interactionOf = (interaction: TLineInteraction | undefined): number[] => {
    const out = filledChunk(1, 9);
    encodeShapes([{ ...shape(segments), interaction }], 0, out);
    const floats = instance(out.lines, 0).slice(28, 32);
    return [...floats.slice(0, 3).map((value) => Math.round(value * 255)), floats[3]];
  };

  it("packs the flags over the selection alpha, whatever the state", () => {
    const selectionColor = "#ffcc00";
    expect(interactionOf({ hovered: false, selected: false, selectionColor })).toEqual([255, 204, 0, 1020]);
    expect(interactionOf({ hovered: true, selected: false, selectionColor })).toEqual([255, 204, 0, 1021]);
    expect(interactionOf({ hovered: false, selected: true, selectionColor })).toEqual([255, 204, 0, 1022]);
    expect(interactionOf({ hovered: true, selected: true, selectionColor })).toEqual([255, 204, 0, 1023]);
  });

  it("keeps a translucent selection color's alpha in 1/255 steps", () => {
    const selectionColor = "rgba(0, 0, 255, 0.5)";
    // round(0.5 * 255) = 128.
    expect(interactionOf({ hovered: false, selected: true, selectionColor })).toEqual([0, 0, 255, 2 + 4 * 128]);
    expect(interactionOf({ hovered: false, selected: false, selectionColor: "rgba(0, 0, 0, 0)" })).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("writes zeros for a shape without an interaction (an arrow)", () => {
    expect(interactionOf(undefined)).toEqual([0, 0, 0, 0]);
  });

  it("writes the interaction into every instance of the shape, curve pieces included", () => {
    const curve = [0, 0, 0, 3000, 100, -3000, 100, 0];
    const out = createEncodedChunk();
    const interaction = { hovered: true, selected: true, selectionColor: "#ffcc00" };
    encodeShapes([{ ...shape([...segments, ...curve]), interaction }, shape(segments)], 0, out);
    expect(out.curves.count).toBeGreaterThan(1);
    for (let i = 0; i < out.curves.count; i++) expect(instance(out.curves, i)[31]).toBe(1023);
    expect(instance(out.lines, 0)[31]).toBe(1023);
    // The next shape has none; the floats before stay the params.
    expect(instance(out.lines, 1).slice(20, 32)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

test("a shape without segments writes nothing", () => {
  const out = createEncodedChunk();
  encodeShapes([shape([])], 0, out);
  expect([out.lines.count, out.curves.count]).toEqual([0, 0]);
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
  const count = piecesAt(segments, 0, 0);
  expect(count).toBeGreaterThan(1);
  const encoded = createEncodedChunk();
  encodeShapes([shape(segments)], 0, encoded);
  expect([encoded.lines.count, encoded.curves.count]).toEqual([0, count]);
  const out = encoded.curves.data;

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

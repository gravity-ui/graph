import type { IConnectionBatchItem } from "../batch";
import { generateBezierParams } from "../bezierHelpers";
import { defineConnectionEffect, toConnectionEffect } from "../effects/ConnectionEffect";
import { bezierSegment, lineSegment } from "../geometry/segments";
import type { TWebGLShape } from "../lines/types";

import { WebGLBatchBackend } from "./WebGLBatchBackend";
import type { TGLChunk } from "./WebGLBatchBackend";
import {
  CURVE_CHORDS,
  INSTANCE_FLOATS,
  TESSELLATION_TOLERANCE,
  createEncodedChunk,
  encodeShapes,
  piecesAt,
  scaleBucket,
} from "./encode";
import type { TInstances } from "./encode";
import { createFakeGL } from "./fakeGL";
import type { TFakeGL } from "./fakeGL";
import { ConnectionPrograms } from "./programs";
import { getWebGLConnectionsStats, resetWebGLConnectionsStats } from "./stats";

const [P0, C1, C2, P3] = generateBezierParams({ x: 0, y: 0 }, { x: 3000, y: 800 });

/** A long horizontal bezier like the connections of a Nirvana graph. */
const LONG_BEZIER = new Float32Array(bezierSegment(P0, C1, C2, P3));

/** Handle length of the cubic closest to a quarter circle, per unit of radius. */
const KAPPA = (4 / 3) * (Math.SQRT2 - 1);

const RADIUS = 100;

/** A quarter circle of `RADIUS` around the origin, from (r, 0) to (0, r), as one cubic. */
const QUARTER_CIRCLE = new Float32Array([RADIUS, 0, RADIUS, KAPPA * RADIUS, KAPPA * RADIUS, RADIUS, 0, RADIUS]);

/** Vertices of the two templates: a straight segment is one quad, a curve piece `CURVE_CHORDS` chords. */
const LINE_VERTICES = 4;
const CURVE_VERTICES = 2 * (CURVE_CHORDS + 1);

const shape = (segments: ArrayLike<number>): TWebGLShape => ({
  segments: new Float32Array(segments),
  stroke: { color: "#000", width: 2 },
});

function instance(instances: TInstances, index: number): Float32Array {
  return instances.data.subarray(index * INSTANCE_FLOATS, (index + 1) * INSTANCE_FLOATS);
}

/** The connection length every instance of a lone shape carries, encoded at `bucket`. */
function lengthAt(segments: ArrayLike<number>, bucket: number): number {
  const out = createEncodedChunk();
  encodeShapes([shape(segments)], bucket, out);
  const first = out.lines.count ? out.lines : out.curves;
  return instance(first, 0)[13];
}

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

function distanceToChord(x: number, y: number, [ax, ay]: number[], [bx, by]: number[]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** World distance between the cubic and the uniform chords the curve template draws for its pieces. */
function chordDeviation(segments: ArrayLike<number>, pieces: number): number {
  const chords = pieces * CURVE_CHORDS;
  let deviation = 0;
  for (let i = 0; i < chords; i++) {
    const from = cubicAt(segments, 0, i / chords);
    const to = cubicAt(segments, 0, (i + 1) / chords);
    for (let k = 1; k < 8; k++) {
      const [x, y] = cubicAt(segments, 0, (i + k / 8) / chords);
      deviation = Math.max(deviation, distanceToChord(x, y, from, to));
    }
  }
  return deviation;
}

describe("scaleBucket", () => {
  it("is the power of two at or above the scale", () => {
    expect([1, 0.5, 0.6, 2, 3].map(scaleBucket)).toEqual([0, -1, 0, 1, 2]);
    // Scale 0.01 is drawn with the tessellation of 2^-6 = 0.0156.
    expect(scaleBucket(0.01)).toBe(-6);
    for (const scale of [0.003, 0.01, 0.07, 0.3, 0.9, 1, 1.5, 7]) {
      const bucket = scaleBucket(scale);
      expect(2 ** bucket).toBeGreaterThanOrEqual(scale);
      expect(2 ** (bucket - 1)).toBeLessThan(scale);
    }
  });

  it("stays within -12..4, also for scales that are not positive numbers", () => {
    expect([1e-6, 0, -1, Number.NaN, 1000, Infinity].map(scaleBucket)).toEqual([-12, -12, -12, -12, 4, 4]);
  });
});

describe("piecesAt", () => {
  it("draws a straight segment as one piece at every bucket", () => {
    const segment = lineSegment({ x: 0, y: 0 }, { x: 5000, y: 3000 });
    for (let bucket = -12; bucket <= 4; bucket++) expect(piecesAt(segment, 0, bucket)).toBe(1);
  });

  it("splits a long bezier less when zoomed out: one piece at scale 0.01, at most 64", () => {
    const pieces = [-7, -3, 0, 1].map((bucket) => piecesAt(LONG_BEZIER, 0, bucket));
    expect(pieces).toEqual([1, 2, 5, 7]);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i]).toBeGreaterThanOrEqual(pieces[i - 1]);
    expect(piecesAt(LONG_BEZIER, 0, scaleBucket(0.01))).toBe(1);
    expect(piecesAt(new Float32Array([0, 0, 0, 1e6, 1e6, -1e6, 1e6, 0]), 0, 4)).toBe(64);
  });

  it("keeps the curve template's chords within the tolerance in CSS pixels at the bucket's largest scale", () => {
    for (const segments of [LONG_BEZIER, QUARTER_CIRCLE, new Float32Array([0, 0, 0, 3000, 100, -3000, 100, 0])]) {
      for (const bucket of [-7, -3, 0, 1, 4]) {
        const pieces = piecesAt(segments, 0, bucket);
        if (pieces === 64) continue;
        expect(chordDeviation(segments, pieces) * 2 ** bucket).toBeLessThanOrEqual(TESSELLATION_TOLERANCE);
      }
    }
  });
});

describe("piece lengths", () => {
  it("measure a straight cubic with control points off its thirds as its chord", () => {
    // Collinear along (4, 3), 50 long, not built like a line segment: drawn with the curve template.
    const straight = [0, 0, 24, 18, 28, 21, 40, 30];
    for (const bucket of [-7, 0, 4]) expect(lengthAt(straight, bucket)).toBeCloseTo(50, 3);
    expect(lengthAt([0, 0, 20, 0, 25, 0, 30, 0], 0)).toBeCloseTo(30, 3);
  });

  it("keep a straight segment's exact chord length", () => {
    expect(lengthAt(lineSegment({ x: 0, y: 0 }, { x: 30, y: 40 }), 0)).toBe(50);
  });

  it("measure the quarter circle's cubic within 0.1 % of the arc at every bucket", () => {
    const arc = (Math.PI * RADIUS) / 2;
    for (const bucket of [-7, 0, 4]) {
      expect(Math.abs(lengthAt(QUARTER_CIRCLE, bucket) - arc) / arc).toBeLessThan(0.001);
    }
  });

  it("give a long bezier nearly the same length at every bucket, so the dash phase does not jump while zooming", () => {
    const lengths: number[] = [];
    for (let bucket = -12; bucket <= 4; bucket++) lengths.push(lengthAt(LONG_BEZIER, bucket));
    const finest = lengths[lengths.length - 1];
    for (const length of lengths) expect(Math.abs(length - finest) / finest).toBeLessThan(1e-4);
    // Entering the next bucket moves the end of the dash pattern by less than 0.01 CSS px at that bucket's scale.
    for (let i = 1; i < lengths.length; i++) {
      expect(Math.abs(lengths[i] - lengths[i - 1]) * 2 ** (i - 12)).toBeLessThan(0.01);
    }
  });
});

describe("encodeShapes", () => {
  it("writes straight segments into the line instances and curve pieces into the curve instances", () => {
    const curve = [100, 0, 250, 0, 250, 100, 400, 100];
    const segments = [
      ...lineSegment({ x: 0, y: 0 }, { x: 100, y: 0 }),
      ...curve,
      ...lineSegment({ x: 400, y: 100 }, { x: 400, y: 200 }),
    ];
    const pieces = piecesAt(curve, 0, 0);
    expect(pieces).toBeGreaterThan(1);
    const out = createEncodedChunk();
    encodeShapes([shape(segments)], 0, out);
    expect([out.lines.count, out.curves.count]).toEqual([2, pieces]);

    const stored = new Float32Array(segments);
    const first = instance(out.lines, 0);
    expect(first.slice(0, 8)).toEqual(stored.slice(0, 8));
    expect([first[14], first[15]]).toEqual([0, 100]);
    // The distance runs on from the first line through the curve pieces to the last line.
    let distance = 100;
    for (let k = 0; k < pieces; k++) {
      const piece = instance(out.curves, k);
      expect(piece[14]).toBeCloseTo(distance, 3);
      distance += piece[15];
    }
    const last = instance(out.lines, 1);
    expect(last.slice(0, 8)).toEqual(stored.slice(16, 24));
    expect(last[14]).toBeCloseTo(distance, 3);
    expect(last[15]).toBe(100);
    // Every instance carries the whole length.
    const total = distance + 100;
    for (const instances of [out.lines, out.curves]) {
      for (let i = 0; i < instances.count; i++) expect(instance(instances, i)[13]).toBeCloseTo(total, 2);
    }
  });

  it("appends to the instances already in `out`, growing them", () => {
    const out = createEncodedChunk();
    encodeShapes([shape(lineSegment({ x: 0, y: 0 }, { x: 10, y: 0 }))], 0, out);
    const lines = Array.from({ length: 100 }, (_, i) => shape(lineSegment({ x: 0, y: i }, { x: 10, y: i })));
    encodeShapes([...lines, shape(LONG_BEZIER)], 0, out);
    expect([out.lines.count, out.curves.count]).toEqual([101, 5]);
    expect(instance(out.lines, 0)[1]).toBe(0);
    expect(instance(out.lines, 100)[1]).toBe(99);
    expect(out.lines.data.length).toBeGreaterThanOrEqual(101 * INSTANCE_FLOATS);
  });
});

describe("WebGLBatchBackend tessellation", () => {
  beforeEach(() => resetWebGLConnectionsStats());

  afterEach(() => jest.restoreAllMocks());

  const item = (segments: ArrayLike<number>, extra: Partial<TWebGLShape> = {}): IConnectionBatchItem => {
    const itemShape = { ...shape(segments), ...extra };
    return {
      getPathBounds: () => [0, 0, 100, 100],
      getPath: () => undefined,
      style: () => undefined,
      getWebGLShape: () => itemShape,
    };
  };

  const effect = toConnectionEffect(
    defineConnectionEffect({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.bgra; } // T" })
  );

  function setup(): { fake: TFakeGL; backend: WebGLBatchBackend } {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    programs.beginFrame({ width: 100, height: 100, x: 0, y: 0, scale: 1, dpr: 1, time: 0 });
    return { fake, backend: new WebGLBatchBackend(fake.gl, programs) };
  }

  function drawLevel(backend: WebGLBatchBackend, chunks: readonly TGLChunk[]): void {
    for (const chunk of chunks) backend.draw(undefined, chunk);
    backend.endGroup();
  }

  /** Every `performance.now()` call advances the clock: a re-encode, timed by two calls, takes `step` ms. */
  function clock(step: number): void {
    let now = 0;
    jest.spyOn(performance, "now").mockImplementation(() => (now += step));
  }

  it("draws a group's straight segments with the line template, then its curves, after one program bind", () => {
    const { fake, backend } = setup();
    const chunk = backend.build(
      [
        item(LONG_BEZIER),
        item(lineSegment({ x: 0, y: 0 }, { x: 10, y: 0 })),
        item(LONG_BEZIER, { effect, params: [] }),
        item(lineSegment({ x: 0, y: 5 }, { x: 10, y: 5 })),
      ],
      undefined
    );
    expect(chunk.ranges.map(({ effect: rangeEffect, template, count }) => [rangeEffect, template, count])).toEqual([
      [undefined, "line", 2],
      [undefined, "curve", 5],
      [effect, "curve", 5],
    ]);
    expect([chunk.lineInstances, chunk.curveInstances, chunk.count]).toEqual([2, 10, 12]);
    const bound = fake.used.length;
    drawLevel(backend, [chunk]);
    expect(fake.draws.map(({ count, instances }) => [count, instances])).toEqual([
      [LINE_VERTICES, 2],
      [CURVE_VERTICES, 5],
      [CURVE_VERTICES, 5],
    ]);
    expect(fake.used.slice(bound)).toHaveLength(2);
    // Two template buffers, created once, and the chunk's instances.
    expect(fake.live("buffer")).toBe(3);
  });

  it("builds a chunk for the frame's bucket", () => {
    const { backend } = setup();
    backend.beginFrame(-7);
    const far = backend.build([item(LONG_BEZIER)], undefined);
    backend.beginFrame(0);
    const near = backend.build([item(LONG_BEZIER)], undefined);
    expect([far.bucket, far.curveInstances]).toEqual([-7, 1]);
    expect([near.bucket, near.curveInstances]).toEqual([0, 5]);
  });

  it("re-encodes drawn chunks of another bucket in place within the frame's budget and leaves the rest stale", () => {
    const { fake, backend } = setup();
    backend.beginFrame(0);
    const chunks = [0, 1, 2].map(() => backend.build([item(LONG_BEZIER)], undefined));
    const buffers = chunks.map(({ buffer }) => buffer);
    // 1.5 ms per re-encode against a 2 ms budget: two chunks this frame.
    clock(1.5);
    backend.beginFrame(-7);
    drawLevel(backend, chunks);
    expect(chunks.map(({ bucket }) => bucket)).toEqual([-7, -7, 0]);
    expect(fake.draws.map(({ instances }) => instances)).toEqual([1, 1, 5]);
    expect(backend.drewStale).toBe(true);
    // Fewer instances: the same buffers, rewritten.
    chunks.forEach(({ buffer }, index) => expect(buffer).toBe(buffers[index]));

    backend.beginFrame(-7);
    expect(backend.drewStale).toBe(false);
    drawLevel(backend, chunks);
    expect(chunks.map(({ bucket }) => bucket)).toEqual([-7, -7, -7]);
    expect(fake.draws.slice(3).map(({ instances }) => instances)).toEqual([1, 1, 1]);
    expect(backend.drewStale).toBe(false);
  });

  it("re-encodes at least one chunk a frame, however long it takes", () => {
    const { fake, backend } = setup();
    backend.beginFrame(0);
    const chunks = [0, 1].map(() => backend.build([item(LONG_BEZIER)], undefined));
    clock(5);
    backend.beginFrame(1);
    drawLevel(backend, chunks);
    expect(chunks.map(({ bucket }) => bucket)).toEqual([1, 0]);
    expect(fake.draws.map(({ instances }) => instances)).toEqual([7, 5]);
    expect(backend.drewStale).toBe(true);
    // More instances than the buffer holds: a new one, the old one and its vertex arrays freed.
    expect(fake.live("buffer")).toBe(4);
    expect(fake.live("vertexArray")).toBe(2);
  });

  it("only relabels a chunk whose cubics keep their piece counts in the new bucket", () => {
    const { fake, backend } = setup();
    backend.beginFrame(-3);
    // A straight segment, and a curve drawn in one piece at both buckets.
    const chunk = backend.build([item(lineSegment({ x: 0, y: 0 }, { x: 10, y: 0 })), item(QUARTER_CIRCLE)], undefined);
    const uploads = fake.uploads.length;
    const ranges = chunk.ranges;
    backend.beginFrame(-6);
    drawLevel(backend, [chunk]);
    expect(chunk.bucket).toBe(-6);
    expect(fake.uploads).toHaveLength(uploads);
    expect(chunk.ranges).toBe(ranges);
    expect(backend.drewStale).toBe(false);

    // In two pieces at bucket 1: re-encoded.
    backend.beginFrame(1);
    drawLevel(backend, [chunk]);
    expect([chunk.bucket, chunk.curveInstances]).toEqual([1, 2]);
    expect(fake.uploads.length).toBeGreaterThan(uploads);
  });

  it("counts line and curve instances in the stats", () => {
    const { backend } = setup();
    backend.beginFrame(0);
    drawLevel(backend, [
      backend.build([item(lineSegment({ x: 0, y: 0 }, { x: 10, y: 0 })), item(LONG_BEZIER)], undefined),
    ]);
    expect(getWebGLConnectionsStats()).toMatchObject({
      drawCalls: 2,
      instances: 6,
      lineInstances: 1,
      curveInstances: 5,
      vertices: LINE_VERTICES + 5 * CURVE_VERTICES,
    });
  });
});

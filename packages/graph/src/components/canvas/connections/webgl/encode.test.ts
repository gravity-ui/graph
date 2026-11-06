import type { TConnectionAppearance } from "../appearance";

import { INSTANCE_FLOATS, countSegments, encodeAppearances } from "./encode";

const curve = (segments: number[], dash?: { pattern: number[]; speed?: number }): TConnectionAppearance => ({
  kind: "curve",
  segments: new Float32Array(segments),
  stroke: { color: "#ff8000", width: 3, dash },
});

test("writes one instance per cubic segment with color, stroke and running distance", () => {
  const appearances = [
    curve([0, 0, 10, 0, 20, 0, 30, 0]),
    curve([0, 0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 40, 0, 50, 0, 60], { pattern: [6, 4], speed: 20 }),
  ];
  expect(countSegments(appearances)).toBe(3);
  const out = new Float32Array(3 * INSTANCE_FLOATS);
  expect(encodeAppearances(appearances, out)).toBe(3);

  const first = Array.from(out.subarray(0, INSTANCE_FLOATS));
  expect(first.slice(0, 8)).toEqual([0, 0, 10, 0, 20, 0, 30, 0]);
  expect(first.slice(8, 12).map((value) => Math.round(value * 255))).toEqual([255, 128, 0, 255]);
  expect(first.slice(12, 16)).toEqual([3, 0, 0, 0]);
  expect(first.slice(16, 18)).toEqual([0, 30]);

  const third = Array.from(out.subarray(2 * INSTANCE_FLOATS, 3 * INSTANCE_FLOATS));
  expect(third.slice(12, 16)).toEqual([3, 6, 4, 20]);
  // The dash continues across segments of one connection: the second segment starts where the first ended.
  expect(third.slice(16, 18)).toEqual([30, 30]);
  // No fading dash; the connection is 30 long; no pulse.
  expect(first.slice(18, 24)).toEqual([0, 30, 0, 0, 0, 0]);
});

test("writes the dash fade and the pulse after the distance", () => {
  const appearance: TConnectionAppearance = {
    kind: "curve",
    segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]),
    stroke: {
      color: "#ff8000",
      width: 3,
      dash: { pattern: [40, 120], speed: -90, fade: true },
      pulse: { period: 2, wavelength: 3000 },
    },
  };
  const out = new Float32Array(INSTANCE_FLOATS);
  expect(encodeAppearances([appearance], out)).toBe(1);
  expect(Array.from(out.subarray(12, 24))).toEqual([3, 40, 120, -90, 0, 30, 1, 30, 2, 3000, 0, 0]);
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

test("splits a strongly curved cubic into continuous pieces that follow it", () => {
  const segments = [0, 0, 0, 3000, 100, -3000, 100, 0];
  const appearances = [curve(segments)];
  const count = countSegments(appearances);
  expect(count).toBeGreaterThan(1);
  const out = new Float32Array(count * INSTANCE_FLOATS);
  expect(encodeAppearances(appearances, out)).toBe(count);

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
      expect(out[base + 16]).toBeCloseTo(out[previous + 16] + out[previous + 17], 2);
    }
  }
});

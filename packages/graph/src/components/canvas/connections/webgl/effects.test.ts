import type { TConnectionAppearance } from "./encode";
import { INSTANCE_FLOATS, encodeAppearances, groupByEffect } from "./encode";
import { createFragmentShader } from "./shaders";

const line = (effect?: { name: string; params?: number[] }): TConnectionAppearance => ({
  kind: "curve",
  segments: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0, 30, 0, 30, 10, 30, 20, 30, 30]),
  stroke: { color: "#000", width: 2, effect },
});

test("writes the connection length and the effect params into every instance of a connection", () => {
  const out = new Float32Array(2 * INSTANCE_FLOATS);
  expect(encodeAppearances([line({ name: "glow", params: [1, 2, 3, 4, 5, 6, 7, 8, 9] })], out)).toBe(2);
  for (const base of [0, INSTANCE_FLOATS]) {
    // Two straight 30-unit segments: one connection of 60.
    expect(out[base + 19]).toBe(60);
    // Params beyond the eighth are ignored.
    expect(Array.from(out.subarray(base + 24, base + 32))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  }
});

test("leaves the params of a connection without an effect at zero", () => {
  const out = new Float32Array(2 * INSTANCE_FLOATS).fill(9);
  encodeAppearances([line({ name: "glow", params: [1] })], out);
  expect(Array.from(out.subarray(24, 32))).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  encodeAppearances([line()], out);
  expect(Array.from(out.subarray(24, 32))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

test("groups appearances by effect: without an effect first, then in order of first use", () => {
  const plain = line();
  const glowA = line({ name: "glow" });
  const dots = line({ name: "dots" });
  const glowB = line({ name: "glow" });
  expect(groupByEffect([glowA, plain, dots, glowB])).toEqual([
    { effect: undefined, appearances: [plain] },
    { effect: "glow", appearances: [glowA, glowB] },
    { effect: "dots", appearances: [dots] },
  ]);
});

test("inserts an effect function into the fragment shader", () => {
  const plain = createFragmentShader();
  expect(plain).not.toContain("#define CONNECTION_EFFECT");
  const source = "vec4 effect(ConnectionFragment f, vec4 color) { return color * f.t; }";
  const shader = createFragmentShader(source);
  expect(shader.startsWith("#version 300 es")).toBe(true);
  expect(shader).toContain("#define CONNECTION_EFFECT");
  expect(shader).toContain("struct ConnectionFragment");
  expect(shader).toContain(source);
  // The effect is defined before main(), which calls it.
  expect(shader.indexOf(source)).toBeLessThan(shader.indexOf("void main()"));
});

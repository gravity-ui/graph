import type { TWebGLShape } from "../lines/types";

import { createFakeGL } from "./fakeGL";
import { ArrowFills, FILL_VERTEX_FLOATS, countFillVertices, encodeFills } from "./fill";

const arrow = (points: number[] | undefined, color = "rgba(255, 0, 0, 0.5)"): TWebGLShape => ({
  segments: new Float32Array(0),
  stroke: { color, width: 2 },
  fill: points && new Float32Array(points),
});

function vertices(out: Float32Array, count: number): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < count; i++) {
    result.push(Array.from(out.subarray(i * FILL_VERTEX_FLOATS, (i + 1) * FILL_VERTEX_FLOATS)));
  }
  return result;
}

test("a vertex is a position and a straight color", () => {
  expect(FILL_VERTEX_FLOATS).toBe(6);
});

test("a triangle is three vertices with its color", () => {
  const shapes = [arrow([0, 0, 10, 0, 5, 8])];
  expect(countFillVertices(shapes)).toBe(3);
  const out = new Float32Array(3 * FILL_VERTEX_FLOATS);
  expect(encodeFills(shapes, out)).toBe(3);
  expect(vertices(out, 3)).toEqual([
    [0, 0, 1, 0, 0, 0.5],
    [10, 0, 1, 0, 0, 0.5],
    [5, 8, 1, 0, 0, 0.5],
  ]);
});

test("a quad is a fan of two triangles", () => {
  const shapes = [arrow([0, 0, 10, 0, 10, 10, 0, 10], "#0000ff")];
  expect(countFillVertices(shapes)).toBe(6);
  const out = new Float32Array(6 * FILL_VERTEX_FLOATS);
  expect(encodeFills(shapes, out)).toBe(6);
  expect(vertices(out, 6).map((vertex) => vertex.slice(0, 2))).toEqual([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 0],
    [10, 10],
    [0, 10],
  ]);
  for (const vertex of vertices(out, 6)) expect(vertex.slice(2)).toEqual([0, 0, 1, 1]);
});

test("open arrows and degenerate polygons add nothing", () => {
  const shapes = [arrow(undefined), arrow([0, 0, 10, 0]), arrow([0, 0, 10, 0, 5, 8], "#00ff00")];
  expect(countFillVertices(shapes)).toBe(3);
  const out = new Float32Array(3 * FILL_VERTEX_FLOATS);
  expect(encodeFills(shapes, out)).toBe(3);
  expect(vertices(out, 1)[0]).toEqual([0, 0, 0, 1, 0, 1]);
});

test("frees the buffer when the vertex array cannot be created", () => {
  const fake = createFakeGL();
  // A lost context returns null for new objects.
  (fake.gl as unknown as { createVertexArray(): null }).createVertexArray = (): null => null;
  expect(() => new ArrowFills(fake.gl).build([arrow([0, 0, 10, 0, 5, 8])], undefined)).toThrow("Cannot allocate");
  expect(fake.buffers).toHaveLength(1);
  expect(fake.live("buffer")).toBe(0);
});

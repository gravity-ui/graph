import type { IConnectionBatchItem } from "../batch";
import type { TWebGLShape } from "../lines/types";

import { WebGLBatchBackend } from "./WebGLBatchBackend";
import { INSTANCE_FLOATS } from "./encode";
import { createFakeGL } from "./fakeGL";
import type { TFakeGL } from "./fakeGL";
import { FILL_VERTEX_FLOATS } from "./fill";
import { ConnectionPrograms } from "./programs";
import { FILL_VERTEX, createCurveTemplate } from "./shaders";
import { getWebGLConnectionsStats, resetWebGLConnectionsStats } from "./stats";

const TEMPLATE = createCurveTemplate();
const TEMPLATE_VERTICES = TEMPLATE.length / 2;

function item(shape?: TWebGLShape | "none"): IConnectionBatchItem {
  const base: IConnectionBatchItem = {
    getPathBounds: () => [0, 0, 100, 100],
    getPath: () => undefined,
    style: () => undefined,
  };
  // "none": an item that has the method and returns no shape.
  if (shape === "none") return { ...base, getWebGLShape: (): undefined => undefined };
  return shape ? { ...base, getWebGLShape: (): TWebGLShape => shape } : base;
}

const line = (y = 0): TWebGLShape => ({
  segments: new Float32Array([0, y, 10, y, 20, y, 30, y]),
  stroke: { color: "#000", width: 2 },
});

/** A triangle arrow: its three sides stroked, the polygon filled when closed. */
const arrow = (closed: boolean): TWebGLShape => {
  const sides = [0, 0, 10, 5, 0, 10, 0, 0];
  const segments: number[] = [];
  for (let i = 0; i + 3 < sides.length; i += 2) {
    const [x0, y0, x1, y1] = sides.slice(i, i + 4);
    segments.push(
      x0,
      y0,
      x0 + (x1 - x0) / 3,
      y0 + (y1 - y0) / 3,
      x0 + (2 * (x1 - x0)) / 3,
      y0 + (2 * (y1 - y0)) / 3,
      x1,
      y1
    );
  }
  const shape: TWebGLShape = { segments: new Float32Array(segments), stroke: { color: "#f00", width: 2 } };
  if (closed) shape.fill = new Float32Array([0, 0, 10, 5, 0, 10]);
  return shape;
};

function setup(): { fake: TFakeGL; backend: WebGLBatchBackend } {
  const fake = createFakeGL();
  const programs = new ConnectionPrograms(fake.gl);
  programs.beginFrame({ width: 100, height: 100, x: 0, y: 0, scale: 1, dpr: 1, time: 0 });
  const template = fake.gl.createBuffer();
  if (!template) throw new Error("Expected a template buffer");
  // The fake checks that draws stay within the bound buffers, the template included.
  fake.gl.bindBuffer(fake.gl.ARRAY_BUFFER, template);
  fake.gl.bufferData(fake.gl.ARRAY_BUFFER, TEMPLATE, fake.gl.STATIC_DRAW);
  const backend = new WebGLBatchBackend(fake.gl, template, TEMPLATE_VERTICES, programs);
  return { fake, backend };
}

describe("WebGLBatchBackend", () => {
  beforeEach(() => resetWebGLConnectionsStats());

  it("draws only items with a WebGL shape", () => {
    const { fake, backend } = setup();
    const chunk = backend.build([item(), item("none"), item(line())], undefined);
    expect(chunk.items).toBe(1);
    expect(chunk.count).toBe(1);
    expect(chunk.fill).toBeUndefined();
    // After the template's upload: one instance.
    expect(fake.uploads.slice(1).map(({ kind, length }) => [kind, length])).toEqual([["bufferData", INSTANCE_FLOATS]]);

    backend.draw(undefined, chunk);
    expect(fake.draws).toHaveLength(1);
    expect(fake.draws[0]).toMatchObject({
      kind: "drawArraysInstanced",
      mode: fake.gl.TRIANGLE_STRIP,
      count: TEMPLATE_VERTICES,
      instances: 1,
    });
  });

  it("lays the instance attributes out over the 28 floats", () => {
    const { fake, backend } = setup();
    backend.draw(undefined, backend.build([item(line())], undefined));
    const vertexArray = fake.draws[0].vertexArray;
    if (!vertexArray) throw new Error("Expected a vertex array");
    const layout = [...vertexArray.attributes.entries()]
      .sort(([a], [b]) => a - b)
      .map(([location, { size, stride, offset, divisor }]) => [location, size, stride, offset, divisor]);
    const stride = INSTANCE_FLOATS * 4;
    expect(layout).toEqual([
      [0, 2, 8, 0, 0],
      [1, 4, stride, 0, 1],
      [2, 4, stride, 16, 1],
      [3, 4, stride, 32, 1],
      [4, 4, stride, 48, 1],
      [5, 4, stride, 64, 1],
      [6, 4, stride, 80, 1],
      [7, 4, stride, 96, 1],
    ]);
  });

  it("draws a chunk's closed-arrow fill with the fill program before its strokes", () => {
    const { fake, backend } = setup();
    const chunk = backend.build([item(arrow(true)), item(arrow(false))], undefined);
    expect(chunk.fill?.vertices).toBe(3);
    backend.draw(undefined, chunk);

    expect(fake.draws.map(({ kind, mode }) => [kind, mode])).toEqual([
      ["drawArrays", fake.gl.TRIANGLES],
      ["drawArraysInstanced", fake.gl.TRIANGLE_STRIP],
    ]);
    const [fill, strokes] = fake.draws;
    expect(fill.count).toBe(3);
    expect(fill.program?.vertex).toBe(FILL_VERTEX);
    expect(strokes.program?.vertex).not.toBe(FILL_VERTEX);
    // Three sides of each arrow.
    expect(strokes.instances).toBe(6);

    // Position and color per vertex.
    const fillLayout = fill.vertexArray && [...fill.vertexArray.attributes.values()];
    expect(fillLayout?.map(({ size, stride, offset }) => [size, stride, offset])).toEqual([
      [2, FILL_VERTEX_FLOATS * 4, 0],
      [4, FILL_VERTEX_FLOATS * 4, 8],
    ]);
  });

  it("open arrows draw no fill", () => {
    const { fake, backend } = setup();
    const chunk = backend.build([item(arrow(false)), item(line())], undefined);
    expect(chunk.fill).toBeUndefined();
    backend.draw(undefined, chunk);
    expect(fake.draws.map(({ kind }) => kind)).toEqual(["drawArraysInstanced"]);
  });

  it("reuses buffers that are large enough and frees what it replaces", () => {
    const { fake, backend } = setup();
    const first = backend.build([item(line()), item(line(10)), item(arrow(true)), item(arrow(true))], undefined);
    const uploads = fake.uploads.length;

    // Fewer instances and fill vertices: both buffers are kept and rewritten.
    const smaller = backend.build([item(line()), item(arrow(true))], first);
    expect(smaller.buffer).toBe(first.buffer);
    expect(smaller.fill?.buffer).toBe(first.fill?.buffer);
    expect(fake.uploads.slice(uploads).map(({ kind, buffer }) => [kind, buffer])).toEqual([
      ["bufferSubData", first.buffer],
      ["bufferSubData", first.fill?.buffer],
    ]);
    expect(smaller.count).toBe(4);
    expect(smaller.fill?.vertices).toBe(3);
    // The rebuilt chunk draws from live objects only (the fake throws otherwise).
    backend.draw(undefined, smaller);
    expect(fake.draws.map(({ kind, count, instances }) => [kind, count, instances])).toEqual([
      ["drawArrays", 3, 1],
      ["drawArraysInstanced", TEMPLATE_VERTICES, 4],
    ]);

    // More instances: a new buffer; no closed arrow: the fill is freed.
    const larger = backend.build(
      [item(line()), item(line(10)), item(line(20)), item(line(30)), item(arrow(false)), item(arrow(false))],
      smaller
    );
    expect(larger.buffer).not.toBe(first.buffer);
    expect(larger.fill).toBeUndefined();
    expect(fake.buffers.find((buffer) => buffer === (first.buffer as unknown))?.deleted).toBe(true);
    expect(fake.buffers.find((buffer) => buffer === (first.fill?.buffer as unknown))?.deleted).toBe(true);

    backend.release(larger);
    // Only the template buffer stays; every vertex array is freed.
    expect(fake.live("buffer")).toBe(1);
    expect(fake.live("vertexArray")).toBe(0);
  });

  it("counts draw calls, instances, items and vertices in the stats", () => {
    const { backend } = setup();
    backend.draw(undefined, backend.build([item(line()), item(arrow(true))], undefined));
    expect(getWebGLConnectionsStats()).toMatchObject({
      drawCalls: 2,
      instances: 4,
      items: 2,
      vertices: 4 * TEMPLATE_VERTICES + 3,
    });
  });
});

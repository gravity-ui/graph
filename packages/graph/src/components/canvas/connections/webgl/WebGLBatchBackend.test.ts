import type { IConnectionBatchItem } from "../batch";
import { defineConnectionEffect, toConnectionEffect } from "../effects/ConnectionEffect";
import type { ConnectionEffect } from "../effects/ConnectionEffect";
import type { TConnectionEffectDefinition, TUniformTypes } from "../effects/types";
import type { TWebGLShape } from "../lines/types";

import { WebGLBatchBackend } from "./WebGLBatchBackend";
import type { TGLChunk } from "./WebGLBatchBackend";
import { INSTANCE_FLOATS } from "./encode";
import { createFakeGL } from "./fakeGL";
import type { TFakeGL } from "./fakeGL";
import { FILL_VERTEX_FLOATS } from "./fill";
import { ConnectionPrograms } from "./programs";
import { FILL_VERTEX } from "./shaders";
import { getWebGLConnectionsStats, resetWebGLConnectionsStats } from "./stats";

/** Vertices of the line template: the straight segments of these tests are one quad each. */
const LINE_VERTICES = 4;

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

/** Queues the chunks of one z-level and ends it, as `BatchScene.render` does. */
function drawLevel(backend: WebGLBatchBackend, ...chunks: TGLChunk[]): void {
  for (const chunk of chunks) backend.draw(undefined, chunk);
  backend.endGroup();
}

function define<U extends TUniformTypes>(
  definition: TConnectionEffectDefinition<U, readonly number[]>
): ConnectionEffect<U, readonly number[]> {
  return toConnectionEffect(defineConnectionEffect(definition));
}

const effectA = define({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.bgra; } // A" });
const effectB = define({ fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color.gbra; } // B" });
const animatedEffect = define({
  fragment: "vec4 effect(ConnectionFragment f, vec4 color) { return color * sin(f.time); }",
  animated: true,
});

const withEffect = (shape: TWebGLShape, effect: ConnectionEffect<TUniformTypes, never>): TWebGLShape => ({
  ...shape,
  effect,
  params: [],
});

/** The p0.y of every instance in a buffer, which tells the lines in these tests apart. */
const instanceRows = (fake: TFakeGL, buffer: WebGLBuffer): number[] => {
  const data = fake.buffers.find((candidate) => candidate === (buffer as unknown))?.data ?? new Float32Array(0);
  const rows: number[] = [];
  for (let o = 0; o + INSTANCE_FLOATS <= data.length; o += INSTANCE_FLOATS) rows.push(data[o + 1]);
  return rows;
};

function setup(): { fake: TFakeGL; backend: WebGLBatchBackend } {
  const fake = createFakeGL();
  const programs = new ConnectionPrograms(fake.gl);
  programs.beginFrame({ width: 100, height: 100, x: 0, y: 0, scale: 1, dpr: 1, time: 0 });
  // The fake checks that draws stay within the bound buffers, the templates included.
  const backend = new WebGLBatchBackend(fake.gl, programs);
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
    // After the uploads of the two templates: one instance.
    expect(fake.uploads.slice(2).map(({ kind, length }) => [kind, length])).toEqual([["bufferData", INSTANCE_FLOATS]]);

    drawLevel(backend, chunk);
    expect(fake.draws).toHaveLength(1);
    expect(fake.draws[0]).toMatchObject({
      kind: "drawArraysInstanced",
      mode: fake.gl.TRIANGLE_STRIP,
      count: LINE_VERTICES,
      instances: 1,
    });
  });

  it("lays the instance attributes out over the 32 floats", () => {
    const { fake, backend } = setup();
    drawLevel(backend, backend.build([item(line())], undefined));
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
      [8, 4, stride, 112, 1],
    ]);
  });

  it("draws a chunk's closed-arrow fill with the fill program before its strokes", () => {
    const { fake, backend } = setup();
    const chunk = backend.build([item(arrow(true)), item(arrow(false))], undefined);
    expect(chunk.fill?.vertices).toBe(3);
    drawLevel(backend, chunk);

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
    drawLevel(backend, chunk);
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
    drawLevel(backend, smaller);
    expect(fake.draws.map(({ kind, count, instances }) => [kind, count, instances])).toEqual([
      ["drawArrays", 3, 1],
      ["drawArraysInstanced", LINE_VERTICES, 4],
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
    // Only the two template buffers stay; every vertex array is freed.
    expect(fake.live("buffer")).toBe(2);
    expect(fake.live("vertexArray")).toBe(0);
  });

  it("counts draw calls, instances, items and vertices in the stats", () => {
    const { backend } = setup();
    drawLevel(backend, backend.build([item(line()), item(arrow(true))], undefined));
    expect(getWebGLConnectionsStats()).toMatchObject({
      drawCalls: 2,
      instances: 4,
      items: 2,
      vertices: 4 * LINE_VERTICES + 3,
    });
  });
  it("queues chunks and draws nothing before the z-level ends", () => {
    const { fake, backend } = setup();
    backend.draw(undefined, backend.build([item(line()), item(arrow(true))], undefined));
    expect(fake.draws).toHaveLength(0);
    backend.endGroup();
    expect(fake.draws).toHaveLength(2);
    // The queue is empty after the level.
    backend.endGroup();
    expect(fake.draws).toHaveLength(2);
  });

  it("groups a chunk's instances by effect object: the plain stroke first, then effects by first appearance", () => {
    const { fake, backend } = setup();
    const chunk = backend.build(
      [
        item(withEffect(line(1), effectB)),
        item(line(2)),
        item(withEffect(line(3), effectA)),
        item(withEffect(line(4), effectB)),
        item(line(5)),
      ],
      undefined
    );
    expect(chunk.effects).toEqual([effectB, effectA]);
    expect(chunk.ranges.map(({ effect, count }) => [effect, count])).toEqual([
      [undefined, 2],
      [effectB, 2],
      [effectA, 1],
    ]);
    expect(instanceRows(fake, chunk.buffer)).toEqual([2, 5, 1, 4, 3]);
    expect(chunk.animated).toBe(false);

    drawLevel(backend, chunk);
    const [plain] = fake.programs;
    expect(fake.draws.map(({ instances }) => instances)).toEqual([2, 2, 1]);
    expect(fake.draws[0].program).toBe(plain);
    expect(fake.draws[1].program?.fragment).toContain("// B");
    expect(fake.draws[2].program?.fragment).toContain("// A");
    // Each range's vertex array starts at its first instance.
    const offsets = fake.draws.map(({ vertexArray }) => vertexArray?.attributes.get(1)?.offset);
    expect(offsets).toEqual([0, 2 * INSTANCE_FLOATS * 4, 4 * INSTANCE_FLOATS * 4]);
  });

  it("draws a z-level's fills first, then each effect once over every queued chunk", () => {
    const { fake, backend } = setup();
    const first = backend.build([item(withEffect(line(1), effectA)), item(arrow(true))], undefined);
    const second = backend.build([item(withEffect(line(2), effectB)), item(withEffect(line(3), effectA))], undefined);
    const third = backend.build([item(line(4)), item(withEffect(line(5), effectB)), item(arrow(true))], undefined);
    const bound = fake.used.length;
    drawLevel(backend, first, second, third);

    const name = (program: TFakeGL["programs"][number] | undefined): string => {
      if (program === fake.programs[0]) return "plain";
      if (program === fake.programs[1]) return "fill";
      return program?.fragment?.includes("// A") ? "A" : "B";
    };
    expect(fake.draws.map(({ program }) => name(program))).toEqual([
      "fill",
      "fill",
      "plain",
      "plain",
      "A",
      "A",
      "B",
      "B",
    ]);
    // One bind per program in the level.
    expect(fake.used.slice(bound).map(name)).toEqual(["fill", "plain", "A", "B"]);
  });

  it("marks a chunk animated when one of its effects is", () => {
    const { backend } = setup();
    const still = backend.build([item(withEffect(line(), effectA))], undefined);
    const moving = backend.build([item(line()), item(withEffect(line(1), animatedEffect))], undefined);
    expect(still.animated).toBe(false);
    expect(moving.animated).toBe(true);
    drawLevel(backend, still);
    expect(backend.drewAnimated).toBe(false);
    drawLevel(backend, moving);
    expect(backend.drewAnimated).toBe(true);
  });

  it("tells its owner which effects its chunks hold as they are built, rebuilt and released", () => {
    const fake = createFakeGL();
    const programs = new ConnectionPrograms(fake.gl);
    const held = new Map<ConnectionEffect<TUniformTypes, never>, number>();
    const backend = new WebGLBatchBackend(fake.gl, programs, {
      retain: (effect) => held.set(effect, (held.get(effect) ?? 0) + 1),
      release: (effect) => held.set(effect, (held.get(effect) ?? 0) - 1),
    });
    const a = backend.build([item(withEffect(line(), effectA)), item(withEffect(line(1), effectA))], undefined);
    const b = backend.build([item(withEffect(line(), effectA)), item(withEffect(line(1), effectB))], undefined);
    // Once per chunk, whatever the number of its connections with the effect.
    expect([...held]).toEqual([
      [effectA, 2],
      [effectB, 1],
    ]);

    backend.build([item(line())], b);
    expect([...held]).toEqual([
      [effectA, 1],
      [effectB, 0],
    ]);
    backend.release(a);
    expect([...held]).toEqual([
      [effectA, 0],
      [effectB, 0],
    ]);
  });
});

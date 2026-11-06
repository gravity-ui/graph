import type { IBatchBackend } from "../../../../lib/batch/types";
import type { TConnectionAppearance } from "../appearance";
import type { IConnectionBatchItem } from "../batch";

import { INSTANCE_FLOATS, countSegments, encodeAppearances, groupByEffect } from "./encode";
import type { IEffectPrograms } from "./programs";
import { webglConnectionsStats } from "./stats";

/** Instances of one effect inside a chunk's buffer, with a vertex array that starts at them. */
type TGLRange = {
  effect: string | undefined;
  vao: WebGLVertexArrayObject;
  count: number;
};

/** GPU drawable of one chunk: an instance buffer drawn with one instanced call per effect. */
export type TGLChunk = {
  buffer: WebGLBuffer;
  capacity: number;
  count: number;
  ranges: TGLRange[];
  /** Connection items with an appearance: what the chunk draws, whatever the curve subdivision. */
  items: number;
  animated: boolean;
};

const STRIDE = INSTANCE_FLOATS * 4;
// location, components, float offset
const INSTANCE_ATTRIBUTES: ReadonlyArray<[number, number, number]> = [
  [1, 4, 0],
  [2, 4, 4],
  [3, 4, 8],
  [4, 4, 12],
  [5, 4, 16],
  [6, 4, 20],
  [7, 4, 24],
  [8, 4, 28],
];

/**
 * Encodes a chunk's appearances into one instance buffer, grouped by effect, and draws each group with its effect's
 * program in one instanced call: a chunk without effects is one call, as before.
 */
export class WebGLBatchBackend implements IBatchBackend<IConnectionBatchItem, TGLChunk, void> {
  /** Whether a chunk with an animated item was drawn since the owner last reset it. */
  public drewAnimated = false;

  private scratch = new Float32Array(0);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly template: WebGLBuffer,
    private readonly templateVertices: number,
    private readonly programs: IEffectPrograms
  ) {}

  public build(items: readonly IConnectionBatchItem[], previous: TGLChunk | undefined): TGLChunk {
    const appearances: TConnectionAppearance[] = [];
    let animated = false;
    for (const item of items) {
      // Items without an appearance (classes with their own createPath()) are not drawn by WebGL.
      const appearance = item.getAppearance?.();
      if (appearance) appearances.push(appearance);
      if (item.isAnimated?.()) animated = true;
    }
    const groups = groupByEffect(appearances);
    const count = countSegments(appearances);
    if (this.scratch.length < count * INSTANCE_FLOATS) this.scratch = new Float32Array(count * INSTANCE_FLOATS * 2);
    const layout: Array<{ effect: string | undefined; first: number; count: number }> = [];
    let written = 0;
    for (const group of groups) {
      const groupCount = encodeAppearances(group.appearances, this.scratch.subarray(written * INSTANCE_FLOATS));
      layout.push({ effect: group.effect, first: written, count: groupCount });
      written += groupCount;
      if (this.programs.isAnimated(group.effect)) animated = true;
    }
    const data = this.scratch.subarray(0, count * INSTANCE_FLOATS);
    const gl = this.gl;
    let buffer: WebGLBuffer;
    let capacity: number;
    if (previous && previous.capacity >= count) {
      this.releaseRanges(previous);
      buffer = previous.buffer;
      capacity = previous.capacity;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    } else {
      if (previous) this.release(previous);
      const created = gl.createBuffer();
      if (!created) throw new Error("Cannot allocate WebGL buffers");
      buffer = created;
      capacity = count;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    }
    const ranges = layout.map((range) => ({
      effect: range.effect,
      count: range.count,
      vao: this.createRange(buffer, range.first),
    }));
    return { buffer, capacity, count, ranges, items: appearances.length, animated };
  }

  public draw(_target: void, chunk: TGLChunk): void {
    if (chunk.animated) this.drewAnimated = true;
    const gl = this.gl;
    for (const range of chunk.ranges) {
      if (!range.count) continue;
      this.programs.use(range.effect);
      gl.bindVertexArray(range.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.templateVertices, range.count);
      webglConnectionsStats.drawCalls++;
    }
    webglConnectionsStats.instances += chunk.count;
    webglConnectionsStats.items += chunk.items;
    webglConnectionsStats.vertices += chunk.count * this.templateVertices;
  }

  public release(chunk: TGLChunk): void {
    this.releaseRanges(chunk);
    this.gl.deleteBuffer(chunk.buffer);
  }

  private releaseRanges(chunk: TGLChunk): void {
    for (const range of chunk.ranges) this.gl.deleteVertexArray(range.vao);
  }

  /** A vertex array over the template and the instances from `first` on. */
  private createRange(buffer: WebGLBuffer, first: number): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Cannot allocate WebGL buffers");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.template);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [location, size, offset] of INSTANCE_ATTRIBUTES) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, STRIDE, first * STRIDE + offset * 4);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
    return vao;
  }
}

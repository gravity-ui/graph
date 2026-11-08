import type { IBatchBackend } from "../../../../lib/batch/types";
import type { IConnectionBatchItem } from "../batch";
import type { TWebGLShape } from "../lines/types";

import { INSTANCE_FLOATS, countPieces, encodeShapes } from "./encode";
import { ArrowFills } from "./fill";
import type { TGLFill } from "./fill";
import type { IConnectionPrograms } from "./programs";
import { webglConnectionsStats } from "./stats";

/** Instances inside a chunk's buffer drawn with one program, with a vertex array that starts at them. */
type TGLRange = {
  vao: WebGLVertexArrayObject;
  count: number;
};

/** GPU drawable of one chunk: an instance buffer of stroke pieces and, with closed arrows, their fills. */
export type TGLChunk = {
  buffer: WebGLBuffer;
  /** Instances the buffer holds. */
  capacity: number;
  count: number;
  ranges: TGLRange[];
  /** Connection items with a WebGL shape: what the chunk draws, whatever the curve subdivision. */
  items: number;
  /** Whether the chunk's look changes with time, so it needs a redraw every frame; plain strokes and fills do not. */
  animated: boolean;
  /** Closed-arrow fills, drawn before the strokes. */
  fill?: TGLFill;
};

const STRIDE = INSTANCE_FLOATS * 4;
// location, components, float offset (see INSTANCE_FLOATS)
const INSTANCE_ATTRIBUTES: ReadonlyArray<[number, number, number]> = [
  [1, 4, 0],
  [2, 4, 4],
  [3, 4, 8],
  [4, 4, 12],
  [5, 2, 16],
  [6, 4, 18],
  [7, 4, 22],
];

/**
 * Encodes the WebGL shapes of a chunk's items into one instance buffer and draws it in one instanced call with the
 * line program; a chunk with closed arrows first fills them in one call with the fill program. Items without a WebGL
 * shape are not drawn.
 */
export class WebGLBatchBackend implements IBatchBackend<IConnectionBatchItem, TGLChunk, void> {
  /** Whether a chunk with an animated item was drawn since the owner last reset it. */
  public drewAnimated = false;

  private scratch = new Float32Array(0);

  private readonly fills: ArrowFills;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly template: WebGLBuffer,
    private readonly templateVertices: number,
    private readonly programs: IConnectionPrograms
  ) {
    this.fills = new ArrowFills(gl);
  }

  public build(items: readonly IConnectionBatchItem[], previous: TGLChunk | undefined): TGLChunk {
    const shapes: TWebGLShape[] = [];
    for (const item of items) {
      const shape = item.getWebGLShape?.();
      if (shape) shapes.push(shape);
    }
    const count = countPieces(shapes);
    if (this.scratch.length < count * INSTANCE_FLOATS) this.scratch = new Float32Array(count * INSTANCE_FLOATS * 2);
    encodeShapes(shapes, this.scratch);
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
      if (previous) {
        this.releaseRanges(previous);
        gl.deleteBuffer(previous.buffer);
      }
      const created = gl.createBuffer();
      if (!created) throw new Error("Cannot allocate WebGL buffers");
      buffer = created;
      capacity = count;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    }
    const ranges = count ? [{ vao: this.createRange(buffer, 0), count }] : [];
    const fill = this.fills.build(shapes, previous?.fill);
    return { buffer, capacity, count, ranges, items: shapes.length, animated: false, fill };
  }

  public draw(_target: void, chunk: TGLChunk): void {
    if (chunk.animated) this.drewAnimated = true;
    const gl = this.gl;
    let vertices = chunk.count * this.templateVertices;
    if (chunk.fill) {
      // Under the arrows' outlines, which anti-alias their edges.
      this.programs.useFill();
      this.fills.draw(chunk.fill);
      webglConnectionsStats.drawCalls++;
      vertices += chunk.fill.vertices;
    }
    for (const range of chunk.ranges) {
      if (!range.count) continue;
      this.programs.use();
      gl.bindVertexArray(range.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.templateVertices, range.count);
      webglConnectionsStats.drawCalls++;
    }
    webglConnectionsStats.instances += chunk.count;
    webglConnectionsStats.items += chunk.items;
    webglConnectionsStats.vertices += vertices;
  }

  public release(chunk: TGLChunk): void {
    this.releaseRanges(chunk);
    this.gl.deleteBuffer(chunk.buffer);
    if (chunk.fill) this.fills.release(chunk.fill);
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

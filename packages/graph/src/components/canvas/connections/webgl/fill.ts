import type { TWebGLShape } from "../lines/types";

import { colorFloats } from "./encode";

/** Floats per fill vertex: world x, y and the straight rgba (0..1) of its polygon. */
export const FILL_VERTEX_FLOATS = 6;

const FILL_STRIDE = FILL_VERTEX_FLOATS * 4;

/** Vertices of a polygon of `points` corners drawn as a triangle fan of separate triangles. */
function polygonVertices(points: number): number {
  return points >= 3 ? 3 * (points - 2) : 0;
}

/** Vertices `encodeFills` writes for the shapes: only closed arrows (shapes with a `fill`) have any. */
export function countFillVertices(shapes: readonly TWebGLShape[]): number {
  let count = 0;
  for (const { fill } of shapes) if (fill) count += polygonVertices(Math.floor(fill.length / 2));
  return count;
}

/**
 * Writes the polygon of every closed arrow into `out` as `TRIANGLES`: a fan from the first corner, each vertex with
 * the arrow's stroke color. Returns the number of vertices written, which `countFillVertices` gives in advance.
 */
export function encodeFills(shapes: readonly TWebGLShape[], out: Float32Array): number {
  let index = 0;
  const write = (fill: Float32Array, corner: number, color: readonly number[]): void => {
    const base = index * FILL_VERTEX_FLOATS;
    out[base] = fill[2 * corner];
    out[base + 1] = fill[2 * corner + 1];
    out.set(color, base + 2);
    index++;
  };
  for (const { fill, stroke } of shapes) {
    if (!fill) continue;
    const points = Math.floor(fill.length / 2);
    if (polygonVertices(points) === 0) continue;
    const color = colorFloats(stroke.color);
    for (let i = 1; i + 1 < points; i++) {
      write(fill, 0, color);
      write(fill, i, color);
      write(fill, i + 1, color);
    }
  }
  return index;
}

/** GPU drawable of a chunk's closed-arrow fills: one vertex buffer drawn as `TRIANGLES` with the fill program. */
export type TGLFill = {
  buffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
  vertices: number;
  /** Vertices the buffer holds. */
  capacity: number;
};

/** Builds, draws and frees the fill drawables of chunks; the caller binds the fill program before `draw()`. */
export class ArrowFills {
  private scratch = new Float32Array(0);

  constructor(private readonly gl: WebGL2RenderingContext) {}

  /** The fills of the shapes, reusing `previous` when it is large enough; undefined without closed arrows. */
  public build(shapes: readonly TWebGLShape[], previous: TGLFill | undefined): TGLFill | undefined {
    const vertices = countFillVertices(shapes);
    if (!vertices) {
      if (previous) this.release(previous);
      return undefined;
    }
    const floats = vertices * FILL_VERTEX_FLOATS;
    if (this.scratch.length < floats) this.scratch = new Float32Array(floats * 2);
    encodeFills(shapes, this.scratch);
    const data = this.scratch.subarray(0, floats);
    const gl = this.gl;
    if (previous && previous.capacity >= vertices) {
      // The vertex array refers to the buffer, not to its content: both stay.
      gl.bindBuffer(gl.ARRAY_BUFFER, previous.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      return { ...previous, vertices };
    }
    if (previous) this.release(previous);
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!buffer || !vao) throw new Error("Cannot allocate WebGL buffers");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, FILL_STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FILL_STRIDE, 8);
    gl.bindVertexArray(null);
    return { buffer, vao, vertices, capacity: vertices };
  }

  public draw(fill: TGLFill): void {
    const gl = this.gl;
    gl.bindVertexArray(fill.vao);
    gl.drawArrays(gl.TRIANGLES, 0, fill.vertices);
  }

  public release(fill: TGLFill): void {
    this.gl.deleteVertexArray(fill.vao);
    this.gl.deleteBuffer(fill.buffer);
  }
}

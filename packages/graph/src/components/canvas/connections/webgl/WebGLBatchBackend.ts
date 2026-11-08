import type { IBatchBackend } from "../../../../lib/batch/types";
import type { IConnectionBatchItem } from "../batch";
import type { TWebGLShape } from "../lines/types";

import { INSTANCE_ATTRIBUTES, INSTANCE_FLOATS, countPieces, encodeShapes } from "./encode";
import { ArrowFills } from "./fill";
import type { TGLFill } from "./fill";
import type { IConnectionPrograms, TShapeEffect } from "./programs";
import { webglConnectionsStats } from "./stats";

/** Instances inside a chunk's buffer drawn with one program, with a vertex array that starts at them. */
type TGLRange = {
  vao: WebGLVertexArrayObject;
  count: number;
  /** The effect the instances are drawn with; undefined for the plain stroke. */
  effect: TShapeEffect | undefined;
};

/** GPU drawable of one chunk: an instance buffer of stroke pieces and, with closed arrows, their fills. */
export type TGLChunk = {
  buffer: WebGLBuffer;
  /** Instances the buffer holds. */
  capacity: number;
  count: number;
  /** One range per effect group: the plain stroke first, then effects in order of first appearance. */
  ranges: TGLRange[];
  /** The effects of the chunk's shapes, in order of first appearance. */
  effects: readonly TShapeEffect[];
  /** Connection items with a WebGL shape: what the chunk draws, whatever the curve subdivision. */
  items: number;
  /** Whether one of the chunk's effects is animated, so the chunk needs a redraw every frame. */
  animated: boolean;
  /** Closed-arrow fills, drawn before the strokes. */
  fill?: TGLFill;
};

/** Told which effects the built chunks hold: once per chunk and effect, as chunks are built, rebuilt and released. */
export interface IEffectRefs {
  retain(effect: TShapeEffect): void;
  release(effect: TShapeEffect): void;
}

const STRIDE = INSTANCE_FLOATS * 4;

/**
 * Encodes the WebGL shapes of a chunk's items into one instance buffer, grouped by effect object: one range per
 * group, the plain stroke first. `draw()` queues a chunk; `endGroup()` draws the queued chunks of a z-level: their
 * closed-arrow fills with the fill program, then each effect group with its program, once over every queued chunk
 * (the plain stroke first, then effects in order of first appearance), so program switches per z-level equal the
 * number of effects. Items without a WebGL shape are not drawn.
 */
export class WebGLBatchBackend implements IBatchBackend<IConnectionBatchItem, TGLChunk, void> {
  /** Whether a chunk with an animated effect was drawn since the last `beginFrame()`. */
  public drewAnimated = false;

  private scratch = new Float32Array(0);

  private readonly fills: ArrowFills;

  /** Chunks of the current z-level, drawn by `endGroup()`. */
  private readonly queued: TGLChunk[] = [];

  /** Effects of the queued chunks in order of first appearance; reused by every z-level. */
  private readonly levelEffects = new Set<TShapeEffect>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly template: WebGLBuffer,
    private readonly templateVertices: number,
    private readonly programs: IConnectionPrograms,
    private readonly effectRefs?: IEffectRefs
  ) {
    this.fills = new ArrowFills(gl);
  }

  /** Starts a frame: forgets chunks a failed frame left queued and whether an animated chunk was drawn. */
  public beginFrame(): void {
    this.queued.length = 0;
    this.drewAnimated = false;
  }

  public build(items: readonly IConnectionBatchItem[], previous: TGLChunk | undefined): TGLChunk {
    const shapes: TWebGLShape[] = [];
    const plain: TWebGLShape[] = [];
    const byEffect = new Map<TShapeEffect, TWebGLShape[]>();
    for (const item of items) {
      const shape = item.getWebGLShape?.();
      if (!shape) continue;
      shapes.push(shape);
      if (!shape.effect) {
        plain.push(shape);
        continue;
      }
      const group = byEffect.get(shape.effect);
      if (group) group.push(shape);
      else byEffect.set(shape.effect, [shape]);
    }
    const groups: Array<[TShapeEffect | undefined, TWebGLShape[]]> = [[undefined, plain], ...byEffect];
    const ordered = byEffect.size ? groups.flatMap(([, group]) => group) : shapes;
    const pieces = groups.map(([, group]) => countPieces(group));
    const count = pieces.reduce((sum, value) => sum + value, 0);
    if (this.scratch.length < count * INSTANCE_FLOATS) this.scratch = new Float32Array(count * INSTANCE_FLOATS * 2);
    encodeShapes(ordered, this.scratch);
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
    const ranges: TGLRange[] = [];
    let first = 0;
    groups.forEach(([effect], index) => {
      if (!pieces[index]) return;
      ranges.push({ vao: this.createRange(buffer, first), count: pieces[index], effect });
      first += pieces[index];
    });
    const fill = this.fills.build(shapes, previous?.fill);
    const effects = [...byEffect.keys()];
    // Retained before the previous drawable lets go, so an effect the chunk keeps stays subscribed.
    for (const effect of effects) this.effectRefs?.retain(effect);
    if (previous) for (const effect of previous.effects) this.effectRefs?.release(effect);
    const animated = effects.some((effect) => effect.animated);
    return { buffer, capacity, count, ranges, effects, items: shapes.length, animated, fill };
  }

  /** Queues the chunk for the end of its z-level. */
  public draw(_target: void, chunk: TGLChunk): void {
    if (chunk.animated) this.drewAnimated = true;
    this.queued.push(chunk);
    webglConnectionsStats.instances += chunk.count;
    webglConnectionsStats.items += chunk.items;
    webglConnectionsStats.vertices += chunk.count * this.templateVertices + (chunk.fill?.vertices ?? 0);
  }

  /** Draws the queued chunks of the z-level: fills, then the plain stroke, then each effect by first appearance. */
  public endGroup(): void {
    const { queued, levelEffects } = this;
    if (!queued.length) return;
    try {
      for (const chunk of queued) {
        if (!chunk.fill) continue;
        // Under the arrows' outlines, which anti-alias their edges.
        this.programs.useFill();
        this.fills.draw(chunk.fill);
        webglConnectionsStats.drawCalls++;
      }
      this.drawGroup(undefined);
      for (const chunk of queued) for (const effect of chunk.effects) levelEffects.add(effect);
      for (const effect of levelEffects) this.drawGroup(effect);
    } finally {
      queued.length = 0;
      levelEffects.clear();
    }
  }

  public release(chunk: TGLChunk): void {
    this.releaseRanges(chunk);
    this.gl.deleteBuffer(chunk.buffer);
    if (chunk.fill) this.fills.release(chunk.fill);
    for (const effect of chunk.effects) this.effectRefs?.release(effect);
  }

  /** Every queued chunk's range of the effect group, after one bind of its program. */
  private drawGroup(effect: TShapeEffect | undefined): void {
    const gl = this.gl;
    let bound = false;
    for (const chunk of this.queued) {
      for (const range of chunk.ranges) {
        if (range.effect !== effect || !range.count) continue;
        if (!bound) {
          this.programs.use(effect);
          bound = true;
        }
        gl.bindVertexArray(range.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.templateVertices, range.count);
        webglConnectionsStats.drawCalls++;
      }
    }
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

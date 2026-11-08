import type { IBatchBackend } from "../../../../lib/batch/types";
import type { IConnectionBatchItem } from "../batch";
import type { TWebGLShape } from "../lines/types";

import { INSTANCE_ATTRIBUTES, INSTANCE_FLOATS, createEncodedChunk, encodeShapes, piecesDiffer } from "./encode";
import { ArrowFills } from "./fill";
import type { TGLFill } from "./fill";
import type { IConnectionPrograms, TShapeEffect } from "./programs";
import { createCurveTemplate, createLineTemplate } from "./shaders";
import { webglConnectionsStats } from "./stats";

/** The vertex template a range is drawn with: one quad per straight segment, or `CURVE_CHORDS` chords per piece. */
type TTemplateKind = "line" | "curve";

/** A vertex template in a GPU buffer, created once per backend. */
type TGLTemplate = { buffer: WebGLBuffer; vertices: number };

/** Instances of a chunk's buffer drawn with one program and one template, by a vertex array that starts at them. */
type TGLRange = {
  vao: WebGLVertexArrayObject;
  count: number;
  /** The effect the instances are drawn with; undefined for the plain stroke. */
  effect: TShapeEffect | undefined;
  template: TTemplateKind;
};

/** Shapes drawn with one effect; the plain stroke's group has none. */
type TShapeGroup = { effect: TShapeEffect | undefined; shapes: readonly TWebGLShape[] };

/** The tessellated strokes of a chunk: one instance buffer, lines first, then curve pieces. */
type TGLStrokes = {
  buffer: WebGLBuffer;
  /** Instances the buffer holds. */
  capacity: number;
  count: number;
  /** Instances drawn with the line template. */
  lineInstances: number;
  /** Instances drawn with the curve template. */
  curveInstances: number;
  /** Per effect group (the plain stroke first, then effects by first appearance): its lines, then its curves. */
  ranges: TGLRange[];
  /** The scale bucket the strokes are tessellated for (see `scaleBucket`). */
  bucket: number;
};

/** GPU drawable of one chunk: an instance buffer of stroke pieces and, with closed arrows, their fills. */
export type TGLChunk = TGLStrokes & {
  /** The chunk's shapes by effect group, kept to re-encode the strokes for another scale bucket. */
  groups: readonly TShapeGroup[];
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

/** Milliseconds per frame for bringing drawn chunks to the frame's scale bucket; at least one chunk a frame. */
const REENCODE_BUDGET_MS = 2;

function createTemplate(gl: WebGL2RenderingContext, vertices: Float32Array): TGLTemplate {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Cannot allocate a WebGL buffer");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  return { buffer, vertices: vertices.length / 2 };
}

/**
 * Encodes the WebGL shapes of a chunk's items into one instance buffer, grouped by effect object: per group one range
 * of straight segments and one of curve pieces, the plain stroke first. Curves are tessellated for the frame's scale
 * bucket: `draw()` brings a chunk of another bucket to it in place while the frame's budget lasts (re-encoding it only
 * when a curve gets another number of pieces) and draws the others as they are. `draw()` queues a chunk;
 * `endGroup()` draws the queued chunks of a z-level: their closed-arrow fills with the fill program, then each effect
 * group with its program, once over every queued chunk (the plain stroke first, then effects in order of first
 * appearance), so program switches per z-level equal the number of effects. Items without a WebGL shape are not
 * drawn.
 */
export class WebGLBatchBackend implements IBatchBackend<IConnectionBatchItem, TGLChunk, void> {
  /** Whether a chunk with an animated effect was drawn since the last `beginFrame()`. */
  public drewAnimated = false;

  /** Whether a chunk of another scale bucket was drawn as it is since the last `beginFrame()`: the budget ran out. */
  public drewStale = false;

  private readonly templates: Readonly<Record<TTemplateKind, TGLTemplate>>;

  private readonly encoded = createEncodedChunk();

  /** The instances of a chunk as they are uploaded: lines, then curve pieces. */
  private upload = new Float32Array(0);

  private readonly fills: ArrowFills;

  /** Chunks of the current z-level, drawn by `endGroup()`. */
  private readonly queued: TGLChunk[] = [];

  /** Effects of the queued chunks in order of first appearance; reused by every z-level. */
  private readonly levelEffects = new Set<TShapeEffect>();

  /** The frame's scale bucket: chunks are built for it, and drawn chunks of another one are re-encoded. */
  private bucket = 0;

  /** Milliseconds spent bringing chunks to the frame's bucket since `beginFrame()`. */
  private refreshMs = 0;

  /** Chunks brought to the frame's bucket since `beginFrame()`. */
  private refreshed = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly programs: IConnectionPrograms,
    private readonly effectRefs?: IEffectRefs
  ) {
    this.templates = {
      line: createTemplate(gl, createLineTemplate()),
      curve: createTemplate(gl, createCurveTemplate()),
    };
    this.fills = new ArrowFills(gl);
  }

  /**
   * Starts a frame at a scale bucket (see `scaleBucket`): forgets chunks a failed frame left queued, whether an
   * animated or a stale chunk was drawn, and the re-encoding spent.
   */
  public beginFrame(bucket: number): void {
    this.queued.length = 0;
    this.drewAnimated = false;
    this.drewStale = false;
    this.bucket = bucket;
    this.refreshMs = 0;
    this.refreshed = 0;
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
    const groups: TShapeGroup[] = [{ effect: undefined, shapes: plain }];
    for (const [effect, group] of byEffect) groups.push({ effect, shapes: group });
    const strokes = this.encodeStrokes(groups, previous);
    const fill = this.fills.build(shapes, previous?.fill);
    const effects = [...byEffect.keys()];
    // Retained before the previous drawable lets go, so an effect the chunk keeps stays subscribed.
    for (const effect of effects) this.effectRefs?.retain(effect);
    if (previous) for (const effect of previous.effects) this.effectRefs?.release(effect);
    const animated = effects.some((effect) => effect.animated);
    return { ...strokes, groups, effects, items: shapes.length, animated, fill };
  }

  /** Queues the chunk for the end of its z-level, brought to the frame's bucket first while the budget lasts. */
  public draw(_target: void, chunk: TGLChunk): void {
    if (chunk.bucket !== this.bucket) this.refresh(chunk);
    if (chunk.animated) this.drewAnimated = true;
    this.queued.push(chunk);
    const { templates } = this;
    webglConnectionsStats.instances += chunk.count;
    webglConnectionsStats.lineInstances += chunk.lineInstances;
    webglConnectionsStats.curveInstances += chunk.curveInstances;
    webglConnectionsStats.items += chunk.items;
    webglConnectionsStats.vertices +=
      chunk.lineInstances * templates.line.vertices +
      chunk.curveInstances * templates.curve.vertices +
      (chunk.fill?.vertices ?? 0);
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

  /**
   * Brings the chunk to the frame's bucket in place, unless the frame's budget is spent: re-encodes its strokes when a
   * curve is split into another number of pieces there, else only relabels it.
   */
  private refresh(chunk: TGLChunk): void {
    if (this.refreshed > 0 && this.refreshMs >= REENCODE_BUDGET_MS) {
      this.drewStale = true;
      return;
    }
    const began = performance.now();
    const { bucket } = this;
    if (chunk.groups.some(({ shapes }) => piecesDiffer(shapes, chunk.bucket, bucket))) {
      Object.assign(chunk, this.encodeStrokes(chunk.groups, chunk));
    } else {
      chunk.bucket = bucket;
    }
    this.refreshMs += performance.now() - began;
    this.refreshed++;
  }

  /**
   * Tessellates the groups' strokes for the frame's bucket into one buffer: every group's lines, then every group's
   * curve pieces, with a range per group and template. Reuses the previous buffer when it is large enough and frees
   * the previous ranges.
   */
  private encodeStrokes(groups: readonly TShapeGroup[], previous: TGLStrokes | undefined): TGLStrokes {
    const { encoded, bucket } = this;
    encoded.lines.count = 0;
    encoded.curves.count = 0;
    // Per group: where its lines and its curve pieces end.
    const ends: number[] = [];
    for (const group of groups) {
      encodeShapes(group.shapes, bucket, encoded);
      ends.push(encoded.lines.count, encoded.curves.count);
    }
    const lineInstances = encoded.lines.count;
    const curveInstances = encoded.curves.count;
    const count = lineInstances + curveInstances;
    const { buffer, capacity } = this.uploadInstances(count, previous);
    const ranges: TGLRange[] = [];
    let lineStart = 0;
    let curveStart = 0;
    groups.forEach(({ effect }, index) => {
      const lineEnd = ends[2 * index];
      const curveEnd = ends[2 * index + 1];
      if (lineEnd > lineStart) {
        const vao = this.createRange(buffer, lineStart, "line");
        ranges.push({ vao, count: lineEnd - lineStart, effect, template: "line" });
      }
      if (curveEnd > curveStart) {
        const vao = this.createRange(buffer, lineInstances + curveStart, "curve");
        ranges.push({ vao, count: curveEnd - curveStart, effect, template: "curve" });
      }
      lineStart = lineEnd;
      curveStart = curveEnd;
    });
    return { buffer, capacity, count, lineInstances, curveInstances, ranges, bucket };
  }

  /** Uploads the encoded lines, then curve pieces, into the previous buffer when it holds them, else a new one. */
  private uploadInstances(count: number, previous: TGLStrokes | undefined): { buffer: WebGLBuffer; capacity: number } {
    const { gl, encoded } = this;
    const lineFloats = encoded.lines.count * INSTANCE_FLOATS;
    const floats = count * INSTANCE_FLOATS;
    if (this.upload.length < floats) this.upload = new Float32Array(floats * 2);
    this.upload.set(encoded.lines.data.subarray(0, lineFloats));
    this.upload.set(encoded.curves.data.subarray(0, floats - lineFloats), lineFloats);
    const data = this.upload.subarray(0, floats);
    if (previous) this.releaseRanges(previous);
    if (previous && previous.capacity >= count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, previous.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      return { buffer: previous.buffer, capacity: previous.capacity };
    }
    if (previous) gl.deleteBuffer(previous.buffer);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Cannot allocate WebGL buffers");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    return { buffer, capacity: count };
  }

  /** Every queued chunk's ranges of the effect group, lines then curves per chunk, after one bind of its program. */
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
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.templates[range.template].vertices, range.count);
        webglConnectionsStats.drawCalls++;
      }
    }
  }

  private releaseRanges(chunk: TGLStrokes): void {
    for (const range of chunk.ranges) this.gl.deleteVertexArray(range.vao);
  }

  /** A vertex array over the template and the instances from `first` on. */
  private createRange(buffer: WebGLBuffer, first: number, template: TTemplateKind): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Cannot allocate WebGL buffers");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.templates[template].buffer);
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

import { effect as watch } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import { BatchScene } from "../../../../lib/batch/BatchScene";
import type { TBatchParams } from "../../../../lib/batch/types";
import type { TTileRect } from "../../../../lib/culling/TileIndex";
import type { TCameraState } from "../../../../services/camera/CameraService";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";

import type { IEffectRefs, TGLChunk } from "./WebGLBatchBackend";
import { WebGLBatchBackend } from "./WebGLBatchBackend";
import { ZLevelBatch } from "./ZLevelBatch";
import { scaleBucket } from "./encode";
import { ConnectionPrograms } from "./programs";
import type { TShapeEffect } from "./programs";
import { webglConnectionsStats } from "./stats";

export type TWebGLConnectionsOptions = {
  chunkSize: number;
  cellSize: number;
  getCamera: () => TCameraState;
  /** Called after a change that can alter the picture, like the Path2D batch's `onChange`. */
  onChange: () => void;
  /** The context is lost: nothing is drawn until the owner disposes this instance. */
  onLost: () => void;
  /** The lost context is restored; its objects are gone, so the owner disposes this instance and creates another. */
  onRestored: () => void;
};

/** An effect present in built chunks: how many hold it, and the subscription to its uniforms. */
type TEffectEntry = { chunks: number; dispose: () => void };

/** The signals' values; reading them inside an effect subscribes the effect to each. */
function readValues(signals: ReadonlyArray<ReadonlySignal<unknown>>): unknown[] {
  return signals.map((source) => source.value);
}

/**
 * Lines and arrows drawn with WebGL2 on a canvas stacked right below the graph layer's canvas. Draws in the graph
 * layer's frame; it also redraws itself in an animation frame of its own, without the graph layer, every frame while it
 * draws an animated chunk or a chunk still tessellated for another zoom bucket, and once after a uniform of an effect
 * in its chunks changes. Suspended while the graph layer is detached. After its context is lost it draws nothing; its
 * canvas reports the restore.
 */
export class WebGLConnections implements IConnectionBatch {
  /**
   * Returns undefined when WebGL2 is unavailable; throws the log when the line or fill program fails to compile or
   * link, after freeing the context.
   */
  public static create(
    graphCanvas: HTMLCanvasElement,
    options: TWebGLConnectionsOptions
  ): WebGLConnections | undefined {
    const canvas = graphCanvas.ownerDocument.createElement("canvas");
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) return undefined;
    let connections: WebGLConnections;
    try {
      connections = new WebGLConnections(canvas, gl, graphCanvas, options);
    } catch (error) {
      // Browsers limit live WebGL contexts; this one is not used.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      throw error;
    }
    canvas.classList.add("layer", "layer-canvas", "no-pointer-events");
    canvas.style.zIndex = graphCanvas.style.zIndex;
    connections.stackBelowGraphCanvas();
    return connections;
  }

  /** Chunks by z-level only: styles are instance attributes. */
  private readonly batch: ZLevelBatch<IConnectionBatchItem, TGLChunk, void>;

  private readonly backend: WebGLBatchBackend;

  private readonly programs: ConnectionPrograms;

  private readonly start = performance.now();

  private viewport: TTileRect | undefined;

  private frame: number | undefined;

  /** Set by `webglcontextlost`; the GL objects of this instance are gone for good then, a restore included. */
  private lost = false;

  /** Set by `suspend()` until the next `render()`: no frames of its own, no canvas in the document. */
  private suspended = false;

  /** Effects of the built chunks, with the subscriptions to their uniforms. */
  private readonly effects = new Map<TShapeEffect, TEffectEntry>();

  private readonly effectRefs: IEffectRefs = {
    retain: (effect) => this.retainEffect(effect),
    release: (effect) => this.releaseEffect(effect),
  };

  /** Compiles the line and fill programs; throws their log when one fails. */
  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly graphCanvas: HTMLCanvasElement,
    private readonly options: TWebGLConnectionsOptions
  ) {
    this.programs = new ConnectionPrograms(gl);
    this.backend = new WebGLBatchBackend(gl, this.programs, this.effectRefs);
    this.batch = new ZLevelBatch(
      new BatchScene(this.backend, {
        chunkSize: options.chunkSize,
        cellSize: options.cellSize,
        onChange: options.onChange,
      })
    );
    canvas.addEventListener("webglcontextlost", this.handleLost);
    canvas.addEventListener("webglcontextrestored", this.handleRestored);
  }

  public add(item: IConnectionBatchItem, params: TBatchParams): void {
    this.batch.add(item, params);
  }

  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    this.batch.update(item, params);
  }

  public delete(item: IConnectionBatchItem): void {
    this.batch.delete(item);
  }

  public has(item: IConnectionBatchItem): boolean {
    return this.batch.has(item);
  }

  public markDirty(item: IConnectionBatchItem): void {
    this.batch.markDirty(item);
  }

  public markBoundsDirty(item: IConnectionBatchItem): void {
    this.batch.markBoundsDirty(item);
  }

  /** Visits every item with its own params, style group included, so switching back to Path2D restores them. */
  public forEachItem(visit: (item: IConnectionBatchItem, params: TBatchParams) => void): void {
    this.batch.forEachItem(visit);
  }

  /** Draws the frame of the graph layer with its culling viewport; nothing after the context is lost. */
  public render(viewport?: TTileRect): void {
    this.suspended = false;
    if (this.lost) return;
    this.viewport = viewport && { ...viewport };
    // The graph layer's frame replaces a pending loop frame, so a frame is drawn once.
    this.stopLoop();
    this.draw();
    this.loop();
  }

  /**
   * Stops drawing while the graph layer is detached: cancels its own frame, ignores uniform changes and takes its
   * canvas out of the document. The GL objects, the items and the context listeners stay, so the next `render()` puts
   * the canvas back and draws, and a lost context still reports its restore.
   */
  public suspend(): void {
    this.suspended = true;
    this.stopLoop();
    this.canvas.remove();
  }

  /** Stops the animation loop and the uniform subscriptions, removes the canvas and its listeners, frees its context. */
  public dispose(): void {
    this.stopLoop();
    this.disposeEffects();
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleRestored);
    this.canvas.remove();
    if (this.gl.isContextLost()) return;
    // A restored context has none of this instance's objects.
    if (!this.lost) this.programs.dispose();
    // Browsers limit live WebGL contexts; free this one now instead of at garbage collection.
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private stopLoop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  /** A chunk was built with the effect: the first one subscribes to the effect's uniforms. */
  private retainEffect(effect: TShapeEffect): void {
    const entry = this.effects.get(effect);
    if (entry) {
      entry.chunks++;
      return;
    }
    const uniforms = Object.values(effect.uniforms);
    let subscribed = false;
    // The draw reads the values with peek(); only this effect reads `.value`, which subscribes it to each uniform.
    const dispose = uniforms.length
      ? watch(() => {
          readValues(uniforms);
          if (subscribed) this.requestFrame();
          subscribed = true;
        })
      : (): void => undefined;
    this.effects.set(effect, { chunks: 1, dispose });
  }

  /** A chunk with the effect was rebuilt without it or released: the last one unsubscribes. */
  private releaseEffect(effect: TShapeEffect): void {
    const entry = this.effects.get(effect);
    if (!entry || --entry.chunks > 0) return;
    entry.dispose();
    this.effects.delete(effect);
  }

  private disposeEffects(): void {
    for (const entry of this.effects.values()) entry.dispose();
    this.effects.clear();
  }

  /**
   * The culling viewport widened on each side by the widest `extraWidth` of the effects in the chunks, in world
   * units: a glow reaches beyond its connection's bounds.
   */
  private cullingViewport(scale: number): TTileRect | undefined {
    const viewport = this.viewport;
    if (!viewport || !(scale > 0)) return viewport;
    let extraWidth = 0;
    for (const effect of this.effects.keys()) extraWidth = Math.max(extraWidth, effect.extraWidth);
    if (!extraWidth) return viewport;
    const margin = extraWidth / scale;
    return {
      minX: viewport.minX - margin,
      minY: viewport.minY - margin,
      maxX: viewport.maxX + margin,
      maxY: viewport.maxY + margin,
    };
  }

  /** Same z-index, right before it in the document: below the graph layer's canvas, above the layers under it. */
  private stackBelowGraphCanvas(): void {
    if (this.canvas.nextSibling === this.graphCanvas) return;
    this.graphCanvas.parentNode?.insertBefore(this.canvas, this.graphCanvas);
  }

  private draw(): void {
    const began = performance.now();
    const { gl, canvas, graphCanvas } = this;
    // The layer moves its canvas when it is attached to a root again.
    this.stackBelowGraphCanvas();
    if (canvas.width !== graphCanvas.width || canvas.height !== graphCanvas.height) {
      canvas.width = graphCanvas.width;
      canvas.height = graphCanvas.height;
    }
    const camera = this.options.getCamera();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Each program gets these uniforms when a chunk first draws with it in this frame.
    this.programs.beginFrame({
      width: camera.width,
      height: camera.height,
      x: camera.x,
      y: camera.y,
      scale: camera.scale,
      dpr: camera.width ? canvas.width / camera.width : 1,
      time: (performance.now() - this.start) / 1000,
    });
    // Curves are tessellated for the camera's zoom bucket; chunks of another one are re-encoded over a few frames.
    this.backend.beginFrame(scaleBucket(camera.scale));
    this.batch.render(undefined, this.cullingViewport(camera.scale));
    gl.bindVertexArray(null);
    webglConnectionsStats.draws++;
    webglConnectionsStats.drawMs += performance.now() - began;
  }

  /**
   * Redraws every animation frame while an animated chunk is visible or a drawn chunk waits for its re-encoding; the
   * graph layer is not involved.
   */
  private loop(): void {
    if (this.backend.drewAnimated || this.backend.drewStale) this.requestFrame();
  }

  /**
   * One frame of its own in the next animation frame, unless one is pending; nothing while suspended or after the
   * context is lost.
   */
  private requestFrame(): void {
    if (this.frame !== undefined || this.lost || this.suspended) return;
    this.frame = requestAnimationFrame(this.handleFrame);
  }

  private handleFrame = (): void => {
    this.frame = undefined;
    // The graph layer's canvas left the document: nothing is drawn until the graph layer's next frame.
    if (!this.graphCanvas.isConnected) return;
    this.draw();
    this.loop();
  };

  private handleLost = (event: Event): void => {
    // Without preventDefault() the browser never restores the context.
    event.preventDefault();
    this.lost = true;
    this.stopLoop();
    // Nothing is drawn again, so uniform changes have nothing to redraw.
    this.disposeEffects();
    this.options.onLost();
  };

  private handleRestored = (): void => {
    this.options.onRestored();
  };
}

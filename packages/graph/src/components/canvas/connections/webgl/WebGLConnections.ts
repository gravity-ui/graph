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
 * A context lost while the renderer was set up: a browser can hand out a context that is lost already, or lose it
 * meanwhile. Its canvas never joins the document; it keeps listening to it, so the browser may restore the context,
 * and reports the restore like a lost renderer does.
 */
export class LostWebGLContext {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly onRestored: () => void
  ) {
    canvas.addEventListener("webglcontextlost", this.handleLost);
    canvas.addEventListener("webglcontextrestored", this.handleRestored);
  }

  /** Nothing to suspend: its canvas is not in the document. */
  public suspend(): void {}

  /** Stops listening and frees a restored context. */
  public dispose(): void {
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleRestored);
    if (!this.gl.isContextLost()) this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private handleLost = (event: Event): void => {
    // Without preventDefault() the browser never restores the context.
    event.preventDefault();
  };

  private handleRestored = (): void => {
    this.onRestored();
  };
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
   * Returns undefined when WebGL2 is unavailable, and a `LostWebGLContext` that reports the restore (`onRestored`)
   * when the context is lost while the renderer is set up; throws the log when the line or fill program fails to
   * compile or link, after freeing the context.
   */
  public static create(
    graphCanvas: HTMLCanvasElement,
    options: TWebGLConnectionsOptions
  ): WebGLConnections | LostWebGLContext | undefined {
    const canvas = graphCanvas.ownerDocument.createElement("canvas");
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) return undefined;
    let connections: WebGLConnections;
    try {
      connections = new WebGLConnections(canvas, gl, graphCanvas, options);
    } catch (error) {
      // A lost context fails every step of the setup: the setup is not broken, the context may come back.
      if (gl.isContextLost()) return new LostWebGLContext(canvas, gl, options.onRestored);
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

  /** The effect each item reported when it was added or updated last; items without one are not kept. */
  private readonly itemEffects = new Map<IConnectionBatchItem, TShapeEffect>();

  /** How many items of `itemEffects` hold each effect. */
  private readonly effectItems = new Map<TShapeEffect, number>();

  /** The widest `extraWidth` of the items' and the built chunks' effects; undefined until it is computed again. */
  private extraWidth: number | undefined = 0;

  /** The `extraWidth` the current frame culls with; Infinity when the frame culls nothing. */
  private frameExtraWidth = Infinity;

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
    this.trackEffect(item, item.getWebGLEffect?.());
    this.batch.add(item, params);
  }

  public update(item: IConnectionBatchItem, params: TBatchParams): void {
    this.trackEffect(item, item.getWebGLEffect?.());
    this.batch.update(item, params);
  }

  public delete(item: IConnectionBatchItem): void {
    this.trackEffect(item, undefined);
    this.batch.delete(item);
  }

  public has(item: IConnectionBatchItem): boolean {
    return this.batch.has(item);
  }

  public markDirty(item: IConnectionBatchItem): void {
    this.trackEffect(item, item.getWebGLEffect?.());
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

  /**
   * Keeps the item's effect counted, so the culling margin covers it before a chunk holding it is built: an item
   * outside the viewport may glow into it.
   */
  private trackEffect(item: IConnectionBatchItem, effect: TShapeEffect | undefined): void {
    const previous = this.itemEffects.get(item);
    if (previous === effect) return;
    if (previous) {
      this.itemEffects.delete(item);
      const count = (this.effectItems.get(previous) ?? 1) - 1;
      if (count > 0) {
        this.effectItems.set(previous, count);
      } else {
        this.effectItems.delete(previous);
        this.forgetExtraWidth(previous);
      }
    }
    if (effect) {
      this.itemEffects.set(item, effect);
      this.effectItems.set(effect, (this.effectItems.get(effect) ?? 0) + 1);
      this.widenExtraWidth(effect);
    }
  }

  /** An effect joined the items or the built chunks: the margin is at least its extra width. */
  private widenExtraWidth(effect: TShapeEffect): void {
    if (this.extraWidth !== undefined) this.extraWidth = Math.max(this.extraWidth, effect.extraWidth);
  }

  /** An effect left the items or the built chunks: the margin is computed again when it was the widest. */
  private forgetExtraWidth(effect: TShapeEffect): void {
    if (effect.extraWidth > 0 && effect.extraWidth === this.extraWidth) this.extraWidth = undefined;
  }

  /** The widest `extraWidth` of the items' and the built chunks' effects; distinct effects are few. */
  private getExtraWidth(): number {
    if (this.extraWidth === undefined) {
      let extraWidth = 0;
      for (const effect of this.effectItems.keys()) extraWidth = Math.max(extraWidth, effect.extraWidth);
      for (const effect of this.effects.keys()) extraWidth = Math.max(extraWidth, effect.extraWidth);
      this.extraWidth = extraWidth;
    }
    return this.extraWidth;
  }

  /**
   * A chunk was built with the effect: the first one subscribes to the effect's uniforms. An effect wider than the
   * margin this frame culls with (one its item did not report) asks for another frame with the wider margin.
   */
  private retainEffect(effect: TShapeEffect): void {
    const entry = this.effects.get(effect);
    if (entry) {
      entry.chunks++;
      return;
    }
    this.widenExtraWidth(effect);
    if (effect.extraWidth > this.frameExtraWidth) this.requestFrame();
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
    this.forgetExtraWidth(effect);
  }

  private disposeEffects(): void {
    for (const entry of this.effects.values()) entry.dispose();
    this.effects.clear();
    this.extraWidth = undefined;
  }

  /**
   * The culling viewport widened on each side by the widest `extraWidth` of the items' effects (and of the built
   * chunks' effects), in world units: a glow reaches beyond its connection's bounds.
   */
  private cullingViewport(scale: number): TTileRect | undefined {
    const viewport = this.viewport;
    // Without a viewport every chunk is drawn; at a scale that is not positive there is no margin to widen by.
    this.frameExtraWidth = viewport && scale > 0 ? this.getExtraWidth() : Infinity;
    if (!viewport || !(scale > 0)) return viewport;
    const extraWidth = this.frameExtraWidth;
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

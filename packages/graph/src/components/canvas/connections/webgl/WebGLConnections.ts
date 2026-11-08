import { BatchScene } from "../../../../lib/batch/BatchScene";
import type { TBatchParams } from "../../../../lib/batch/types";
import type { TTileRect } from "../../../../lib/culling/TileIndex";
import type { TCameraState } from "../../../../services/camera/CameraService";
import type { IConnectionBatch, IConnectionBatchItem } from "../batch";

import type { TGLChunk } from "./WebGLBatchBackend";
import { WebGLBatchBackend } from "./WebGLBatchBackend";
import { ZLevelBatch } from "./ZLevelBatch";
import { ConnectionPrograms } from "./programs";
import { createCurveTemplate } from "./shaders";
import { webglConnectionsStats } from "./stats";

export type TWebGLConnectionsOptions = {
  chunkSize: number;
  cellSize: number;
  getCamera: () => TCameraState;
  /** Called after a change that can alter the picture, like the Path2D batch's `onChange`. */
  onChange: () => void;
  onLost: () => void;
};

/**
 * Lines and arrows drawn with WebGL2 on a canvas stacked right below the graph layer's canvas. Draws in the graph
 * layer's frame; while it draws an animated chunk, it also redraws itself every animation frame without the graph
 * layer.
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

  /** Compiles the line and fill programs; throws their log when one fails. */
  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly graphCanvas: HTMLCanvasElement,
    private readonly options: TWebGLConnectionsOptions
  ) {
    this.programs = new ConnectionPrograms(gl);
    const vertices = createCurveTemplate();
    const template = gl.createBuffer();
    if (!template) throw new Error("Cannot allocate a WebGL buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, template);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    this.backend = new WebGLBatchBackend(gl, template, vertices.length / 2, this.programs);
    this.batch = new ZLevelBatch(
      new BatchScene(this.backend, {
        chunkSize: options.chunkSize,
        cellSize: options.cellSize,
        onChange: options.onChange,
      })
    );
    canvas.addEventListener("webglcontextlost", this.handleLost);
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

  /** Draws the frame of the graph layer with its culling viewport. */
  public render(viewport?: TTileRect): void {
    this.viewport = viewport && { ...viewport };
    // The graph layer's frame replaces a pending loop frame, so a frame is drawn once.
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.draw();
    this.loop();
  }

  /** Stops the animation loop, removes the canvas and frees its context. */
  public dispose(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    this.canvas.remove();
    // Browsers limit live WebGL contexts; free this one now instead of at garbage collection.
    if (!this.gl.isContextLost()) {
      this.programs.dispose();
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
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
    this.backend.drewAnimated = false;
    this.batch.render(undefined, this.viewport);
    gl.bindVertexArray(null);
    webglConnectionsStats.draws++;
    webglConnectionsStats.drawMs += performance.now() - began;
  }

  /** Redraws every animation frame while an animated chunk is visible; the graph layer is not involved. */
  private loop(): void {
    if (this.frame !== undefined || !this.backend.drewAnimated) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.draw();
      this.loop();
    });
  }

  private handleLost = (event: Event): void => {
    event.preventDefault();
    this.options.onLost();
  };
}

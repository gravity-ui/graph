import REGL from "regl";

import { Layer, LayerProps } from "../../../services/Layer";
import { TGraphLayerContext } from "./graphLayer/GraphLayer";

type TCameraProps = {
  u_resolution: [number, number];
  u_camera: [number, number];
  u_scale: number;
};

/**
 * WebGLLayer — base class for layers that render via WebGL (regl).
 *
 * Handles all WebGL boilerplate so subclasses only contain rendering logic:
 * - Creates the canvas without getContext("2d") (reserved for WebGL)
 * - Owns the regl instance and GL context (shared across all engines)
 * - Sets up a cameraScope command that binds u_resolution/u_camera/u_scale
 *   once per frame; engine draw() calls inherit these uniforms for free
 * - Clears, resizes viewport, and drives the render loop
 *
 * ## Subclass contract
 *
 * 1. Pass canvas options to `super()` in your constructor.
 * 2. Override `afterWebGLInit()` to create engines and subscribe to events.
 *    Do NOT call `super.afterInit()` there — WebGLLayer manages the call chain.
 * 3. Override `unmountLayer()` to destroy your engines, then call `super.unmountLayer()`.
 * 4. Implement `drawScene()` — call engine.draw() inside it. Camera uniforms are
 *    already bound via cameraScope when this method is called.
 *
 * @example
 * ```typescript
 * class MyWebGLLayer extends WebGLLayer<MyLayerProps> {
 *   private engine: LineWebGLEngine | null = null;
 *
 *   constructor(props: MyLayerProps) {
 *     super({ canvas: { zIndex: 1, transformByCameraPosition: true }, ...props });
 *   }
 *
 *   protected override afterWebGLInit(): void {
 *     this.engine = new LineWebGLEngine(this.regl!);
 *     this.engine.init();
 *   }
 *
 *   protected override unmountLayer(): void {
 *     this.engine?.destroy();
 *     this.engine = null;
 *     super.unmountLayer();
 *   }
 *
 *   protected override drawScene(): void {
 *     this.engine?.draw();
 *   }
 * }
 * ```
 */
export abstract class WebGLLayer<
  Props extends LayerProps = LayerProps,
  Context extends TGraphLayerContext = TGraphLayerContext,
> extends Layer<Props, Context> {
  /** Shared regl instance — pass to every engine so they live in one GL context. */
  protected regl: REGL.Regl | null = null;

  protected gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  /**
   * Scoped command that binds camera uniforms once per frame.
   * Engine draw() calls inside drawScene() inherit u_resolution, u_camera, u_scale.
   */
  protected cameraScope: REGL.DrawCommand | null = null;

  constructor(props: Props) {
    super(props);
    // canvas is created by Layer.init() (called from super()) before this line runs.
    // Override ctx to null — this canvas belongs to WebGL, not Canvas 2D.
    this.setContext({
      canvas: this.canvas,
      ownerDocument: this.canvas.ownerDocument,
      ctx: null as unknown as CanvasRenderingContext2D,
    });
  }

  /**
   * Override to skip getContext("2d") — the canvas is reserved for WebGL.
   * Sets graphCanvas in context; ctx is overridden to null in the constructor.
   */
  protected override createCanvas(params: LayerProps["canvas"]): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.classList.add("layer", "layer-canvas");
    if (Array.isArray(params?.classNames)) canvas.classList.add(...params.classNames);
    canvas.style.zIndex = `${Number(params?.zIndex)}`;
    this.setContext({ graphCanvas: canvas });
    return canvas;
  }

  /**
   * Override to skip the base class's getContext("2d") cleanup, which would
   * crash because this canvas has a WebGL context, not a 2D one.
   * Destroys the regl instance and removes DOM elements.
   */
  protected override unmountLayer(): void {
    this.regl?.destroy();
    this.regl = null;
    this.cameraScope = null;
    this.gl = null;
    this.canvas?.parentNode?.removeChild(this.canvas);
    this.html?.parentNode?.removeChild(this.html);
    this.eventAbortController.abort();
    this.eventAbortController = new AbortController();
    this.attached = false;
  }

  /**
   * Initializes WebGL context, regl instance, and cameraScope, then
   * calls afterWebGLInit() so subclasses can set up their engines,
   * then calls super.afterInit() to complete the Layer lifecycle.
   */
  protected override afterInit(): void {
    this.setContext({ root: this.root as HTMLDivElement });

    this.gl = (this.canvas.getContext("webgl2") ?? this.canvas.getContext("webgl")) as
      | WebGLRenderingContext
      | WebGL2RenderingContext;

    this.regl = REGL({ gl: this.gl, attributes: { alpha: true, premultipliedAlpha: false } });

    const propFn = this.regl.prop.bind(this.regl) as (name: string) => REGL.DynamicVariable<unknown>;
    this.cameraScope = this.regl({
      uniforms: {
        u_resolution: propFn("u_resolution"),
        u_camera: propFn("u_camera"),
        u_scale: propFn("u_scale"),
      },
    });

    this.afterWebGLInit();
    super.afterInit();
  }

  /**
   * Called after the WebGL context, regl instance, and cameraScope are ready.
   * Override to create engines and subscribe to graph events.
   * Do NOT call super.afterInit() here — WebGLLayer manages the call chain.
   */
  protected afterWebGLInit(): void {}

  protected override render(): void {
    if (!this.regl || !this.cameraScope) return;

    if (this.sizeTouched) {
      this.sizeTouched = false;
      this.updateCanvasSize();
      this.gl!.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    const camera = this.context.camera.getCameraState();
    const dpr = this.getDRP();

    this.regl.clear({ color: [0, 0, 0, 0], depth: 1 });

    const cameraProps: TCameraProps = {
      u_resolution: [this.canvas.width / dpr, this.canvas.height / dpr],
      u_camera: [camera.x, camera.y],
      u_scale: camera.scale,
    };

    this.cameraScope(cameraProps, () => this.drawScene());
  }

  /**
   * Called every frame inside the cameraScope. Issue engine draw() calls here.
   * Camera uniforms (u_resolution, u_camera, u_scale) are already bound.
   */
  protected abstract drawScene(): void;
}

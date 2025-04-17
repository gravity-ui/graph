import { Graph } from "../graph";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { CoreComponent } from "../lib";
import { Component, TComponentState } from "../lib/Component";
import { noop } from "../utils/functions";

import { ICamera } from "./camera/CameraService";

import "./Layer.css";

export type LayerPropsElementProps = {
  zIndex: number;
  classNames?: string[];
  root?: HTMLElement;
  transformByCameraPosition?: boolean;
};

export type LayerProps = {
  canvas?: LayerPropsElementProps & { respectPixelRatio?: boolean };
  html?: LayerPropsElementProps;
  root?: HTMLElement;
  camera: ICamera;
  graph: Graph;
};

export type LayerContext = {
  graph: Graph;
  camera: ICamera;
  constants: TGraphConstants;
  colors: TGraphColors;
  graphCanvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  layer: Layer;
};

export class Layer<
  Props extends LayerProps = LayerProps,
  Context extends LayerContext = LayerContext,
  State extends TComponentState = TComponentState,
> extends Component<Props, State, Context> {
  public static id?: string;

  protected canvas: HTMLCanvasElement;

  protected html: HTMLElement;

  protected root?: HTMLDivElement;

  private cameraSubscription: () => void = noop;

  constructor(props: Props, parent?: CoreComponent) {
    super(props, parent);

    this.setContext({
      graph: this.props.graph,
      camera: props.camera,
      colors: this.props.graph.$graphColors.value,
      constants: this.props.graph.$graphConstants.value,
      layer: this,
    });

    this.init();

    this.props.graph.on("colors-changed", (event) => {
      this.setContext({
        colors: event.detail.colors,
      });
    });

    this.props.graph.on("constants-changed", (event) => {
      this.setContext({
        constants: event.detail.constants,
      });
    });
  }

  public updateSize(width: number, height: number) {
    if (this.canvas) {
      const dpr = this.props.canvas.respectPixelRatio === false ? 1 : this.context.constants.system?.PIXEL_RATIO;
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }
  }

  protected afterInit() {
    if (this.props.canvas) {
      const ctx = this.canvas.getContext("2d");
      if (ctx) {
        this.setContext({
          graphCanvas: this.canvas,
          ctx,
        });
      } else {
        console.error("Failed to get 2D context from canvas");
      }
    }
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  protected init() {
    if (this.props.canvas) {
      if (this.canvas) {
        throw new Error("Attempt to recreate a canvas");
      }
      this.canvas = this.createCanvas(this.props.canvas);
    }

    if (this.props.html) {
      if (this.html) {
        throw new Error("Attempt to recreate an html");
      }
      this.html = this.createHTML(this.props.html);
    }

    this.root = this.props.root as HTMLDivElement;
    if (this.root) {
      this.attachLayer(this.root);
    }
  }

  protected unmountLayer() {
    if (this.canvas) {
      const cameraState = this.context.camera.getCameraState();
      const context = this.canvas.getContext("2d");
      context.setTransform(1, 0, 0, 1, 0, 0);

      context.clearRect(0, 0, cameraState.width, cameraState.height);

      context.setTransform(cameraState.scale, 0, 0, cameraState.scale, cameraState.x, cameraState.y);
    }
    this.canvas?.parentNode?.removeChild(this.canvas);
    this.html?.parentNode?.removeChild(this.html);
  }

  protected unmount(): void {
    this.unmountLayer();
  }

  public getCanvas() {
    return this.canvas;
  }

  public getHTML() {
    return this.html;
  }

  public attachLayer(root: HTMLElement) {
    if (this.root) {
      this.unmountLayer();
    }
    this.root = root as HTMLDivElement;
    if (this.canvas) {
      root.appendChild(this.canvas);
    }
    if (this.html) {
      root.appendChild(this.html);
    }
    this.afterInit();
  }

  public detachLayer() {
    this.unmount();
    this.root = undefined;
    this.cameraSubscription?.();
  }

  protected subscribeCameraState() {
    this.cameraSubscription = this.props.graph.on("camera-change", (event) => {
      const camera = event.detail;
      this.html.style.transform = `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.x}, ${camera.y})`;
    });
  }

  protected createCanvas(params: LayerProps["canvas"]) {
    const canvas = document.createElement("canvas");
    canvas.classList.add("layer", "layer-canvas");
    if (Array.isArray(params.classNames)) canvas.classList.add(...params.classNames);
    canvas.style.zIndex = `${Number(params.zIndex)}`;
    return canvas;
  }

  protected createHTML(params: LayerProps["html"]) {
    const div = document.createElement("div");
    div.classList.add("layer", "layer-html");
    if (Array.isArray(params.classNames)) div.classList.add(...params.classNames);
    div.style.zIndex = `${Number(params.zIndex)}`;
    if (params.transformByCameraPosition) {
      div.classList.add("layer-with-camera");
      this.subscribeCameraState();
    }
    return div;
  }

  public getDRP() {
    const respectPixelRatio = this.props.canvas?.respectPixelRatio ?? true;
    return respectPixelRatio ? this.context.constants.system?.PIXEL_RATIO ?? 1 : 1;
  }

  protected applyTransform(
    x: number,
    y: number,
    scale: number,
    respectPixelRatio: boolean = this.props.canvas?.respectPixelRatio
  ) {
    const ctx = this.context.ctx;
    const dpr = respectPixelRatio ? this.getDRP() : 1;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, x * dpr, y * dpr);
  }

  public resetTransform() {
    const cameraState = this.props.canvas?.transformByCameraPosition ? this.context.camera.getCameraState() : null;

    // Reset transform and clear the canvas
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Use canvas dimensions directly, as they should already factor in DPR if respectPixelRatio is true
    this.context.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform(cameraState?.x ?? 0, cameraState?.y ?? 0, cameraState?.scale ?? 1, true);
  }
}

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
};

export type LayerProps = {
  canvas?: LayerPropsElementProps & { respectPixelRatio?: true };
  html?: LayerPropsElementProps & { transformByCameraPosition?: true };
  root?: HTMLElement;
  camera: ICamera;
  graph: Graph;
};

export type LayerContext = {
  camera: ICamera;
  constants: TGraphConstants;
  colors: TGraphColors;
};

export class Layer<
  Props extends LayerProps = LayerProps,
  Context extends LayerContext = LayerContext,
> extends Component<Props, TComponentState, Context> {
  public static id?: string;

  protected canvas: HTMLCanvasElement;

  protected html: HTMLElement;

  protected root?: HTMLElement;

  private cameraSubscription: () => void = noop;

  constructor(props: Props, parent?: CoreComponent) {
    super(props, parent);

    this.setContext({
      camera: props.camera,
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
      const dpr = this.props.canvas.respectPixelRatio ? this.context.constants.system?.PIXEL_RATIO : 1;
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }
  }

  protected afterInit() {
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

    this.root = this.props.root;
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
    this.root = root;
    if (this.canvas) {
      root.appendChild(this.canvas);
    }
    if (this.html) {
      root.appendChild(this.html);
    }
    this.afterInit();
  }

  public detachLayer() {
    this.unmountLayer();
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
}

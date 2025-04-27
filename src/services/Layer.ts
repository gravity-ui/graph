import { Graph } from "../graph";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { GraphEventsDefinitions } from "../graphEvents";
import { CoreComponent } from "../lib";
import { Component, TComponentState } from "../lib/Component";

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

  protected attached = false;

  /**
   * AbortController used to manage event listeners.
   * All event listeners (both graph.on and DOM addEventListener) are registered with this controller's signal.
   * When the layer is unmounted, the controller is aborted, which automatically removes all event listeners.
   */
  protected eventAbortController: AbortController;

  /**
   * A wrapper for this.props.graph.on that automatically includes the AbortController signal.
   * The method is named onGraphEvent to indicate it's specifically for graph events.
   * This simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   * @returns The result of graph.on call (an unsubscribe function)
   */
  protected onGraphEvent<EventName extends keyof GraphEventsDefinitions, Cb extends GraphEventsDefinitions[EventName]>(
    eventName: EventName,
    handler: Cb,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    return this.props.graph.on(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  /**
   * A wrapper for HTMLElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the HTML element of the layer.
   * It simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the DOM event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   */
  protected onHtmlEvent<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: ((this: HTMLElement, ev: HTMLElementEventMap[K]) => void) | EventListenerObject,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.html) {
      throw new Error("Attempt to add event listener to non-existent HTML element");
    }

    this.html.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  /**
   * A wrapper for HTMLCanvasElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the canvas element of the layer.
   * It simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the DOM event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   */
  protected onCanvasEvent<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: ((this: HTMLCanvasElement, ev: HTMLElementEventMap[K]) => void) | EventListenerObject,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.canvas) {
      throw new Error("Attempt to add event listener to non-existent canvas element");
    }

    this.canvas.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  /**
   * A wrapper for HTMLElement.addEventListener that automatically includes the AbortController signal.
   * This method is for adding event listeners to the root element of the layer.
   * It simplifies event subscription and ensures proper cleanup when the layer is unmounted.
   *
   * IMPORTANT: Always use this method in the afterInit() method, NOT in the constructor.
   * This ensures that event subscriptions are properly set up when the layer is reattached.
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, afterInit() is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * @param eventName - The name of the DOM event to subscribe to
   * @param handler - The event handler function
   * @param options - Additional options (optional)
   */
  protected onRootEvent<K extends keyof HTMLElementEventMap>(
    eventName: K,
    handler: ((this: HTMLElement, ev: HTMLElementEventMap[K]) => void) | EventListenerObject,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }

    this.root.addEventListener(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  constructor(props: Props, parent?: CoreComponent) {
    super(props, parent);

    this.eventAbortController = new AbortController();

    this.setContext({
      graph: this.props.graph,
      camera: props.camera,
      colors: this.props.graph.$graphColors.value,
      constants: this.props.graph.$graphConstants.value,
      layer: this,
    });

    this.init();
  }

  public updateSize(width: number, height: number) {
    if (this.canvas) {
      const dpr = this.props.canvas.respectPixelRatio === false ? 1 : this.context.constants.system?.PIXEL_RATIO;
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is the proper place to set up event subscriptions using onGraphEvent().
   *
   * When a layer is unmounted, the AbortController is aborted and a new one is created.
   * When the layer is reattached, this method is called again, which sets up new subscriptions
   * with the new AbortController.
   *
   * All derived Layer classes should call super.afterInit() at the end of their afterInit method.
   */
  protected afterInit() {
    let context: Partial<Context> = {
      ...this.context,
      colors: this.props.graph.$graphColors.value,
      constants: this.props.graph.$graphConstants.value,
    };
    if (this.props.canvas) {
      const ctx = this.canvas.getContext("2d");
      if (ctx) {
        context = {
          ...context,
          graphCanvas: this.canvas,
          ctx,
        };
      } else {
        console.error("Failed to get 2D context from canvas");
      }
    }

    this.setContext(context as Context);
    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;
    this.performRender();

    // Subscribe to graph events here instead of in the constructor
    // This ensures that subscriptions are properly set up when the layer is reattached
    this.onGraphEvent("colors-changed", (event) => {
      this.setContext({
        colors: event.detail.colors,
      });
    });

    this.onGraphEvent("constants-changed", (event) => {
      this.setContext({
        constants: event.detail.constants,
      });
    });

    // Add camera state subscription if needed
    if (this.props.html?.transformByCameraPosition && this.html) {
      this.onGraphEvent("camera-change", (event) => {
        const camera = event.detail;
        this.html.style.transform = `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.x}, ${camera.y})`;
      });
    }
  }

  protected init() {
    this.attached = false;
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

    // Abort all event listeners (both graph.on and DOM addEventListener)
    this.eventAbortController.abort();
    // Create a new controller for potential reattachment
    // This ensures that if the layer is reattached, new event listeners can be registered
    this.eventAbortController = new AbortController();
    this.attached = false;
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
    if (this.attached) {
      return;
    }
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
    this.attached = true;
  }

  public detachLayer() {
    this.unmount();
    this.root = undefined;
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

  /**
   * Subscribes to a signal (with .subscribe) and automatically unsubscribes when the layer's AbortController is aborted.
   *
   * Usage:
   *   this.onSignal(signal, handler)
   *
   * @template S - Signal type (must have .subscribe method)
   * @template T - Value type of the signal
   * @param signal - Signal with .subscribe method (returns unsubscribe function)
   * @param handler - Handler function to call on signal change
   * @returns The unsubscribe function (called automatically on abort)
   */
  protected onSignal<
    S extends { subscribe: (handler: (value: T) => void) => () => void },
    T = S extends { subscribe: (handler: (value: infer U) => void) => () => void } ? U : unknown,
  >(signal: S, handler: (value: T) => void): () => void {
    const unsubscribe = signal.subscribe(handler);
    const abortHandler = () => {
      unsubscribe();
      this.eventAbortController.signal.removeEventListener("abort", abortHandler);
    };
    this.eventAbortController.signal.addEventListener("abort", abortHandler);
    return unsubscribe;
  }
}

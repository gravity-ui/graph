import { Graph } from "../graph";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { GraphEventsDefinitions } from "../graphEvents";
import { CoreComponent } from "@gravity-ui/graph-canvas-core";
import { Component, TComponentState } from "@gravity-ui/graph-canvas-core";

import { ICamera, TCameraState } from "./camera/CameraService";

import "./Layer.css";

export type LayerPropsElementProps = {
  zIndex: number;
  classNames?: string[];
  root?: HTMLElement;
  transformByCameraPosition?: boolean;
};

export type LayerPropsHtmlElementProps = LayerPropsElementProps & {
  /**
   * Minimum camera scale at which the HTML layer becomes active.
   * When camera scale is below this value, the HTML layer is disabled
   * and won't receive updates (improving performance when zoomed out).
   *
   * @example
   * ```typescript
   * // HTML layer only active when zoomed in (scale >= 0.5)
   * html: { zIndex: 1, activationScale: 0.5 }
   * ```
   */
  activationScale?: number;
};

export type LayerProps = {
  canvas?: LayerPropsElementProps & {
    respectPixelRatio?: boolean;
    alpha?: boolean;
    desynchronized?: boolean;
    willReadFrequently?: boolean;
  };
  html?: LayerPropsHtmlElementProps;
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

/**
 * Utility type to extract public props for a Layer constructor.
 * Excludes internal props that are provided by the graph instance:
 * - root: managed by the layers service
 * - camera: provided by the graph's camera service
 * - graph: provided by the graph instance
 *
 * The root prop is made optional as it can be overridden by the user.
 *
 * @template T - Layer constructor type
 */
export type LayerPublicProps<T extends Constructor<Layer>> =
  T extends Constructor<Layer<infer Props>>
    ? Omit<Props, "root" | "camera" | "graph"> & { root?: Props["root"] }
    : never;

export type LayerConstructor<T extends Constructor<Layer>> = T extends Constructor<Layer> ? T : never;

const HIDDEN_CLASS_NAME = "layer-hidden";

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
   * Indicates whether the HTML layer is currently active based on camera scale.
   * When false, the HTML layer is hidden and won't receive updates.
   */
  protected htmlActive = true;

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

  public hide() {
    this.canvas?.classList.add(HIDDEN_CLASS_NAME);
    this.html?.classList.add(HIDDEN_CLASS_NAME);
  }

  public isHidden() {
    return this.canvas?.classList.contains(HIDDEN_CLASS_NAME) || this.html?.classList.contains(HIDDEN_CLASS_NAME);
  }

  public show() {
    this.canvas?.classList.remove(HIDDEN_CLASS_NAME);
    this.html?.classList.remove(HIDDEN_CLASS_NAME);
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

  protected sizeTouched = false;

  public updateSize = () => {
    this.sizeTouched = true;
    this.performRender();
  };

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
    this.setContext({
      colors: this.props.graph.$graphColors.value,
      constants: this.props.graph.$graphConstants.value,
    });

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
    this.onGraphEvent("camera-change", (event) => this.onCameraChange(event.detail));
    this.onSignal(this.props.graph.layers.rootSize, this.updateSize);

    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;

    // Initialize htmlActive state based on current camera scale
    if (this.html && this.props.html?.activationScale !== undefined) {
      const cameraState = this.context.camera.getCameraState();
      this.htmlActive = cameraState.scale >= this.props.html.activationScale;
      if (!this.htmlActive) {
        this.onHtmlActiveChange(false);
      }
    }

    this.onCameraChange(this.context.camera.getCameraState());
    this.updateSize();
  }

  protected scheduleCameraChange(camera: TCameraState) {
    if (this.html && this.htmlActive) {
      this.html.style.transform = `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.x}, ${camera.y})`;
    }
  }

  protected onCameraChange(camera: TCameraState) {
    // Check if HTML layer should be active based on activationScale
    if (this.html && this.props.html?.activationScale !== undefined) {
      const shouldBeActive = camera.scale >= this.props.html.activationScale;
      if (shouldBeActive !== this.htmlActive) {
        this.htmlActive = shouldBeActive;
        this.onHtmlActiveChange(shouldBeActive);
      }
    }

    if (this.props.html?.transformByCameraPosition && this.html && this.htmlActive) {
      this.scheduleCameraChange(camera);
    }
    if (this.props.canvas?.transformByCameraPosition) {
      this.performRender();
    }
  }

  /**
   * Called when the HTML layer's active state changes based on camera scale.
   * Override this method to implement custom behavior when the layer activates/deactivates.
   *
   * @param active - Whether the HTML layer is now active
   */
  protected onHtmlActiveChange(active: boolean) {
    if (active) {
      this.html.classList.remove("layer-hidden");
    } else {
      this.html.classList.add("layer-hidden");
    }
  }

  /**
   * Returns whether the HTML layer is currently active.
   * The layer is inactive when camera scale is below the activationScale threshold.
   */
  public isHtmlActive(): boolean {
    return this.htmlActive;
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
    super.unmount();
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
    this.attached = true;
    this.afterInit();
  }

  public detachLayer() {
    this.unmountLayer();
    this.root = undefined;
  }

  protected createCanvas(params: LayerProps["canvas"]) {
    const canvas = document.createElement("canvas");
    canvas.classList.add("layer", "layer-canvas");
    if (Array.isArray(params.classNames)) canvas.classList.add(...params.classNames);
    canvas.style.zIndex = `${Number(params.zIndex)}`;
    this.setContext({
      graphCanvas: canvas,
      ctx: canvas.getContext("2d", {
        desynchronized: params.desynchronized ?? true,
        willReadFrequently: params.willReadFrequently ?? false,
        alpha: params.alpha ?? true,
      }),
    });
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
    return respectPixelRatio ? this.context.graph.layers.getDPR() : 1;
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

  protected updateCanvasSize() {
    const { width, height, dpr } = this.context.graph.layers.getRootSize();
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
  }

  public resetTransform() {
    if (this.sizeTouched) {
      this.sizeTouched = false;
      this.updateCanvasSize();
    }
    const cameraState = this.props.canvas?.transformByCameraPosition ? this.context.camera.getCameraState() : null;
    // Reset transform and clear the canvas
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Use canvas dimensions directly, as they should already factor in DPR if respectPixelRatio is true
    this.context.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform(cameraState?.x ?? 0, cameraState?.y ?? 0, cameraState?.scale ?? 1, true);
  }

  protected render() {
    if (this.canvas) {
      this.resetTransform();
    }
  }
}

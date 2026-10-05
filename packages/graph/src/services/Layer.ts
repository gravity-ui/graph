import { Graph } from "../graph";
import { TGraphColors, TGraphConstants } from "../graphConfig";
import { GraphEventsDefinitions, UnwrapGraphEvents } from "../graphEvents";
import { CoreComponent } from "../lib";
import { Component, TComponentState } from "../lib/Component";
import { ESchedulerPriority } from "../lib/Scheduler";
import { TypedEventListener, addTypedEventListener } from "../utils/eventListener";
import type { GraphClassConstructor } from "../utils/types/classes";
import { debounce } from "../utils/utils/schedule";

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
  canvas: HTMLCanvasElement | undefined;
  graphCanvas: HTMLCanvasElement | undefined;
  root: HTMLElement | undefined;
  ownerDocument: Document | undefined;
  ctx: CanvasRenderingContext2D | undefined;
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
export type LayerPublicProps<T extends GraphClassConstructor<Layer>> =
  T extends GraphClassConstructor<Layer<infer Props>>
    ? Omit<Props, "root" | "camera" | "graph"> & { root?: Props["root"] }
    : never;

export type LayerConstructor<T extends GraphClassConstructor<Layer>> =
  T extends GraphClassConstructor<Layer> ? T : never;

const HIDDEN_CLASS_NAME = "layer-hidden";

export class Layer<
  Props extends LayerProps = LayerProps,
  Context extends LayerContext = LayerContext,
  State extends TComponentState = TComponentState,
> extends Component<Props, State, Context> {
  public static id?: string;

  protected canvas?: HTMLCanvasElement;

  protected html?: HTMLElement;

  protected root?: HTMLElement;

  protected attached = false;

  private hiddenByUser = false;

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
  protected onGraphEvent<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    handler: TypedEventListener<UnwrapGraphEvents<NoInfer<EventName>>>,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    return this.props.graph.on(eventName, handler, {
      ...options,
      signal: this.eventAbortController.signal,
    });
  }

  public hide() {
    this.hiddenByUser = true;
    this.canvas?.classList.add(HIDDEN_CLASS_NAME);
    this.html?.classList.add(HIDDEN_CLASS_NAME);
  }

  public isHidden() {
    return Boolean(
      this.canvas?.classList.contains(HIDDEN_CLASS_NAME) || this.html?.classList.contains(HIDDEN_CLASS_NAME)
    );
  }

  public show() {
    this.hiddenByUser = false;
    this.canvas?.classList.remove(HIDDEN_CLASS_NAME);
    this.html?.classList.toggle(HIDDEN_CLASS_NAME, !this.htmlActive);
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
    handler: TypedEventListener<HTMLElementEventMap[NoInfer<K>], HTMLElement>,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.html) {
      throw new Error("Attempt to add event listener to non-existent HTML element");
    }

    return addTypedEventListener(this.html, eventName, handler, {
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
    handler: TypedEventListener<HTMLElementEventMap[NoInfer<K>], HTMLCanvasElement>,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.canvas) {
      throw new Error("Attempt to add event listener to non-existent canvas element");
    }

    return addTypedEventListener(this.canvas, eventName, handler, {
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
    handler: TypedEventListener<HTMLElementEventMap[NoInfer<K>], HTMLElement>,
    options?: Omit<AddEventListenerOptions, "signal">
  ) {
    if (!this.root) {
      throw new Error("Attempt to add event listener to non-existent root element");
    }

    return addTypedEventListener(this.root, eventName, handler, {
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
    const abortSignal = this.eventAbortController.signal;
    const unsubscribe = signal.subscribe(handler);
    let subscribed = true;
    const cleanup = () => {
      if (!subscribed) return;
      subscribed = false;
      abortSignal.removeEventListener("abort", cleanup);
      unsubscribe();
    };
    if (abortSignal.aborted) cleanup();
    else abortSignal.addEventListener("abort", cleanup, { once: true });
    return cleanup;
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
      canvas: undefined,
      graphCanvas: undefined,
      root: undefined,
      ownerDocument: undefined,
      ctx: undefined,
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
    this.onSignal(this.props.graph.$camera, (camera) => this.handleCommittedCameraChange(camera));
    this.onSignal(this.props.graph.layers.rootSize, this.updateSize);

    this.shouldRenderChildren = true;
    this.shouldUpdateChildren = true;

    // Initialize htmlActive state based on current camera scale
    if (this.html && this.props.html?.activationScale !== undefined) {
      const cameraState = this.context.camera.getCameraState();
      this.htmlActive = cameraState.scale >= this.props.html.activationScale;
      this.onHtmlActiveChange(this.htmlActive);
    }

    this.handleCommittedCameraChange(this.context.camera.getCameraState());
    this.updateSize();
  }

  private readonly stopCameraMoving = debounce(
    () => {
      this.html?.classList.remove("layer-with-camera-moving");
      this.moving = false;
    },
    { priority: ESchedulerPriority.LOW, frameTimeout: 150 }
  );

  protected moving = false;

  protected scheduleCameraChange(camera: TCameraState) {
    if (this.html && this.htmlActive) {
      if (!this.moving) {
        this.html.classList.add("layer-with-camera-moving");
        this.moving = true;
      }
      this.html.style.transform = `matrix(${camera.scale}, 0, 0, ${camera.scale}, ${camera.x}, ${camera.y})`;
      this.stopCameraMoving();
    }
  }

  private handleCommittedCameraChange(camera: TCameraState): void {
    this.applyCameraTransform(camera);
    this.onCameraChange(camera);
  }

  private applyCameraTransform(camera: TCameraState): void {
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
   * Called when committed camera state changes (`graph.$camera` signal).
   * Override in derived layers to react to pan, zoom, and resize.
   *
   * Built-in HTML/canvas transforms (`transformByCameraPosition`, `activationScale`)
   * are applied before this hook via `applyCameraTransform`.
   *
   * @param camera - Committed camera state (same as `graph.$camera.value`)
   */
  protected onCameraChange(_camera: TCameraState): void {
    // Override in subclasses
  }

  /**
   * Called when the HTML layer's active state changes based on camera scale.
   * Override this method to implement custom behavior when the layer activates/deactivates.
   *
   * @param active - Whether the HTML layer is now active
   */
  protected onHtmlActiveChange(active: boolean) {
    this.html?.classList.toggle(HIDDEN_CLASS_NAME, this.hiddenByUser || !active);
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
    this.stopCameraMoving.cancel();
    this.moving = false;
    this.html?.classList.remove("layer-with-camera-moving");
    if (this.canvas && this.context.ctx) {
      this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.context.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.canvas?.parentNode?.removeChild(this.canvas);
    this.html?.parentNode?.removeChild(this.html);

    // Abort all event listeners (both graph.on and DOM addEventListener)
    this.eventAbortController.abort();
    // Create a new controller for potential reattachment
    // This ensures that if the layer is reattached, new event listeners can be registered
    this.eventAbortController = new AbortController();
    this.attached = false;
    this.root = undefined;
    this.setContext({ root: undefined });
  }

  protected unmount(): void {
    this.unmountLayer();
    super.unmount();
  }

  public getCanvas(): HTMLCanvasElement | undefined {
    return this.canvas;
  }

  public getHTML(): HTMLElement | undefined {
    return this.html;
  }

  protected requireCanvas(): HTMLCanvasElement {
    if (!this.canvas) throw new Error("Canvas is not configured for this layer");
    return this.canvas;
  }

  protected requireCanvasContext(): CanvasRenderingContext2D {
    if (!this.context.ctx) throw new Error("2D canvas context is unavailable");
    return this.context.ctx;
  }

  public attachLayer(root: HTMLElement) {
    if (this.attached) {
      return;
    }
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
    this.attached = true;
    this.setContext({ root, ownerDocument: root.ownerDocument });
    this.afterInit();
  }

  public detachLayer() {
    this.unmountLayer();
  }

  protected createCanvas(params: NonNullable<LayerProps["canvas"]>) {
    const canvas = document.createElement("canvas");
    canvas.classList.add("layer", "layer-canvas");
    if (Array.isArray(params.classNames)) canvas.classList.add(...params.classNames);
    canvas.style.zIndex = `${Number(params.zIndex)}`;
    const ctx = canvas.getContext("2d", {
      desynchronized: params.desynchronized ?? false,
      willReadFrequently: params.willReadFrequently ?? false,
      alpha: params.alpha ?? true,
    });
    if (!ctx) throw new Error("2D canvas context is unavailable");
    this.setContext({ canvas, graphCanvas: canvas, ctx, ownerDocument: canvas.ownerDocument });
    return canvas;
  }

  protected createHTML(params: NonNullable<LayerProps["html"]>) {
    const div = document.createElement("div");
    div.classList.add("layer", "layer-html");
    if (Array.isArray(params.classNames)) div.classList.add(...params.classNames);
    div.style.zIndex = `${Number(params.zIndex)}`;
    if (params.transformByCameraPosition) {
      div.classList.add("layer-with-camera");
    }
    this.setContext({ ownerDocument: this.context.ownerDocument ?? div.ownerDocument });
    return div;
  }

  public getDRP() {
    const respectPixelRatio = this.props.canvas?.respectPixelRatio ?? true;
    return respectPixelRatio ? this.context.graph.layers.rootSize.value.dpr : 1;
  }

  protected applyTransform(
    x: number,
    y: number,
    scale: number,
    respectPixelRatio: boolean = this.props.canvas?.respectPixelRatio ?? true
  ) {
    const ctx = this.context.ctx;
    if (!ctx) return;
    const dpr = respectPixelRatio ? this.getDRP() : 1;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, x * dpr, y * dpr);
  }

  protected updateCanvasSize() {
    if (!this.canvas) return;
    const { width, height, dpr } = this.context.graph.layers.getRootSize();
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
  }

  public resetTransform() {
    if (!this.canvas || !this.context.ctx) return;
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

import { batch, signal } from "@preact/signals-core";

import { PublicGraphApi, ZoomConfig } from "./api/PublicGraphApi";
import { GraphComponent } from "./components/canvas/GraphComponent";
import { TBlock } from "./components/canvas/blocks/Block";
import { BelowLayer } from "./components/canvas/layers/belowLayer/BelowLayer";
import { CursorLayer, CursorLayerCursorTypes } from "./components/canvas/layers/cursorLayer";
import { GraphLayer } from "./components/canvas/layers/graphLayer/GraphLayer";
import { SelectionLayer } from "./components/canvas/layers/selectionLayer/SelectionLayer";
import { SceneComponent } from "./components/canvas/scene/SceneComponent";
import {
  GraphComponentConstructor,
  TGraphColorsPatch,
  TGraphConstantsPatch,
  resolveGraphColors,
  resolveGraphConstants,
} from "./graphConfig";
import { GraphEvent, GraphEventsDefinitions, UnwrapGraphEvents, UnwrapGraphEventsDetail } from "./graphEvents";
import { scheduler } from "./lib/Scheduler";
import { HitTest } from "./services/HitTest";
import { KeyboardService } from "./services/KeyboardService";
import { Layer, LayerPublicProps } from "./services/Layer";
import type { LayerConfig } from "./services/LayerConfig";
import { Layers, LayersRootSize } from "./services/LayersService";
import type { CameraPoint } from "./services/camera/CameraPoint";
import { CameraService, getInitCameraState } from "./services/camera/CameraService";
import type { TCameraState } from "./services/camera/CameraService";
import { DragService } from "./services/drag";
import { GraphScene } from "./services/scene/GraphScene";
import { bindSceneRaises } from "./services/scene/sceneRaises";
import { bindBuiltinTags } from "./services/tags/systems";
import { RootStore } from "./store";
import { TBlockId } from "./store/block/Block";
import { TConnection } from "./store/connection/ConnectionState";
import { TGraphSettingsConfig, TGraphSettingsPatch } from "./store/settings";
import { TypedEventListener, addTypedEventListener, removeTypedEventListener } from "./utils/eventListener";
import { clearColorCache, getXY } from "./utils/functions";
import { GRAPH_ROOT_CLASS_NAME, clearGraphInstance, setGraphInstance } from "./utils/graphInstance";
import { clearTextCache } from "./utils/renderers/text";
import type { GraphClassConstructor } from "./utils/types/classes";
import { Point, TPoint, TRect, isTRect } from "./utils/types/shapes";

export type TGraphConfig<Block extends TBlock = TBlock, Connection extends TConnection = TConnection> = {
  configurationName?: string;
  blocks?: Block[];
  connections?: TConnection[];
  /**
   * @deprecated use Graph.zoom api
   */
  rect?: TRect;
  /**
   * @deprecated use Graph.zoom api
   * */
  cameraXY?: TPoint;
  /**
   * @deprecated use Graph.zoom api
   * */
  cameraScale?: number;
  settings?: TGraphSettingsPatch<Block, Connection>;
  layers?: LayerConfig[];
};

export type TGraphZoomTarget = "center" | TRect | TBlockId[] | GraphComponent[];

export enum GraphState {
  INIT,
  ATTACHED,
  READY,
}

export class Graph {
  public readonly scheduler = scheduler;

  public readonly cameraService: CameraService = new CameraService(this);

  public readonly layers: Layers = new Layers();

  public readonly api = new PublicGraphApi(this);

  public readonly eventEmitter = new EventTarget();

  public readonly rootStore: RootStore = new RootStore(this);

  public hitTest = new HitTest(this);

  /**
   * Service that manages drag operations for all draggable GraphComponents.
   * Handles autopanning, cursor locking, and coordinates drag lifecycle across selected components.
   */
  public readonly dragService: DragService;

  public readonly keyboardService: KeyboardService;

  protected readonly graphLayer: GraphLayer;

  protected readonly belowLayer: BelowLayer;

  protected readonly selectionLayer: SelectionLayer;

  protected readonly cursorLayer: CursorLayer;

  public getGraphCanvas() {
    return this.graphLayer.getCanvas();
  }

  public get graphColors() {
    return this.$graphColors.value;
  }

  public $graphColors = signal(resolveGraphColors());

  public get graphConstants() {
    return this.$graphConstants.value;
  }

  public $graphConstants = signal(resolveGraphConstants());

  /**
   * Committed camera state. Updated only after a non-prevented `camera-change` event.
   * Subscribe via `signal.subscribe()` or Layer's `onSignal()` to react to applied changes.
   */
  public $camera = signal<TCameraState>(getInitCameraState());

  public state: GraphState = GraphState.INIT;

  protected config: TGraphConfig = {};

  protected startRequested = false;

  /** Updates this graph's layers on each frame while the graph is started. */
  private readonly frameTask = {
    performUpdate: (): void => {
      if (this.scene.pendingPresentation) return;
      const contentRevision = this.scene.contentRevision;
      this.layers.update();
      this.scene.update(contentRevision);
    },
  };

  /** Scene runtime: element store, renderer (Canvas2D or WebGL), level and clock. */
  public readonly scene: GraphScene;

  private readonly unbindBuiltinTags: () => void;

  private readonly unbindSceneRaises: () => void;

  private removeFrameTask: (() => void) | undefined;

  public get blocks() {
    return this.rootStore.blocksList;
  }

  public get connections() {
    return this.rootStore.connectionsList;
  }

  public get selectionService() {
    return this.rootStore.selectionService;
  }

  constructor(
    config: TGraphConfig,
    rootEl?: HTMLDivElement,
    graphColors?: TGraphColorsPatch,
    graphConstants?: TGraphConstantsPatch
  ) {
    this.belowLayer = this.addLayer(BelowLayer, {});
    this.graphLayer = this.addLayer(GraphLayer, {});
    // Right after GraphLayer: the scene canvas follows the GraphLayer canvas in the DOM.
    this.scene = new GraphScene(this);
    this.selectionLayer = this.addLayer(SelectionLayer, {});
    this.cursorLayer = this.addLayer(CursorLayer, {});

    // Initialize DragService for managing drag operations on GraphComponents
    this.dragService = new DragService(this);
    this.unbindBuiltinTags = bindBuiltinTags(this);
    this.unbindSceneRaises = bindSceneRaises(this);
    this.keyboardService = new KeyboardService(this);

    this.selectionLayer.hide();
    this.graphLayer.hide();
    this.belowLayer.hide();

    if (rootEl) {
      this.attach(rootEl);
    }
    if (graphColors) {
      this.setColors(graphColors);
    }
    if (graphConstants) {
      this.setConstants(graphConstants);
    }

    this.setupGraph(config);
    this.rootStore.settings.captureInitialSettings();
  }

  protected onUpdateSize = (event: LayersRootSize) => {
    this.cameraService.set(event);
  };

  public getGraphLayer() {
    return this.graphLayer;
  }

  public setColors(colors: TGraphColorsPatch) {
    this.$graphColors.value = resolveGraphColors(colors, this.$graphColors.value);
    this.emit("colors-changed", { colors: this.graphColors });
  }

  public setConstants(constants: TGraphConstantsPatch) {
    this.$graphConstants.value = resolveGraphConstants(constants, this.$graphConstants.value);
    this.emit("constants-changed", { constants: this.graphConstants });
  }

  /**
   * Zoom to center of camera
   * @param zoomConfig - zoom config
   * @param zoomConfig.x if set - zoom to x coordinate, else - zoom to center
   * @param zoomConfig.y if set - zoom to y coordinate, else - zoom to center
   * @param zoomConfig.scale camera scale
   *
   * @returns {undefined}
   * */
  public zoom(zoomConfig: { x?: number; y?: number; scale: number }) {
    const { width, height } = this.cameraService.getCameraState();
    this.cameraService.zoom(zoomConfig.x || width / 2, zoomConfig.y || height / 2, zoomConfig.scale);
  }

  /**
   * Zooms to the target
   *
   * - If target is rectangle, it will be zoomed({@link PublicGraphApi.zoomToRect}) to the rectangle and returns true.
   * - If target is array of block ids, it will be zoomed({@link PublicGraphApi.zoomToBlocks}) to the blocks, if at least one block is found, returns true, otherwise returns false.
   * - If target is array of {@link GraphComponent} instances, it will be zoomed({@link PublicGraphApi.zoomToElements}) to the rect containing all components and returns true.
   * - If target is center, it will be zoomed({@link PublicGraphApi.zoomToViewPort}) to the center and returns true.
   *
   * @example
   * ```typescript
   * graph.zoomTo("center");
   * graph.zoomTo([block1.id, block2.id]);
   * graph.zoomTo([block1, block2]);
   * graph.zoomTo({x: 100, y: 100, width: 100, height: 100 });
   * ```
   * @param target - target to zoom to
   * @param config - zoom config, optional, optional
   * @returns {boolean} true if zoom is successful, false otherwise
   *
   * */
  public zoomTo(target: TGraphZoomTarget, config?: ZoomConfig): boolean {
    if (isTRect(target)) {
      this.api.zoomToRect(target, config);
      return true;
    }
    if (Array.isArray(target)) {
      if (target.every((item) => item instanceof GraphComponent)) {
        return this.api.zoomToElements(target, config);
      }
      if (target.every((item) => typeof item === "string" || typeof item === "number")) {
        return this.api.zoomToBlocks(target, config);
      }
    }

    this.api.zoomToViewPort(config);
    return true;
  }

  /** Returns elements at a world point or a prepared pair of world and canvas coordinates. */
  public getElementsOverPoint<T extends GraphComponentConstructor>(
    point: TPoint | CameraPoint,
    filter?: T[]
  ): InstanceType<T>[] {
    const cameraPoint = "world" in point ? point : this.cameraService.createCameraPoint(point);
    const items = this.hitTest.testPoint(cameraPoint, this.layers.getDPR());
    if (filter && items.length > 0) {
      return items.filter((item) => filter.some((Component) => item instanceof Component)) as InstanceType<T>[];
    }
    return items as InstanceType<T>[];
  }

  /**
   * Returns the topmost element at a world-space point that pointer events reach: components transparent to events
   * (`GraphComponent.transparentToEvents`) are skipped. GraphLayer targets the pointer with it.
   */
  public getElementOverPoint<T extends GraphComponentConstructor>(
    point: TPoint | CameraPoint,
    filter?: T[]
  ): InstanceType<T> | undefined {
    for (const item of this.getElementsOverPoint(point, filter)) {
      const component: unknown = item;
      if (!(component instanceof GraphComponent) || !component.isTransparentToEvents()) return item;
    }
    return undefined;
  }

  /**
   * Returns the current viewport rectangle in camera space, expanded by threshold.
   * @returns {TRect} Viewport rect in camera-relative coordinates
   */
  public getViewportRect(): TRect {
    const CAMERA_VIEWPORT_TRESHOLD = this.graphConstants.system.CAMERA_VIEWPORT_TRESHOLD;
    const rel = this.cameraService.getRelativeViewportRect(); // full viewport, ignores insets

    const x = -rel.x - rel.width * CAMERA_VIEWPORT_TRESHOLD;
    const y = -rel.y - rel.height * CAMERA_VIEWPORT_TRESHOLD;
    const width = -rel.x + rel.width * (1 + CAMERA_VIEWPORT_TRESHOLD) - x;
    const height = -rel.y + rel.height * (1 + CAMERA_VIEWPORT_TRESHOLD) - y;

    return { x, y, width, height };
  }

  public getElementsInViewport<T extends GraphComponentConstructor>(filter?: T[]): InstanceType<T>[] {
    const viewportRect = this.getViewportRect();
    return this.getElementsOverRect(viewportRect, filter);
  }

  /**
   * Returns the elements whose hit boxes meet a world rect, without the scene components the current level does not
   * hit (`SceneComponent.isHitOnLevel`: a stock anchor at the minimalistic level, or at the detailed level without an
   * HTML view), as points leave them out.
   */
  public getElementsOverRect<T extends GraphComponentConstructor>(rect: TRect, filter?: T[]): InstanceType<T>[] {
    const level = this.scene.$level.peek();
    return this.getComponentsOverRect(rect, filter).filter(
      (item) => !(item instanceof SceneComponent) || item.isHitOnLevel(level)
    ) as InstanceType<T>[];
  }

  /**
   * @internal The components whose hit boxes meet the viewport, whether or not the current level hits them: what is in
   * view, not what the pointer can target (`getElementsInViewport` leaves out what the level does not hit). React's
   * `BlocksList` picks the blocks it renders as HTML with it, so a block class whose `hitLevels` exclude the detailed
   * level keeps its HTML view.
   */
  public getComponentsInViewport<T extends GraphComponentConstructor>(filter?: T[]): InstanceType<T>[] {
    return this.getComponentsOverRect(this.getViewportRect(), filter) as InstanceType<T>[];
  }

  /** The components of the filter's classes whose hit boxes meet a world rect, hit levels aside. */
  private getComponentsOverRect(rect: TRect, filter?: GraphComponentConstructor[]): ReturnType<HitTest["testBox"]> {
    const found = this.hitTest.testBox({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    });
    return filter ? found.filter((item) => filter.some((Component) => item instanceof Component)) : found;
  }

  /** Returns exact world and canvas-relative CSS coordinates of a mouse event. */
  public getPointInCameraSpace(event: MouseEvent): CameraPoint {
    const xy = getXY(this.graphLayer.getCanvas(), event);
    return this.cameraService.createCameraPoint(Point(xy[0], xy[1]), "canvas");
  }

  public updateEntities({
    blocks,
    connections,
  }: Partial<{
    blocks?: TBlock[];
    connections?: TConnection[];
  }>) {
    batch(() => {
      if (blocks?.length) {
        this.rootStore.blocksList.updateBlocks(blocks);
      }
      if (connections?.length) {
        this.rootStore.connectionsList.updateConnections(connections);
      }
    });
  }

  /** Replaces the block and connection data, including rows with existing IDs. An omitted collection is emptied. */
  public setEntities({
    blocks,
    connections,
  }: Partial<{
    blocks?: TBlock[];
    connections?: TConnection[];
  }>) {
    // Mark hitTest as pending so waitUsableRectUpdate (used by zoomToViewPort)
    // waits for block components to settle without clearing usableRectTracker.
    this.scene.entitiesReplacing();
    this.hitTest.markPendingUpdate();
    batch(() => {
      this.rootStore.blocksList.setBlocks(blocks || []);
      this.rootStore.connectionsList.setConnections(connections || []);
    });
  }

  public on<EventName extends keyof GraphEventsDefinitions>(
    type: EventName,
    cb: TypedEventListener<UnwrapGraphEvents<NoInfer<EventName>>>,
    options?: AddEventListenerOptions | boolean
  ) {
    return addTypedEventListener(this.eventEmitter, type, cb, options);
  }

  public off<EventName extends keyof GraphEventsDefinitions>(
    type: EventName,
    cb: TypedEventListener<UnwrapGraphEvents<NoInfer<EventName>>>,
    options?: EventListenerOptions | boolean
  ) {
    removeTypedEventListener(this.eventEmitter, type, cb, options);
  }

  /*
   * Emit Graph's events
   */
  public emit<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    detail: UnwrapGraphEventsDetail<NoInfer<EventName>>
  ) {
    const event = new GraphEvent(eventName, {
      detail,
      bubbles: false,
      cancelable: eventName !== "scene-state-change",
    });
    this.eventEmitter.dispatchEvent(event);

    /*
     * !!!IMPORTANT!!!
     * Users or layers must be able to prevent the default drag action.
     * Simply subscribing to the "mousedown" event does not allow handling the event at the very end of the chain,
     * so manual handling of the event is required here.
     *
     * Preventing a graph "mousedown" also stops dispatching it to the target component and the camera drag,
     * so a layer can take over the gesture and start its own operation with `dragService.startDrag`.
     * The camera drag and DragService run here, after every listener, so the order of subscription does not matter.
     *
     * @example
     * ```typescript
     * graph.on("mousedown", (event) => {
     *   event.preventDefault(); // Prevent drag
     * });
     * ```
     * */
    if (eventName === "mousedown" && !event.isDefaultPrevented()) {
      // The generic name cannot be narrowed with its indexed payload; this branch fixes it to mousedown.
      const mouseDownEvent = event as GraphEvent<UnwrapGraphEventsDetail<"mousedown">>;
      // The camera goes first: it prevents the event when it takes the press (e.g. middle-button pan).
      this.graphLayer.$.camera?.handleGraphMouseDown(mouseDownEvent);
      if (!mouseDownEvent.isDefaultPrevented()) {
        this.dragService.handleMouseDown(mouseDownEvent);
      }
    }
    return event;
  }

  /*
   * Emit Graph's event and execute default action if it is not prevented
   */
  public executеDefaultEventAction<EventName extends keyof GraphEventsDefinitions>(
    eventName: EventName,
    detail: UnwrapGraphEventsDetail<NoInfer<EventName>>,
    defaultCb: () => void
  ) {
    const event = this.emit(eventName, detail);
    if (!event.defaultPrevented) {
      defaultCb();
    }
  }

  public addLayer<T extends GraphClassConstructor<Layer> = GraphClassConstructor<Layer>>(
    layerCtor: T,
    props: LayerPublicProps<T>
  ): InstanceType<T> {
    // TODO: These types are too complicated, try to simplify them
    return this.layers.createLayer(layerCtor as GraphClassConstructor<Layer>, {
      ...props,
      camera: this.cameraService,
      graph: this,
    }) as InstanceType<T>;
  }

  /**
   * Removes the layer from the graph and DOM without destroying it. The graph no longer updates it:
   * return it with `attachLayer` or release it with `removeLayer`.
   */
  public detachLayer(layer: Layer) {
    this.layers.detachLayer(layer);
  }

  /**
   * Returns a layer detached with `detachLayer` to this graph, which updates it again and attaches
   * it to the graph root while started. A layer attached by hand to another root leaves it.
   * Layers of other graphs and layers removed with `removeLayer` are ignored.
   */
  public attachLayer(layer: Layer): void {
    this.layers.attachLayer(layer);
  }

  /**
   * Permanently removes a layer created by this graph: detaches it and unmounts it with its
   * children. The layer cannot be reused afterwards. Repeated calls and foreign layers are ignored.
   * Built-in layers belong to the graph and must not be removed.
   */
  public removeLayer(layer: Layer): void {
    this.layers.removeLayer(layer);
  }

  public setupGraph(config: TGraphConfig = {}) {
    this.config = config;
    this.rootStore.configurationName = config.configurationName ?? "";
    this.setEntities({
      blocks: config.blocks,
      connections: config.connections,
    });

    if (config.settings) {
      this.updateSettings(config.settings);
    }

    if (config.layers) {
      config.layers.forEach(({ layer, props }) => {
        this.addLayer(layer, props);
      });
    }
  }

  public updateSettings(settings: TGraphSettingsPatch = {}) {
    this.rootStore.settings.setupSettings(settings);
  }

  /** Restore the selected settings to their constructor values, or all settings when keys are omitted. */
  public resetSettings(keys?: readonly (keyof TGraphSettingsConfig)[]) {
    this.rootStore.settings.reset(keys);
  }

  public updateSize() {
    this.layers.updateSize();
  }

  public attach(rootEl: HTMLDivElement) {
    if (this.state === GraphState.READY) {
      return;
    }
    const previousRoot = this.layers.$root;
    if (previousRoot && previousRoot !== rootEl) {
      clearGraphInstance(previousRoot, this);
      previousRoot.classList.remove(GRAPH_ROOT_CLASS_NAME);
    }
    setGraphInstance(rootEl, this);
    // Layers are absolutely positioned; the class makes a static root their containing block.
    rootEl.classList.add(GRAPH_ROOT_CLASS_NAME);
    this.layers.attach(rootEl);

    const { width: rootWidth, height: rootHeight } = this.layers.getRootSize();

    this.cameraService.set({ width: rootWidth, height: rootHeight });

    this.setGraphState(GraphState.ATTACHED);
    this.scene.followVisibility();

    if (this.startRequested) {
      this.startRequested = false;
      this.start();
    }
  }

  public start(rootEl: HTMLDivElement | undefined = this.layers.$root): void {
    if (this.state === GraphState.READY) {
      return;
    }
    if (this.state !== GraphState.ATTACHED) {
      this.startRequested = true;
      return;
    }
    this.startRequested = false;
    if (rootEl) {
      this.attach(rootEl);
    }
    this.layers.on("update-size", this.onUpdateSize);
    this.layers.start();
    // One frame task per started graph, however start() is reached.
    this.removeFrameTask ??= this.scheduler.addScheduler(this.frameTask);
    this.scene.start();

    this.setGraphState(GraphState.READY);
    this.runAfterGraphReady(() => {
      this.selectionLayer.show();
      this.graphLayer.show();
      this.belowLayer.show();
      this.cursorLayer.show();
    });
  }

  /**
   * Graph is ready when the hitboxes are stable.
   * In order to initialize hitboxes we need to start scheduler and wait untils every component registered in hitTest service
   * Immediatelly after registering startign a rendering process.
   * @param cb - Callback to run after graph is ready
   */
  public runAfterGraphReady(cb: () => void) {
    this.hitTest.waitUsableRectUpdate(cb);
  }

  public stop(full = false) {
    const root = this.layers.$root;
    this.layers.detach(full);
    if (full && root) {
      clearGraphInstance(root, this);
      root.classList.remove(GRAPH_ROOT_CLASS_NAME);
    }
    clearTextCache();
    this.startRequested = false;
    this.removeFrameTask?.();
    this.removeFrameTask = undefined;
    this.scene.stop();
    this.setGraphState(this.layers.$root ? GraphState.ATTACHED : GraphState.INIT);
  }

  protected setGraphState(state: GraphState) {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.emit("state-change", { state: this.state });
  }

  protected clear() {
    this.layers.detach();
    clearTextCache();
  }

  public detach() {
    this.stop(true);
  }

  public unmount() {
    try {
      this.dragService.destroy();
    } finally {
      this.detach();
      this.layers.off("update-size", this.onUpdateSize);
      this.setGraphState(GraphState.INIT);
      // Before the layers are unmounted: pending ready waiters must not fire on a graph that is
      // being torn down, and removing the layers' hit boxes must not queue hit-test work.
      this.hitTest.destroy();
      // The scene first: it releases its style bindings before the built-in tags are cleared, so clearing them does not
      // re-run every bound element's style effect.
      this.unbindSceneRaises();
      this.scene.dispose();
      this.unbindBuiltinTags();
      this.layers.unmount();
      clearTextCache();
      clearColorCache();
      this.rootStore.reset();
    }
  }

  /**
   * Locks the cursor to a specific type, disabling automatic cursor changes.
   *
   * When the cursor is locked, it will remain fixed to the specified type
   * and will not change automatically based on component interactions until
   * unlockCursor() is called. This is useful during drag operations, loading
   * states, or other situations where you want to override the default
   * interactive cursor behavior.
   *
   * @param cursor - The cursor type to lock to
   *
   * @example
   * ```typescript
   * // Lock to loading cursor during async operation
   * graph.lockCursor("wait");
   *
   * // Lock to grabbing cursor during drag operation
   * graph.lockCursor("grabbing");
   *
   * // Lock to copy cursor for duplication operations
   * graph.lockCursor("copy");
   * ```
   *
   * @see {@link CursorLayer.lockCursor} for more details
   * @see {@link unlockCursor} to return to automatic behavior
   */
  public lockCursor(cursor: CursorLayerCursorTypes): void {
    this.cursorLayer.lockCursor(cursor);
  }

  /**
   * Unlocks the cursor and returns to automatic cursor management.
   *
   * The cursor will immediately update to reflect the current state
   * based on the component under the mouse (if any). This provides
   * smooth transitions when ending drag operations or async tasks.
   *
   * @example
   * ```typescript
   * // After completing a drag operation
   * graph.unlockCursor(); // Will show appropriate cursor for current hover state
   *
   * // After finishing an async operation
   * await someAsyncTask();
   * graph.unlockCursor(); // Returns to interactive cursor behavior
   * ```
   *
   * @see {@link CursorLayer.unlockCursor} for more details
   * @see {@link lockCursor} to override automatic behavior
   */
  public unlockCursor(): void {
    this.cursorLayer.unlockCursor();
  }

  /**
   * Returns the CursorLayer instance for advanced cursor management.
   *
   * Use this method when you need direct access to cursor layer functionality
   * beyond the basic setCursor/unsetCursor API, such as checking the current
   * mode or getting the component under the cursor.
   *
   * @returns The CursorLayer instance
   *
   * @example
   * ```typescript
   * const cursorLayer = graph.getCursorLayer();
   *
   * // Check current mode
   * if (cursorLayer.isManual()) {
   *   console.log("Manual cursor:", cursorLayer.getManualCursor());
   * }
   *
   * // Get component under cursor for debugging
   * const target = cursorLayer.getCurrentTarget();
   * console.log("Hovering over:", target?.constructor.name);
   * ```
   *
   * @see {@link CursorLayer} for available methods and properties
   */
  public getCursorLayer(): CursorLayer {
    return this.cursorLayer;
  }
}

import { batch, signal } from "@preact/signals-core";
import merge from "lodash/merge";

import { PublicGraphApi, ZoomConfig } from "./api/PublicGraphApi";
import { GraphComponent } from "./components/canvas/GraphComponent";
import { TBlock } from "./components/canvas/blocks/Block";
import { BelowLayer } from "./components/canvas/layers/belowLayer/BelowLayer";
import { CursorLayer, CursorLayerCursorTypes } from "./components/canvas/layers/cursorLayer";
import { GraphLayer } from "./components/canvas/layers/graphLayer/GraphLayer";
import { SelectionLayer } from "./components/canvas/layers/selectionLayer/SelectionLayer";
import { TGraphColors, TGraphConstants, initGraphColors, initGraphConstants } from "./graphConfig";
import { GraphEvent, GraphEventParams, GraphEventsDefinitions } from "./graphEvents";
import { scheduler } from "./lib/Scheduler";
import { HitTest } from "./services/HitTest";
import { Layer, LayerPublicProps } from "./services/Layer";
import { Layers } from "./services/LayersService";
import { CameraService } from "./services/camera/CameraService";
import { DragService } from "./services/drag";
import { RootStore } from "./store";
import { TBlockId } from "./store/block/Block";
import { TConnection } from "./store/connection/ConnectionState";
import { TGraphSettingsConfig } from "./store/settings";
import { getXY } from "./utils/functions";
import { clearTextCache } from "./utils/renderers/text";
import { RecursivePartial } from "./utils/types/helpers";
import { IPoint, IRect, Point, TPoint, TRect, isTRect } from "./utils/types/shapes";

export type LayerConfig<T extends Constructor<Layer> = Constructor<Layer>> = [T, LayerPublicProps<T>];
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
  settings?: Partial<TGraphSettingsConfig<Block, Connection>>;
  layers?: LayerConfig[];
};

export type TGraphZoomTarget = "center" | TRect | TBlockId[] | GraphComponent[];

export enum GraphState {
  INIT,
  ATTACHED,
  READY,
}

export class Graph {
  private scheduler = scheduler;

  public cameraService: CameraService = new CameraService(this);

  public layers: Layers = new Layers();

  public api = new PublicGraphApi(this);

  public eventEmitter = new EventTarget();

  public rootStore: RootStore = new RootStore(this);

  public hitTest = new HitTest(this);

  /**
   * Service that manages drag operations for all draggable GraphComponents.
   * Handles autopanning, cursor locking, and coordinates drag lifecycle across selected components.
   */
  public dragService: DragService;

  protected graphLayer: GraphLayer;

  protected belowLayer: BelowLayer;

  protected selectionLayer: SelectionLayer;

  protected cursorLayer: CursorLayer;

  public getGraphCanvas() {
    return this.graphLayer.getCanvas();
  }

  public get graphColors() {
    return this.$graphColors.value;
  }

  public $graphColors = signal<TGraphColors>(initGraphColors);

  public get graphConstants() {
    return this.$graphConstants.value;
  }

  public $graphConstants = signal<TGraphConstants>(initGraphConstants);

  public state: GraphState = GraphState.INIT;

  protected config: TGraphConfig;

  protected startRequested = false;

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
    graphColors?: TGraphColors,
    graphConstants?: TGraphConstants
  ) {
    this.belowLayer = this.addLayer(BelowLayer, {});
    this.graphLayer = this.addLayer(GraphLayer, {});
    this.selectionLayer = this.addLayer(SelectionLayer, {});
    this.cursorLayer = this.addLayer(CursorLayer, {});

    // Initialize DragService for managing drag operations on GraphComponents
    this.dragService = new DragService(this);

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
  }

  protected onUpdateSize = (event: IRect) => {
    this.cameraService.set(event);
  };

  public getGraphLayer() {
    return this.graphLayer;
  }

  public setColors(colors: RecursivePartial<TGraphColors>) {
    this.$graphColors.value = merge({}, initGraphColors, colors);
    this.emit("colors-changed", { colors: this.graphColors });
  }

  public setConstants(constants: RecursivePartial<TGraphConstants>) {
    this.$graphConstants.value = merge({}, initGraphConstants, constants);
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
      if (target.every((item) => typeof item === "string")) {
        return this.api.zoomToBlocks(target, config);
      }
    }

    this.api.zoomToViewPort(config);
    return true;
  }

  public getElementsOverPoint<T extends Constructor<GraphComponent>>(point: IPoint, filter?: T[]): InstanceType<T>[] {
    const items = this.hitTest.testPoint(point, this.layers.getDPR());
    if (filter && items.length > 0) {
      return items.filter((item) => filter.some((Component) => item instanceof Component)) as InstanceType<T>[];
    }
    return items as InstanceType<T>[];
  }

  public getElementOverPoint<T extends Constructor<GraphComponent>>(
    point: IPoint,
    filter?: T[]
  ): InstanceType<T> | undefined {
    return this.getElementsOverPoint(point, filter)?.[0] as InstanceType<T> | undefined;
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

  public getElementsInViewport<T extends Constructor<GraphComponent>>(filter?: T[]): InstanceType<T>[] {
    const viewportRect = this.getViewportRect();
    return this.getElementsOverRect(viewportRect, filter);
  }

  public getElementsOverRect<T extends Constructor<GraphComponent>>(rect: TRect, filter?: T[]): InstanceType<T>[] {
    const items = this.hitTest.testBox({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    }) as InstanceType<T>[] | [];
    if (filter.length && items.length > 0) {
      return items.filter((item: InstanceType<T>) =>
        filter.some((Component) => item instanceof Component)
      ) as InstanceType<T>[];
    }
    return items as InstanceType<T>[];
  }

  public getPointInCameraSpace(event: MouseEvent) {
    const xy = getXY(this.graphLayer.getCanvas(), event);

    const applied = this.cameraService.applyToPoint(xy[0], xy[1]);
    return new Point(applied[0], applied[1], { x: xy[0], y: xy[1] });
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

  public setEntities({
    blocks,
    connections,
  }: Partial<{
    blocks?: TBlock[];
    connections?: TConnection[];
  }>) {
    batch(() => {
      this.rootStore.blocksList.setBlocks(blocks || []);
      this.rootStore.connectionsList.setConnections(connections || []);
    });
  }

  public on<
    EventName extends keyof GraphEventsDefinitions = keyof GraphEventsDefinitions,
    Cb extends GraphEventsDefinitions[EventName] = GraphEventsDefinitions[EventName],
  >(type: EventName, cb: Cb, options?: AddEventListenerOptions | boolean) {
    this.eventEmitter.addEventListener(type, cb, options);
    return () => this.off(type, cb);
  }

  public off<
    EventName extends keyof GraphEventsDefinitions = keyof GraphEventsDefinitions,
    Cb extends GraphEventsDefinitions[EventName] = GraphEventsDefinitions[EventName],
  >(type: EventName, cb: Cb) {
    this.eventEmitter.removeEventListener(type, cb);
  }

  /*
   * Emit Graph's events
   */
  public emit<
    EventName extends keyof GraphEventsDefinitions = keyof GraphEventsDefinitions,
    Cb extends GraphEventsDefinitions[EventName] = GraphEventsDefinitions[EventName],
    P extends Parameters<Cb>[0] = Parameters<Cb>[0],
  >(eventName: EventName, detail: GraphEventParams<P>) {
    const event = new GraphEvent(eventName, {
      detail,
      bubbles: false,
      cancelable: true,
    });
    this.eventEmitter.dispatchEvent(event);
    return event;
  }

  /*
   * Emit Graph's event and execute default action if it is not prevented
   */
  public executеDefaultEventAction<
    EventName extends keyof GraphEventsDefinitions = keyof GraphEventsDefinitions,
    Cb extends GraphEventsDefinitions[EventName] = GraphEventsDefinitions[EventName],
    P extends Parameters<Cb>[0] = Parameters<Cb>[0],
  >(eventName: EventName, detail: GraphEventParams<P>, defaultCb: () => void) {
    const event = this.emit(eventName, detail);
    if (!event.defaultPrevented) {
      defaultCb();
    }
  }

  public addLayer<T extends Constructor<Layer> = Constructor<Layer>>(
    layerCtor: T,
    props: LayerPublicProps<T>
  ): InstanceType<T> {
    // TODO: These types are too complicated, try to simplify them
    return this.layers.createLayer(layerCtor as Constructor<Layer>, {
      ...props,
      camera: this.cameraService,
      graph: this,
    }) as InstanceType<T>;
  }

  public detachLayer(layer: Layer) {
    this.layers.detachLayer(layer);
  }

  public setupGraph(config: TGraphConfig = {}) {
    this.config = config;
    this.rootStore.configurationName = config.configurationName;
    this.setEntities({
      blocks: config.blocks,
      connections: config.connections,
    });

    if (config.settings) {
      this.updateSettings(config.settings);
    }

    if (config.layers) {
      config.layers.forEach(([layer, params]) => {
        this.addLayer(layer, params);
      });
    }
  }

  public updateSettings(settings: Partial<TGraphSettingsConfig>) {
    this.rootStore.settings.setupSettings(settings);
  }

  public updateSize() {
    this.layers.updateSize();
  }

  public attach(rootEl: HTMLDivElement) {
    if (this.state === GraphState.READY) {
      return;
    }
    rootEl[Symbol.for("graph")] = this;
    this.layers.attach(rootEl);

    const { width: rootWidth, height: rootHeight } = this.layers.getRootSize();

    this.cameraService.set({ width: rootWidth, height: rootHeight });

    this.setGraphState(GraphState.ATTACHED);

    if (this.startRequested) {
      this.startRequested = false;
      this.start();
    }
  }

  public start(rootEl: HTMLDivElement = this.layers.$root): void {
    if (this.state !== GraphState.ATTACHED) {
      this.startRequested = true;
      return;
    }
    if (this.state >= GraphState.READY) {
      throw new Error("Graph already started");
    }
    if (rootEl) {
      this.attach(rootEl);
    }
    this.layers.on("update-size", this.onUpdateSize);
    this.layers.start();
    this.scheduler.start();
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
    this.layers.detach(full);
    clearTextCache();
    this.scheduler.stop();
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
    this.detach();
    this.layers.off("update-size", this.onUpdateSize);
    this.setGraphState(GraphState.INIT);
    this.hitTest.clear();
    this.layers.unmount();
    clearTextCache();
    this.rootStore.reset();
    this.scheduler.stop();
    this.dragService.destroy();
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

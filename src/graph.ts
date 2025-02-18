import { batch, signal } from "@preact/signals-core";
import merge from "lodash/merge";

import { PublicGraphApi, ZoomConfig } from "./api/PublicGraphApi";
import { GraphComponent } from "./components/canvas/GraphComponent";
import { TBlock } from "./components/canvas/blocks/Block";
import { BelowLayer } from "./components/canvas/layers/belowLayer/BelowLayer";
import { GraphLayer } from "./components/canvas/layers/graphLayer/GraphLayer";
import { OverLayer } from "./components/canvas/layers/overLayer/OverLayer";
import { TGraphColors, TGraphConstants, initGraphColors, initGraphConstants } from "./graphConfig";
import { GraphEventParams, GraphEventsDefinitions } from "./graphEvents";
import { scheduler } from "./lib/Scheduler";
import { HitTest } from "./services/HitTest";
import { Layer } from "./services/Layer";
import { Layers } from "./services/LayersService";
import { CameraService } from "./services/camera/CameraService";
import { RootStore } from "./store";
import { TBlockId } from "./store/block/Block";
import { TConnection } from "./store/connection/ConnectionState";
import { TGroup } from "./store/group/Group";
import { TGraphSettingsConfig } from "./store/settings";
import { getXY } from "./utils/functions";
import { clearTextCache } from "./utils/renderers/text";
import { RecursivePartial } from "./utils/types/helpers";
import { IPoint, IRect, Point, TPoint, TRect, isTRect } from "./utils/types/shapes";

export type LayerConfig<T extends Constructor<Layer> = Constructor<Layer>> = [
  T,
  T extends Constructor<Layer<infer Props>>
    ? Omit<Props, "root" | "camera" | "graph"> & { root?: Props["root"] }
    : never,
];
export type TGraphConfig<Block extends TBlock = TBlock, Connection extends TConnection = TConnection> = {
  configurationName?: string;
  blocks?: Block[];
  connections?: TConnection[];
  rect?: TRect;
  cameraXY?: TPoint;
  cameraScale?: number;
  settings?: Partial<TGraphSettingsConfig<Block, Connection>>;
  layers?: LayerConfig[];
};

export type TGraphZoomTarget = "center" | TRect | TBlockId[];

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

  public hitTest = new HitTest();

  protected graphLayer: GraphLayer;

  protected belowLayer: BelowLayer;

  protected overLayer: OverLayer;

  public getGraphHTML() {
    return this.graphLayer.getHTML();
  }
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

  constructor(
    config: TGraphConfig,
    rootEl?: HTMLDivElement,
    graphColors?: TGraphColors,
    graphConstants?: TGraphConstants
  ) {
    this.belowLayer = this.addLayer(BelowLayer, {});
    this.graphLayer = this.addLayer(GraphLayer, {});
    this.overLayer = this.addLayer(OverLayer, {});

    if (rootEl) {
      this.attach(rootEl);
    }
    if (graphColors) {
      this.setColors(graphColors);
    }
    if (graphConstants) {
      this.setConstants(graphConstants);
    }

    this.layers.on("update-size", (event: IRect) => {
      this.cameraService.set(event);
    });

    this.setupGraph(config);
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

  public zoomTo(target: TGraphZoomTarget, config?: ZoomConfig) {
    if (target === "center") {
      this.api.zoomToViewPort(config);
      return;
    }
    if (isTRect(target)) {
      this.api.zoomToRect(target, config);
      return;
    }
    this.api.zoomToBlocks(target, config);
  }

  public getElementsOverPoint<T extends Constructor<GraphComponent>>(point: IPoint, filter?: T[]): InstanceType<T>[] {
    const items = this.hitTest.testPoint(point, this.graphConstants.system.PIXEL_RATIO);
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
    groups,
  }: Partial<{
    blocks?: TBlock[];
    connections?: TConnection[];
    groups?: TGroup[];
  }>) {
    batch(() => {
      if (blocks?.length) {
        this.rootStore.blocksList.updateBlocks(blocks);
      }
      if (connections?.length) {
        this.rootStore.connectionsList.updateConnections(connections);
      }
      if (groups?.length) {
        this.rootStore.groupsList.updateGroups(groups);
      }
    });
  }

  public setEntities({
    blocks,
    connections,
    groups,
  }: Partial<{
    blocks?: TBlock[];
    connections?: TConnection[];
    groups?: TGroup[];
  }>) {
    batch(() => {
      this.rootStore.blocksList.setBlocks(blocks || []);
      this.rootStore.connectionsList.setConnections(connections || []);
      this.rootStore.groupsList.setGroups(groups || []);
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
    const event = new CustomEvent(eventName, {
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
    props: T extends Constructor<Layer<infer Props>>
      ? Omit<Props, "root" | "camera" | "graph" | "emitter"> & { root?: Props["root"] }
      : never
  ): InstanceType<T> {
    // TODO: These types are too complicated, try to simplify them
    return this.layers.createLayer(layerCtor as Constructor<Layer>, {
      ...props,
      camera: this.cameraService,
      graph: this,
    }) as InstanceType<T>;
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
    this.layers.start();
    this.scheduler.start();
    this.setGraphState(GraphState.READY);
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
    this.setGraphState(GraphState.INIT);
    this.hitTest.clear();
    this.layers.destroy();
    clearTextCache();
    this.rootStore.reset();
    this.scheduler.stop();
  }
}

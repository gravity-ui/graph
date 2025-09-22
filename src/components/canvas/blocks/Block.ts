import { signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";
import isObject from "lodash/isObject";

import { Component } from "../../../lib/Component";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { GraphEvent } from "../../../services/event/EventService";
import { TGraphSettingsConfig } from "../../../store";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState, IS_BLOCK_TYPE, TBlockId } from "../../../store/block/Block";
import { selectBlockById } from "../../../store/block/selectors";
import { PortState } from "../../../store/connection/port/Port";
import { createAnchorPortId, createBlockPointPortId } from "../../../store/connection/port/utils";
import { getXY, isMetaKeyEvent } from "../../../utils/functions";
import { TMeasureTextOptions } from "../../../utils/functions/text";
import { TTExtRect, renderText } from "../../../utils/renderers/text";
import { TPoint, TRect } from "../../../utils/types/shapes";
import { ESelectionStrategy } from "../../../utils/types/types";
import { GraphComponent, TGraphComponentProps } from "../GraphComponent";
import { Anchor, TAnchor } from "../anchors";
import { TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

// import { BlockController } from "./controllers/BlockController";

export type TBlockSettings = {
  /** Phantom blocks are blocks whose dimensions and position
   * are not taken into account when calculating the usable rect.
   *
   * @deprecated phantom blocks are not used anymore. Please create an issue if you need this feature.
   */
  phantom?: boolean;
};

export function isTBlock(block: unknown): block is TBlock {
  return isObject(block);
}

export type TBlock<T extends Record<string, unknown> = {}> = {
  id: TBlockId;
  is: string;
  x: number;
  y: number;
  group?: string;
  width: number;
  height: number;
  selected?: boolean;
  name: string;
  anchors?: TAnchor[];
  settings?: TBlockSettings;
  meta?: T;
};

export type TBlockProps = TGraphComponentProps & {
  id: TBlockId;
  font?: string;
};

declare module "../../../graphEvents" {
  interface GraphEventsDefinitions {
    "block-drag-start": (
      event: CustomEvent<{
        nativeEvent: MouseEvent;
        block: TBlock;
      }>
    ) => void;

    "block-drag": (
      event: CustomEvent<{
        nativeEvent: MouseEvent;
        block: TBlock;
        x: number;
        y: number;
      }>
    ) => void;

    "block-drag-end": (
      event: CustomEvent<{
        nativeEvent: MouseEvent;
        block: TBlock;
      }>
    ) => void;
  }
}

export type BlockViewState = {
  zIndex: number;
  order: number;
};

export class Block<T extends TBlock = TBlock, Props extends TBlockProps = TBlockProps> extends GraphComponent<
  Props,
  T,
  TGraphLayerContext
> {
  public static IS = IS_BLOCK_TYPE;

  // from controller mixin
  public readonly isBlock = true;

  public declare context: TGraphLayerContext;

  public declare state: T;

  public declare props: Props;

  public connectedState: BlockState<T>;

  protected lastDragEvent?: MouseEvent;

  protected startDragCoords: number[] = [];

  protected shouldRenderText: boolean;

  protected shouldRenderHtml: boolean;

  protected raised: boolean;

  protected hidden: boolean;

  protected currentState(): T {
    return this.connectedState.$state.value;
  }

  // protected blockController = new BlockController(this);

  public $viewState = signal<BlockViewState>({ zIndex: 0, order: 0 });

  constructor(props: Props, parent: Component) {
    super(props, parent);

    this.subscribe(props.id);

    this.addEventListener("tap", this);
    this.addEventListener("pointerdown", this);
    this.addEventListener("dragmove", this);
    this.addEventListener("dragend", this);
  }

  public isRendered() {
    return this.shouldRender;
  }

  protected updateViewState(params: Partial<BlockViewState>) {
    let hasChanges = false;
    for (const [key, value] of Object.entries(params)) {
      if (this.$viewState.value[key] !== value) {
        hasChanges = true;
        break;
      }
    }

    if (!hasChanges) {
      return;
    }

    this.$viewState.value = {
      ...this.$viewState.value,
      ...params,
    };
  }

  public getGeometry(): TRect {
    return {
      x: this.state.x,
      y: this.state.y,
      width: this.state.width,
      height: this.state.height,
    };
  }

  public getConfigFlag<K extends keyof TGraphSettingsConfig>(flagPath: K) {
    return this.context.graph.rootStore.settings.getConfigFlag(flagPath);
  }

  protected subscribe(id: TBlockId) {
    this.connectedState = selectBlockById<T>(this.context.graph, id);
    this.state = cloneDeep(this.connectedState.$state.value);
    this.connectedState.setViewComponent(this);
    this.setState({
      ...this.connectedState.$state.value,
      anchors: this.connectedState.$anchors.value,
    });
    this.updateViewState({
      zIndex: this.zIndex,
      order: this.renderOrder,
    });

    // Initialize ports
    return [
      this.subscribeSignal(this.connectedState.$anchors, () => {
        this.setState({
          anchors: this.connectedState.$anchors.value,
        });
        this.shouldUpdateChildren = true;
      }),
      this.subscribeSignal(this.connectedState.$state, () => {
        this.setState({
          ...this.connectedState.$state.value,
          anchors: this.connectedState.$anchors.value,
        });
        this.updateHitBox(this.connectedState.$geometry.value);
        this.updatePortPositions();
      }),
    ];
  }

  protected getNextState() {
    // @ts-ignore
    return this.__data.nextState || this.state;
  }

  protected didIterate() {
    if (this.$viewState.value.zIndex !== this.zIndex || this.$viewState.value.order !== this.renderOrder) {
      this.updateViewState({
        zIndex: this.zIndex,
        order: this.renderOrder,
      });
    }
  }

  protected calcZIndex() {
    const raised = this.connectedState.selected || this.lastDragEvent ? 1 : 0;
    return this.context.constants.block.DEFAULT_Z_INDEX + raised;
  }

  protected raiseBlock() {
    this.zIndex = this.calcZIndex();
    this.performRender();
  }

  protected stateChanged(nextState: T): void {
    if (!this.firstRender && nextState.selected !== this.state.selected) {
      this.raiseBlock();
    }
    return super.stateChanged(nextState);
  }

  public getRenderIndex() {
    return this.renderOrder;
  }

  public updatePosition(x: number, y: number, silent = false) {
    if (!silent) {
      this.connectedState.updateXY(x, y);
    }
    this.setState({ x, y });
    this.updatePortPositions();
  }

  protected updatePortPositions(): void {
    // Update input port position
    const inputPoint = this.getConnectionPoint("in");
    this.getInputPort().setPoint(inputPoint.x, inputPoint.y);

    // Update output port position
    const outputPoint = this.getConnectionPoint("out");
    this.getOutputPort().setPoint(outputPoint.x, outputPoint.y);

    // Update anchor ports positions
    this.connectedState.$anchors.value.forEach((anchor) => {
      const port = this.getAnchorPort(anchor.id);
      if (port) {
        const anchorPoint = this.getConnectionAnchorPosition(anchor);
        port.setPoint(anchorPoint.x, anchorPoint.y);
      }
    });
  }

  public getInputPort(): PortState {
    return this.getPort(createBlockPointPortId(this.state.id, true));
  }

  public getOutputPort(): PortState {
    return this.getPort(createBlockPointPortId(this.state.id, false));
  }

  public getAnchorPort(anchorId: string): PortState {
    return this.getPort(createAnchorPortId(this.state.id, anchorId));
  }

  public handleEvent(event: GraphEvent) {
    switch (event.type) {
      case "tap": {
        event.stopPropagation();

        const { connectionsList } = this.context.graph.rootStore;
        const isAnyConnectionSelected = connectionsList.$selectedConnections.value.size !== 0;

        if (!isMetaKeyEvent(event.detail.sourceEvent) && isAnyConnectionSelected) {
          connectionsList.resetSelection();
        }

        this.context.graph.api.selectBlocks(
          [this.props.id],
          /**
           * On click with meta key we want to select only one block, otherwise we want to toggle selection
           */
          !isMetaKeyEvent(event.detail.sourceEvent) ? true : !this.state.selected,
          /**
           * On click with meta key we want to append selection, otherwise we want to replace selection
           */
          !isMetaKeyEvent(event.detail.sourceEvent) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
        );
        break;
      }
      case "pointerdown": {
        console.log({ event });
        this.onDragStart(event);
        break;
      }
      case "dragmove": {
        this.onDragmove(event);
        break;
      }
      case "dragend": {
        this.onDragEnd(event);
        break;
      }
    }
  }

  protected onDragStart(event: GraphEvent) {
    // this.context.graph.executеDefaultEventAction(
    //   "block-drag-start",
    //   {
    //     nativeEvent: event,
    //     block: this.connectedState.asTBlock(),
    //   },
    //   () => {
    //     this.lastDragEvent = event;
    //     const xy = getXY(this.context.canvas, event);
    //     this.startDragCoords = this.context.camera.applyToPoint(xy[0], xy[1]).concat([this.state.x, this.state.y]);
    //     this.raiseBlock();
    //   }
    // );
    const xy = getXY(this.context.canvas, event.detail.sourceEvent);
    this.startDragCoords = this.context.camera.applyToPoint(xy[0], xy[1]).concat([this.state.x, this.state.y]);
  }

  protected onDragmove(event: GraphEvent) {
    const [canvasX, canvasY] = getXY(this.context.canvas, event.detail.sourceEvent);
    const [cameraSpaceX, cameraSpaceY] = this.context.camera.applyToPoint(canvasX, canvasY);

    const [x, y] = this.calcNextDragPosition(cameraSpaceX, cameraSpaceY);

    this.updatePosition(x, y);
  }

  protected onDragUpdate(event: MouseEvent) {
    // if (!this.startDragCoords) return;

    this.lastDragEvent = event;

    const [canvasX, canvasY] = getXY(this.context.canvas, event);
    const [cameraSpaceX, cameraSpaceY] = this.context.camera.applyToPoint(canvasX, canvasY);

    const [x, y] = this.calcNextDragPosition(cameraSpaceX, cameraSpaceY);

    // this.context.graph.executеDefaultEventAction(
    //   "block-drag",
    //   {
    //     nativeEvent: event,
    //     block: this.connectedState.asTBlock(),
    //     x,
    //     y,
    //   },
    //   () => this.applyNextPosition(x, y)
    // );
    this.updatePosition(x, y);
  }

  protected calcNextDragPosition(x: number, y: number) {
    const diffX = (this.startDragCoords[0] - x) | 0;
    const diffY = (this.startDragCoords[1] - y) | 0;

    let nextX = this.startDragCoords[2] - diffX;
    let nextY = this.startDragCoords[3] - diffY;

    const spanGridSize = this.context.constants.block.SNAPPING_GRID_SIZE;

    if (spanGridSize > 1) {
      nextX = Math.round(nextX / spanGridSize) * spanGridSize;
      nextY = Math.round(nextY / spanGridSize) * spanGridSize;
    }

    return [nextX, nextY];
  }

  protected applyNextPosition(x: number, y: number) {
    this.updatePosition(x, y);
  }

  protected onDragEnd(event: GraphEvent) {
    // if (!this.startDragCoords) return;
    // this.context.graph.emit("block-drag-end", {
    //   nativeEvent: event,
    //   block: this.connectedState.asTBlock(),
    // });

    this.lastDragEvent = undefined;
    this.startDragCoords = [];
    this.updateHitBox(this.state);
  }

  public updateHitBox = (geometry: TRect, force?: boolean) => {
    this.setHitBox(geometry.x, geometry.y, geometry.x + geometry.width, geometry.y + geometry.height, force);
  };

  /* Calculate the position of the anchor based on the absolute position of the block. */
  public getConnectionAnchorPosition(anchor: TAnchor) {
    const { x, y } = this.getAnchorPosition(anchor);
    return {
      x: x + this.connectedState.x,
      y: y + this.connectedState.y,
    };
  }

  /* Calculate the position of the anchors relative to the block container. */
  public getAnchorPosition(anchor: TAnchor): TPoint {
    const index = this.connectedState.$anchorIndexs.value?.get(anchor.id) || 0;
    const offset = this.context.constants.block.HEAD_HEIGHT + this.context.constants.block.BODY_PADDING;
    return {
      x: anchor.type === EAnchorType.OUT ? this.state.width : 0,
      y: offset + index * this.context.constants.system.GRID_SIZE * 2,
    };
  }

  public getConnectionPoint(direction: "in" | "out"): TPoint {
    return {
      x: this.connectedState.x + (direction === "out" ? this.connectedState.width : 0),
      y: (this.connectedState.y + this.connectedState.height / 2) | 0,
    };
  }

  protected renderAnchor(anchor: TAnchor, getPosition: (anchor: TAnchor) => TPoint) {
    return Anchor.create(
      {
        ...anchor,
        zIndex: this.zIndex,
        size: 18,
        lineWidth: 2,
        getPosition,
      },
      {
        key: anchor.id,
      }
    );
  }

  protected isAnchorsAllowed() {
    return Array.isArray(this.state.anchors) && this.state.anchors.length && this.getConfigFlag("useBlocksAnchors");
  }

  protected binderGetAnchorPosition = (anchor: TAnchor) => {
    return this.getConnectionAnchorPosition(anchor);
  };

  protected updateChildren() {
    if (!this.isAnchorsAllowed()) {
      return undefined;
    }

    return this.state.anchors.map((anchor) => {
      return this.renderAnchor(anchor, this.binderGetAnchorPosition);
    });
  }

  protected willRender() {
    super.willRender();

    const scale = this.context.camera.getCameraScale();
    this.shouldRenderText = scale > this.context.constants.block.SCALES[0];
  }

  protected renderStroke(color: string) {
    this.context.ctx.lineWidth = Math.round(3 / this.context.camera.getCameraScale());
    this.context.ctx.strokeStyle = color;
    this.context.ctx.strokeRect(this.state.x, this.state.y, this.state.width, this.state.height);
  }

  /* Returns rect of block size with padding */
  protected getContentRect(): TRect {
    return {
      x: this.state.x + this.context.constants.text.PADDING,
      y: this.state.y + this.context.constants.text.PADDING,
      height: this.state.height - this.context.constants.text.PADDING * 2,
      width: this.state.width - this.context.constants.text.PADDING * 2,
    };
  }

  protected renderText(
    text: string,
    ctx = this.context.ctx,
    { rect, renderParams }: { rect: TTExtRect; renderParams: TMeasureTextOptions } = {
      rect: this.getContentRect(),
      renderParams: { font: this.props.font },
    }
  ) {
    renderText(text, ctx, rect, renderParams);
  }

  public renderMinimalisticBlock(ctx: CanvasRenderingContext2D) {
    this.renderSchematicView(ctx);
  }

  protected renderBody(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.context.colors.block.background;
    ctx.strokeStyle = this.context.colors.block.border;

    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    this.renderStroke(
      this.state.selected ? this.context.colors.block.selectedBorder : this.context.colors.block.border
    );
  }

  public renderSchematicView(ctx: CanvasRenderingContext2D) {
    this.renderBody(ctx);

    if (this.shouldRenderText) {
      ctx.fillStyle = this.context.colors.block.text;
      ctx.textAlign = "center";
      this.renderText(this.state.name, ctx);
    }
  }

  public setHiddenBlock(hidden: boolean) {
    if (this.hidden !== hidden) {
      this.hidden = hidden;
      this.shouldRender = !hidden;
      this.performRender();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public renderDetailedView(ctx: CanvasRenderingContext2D) {
    return this.renderBody(ctx);
  }

  protected render() {
    if (this.hidden) {
      return;
    }

    const scaleLevel = this.context.graph.cameraService.getCameraBlockScaleLevel();

    switch (scaleLevel) {
      case ECameraScaleLevel.Minimalistic: {
        this.renderMinimalisticBlock(this.context.ctx);
        break;
      }
      case ECameraScaleLevel.Schematic: {
        this.renderSchematicView(this.context.ctx);
        break;
      }
      case ECameraScaleLevel.Detailed: {
        this.renderDetailedView(this.context.ctx);
        break;
      }
    }
  }

  protected override unmount(): void {
    // Release ownership of all ports owned by this block
    const connectionsList = this.context.graph.rootStore.connectionsList;

    connectionsList.releasePort(createBlockPointPortId(this.state.id, true), this);
    connectionsList.releasePort(createBlockPointPortId(this.state.id, false), this);

    this.state.anchors.forEach((anchor) => {
      connectionsList.releasePort(createAnchorPortId(this.state.id, anchor.id), this);
    });

    super.unmount();
  }
}

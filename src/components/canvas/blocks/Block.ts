import { effect, signal } from "@preact/signals-core";
import isObject from "lodash/isObject";

import { EventedComponent } from "../../../mixins/withEvents";
import { withHitTest } from "../../../mixins/withHitTest";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { TGraphSettingsConfig } from "../../../store";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState, TBlockId } from "../../../store/block/Block";
import { selectBlockById } from "../../../store/block/selectors";
import { getXY } from "../../../utils/functions";
import { TMeasureTextOptions } from "../../../utils/functions/text";
import { TTExtRect, renderText } from "../../../utils/renderers/text";
import { EVENTS } from "../../../utils/types/events";
import { TPoint, TRect } from "../../../utils/types/shapes";
import { Anchor, TAnchor } from "../anchors";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

import { BlockController } from "./controllers/BlockController";

export type TBlockSettings = {
  /** Phantom blocks are blocks whose dimensions and position
   * are not taken into account when calculating the usable rect. */
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
  width: number;
  height: number;
  selected: boolean;
  name: string;
  anchors: TAnchor[];
  settings?: TBlockSettings;
  meta?: T;
};

export type TBlockProps = {
  id: TBlockId;
  font: string;
  onZindexChange: (block: Block) => void;
  getRenderIndex: (block: Block) => number;
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

export class Block<T extends TBlock = TBlock, Props extends TBlockProps = TBlockProps> extends withHitTest(
  EventedComponent
) {
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

  protected readonly unsubscribe: (() => void)[] = [];

  protected blockController = new BlockController(this);

  public $viewState = signal<BlockViewState>({ zIndex: 0, order: 0 });

  constructor(props: Props, parent: GraphLayer) {
    super(props, parent);

    this.unsubscribe = this.subscribe(props.id);

    (this as unknown as EventedComponent).addEventListener(EVENTS.DRAG_START, this);
    (this as unknown as EventedComponent).addEventListener(EVENTS.DRAG_UPDATE, this);
    (this as unknown as EventedComponent).addEventListener(EVENTS.DRAG_END, this);
  }

  public isRendered() {
    return this.shouldRender;
  }

  public get zIndex() {
    const raised = this.connectedState.selected || this.lastDragEvent ? 1 : 0;
    return this.context.constants.block.DEFAULT_Z_INDEX + raised;
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
    this.state = this.connectedState.$state.value;
    this.connectedState.setViewComponent(this);
    this.setState({
      ...this.connectedState.$state.value,
      anchors: this.connectedState.$anchors.value,
    });
    this.updateViewState({
      zIndex: this.zIndex,
      order: this.props.getRenderIndex(this),
    });

    return [
      effect(() => {
        this.setState({
          ...this.connectedState.$state.value,
          anchors: this.connectedState.$anchors.value,
        });
        this.updateHitBox(this.connectedState.$geometry.value);
      }),
      this.connectedState.$anchors.subscribe(() => {
        this.shouldUpdateChildren = true;
        this.performRender();
      }),
    ];
  }

  protected getNextState() {
    // @ts-ignore
    return this.__data.nextState || this.state;
  }

  protected zIndexDirty = false;
  protected didIterate() {
    if (this.zIndexDirty) {
      this.props.onZindexChange(this);
      this.zIndexDirty = false;
      this.updateViewState({
        zIndex: this.zIndex,
      });
      this.$viewState.value = {
        ...this.$viewState.value,
        zIndex: this.zIndex,
      };
    }
    const nextOrder = this.props.getRenderIndex(this);
    if (this.$viewState.value.order !== nextOrder) {
      this.updateViewState({
        order: nextOrder,
      });
    }
  }

  protected raiseBlock() {
    this.zIndexDirty = true;
    this.performRender();
  }

  protected stateChanged(nextState: T): void {
    if (!this.firstRender && nextState.selected !== this.state.selected) {
      this.raiseBlock();
    }
    return super.stateChanged(nextState);
  }

  public getRenderIndex() {
    return this.props.getRenderIndex(this);
  }

  public updatePosition(x: number, y: number) {
    this.connectedState.updateXY(x, y);
    this.setState({ x, y });
  }

  public handleEvent(event: CustomEvent) {
    switch (event.type) {
      case EVENTS.DRAG_START: {
        this.onDragStart(event.detail.sourceEvent);
        break;
      }
      case EVENTS.DRAG_UPDATE: {
        this.onDragUpdate(event.detail.sourceEvent);
        break;
      }
      case EVENTS.DRAG_END: {
        this.onDragEnd(event.detail.sourceEvent);
        break;
      }
    }
  }

  protected onDragStart(event: MouseEvent) {
    this.context.graph.executеDefaultEventAction(
      "block-drag-start",
      {
        nativeEvent: event,
        block: this.connectedState.asTBlock(),
      },
      () => {
        this.lastDragEvent = event;
        const xy = getXY(this.context.canvas, event);
        this.startDragCoords = this.context.camera.applyToPoint(xy[0], xy[1]).concat([this.state.x, this.state.y]);
        this.raiseBlock();
      }
    );
  }

  protected onDragUpdate(event: MouseEvent) {
    if (!this.startDragCoords) return;

    this.lastDragEvent = event;

    const [canvasX, canvasY] = getXY(this.context.canvas, event);
    const [cameraSpaceX, cameraSpaceY] = this.context.camera.applyToPoint(canvasX, canvasY);

    const [x, y] = this.calcNextDragPosition(cameraSpaceX, cameraSpaceY);

    this.context.graph.executеDefaultEventAction(
      "block-drag",
      {
        nativeEvent: event,
        block: this.connectedState.asTBlock(),
        x,
        y,
      },
      () => this.applyNextPosition(x, y)
    );
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

  protected onDragEnd(event: MouseEvent) {
    if (!this.startDragCoords) return;
    this.context.graph.emit("block-drag-end", {
      nativeEvent: event,
      block: this.connectedState.asTBlock(),
    });

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
      x: x + this.state.x,
      y: y + this.state.y,
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
      x: this.state.x + (direction === "out" ? this.state.width : 0),
      y: (this.state.y + this.state.height / 2) | 0,
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

  protected updateChildren(): void | object[] {
    if (!this.isAnchorsAllowed()) {
      return undefined;
    }

    return this.state.anchors.map((anchor) => {
      return this.renderAnchor(anchor, this.binderGetAnchorPosition);
    });
  }

  protected unmount() {
    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());

    super.unmount();
  }

  public willIterate() {
    super.willIterate();

    this.shouldRender =
      !this.hidden &&
      this.context.camera.isRectVisible(this.state.x, this.state.y, this.state.width, this.state.height);
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
      this.performRender();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public renderDetailedView(ctx: CanvasRenderingContext2D) {
    return this.renderBody(ctx);
  }

  protected render() {
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
}

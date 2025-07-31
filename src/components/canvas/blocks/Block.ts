import { signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";
import isObject from "lodash/isObject";

import { DragInfo } from "../../../services/DragInfo";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { TGraphSettingsConfig } from "../../../store";
import { EAnchorType } from "../../../store/anchor/Anchor";
import { BlockState, IS_BLOCK_TYPE, TBlockId } from "../../../store/block/Block";
import { selectBlockById } from "../../../store/block/selectors";
import { ECanChangeBlockGeometry } from "../../../store/settings";
import { isAllowChangeBlockGeometry } from "../../../utils/functions";
import { TMeasureTextOptions } from "../../../utils/functions/text";
import { TTExtRect, renderText } from "../../../utils/renderers/text";
import { TPoint, TRect } from "../../../utils/types/shapes";
import { GraphComponent } from "../GraphComponent";
import { Anchor, TAnchor } from "../anchors";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

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
  group?: string;
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

  protected startDragCoords?: [number, number];

  protected shouldRenderText: boolean;

  protected shouldRenderHtml: boolean;

  protected raised: boolean;

  protected hidden: boolean;

  protected currentState(): T {
    return this.connectedState.$state.value;
  }

  public $viewState = signal<BlockViewState>({ zIndex: 0, order: 0 });

  constructor(props: Props, parent: GraphLayer) {
    super(props, parent);

    this.subscribe(props.id);
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

  public isDraggable() {
    return isAllowChangeBlockGeometry(
      this.getConfigFlag("canChangeBlockGeometry") as ECanChangeBlockGeometry,
      this.state.selected
    );
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
    const raised = this.connectedState.selected || this.startDragCoords ? 1 : 0;
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
  }

  public onDragStart(event: MouseEvent) {
    this.context.graph.executеDefaultEventAction(
      "block-drag-start",
      {
        nativeEvent: event,
        block: this.connectedState.asTBlock(),
      },
      () => {
        this.startDragCoords = [this.state.x, this.state.y];
        this.raiseBlock();
      }
    );
  }

  public onDragUpdate(event: MouseEvent, dragInfo: DragInfo) {
    if (!this.startDragCoords) return;

    // Применяем скорректированную дельту к начальной позиции этого блока
    const newPos = dragInfo.applyAdjustedDelta(this.startDragCoords[0], this.startDragCoords[1]);

    this.context.graph.executеDefaultEventAction(
      "block-drag",
      {
        nativeEvent: event,
        block: this.connectedState.asTBlock(),
        x: newPos.x,
        y: newPos.y,
      },
      () => this.applyNextPosition(newPos.x, newPos.y)
    );
  }

  protected calcNextDragPosition(dragInfo: DragInfo) {
    const diff = dragInfo.worldDelta;

    const nextX = this.startDragCoords[0] + diff.x;
    const nextY = this.startDragCoords[1] + diff.y;

    return [nextX, nextY];
  }

  protected applyNextPosition(x: number, y: number) {
    this.updatePosition(x, y);
  }

  public onDragEnd(event: MouseEvent) {
    if (!this.startDragCoords) return;

    this.context.graph.emit("block-drag-end", {
      nativeEvent: event,
      block: this.connectedState.asTBlock(),
    });

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
}

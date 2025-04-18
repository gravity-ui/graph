import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { BlockState } from "../../../../store/block/Block";
import { getXY, isAltKeyEvent, isBlock } from "../../../../utils/functions";
import { dragListener } from "../../../../utils/functions/dragListener";
import { render } from "../../../../utils/renderers/render";
import { EVENTS } from "../../../../utils/types/events";
import { TPoint } from "../../../../utils/types/shapes";
import { Block } from "../../../canvas/blocks/Block";

declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    "block-add-start-from-shadow": (event: CustomEvent<{ block: Block }>) => void;
    "block-added-from-shadow": (event: CustomEvent<{ block: Block; coord: TPoint }>) => void;
  }
}

export interface NewBlockLayerProps extends LayerProps {
  /**
   * Цвет фона для отображения тени блока
   * По умолчанию используется цвет границы блока из темы
   */
  ghostBackground?: string;
}

export class NewBlockLayer extends Layer<
  NewBlockLayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private copyBlock: BlockState;
  private blockState = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  private enabled = true;

  constructor(props: NewBlockLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
      },
      ...props,
    });

    this.setContext({
      canvas: this.getCanvas(),
      graphCanvas: props.graph.getGraphCanvas(),
      ctx: this.getCanvas().getContext("2d"),
      camera: props.camera,
      constants: this.props.graph.graphConstants,
      colors: this.props.graph.graphColors,
      graph: this.props.graph,
    });

    this.performRender = this.performRender.bind(this);
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
    this.graphOn("camera-change", this.performRender);
    this.graphOn("mousedown", this.handleMouseDown, {
      capture: true,
    });

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  protected getOwnerDocument() {
    return this.context.graph.getGraphHTML().ownerDocument;
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const event = extractNativeGraphMouseEvent(nativeEvent);
    const target = nativeEvent.detail.target;
    if (event && isAltKeyEvent(event) && isBlock(target) && this.enabled) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.getOwnerDocument())
        .on(EVENTS.DRAG_START, (event: MouseEvent) => this.onStartNewBlock(event, target))
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) => this.onMoveNewBlock(event))
        .on(EVENTS.DRAG_END, (event: MouseEvent) =>
          this.onEndNewBlock(event, this.context.graph.getPointInCameraSpace(event))
        );
    }
  };

  protected render() {
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.context.ctx.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);

    if (!this.blockState.width && !this.blockState.height) {
      return;
    }

    render(this.context.ctx, (ctx) => {
      ctx.beginPath();
      ctx.fillStyle = this.props.ghostBackground || this.context.colors.block.border;
      ctx.fillRect(this.blockState.x, this.blockState.y, this.blockState.width, this.blockState.height);
      ctx.closePath();
    });
  }

  /**
   * Unmounts the layer and cleans up resources.
   * The super.unmount() call triggers the AbortController's abort method in the parent class,
   * which automatically removes all event listeners.
   * No manual event listener removal is needed.
   */
  protected unmount(): void {
    super.unmount();
    // The event listeners will be automatically removed by the AbortController in the parent class
  }

  private onStartNewBlock(event: MouseEvent, block: Block) {
    this.context.graph.executеDefaultEventAction("block-add-start-from-shadow", { block: block }, () => {
      this.copyBlock = block.connectedState;
      const xy = getXY(this.context.graphCanvas, event);
      this.blockState = {
        width: this.context.constants.block.WIDTH * this.context.camera.getCameraScale(),
        height: this.context.constants.block.HEIGHT * this.context.camera.getCameraScale(),
        x: xy[0],
        y: xy[1],
      };
      this.performRender();
    });
  }

  private onMoveNewBlock(event: MouseEvent) {
    if (!this.copyBlock) {
      return;
    }
    const xy = getXY(this.context.graphCanvas, event);
    this.blockState = {
      ...this.blockState,
      x: xy[0],
      y: xy[1],
    };
    this.performRender();
  }

  private onEndNewBlock(event: MouseEvent, point: TPoint) {
    if (!this.copyBlock) {
      return;
    }
    this.blockState = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    this.performRender();
    this.context.graph.emit("block-added-from-shadow", {
      block: this.copyBlock.getViewComponent(),
      coord: point,
    });
    this.copyBlock = null;
  }

  public enable(): void {
    this.enabled = true;
  }

  public disable(): void {
    this.enabled = false;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

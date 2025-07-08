import { GraphPointerEvent, extractNativeGraphPointerEvent } from "../../../../graphEvents";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { AnchorState } from "../../../../store/anchor/Anchor";
import { BlockState, TBlockId } from "../../../../store/block/Block";
import { getXY, isBlock, isShiftKeyEvent } from "../../../../utils/functions";
import { dragListener } from "../../../../utils/functions/dragListener";
import { render } from "../../../../utils/renderers/render";
import { renderSVG } from "../../../../utils/renderers/svgPath";
import { EVENTS } from "../../../../utils/types/events";
import { Point, TPoint } from "../../../../utils/types/shapes";
import { ESelectionStrategy } from "../../../../utils/types/types";
import { Anchor } from "../../../canvas/anchors";
import { Block } from "../../../canvas/blocks/Block";

type TIcon = {
  path: string;
  fill?: string;
  stroke?: string;
  width: number;
  height: number;
  viewWidth: number;
  viewHeight: number;
};

type LineStyle = {
  color: string;
  dash: number[];
};

type DrawLineFunction = (start: TPoint, end: TPoint) => { path: Path2D; style: LineStyle };

type ConnectionLayerProps = LayerProps & {
  createIcon?: TIcon;
  point?: TIcon;
  drawLine?: DrawLineFunction;
  isConnectionAllowed?: (sourceComponent: BlockState | AnchorState) => boolean;
};

declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     * Fired when a user initiates a connection from a block or anchor.
     * This happens when dragging starts from a block (with Shift key) or an anchor.
     * Preventing this event will prevent the selection of the source component.
     */
    "connection-create-start": (
      event: CustomEvent<{
        blockId: TBlockId;
        anchorId: string | undefined;
      }>
    ) => void;

    /**
     * Fired when the dragged connection endpoint hovers over a potential target block or anchor.
     * Preventing this event will prevent the selection of the target component.
     */
    "connection-create-hover": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string | undefined;
        targetBlockId: TBlockId | undefined;
        targetAnchorId: string | undefined;
      }>
    ) => void;

    /**
     * Fired when a connection is successfully created between two elements.
     * By default, this adds the connection to the connectionsList in the store.
     * Preventing this event will prevent the connection from being added to the store.
     */
    "connection-created": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId?: string;
        targetBlockId: TBlockId;
        targetAnchorId?: string;
      }>
    ) => void;

    /**
     * Fired when the user releases the mouse button to complete the connection process.
     * This event fires regardless of whether a valid connection was established.
     * Can be used for cleanup or to handle custom connection drop behavior.
     */
    "connection-create-drop": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string;
        targetBlockId?: TBlockId;
        targetAnchorId?: string;
        point: Point;
      }>
    ) => void;
  }
}

/**
 * ConnectionLayer manages the creation process of connections between blocks and anchors in the graph.
 * It handles the temporary visualization during connection creation but does not render existing connections.
 *
 * Features:
 * - Interactive connection creation through drag and drop
 * - Temporary visualization during connection creation with configurable icons and line styles
 * - Automatic selection handling of source and target elements
 * - Comprehensive event system for the connection creation lifecycle
 * - Optional connection validation through isConnectionAllowed prop
 *
 * Connection types:
 * - Block-to-Block: Hold Shift key and drag from one block to another
 * - Anchor-to-Anchor: Drag from one anchor to another (must be on different blocks)
 *
 * The layer renders on a separate canvas with a higher z-index and handles
 * all mouse interactions for connection creation.
 */
export class ConnectionLayer extends Layer<
  ConnectionLayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private connectionState = {
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
  };
  protected target?: Block | Anchor;
  protected sourceComponent?: BlockState | AnchorState;
  protected enabled: boolean;
  private declare eventAborter: AbortController;

  constructor(props: ConnectionLayerProps) {
    super({
      canvas: {
        zIndex: 4,
        classNames: ["no-pointer-events"],
        ...props.canvas,
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

    this.enabled = Boolean(this.props.graph.rootStore.settings.getConfigFlag("canCreateNewConnections"));

    this.onSignal(this.props.graph.rootStore.settings.$settings, (value) => {
      this.enabled = Boolean(value.canCreateNewConnections);
    });
  }

  /**
   * Called after initialization and when the layer is reattached.
   * This is where we set up event subscriptions to ensure they work properly
   * after the layer is unmounted and reattached.
   */
  protected afterInit(): void {
    // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
    this.onGraphEvent("pointerdown", this.handlePointerDown, {
      capture: true,
    });

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  public enable = () => {
    this.enabled = true;
  };

  public disable = () => {
    this.enabled = false;
  };

  protected handlePointerDown = (nativeEvent: GraphPointerEvent) => {
    const target = nativeEvent.detail.target;
    const event = extractNativeGraphPointerEvent(nativeEvent);
    if (!event || !target || !this.root?.ownerDocument) {
      return;
    }
    if (
      this.enabled &&
      ((this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors") && target instanceof Anchor) ||
        (isShiftKeyEvent(event) && isBlock(target)))
    ) {
      // Get the source component state
      const sourceComponent = target.connectedState;

      // Check if connection is allowed using the validation function if provided
      if (this.props.isConnectionAllowed && !this.props.isConnectionAllowed(sourceComponent)) {
        return;
      }

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.root.ownerDocument)
        .on(EVENTS.DRAG_START, (dStartEvent: PointerEvent) => {
          this.onStartConnection(dStartEvent, this.context.graph.getPointInCameraSpace(dStartEvent));
        })
        .on(EVENTS.DRAG_UPDATE, (dUpdateEvent: PointerEvent) =>
          this.onMoveNewConnection(dUpdateEvent, this.context.graph.getPointInCameraSpace(dUpdateEvent))
        )
        .on(EVENTS.DRAG_END, (dEndEvent: PointerEvent) =>
          this.onEndNewConnection(this.context.graph.getPointInCameraSpace(dEndEvent))
        );
    }
  };

  protected renderEndpoint(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    if (!this.target && this.props.createIcon) {
      renderSVG(
        {
          path: this.props.createIcon.path,
          width: this.props.createIcon.width,
          height: this.props.createIcon.height,
          iniatialWidth: this.props.createIcon.viewWidth,
          initialHeight: this.props.createIcon.viewHeight,
        },
        ctx,
        { x: this.connectionState.tx, y: this.connectionState.ty - 12, width: 24, height: 24 }
      );
    } else if (this.props.point) {
      ctx.fillStyle = this.props.point.fill || this.context.colors.canvas.belowLayerBackground;
      if (this.props.point.stroke) {
        ctx.strokeStyle = this.props.point.stroke;
      }

      renderSVG(
        {
          path: this.props.point.path,
          width: this.props.point.width,
          height: this.props.point.height,
          iniatialWidth: this.props.point.viewWidth,
          initialHeight: this.props.point.viewHeight,
        },
        ctx,
        { x: this.connectionState.tx, y: this.connectionState.ty - 12, width: 24, height: 24 }
      );
    }
    ctx.closePath();
  }

  protected render() {
    this.resetTransform();
    if (!this.connectionState.sx && !this.connectionState.sy && !this.connectionState.tx && !this.connectionState.ty) {
      return;
    }

    if (this.props.drawLine) {
      const { path, style } = this.props.drawLine(
        { x: this.connectionState.sx, y: this.connectionState.sy },
        { x: this.connectionState.tx, y: this.connectionState.ty }
      );

      this.context.ctx.strokeStyle = style.color;
      this.context.ctx.setLineDash(style.dash);
      this.context.ctx.stroke(path);
    } else {
      this.context.ctx.beginPath();
      this.context.ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      this.context.ctx.moveTo(this.connectionState.sx, this.connectionState.sy);
      this.context.ctx.lineTo(this.connectionState.tx, this.connectionState.ty);
      this.context.ctx.stroke();
      this.context.ctx.closePath();
    }

    render(this.context.ctx, (ctx) => {
      this.renderEndpoint(ctx);
    });
  }

  private getBlockId(component: BlockState | AnchorState) {
    if (component instanceof AnchorState) {
      return component.blockId;
    }
    return component.id;
  }

  private getAnchorId(component: BlockState | AnchorState) {
    if (component instanceof AnchorState) {
      return component.id;
    }
    return undefined;
  }

  private onStartConnection(event: PointerEvent, point: Point) {
    const sourceComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);

    if (!sourceComponent) {
      return;
    }

    this.sourceComponent = sourceComponent.connectedState;

    const xy = getXY(this.context.graphCanvas, event);
    this.connectionState = {
      ...this.connectionState,
      sx: xy[0],
      sy: xy[1],
    };

    this.context.graph.executеDefaultEventAction(
      "connection-create-start",
      {
        blockId:
          sourceComponent instanceof Anchor
            ? sourceComponent.connectedState.blockId
            : sourceComponent.connectedState.id,
        anchorId: sourceComponent instanceof Anchor ? sourceComponent.connectedState.id : undefined,
      },
      () => {
        if (sourceComponent instanceof Block) {
          this.context.graph.api.selectBlocks([this.sourceComponent.id], true, ESelectionStrategy.REPLACE);
        } else if (sourceComponent instanceof Anchor) {
          this.context.graph.api.setAnchorSelection(sourceComponent.props.blockId, sourceComponent.props.id, true);
        }
      }
    );

    this.performRender();
  }

  private onMoveNewConnection(event: PointerEvent, point: Point) {
    const newTargetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    const xy = getXY(this.context.graphCanvas, event);

    this.connectionState = {
      ...this.connectionState,
      tx: xy[0],
      ty: xy[1],
    };
    this.performRender();

    if (!newTargetComponent || !newTargetComponent.connectedState) {
      this.target?.connectedState?.setSelection(false);
      this.target = undefined;
      return;
    }

    // Only process if the target has changed or if there was no previous target
    if (
      (!this.target || this.target.connectedState !== newTargetComponent.connectedState) &&
      newTargetComponent.connectedState !== this.sourceComponent
    ) {
      this.target?.connectedState?.setSelection(false);

      const target = newTargetComponent.connectedState;

      this.target = newTargetComponent;

      this.context.graph.executеDefaultEventAction(
        "connection-create-hover",
        {
          sourceBlockId:
            this.sourceComponent instanceof AnchorState ? this.sourceComponent.blockId : this.sourceComponent.id,
          sourceAnchorId: this.sourceComponent instanceof AnchorState ? this.sourceComponent.id : undefined,
          targetAnchorId: target instanceof AnchorState ? target.id : undefined,
          targetBlockId: target instanceof AnchorState ? target.blockId : target.id,
        },
        () => {
          this.target.connectedState.setSelection(true);
        }
      );
    }
  }

  private onEndNewConnection(point: Point) {
    if (!this.sourceComponent) {
      return;
    }

    const targetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    this.connectionState = {
      sx: 0,
      sy: 0,
      tx: 0,
      ty: 0,
    };
    this.performRender();

    if (!(targetComponent instanceof Block) && !(targetComponent instanceof Anchor)) {
      this.context.graph.executеDefaultEventAction(
        "connection-create-drop",
        {
          sourceBlockId: this.getBlockId(this.sourceComponent),
          sourceAnchorId: this.getAnchorId(this.sourceComponent),
          point,
        },
        () => {}
      );
      return;
    }

    if (targetComponent && targetComponent.connectedState && this.sourceComponent !== targetComponent.connectedState) {
      if (
        this.sourceComponent instanceof AnchorState &&
        targetComponent.connectedState instanceof AnchorState &&
        this.sourceComponent.blockId !== targetComponent.connectedState.blockId
      ) {
        const params = {
          sourceBlockId: this.sourceComponent.blockId,
          sourceAnchorId: this.sourceComponent.id,
          targetAnchorId: targetComponent.connectedState.id,
          targetBlockId: targetComponent.connectedState.blockId,
        };
        this.context.graph.executеDefaultEventAction("connection-created", params, () => {
          this.context.graph.rootStore.connectionsList.addConnection(params);
        });
      } else if (this.sourceComponent instanceof BlockState && targetComponent.connectedState instanceof BlockState) {
        const params = {
          sourceBlockId: this.sourceComponent.id,
          targetBlockId: targetComponent.connectedState.id,
        };
        this.context.graph.executеDefaultEventAction("connection-created", params, () => {
          this.context.graph.rootStore.connectionsList.addConnection(params);
        });
      }
      this.sourceComponent.setSelection(false);
      targetComponent.connectedState.setSelection(false);
    }

    this.context.graph.executеDefaultEventAction(
      "connection-create-drop",
      {
        sourceBlockId: this.getBlockId(this.sourceComponent),
        sourceAnchorId: this.getAnchorId(this.sourceComponent),
        targetBlockId: this.getBlockId(targetComponent.connectedState),
        targetAnchorId: this.getAnchorId(targetComponent.connectedState),
        point,
      },
      () => {}
    );
  }
}

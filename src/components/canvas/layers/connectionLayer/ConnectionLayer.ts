import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
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
};

declare module "../../../../graphEvents" {
  interface GraphEventsDefinitions {
    /**
     * Event reporting on connection pull out of a block/block's anchor.
     * Preventing this event will prevent the connection from being created.
     */
    "connection-create-start": (
      event: CustomEvent<{
        blockId: TBlockId;
        anchorId: string | undefined;
      }>
    ) => void;

    /**
     * Event fires on pulled out connection hover on block or anchor
     * Preventing prevent connection creation.
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
     * Event fires when a connection is successfully created
     * By default, this adds the connection to connectionsList
     * Preventing this event will prevent the connection from being added
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
     * Event fires when the user drops the connection endpoint
     * This happens regardless of whether a connection was created
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
 * ConnectionLayer provides functionality for creating and visualizing connections
 * between blocks and anchors in a graph.
 *
 * Features:
 * - Create connections through an intuitive drag and drop interface
 * - Customize connection appearance with icons and line styles
 * - Automatic selection of connected elements
 * - Rich event system for connection lifecycle
 *
 * Connection types:
 * - Block-to-Block: Hold Shift and drag from one block to another
 * - Anchor-to-Anchor: Drag from one anchor to another
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

  constructor(props: ConnectionLayerProps) {
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

    this.enabled = Boolean(this.props.graph.rootStore.settings.getConfigFlag("canCreateNewConnections"));

    this.performRender = this.performRender.bind(this);
    this.context.graph.on("camera-change", this.performRender);
    this.context.graph.on("mousedown", this.handleMouseDown, { capture: true });
  }

  public enable = () => {
    this.enabled = true;
  };

  public disable = () => {
    this.enabled = false;
  };

  private getOwnedDocument() {
    return this.context.graph.getGraphHTML().ownerDocument;
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const target = nativeEvent.detail.target;
    const event = extractNativeGraphMouseEvent(nativeEvent);
    if (!event || !target) {
      return;
    }
    if (
      this.enabled &&
      ((this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors") && target instanceof Anchor) ||
        (isShiftKeyEvent(event) && isBlock(target)))
    ) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.getOwnedDocument())
        .on(EVENTS.DRAG_START, (dStartEvent: MouseEvent) => {
          this.onStartConnection(dStartEvent, this.context.graph.getPointInCameraSpace(dStartEvent));
        })
        .on(EVENTS.DRAG_UPDATE, (dUpdateEvent: MouseEvent) =>
          this.onMoveNewConnection(dUpdateEvent, this.context.graph.getPointInCameraSpace(dUpdateEvent))
        )
        .on(EVENTS.DRAG_END, (dEndEvent: MouseEvent) =>
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
    this.context.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.context.ctx.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);

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

  protected unmount(): void {
    this.context.graph.off("camera-change", this.performRender);
    this.context.graph.off("mousedown", this.handleMouseDown);
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

  private onStartConnection(event: MouseEvent, point: Point) {
    const sourceComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);

    if (!sourceComponent) {
      return;
    }

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
        this.sourceComponent = sourceComponent.connectedState;

        if (sourceComponent instanceof Block) {
          this.context.graph.api.selectBlocks([this.sourceComponent.id], true, ESelectionStrategy.REPLACE);
        } else if (sourceComponent instanceof Anchor) {
          this.context.graph.api.setAnchorSelection(sourceComponent.props.blockId, sourceComponent.props.id, true);
        }

        const xy = getXY(this.context.graphCanvas, event);
        this.connectionState = {
          ...this.connectionState,
          sx: xy[0],
          sy: xy[1],
        };
        this.performRender();
      }
    );
  }

  private onMoveNewConnection(event: MouseEvent, point: Point) {
    const newTargetComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);
    const xy = getXY(this.context.graphCanvas, event);
    this.target = newTargetComponent;
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

    if (
      this.target?.connectedState !== newTargetComponent.connectedState &&
      newTargetComponent.connectedState !== this.sourceComponent
    ) {
      this.target?.connectedState?.setSelection(false);

      const target = newTargetComponent.connectedState;

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
          this.target = newTargetComponent;
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

import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../../../graphEvents";
import { DragHandler } from "../../../../services/Drag/DragController";
import { DragInfo } from "../../../../services/Drag/DragInfo";
import { MagneticModifier } from "../../../../services/Drag/modifiers/MagneticModifier";
import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import { AnchorState, EAnchorType } from "../../../../store/anchor/Anchor";
import { BlockState, TBlockId } from "../../../../store/block/Block";
import { isBlock, isShiftKeyEvent } from "../../../../utils/functions";
import { render } from "../../../../utils/renderers/render";
import { renderSVG } from "../../../../utils/renderers/svgPath";
import { Point, TPoint } from "../../../../utils/types/shapes";
import { ESelectionStrategy } from "../../../../utils/types/types";
import { Anchor } from "../../../canvas/anchors";
import { Block } from "../../../canvas/blocks/Block";
import { GraphComponent } from "../../GraphComponent";

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
  /**
   * Distance threshold for block magnetism. Defaults to 50 pixels.
   */
  magnetismDistance?: number;
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

  // eslint-disable-next-line new-cap
  protected magneticModifier = MagneticModifier({
    magnetismDistance: 200,
    resolvePosition: (element: GraphComponent) => {
      if (element instanceof Block) {
        return element.getConnectionPoint("in");
      }
      if (element instanceof Anchor) {
        return element.getPosition();
      }
      return null;
    },
  });

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
   * @returns {void}
   */
  protected afterInit(): void {
    // Register event listeners with the graphOn wrapper method for automatic cleanup when unmounted
    this.onGraphEvent("mousedown", this.handleMouseDown, {
      capture: true,
    });

    // Call parent afterInit to ensure proper initialization
    super.afterInit();
  }

  /**
   * Enables connection creation functionality
   * @returns {void}
   */
  public enable = () => {
    this.enabled = true;
  };

  /**
   * Disables connection creation functionality
   * @returns {void}
   */
  public disable = () => {
    this.enabled = false;
  };

  /**
   * Handles mousedown events to initiate connection creation
   * @param {GraphMouseEvent} nativeEvent - The graph mouse event
   * @returns {void}
   */
  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const target = nativeEvent.detail.target;
    const event = extractNativeGraphMouseEvent(nativeEvent);
    if (!event || !target || !this.root?.ownerDocument) {
      return;
    }
    const useBlocksAnchors = this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors");
    if (
      this.enabled &&
      ((useBlocksAnchors && target instanceof Anchor) || (isShiftKeyEvent(event) && isBlock(target)))
    ) {
      // Get the source component state
      const sourceComponent = target.connectedState;

      // Check if connection is allowed using the validation function if provided
      if (this.props.isConnectionAllowed && !this.props.isConnectionAllowed(sourceComponent)) {
        return;
      }

      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();

      const connectionHandler: DragHandler = {
        onDragStart: (dStartEvent: MouseEvent, dragInfo: DragInfo) => {
          this.onStartConnection(dStartEvent, new Point(dragInfo.startCameraX, dragInfo.startCameraY));
        },
        onDragUpdate: (dUpdateEvent: MouseEvent, dragInfo: DragInfo) => {
          this.onMoveNewConnection(
            dUpdateEvent,
            dragInfo.adjustedEntityPosition,
            dragInfo.context?.closestTarget as Block | Anchor
          );
        },
        onDragEnd: (dEndEvent: MouseEvent, dragInfo: DragInfo) => {
          this.onEndNewConnection(dragInfo.adjustedEntityPosition, dragInfo.context?.closestTarget as Block | Anchor);
        },
      };

      this.magneticModifier.setParams({
        magnetismDistance: this.props.magnetismDistance || 80,
        targets: useBlocksAnchors ? [Anchor] : [Block],
        filter: (element: GraphComponent) => {
          if (element === target) {
            return false;
          }
          if (useBlocksAnchors) {
            if (target instanceof Anchor && element instanceof Anchor) {
              // Anchors with same type can't be connected (IN and IN or OUT and OUT)
              return target.connectedState.state.type !== element.connectedState.state.type;
            }
          }
        },
      });

      this.context.graph.dragController.start(connectionHandler, event, {
        positionModifiers: [this.magneticModifier],
      });
    }
  };

  protected renderEndpoint(ctx: CanvasRenderingContext2D, endCanvasX: number, endCanvasY: number) {
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
        { x: endCanvasX, y: endCanvasY - 12, width: 24, height: 24 }
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
        { x: endCanvasX, y: endCanvasY - 12, width: 24, height: 24 }
      );
    }
    ctx.closePath();
  }

  protected render() {
    this.resetTransform();
    if (!this.connectionState.sx && !this.connectionState.sy && !this.connectionState.tx && !this.connectionState.ty) {
      return;
    }

    const scale = this.context.camera.getCameraScale();
    const cameraRect = this.context.camera.getCameraRect();

    const startCanvasX = this.connectionState.sx * scale + cameraRect.x;
    const startCanvasY = this.connectionState.sy * scale + cameraRect.y;
    const endCanvasX = this.connectionState.tx * scale + cameraRect.x;
    const endCanvasY = this.connectionState.ty * scale + cameraRect.y;

    if (this.props.drawLine) {
      const { path, style } = this.props.drawLine(
        { x: startCanvasX, y: startCanvasY },
        { x: endCanvasX, y: endCanvasY }
      );

      this.context.ctx.strokeStyle = style.color;
      this.context.ctx.setLineDash(style.dash);
      this.context.ctx.stroke(path);
    } else {
      this.context.ctx.beginPath();
      this.context.ctx.strokeStyle = this.context.colors.connection.selectedBackground;
      this.context.ctx.moveTo(startCanvasX, startCanvasY);
      this.context.ctx.lineTo(endCanvasX, endCanvasY);
      this.context.ctx.stroke();
      this.context.ctx.closePath();
    }

    render(this.context.ctx, (ctx) => {
      this.renderEndpoint(ctx, endCanvasX, endCanvasY);
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

  private onStartConnection(event: MouseEvent, point: Point) {
    const sourceComponent = this.context.graph.getElementOverPoint(point, [Block, Anchor]);

    if (!sourceComponent) {
      return;
    }

    this.sourceComponent = sourceComponent.connectedState;

    this.connectionState = {
      ...this.connectionState,
      sx: point.x,
      sy: point.y,
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

  private onMoveNewConnection(event: MouseEvent, point: Point, newTargetComponent?: Block | Anchor) {
    // Update connection state with adjusted position from magnetism
    this.connectionState = {
      ...this.connectionState,
      tx: point.x,
      ty: point.y,
    };
    this.performRender();

    if (!newTargetComponent || !newTargetComponent.connectedState) {
      this.target?.connectedState?.setSelection(false);
      this.target = undefined;
      return;
    }

    // Only process if the target has changed or if there was no previous target
    // Also ensure we're not targeting the source component
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

  private onEndNewConnection(point: Point, targetComponent?: Block | Anchor) {
    if (!this.sourceComponent) {
      return;
    }

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

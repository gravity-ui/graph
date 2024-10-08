import { Emitter } from "../../utils/Emitter";
import { EVENTS } from "../../utils/types/events";
import { Point } from "../../utils/types/shapes";
import { Block } from "../../components/canvas/blocks/Block";
import { BlockState, TBlockId } from "../../store/block/Block";
import { AnchorState } from "../../store/anchor/Anchor";
import { Anchor } from "../../components/canvas/anchors";
import { type Graph } from "../../graph";
import { GraphMouseEvent, extractNativeGraphMouseEvent } from "../../graphEvents";
import { dragListener } from "../../utils/functions/dragListener";
import { isBlock, isShiftKeyEvent } from "../../utils/functions";
import { ESelectionStrategy } from "../../utils/types/types";

declare module "../../graphEvents" {
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

    "connection-created": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId?: string;
        targetBlockId: TBlockId;
        targetAnchorId?: string;
      }>
    ) => void;
    "connection-create-drop": (
      event: CustomEvent<{
        sourceBlockId: TBlockId;
        sourceAnchorId: string;
        targetBlockId?: TBlockId;
        targetAnchorId?: string;
        point: Point
      }>
    ) => void;
  }
}

export class ConnectionService extends Emitter {
  private sourceComponent: BlockState | AnchorState;

  private targetComponent: BlockState | AnchorState;

  protected unmountCbs = [];

  public constructor(protected graph: Graph) {
    super();

    this.unmountCbs.push(this.graph.on("mousedown", this.handleMouseDown));
  }

  protected handleMouseDown = (nativeEvent: GraphMouseEvent) => {
    const target = nativeEvent.detail.target;
    const event = extractNativeGraphMouseEvent(nativeEvent);
    if (!event || !target) {
      return;
    }
    if (
      (this.graph.rootStore.settings.getConfigFlag("useBlocksAnchors") && target instanceof Anchor) ||
      (isShiftKeyEvent(event) &&
        isBlock(target) &&
        this.graph.rootStore.settings.getConfigFlag("canCreateNewConnections"))
    ) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
      dragListener(this.getOwnedDocument())
        .on(EVENTS.DRAG_START, (event: MouseEvent) => {
          this.onStartConnection(event, this.graph.getPointInCameraSpace(event));
        })
        .on(EVENTS.DRAG_UPDATE, (event: MouseEvent) =>
          this.onMoveNewConnection(event, this.graph.getPointInCameraSpace(event))
        )
        .on(EVENTS.DRAG_END, (event: MouseEvent) => this.onEndNewConnection(this.graph.getPointInCameraSpace(event)));
    }
  };

  protected getCanvas() {
    return this.graph.getGraphCanvas();
  }
  protected getOwnedDocument() {
    return this.graph.getGraphHTML().ownerDocument;
  }

  /**
   * Handle the start of a new connection creation.
   *
   * @fires Graph:connection-create-start
   *  */
  public onStartConnection(event: MouseEvent, point: Point) {
    const sourceComponent = this.graph.getElementOverPoint(point, [Block, Anchor]);

    if (!sourceComponent) {
      return;
    }

    this.graph.executеDefaultEventAction(
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
          this.graph.api.selectBlocks([this.sourceComponent.id], true, ESelectionStrategy.REPLACE);
        } else if (sourceComponent instanceof Anchor) {
          this.graph.api.setAnchorSelection(sourceComponent.props.blockId, sourceComponent.props.id, true);
        }
        this.emit(EVENTS.NEW_CONNECTION_START, event);
      }
    );
  }

  public onMoveNewConnection(event: MouseEvent, point: Point) {
    this.emit(EVENTS.NEW_CONNECTION_UPDATE, event);

    const newTargetComponent = this.graph.getElementOverPoint(point, [Block, Anchor]);

    if (!(newTargetComponent instanceof Block) || !(newTargetComponent instanceof Anchor)) {
      return;
    }

    /* Unset selection on move new selection target-point out of components */
    if (!newTargetComponent || !newTargetComponent.connectedState) {
      this.targetComponent?.setSelection(false);
      this.targetComponent = undefined;
    }

    if (
      this.targetComponent !== newTargetComponent?.connectedState &&
      newTargetComponent.connectedState !== this.sourceComponent
    ) {
      this.targetComponent?.setSelection(false);

      const target = newTargetComponent.connectedState;

      this.graph.executеDefaultEventAction(
        "connection-create-hover",
        {
          sourceBlockId:
            this.sourceComponent instanceof Anchor
              ? this.sourceComponent.connectedState.blockId
              : this.sourceComponent.id,
          sourceAnchorId: this.sourceComponent instanceof Anchor ? this.sourceComponent.connectedState.id : undefined,
          targetAnchorId: target instanceof Anchor ? target.connectedState.id : undefined,
          targetBlockId: target instanceof Anchor ? target.connectedState.blockId : target.id,
        },
        () => {
          this.targetComponent = newTargetComponent.connectedState;
          this.targetComponent.setSelection(true);
        }
      );
    }
  }

  protected getBlockId(component: BlockState | AnchorState) {
    if (component instanceof AnchorState) {
      return component.blockId;
    }
    return component.id;
  }

  protected getAnchorId(component: BlockState | AnchorState) {
    if (component instanceof AnchorState) {
      return component.id;
    }
    return undefined;
  }

  public onEndNewConnection(point: Point) {
    if (!this.sourceComponent) {
      return;
    }
    const targetComponent = this.graph.getElementOverPoint(point, [Block, Anchor]);
    this.emit(EVENTS.NEW_CONNECTION_END);

    if (!(targetComponent instanceof Block) && !(targetComponent instanceof Anchor)) {
      this.graph.executеDefaultEventAction(
        "connection-create-drop",
        {
          sourceBlockId: this.getBlockId(this.sourceComponent),
          sourceAnchorId: this.getAnchorId(this.sourceComponent),
          point,
        },
        () => { }
      );
      return;
    }
    if (
      targetComponent &&
      targetComponent.connectedState &&
      this.sourceComponent !== targetComponent.connectedState
    ) {
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
        this.graph.executеDefaultEventAction("connection-created", params, () => {
          this.graph.rootStore.connectionsList.addConnection(params);
        });
      } else if (this.sourceComponent instanceof BlockState && targetComponent.connectedState instanceof BlockState) {
        this.graph.executеDefaultEventAction(
          "connection-created",
          {
            sourceBlockId: this.sourceComponent.id,
            targetBlockId: targetComponent.connectedState.id,
          },
          () => {
            this.graph.rootStore.connectionsList.addConnection({
              sourceBlockId: this.sourceComponent.id,
              targetBlockId: targetComponent.connectedState.id,
            });
          }
        );
      }
      this.sourceComponent.setSelection(false);
      targetComponent.connectedState.setSelection(false);
    }
    debugger;
    this.graph.executеDefaultEventAction(
      "connection-create-drop",
      {
        sourceBlockId: this.getBlockId(this.sourceComponent),
        sourceAnchorId: this.getAnchorId(this.sourceComponent),
        targetBlockId: this.getBlockId(targetComponent.connectedState),
        targetAnchorId: this.getAnchorId(targetComponent.connectedState),
        point,
      },
      () => { }
    );
  }

  public unmount() {
    this.unmountCbs?.forEach((cb) => cb?.());
  }
}

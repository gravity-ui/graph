import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { DragContext, DragDiff } from "../../../services/drag";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { selectBlockAnchor } from "../../../store/block/selectors";
import { PortState } from "../../../store/connection/port/Port";
import { TPoint } from "../../../utils/types/shapes";
import { GraphComponent, TGraphComponentProps } from "../GraphComponent";
import { GraphLayer } from "../layers/graphLayer/GraphLayer";

export type TAnchorId = string | number;
export type TAnchor = {
  id: string;
  blockId: TBlockId;
  type: EAnchorType | string;
  index?: number;
};

export type TAnchorProps = TGraphComponentProps &
  TAnchor & {
    size: number;
    lineWidth: number;
    zIndex: number;
    port: PortState;
  };

type TAnchorState = {
  size: number;
  raised: boolean;
  selected: boolean;
};

export class Anchor<T extends TAnchorProps = TAnchorProps> extends GraphComponent<T, TAnchorState> {
  public readonly cursor = "pointer";

  public get zIndex() {
    // @ts-ignore this.__comp.parent instanceOf Block
    return this.__comp.parent.zIndex + 1;
  }

  public connectedState: AnchorState;

  private shift: number;

  constructor(props: T, parent: GraphLayer) {
    super(props, parent);
    this.state = { size: props.size, raised: false, selected: false };

    this.connectedState = selectBlockAnchor(this.context.graph, props.blockId, props.id);
    this.connectedState.setViewComponent(this);

    this.addEventListener("click", this);
    this.addEventListener("mouseenter", this);
    this.addEventListener("mousedown", this);
    this.addEventListener("mouseleave", this);

    this.computeRenderSize(this.props.size, this.state.raised);
    this.shift = this.props.size / 2 + props.lineWidth;
  }

  protected willMount(): void {
    this.props.port.addObserver(this);
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });
    this.subscribeSignal(this.props.port.$point, this.onPositionChanged);
  }

  protected onPositionChanged = (point: TPoint) => {
    this.setHitBox(point.x - this.shift, point.y - this.shift, point.x + this.shift, point.y + this.shift);
  };

  public getPosition() {
    return this.props.port.getPoint();
  }

  public toggleSelected() {
    this.connectedState.setSelection(!this.state.selected);
  }

  /**
   * Anchor is draggable only when connection creation is disabled.
   * When connections can be created via anchors, dragging is handled by ConnectionLayer.
   */
  public override isDraggable(): boolean {
    // If connection creation via anchors is enabled, anchor is not draggable
    // (ConnectionLayer handles the interaction instead)
    if (this.context.graph.rootStore.settings.getConfigFlag("canCreateNewConnections")) {
      return false;
    }

    // Otherwise, delegate drag to parent block
    return true;
  }

  public override handleDragStart(context: DragContext): void {
    this.connectedState.block.getViewComponent()?.handleDragStart(context);
  }

  public override handleDrag(diff: DragDiff, context: DragContext): void {
    this.connectedState.block.getViewComponent()?.handleDrag(diff, context);
  }

  public override handleDragEnd(context: DragContext): void {
    this.connectedState.block.getViewComponent()?.handleDragEnd(context);
  }

  protected isVisible() {
    const params = this.getHitBox();
    return params ? this.context.camera.isRectVisible(...params) : true;
  }

  protected unmount() {
    this.props.port.removeObserver(this);
    super.unmount();
  }

  public handleEvent(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    switch (event.type) {
      case "click": {
        this.toggleSelected();
        break;
      }
      case "mouseenter": {
        this.setState({ raised: true });
        this.computeRenderSize(this.props.size, true);
        break;
      }
      case "mouseleave": {
        this.setState({ raised: false });
        this.computeRenderSize(this.props.size, false);
        break;
      }
    }
  }

  private computeRenderSize(size: number, raised: boolean) {
    if (raised) {
      this.setState({ size: size * 1.8 });
    } else {
      this.setState({ size });
    }
  }

  protected render() {
    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return;
    }
    const { x, y } = this.getPosition();
    const ctx = this.context.ctx;
    ctx.fillStyle = this.context.colors.anchor.background;
    ctx.beginPath();
    ctx.arc(x, y, this.state.size * 0.5, 0, 2 * Math.PI);
    ctx.fill();

    if (this.state.selected) {
      ctx.strokeStyle = this.context.colors.anchor.selectedBorder;
      ctx.lineWidth = this.props.lineWidth + 3;
      ctx.stroke();
    }
    ctx.closePath();
  }
}

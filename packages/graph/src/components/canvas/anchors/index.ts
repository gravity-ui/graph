import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { DragContext, DragDiff } from "../../../services/drag";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { selectBlockAnchor } from "../../../store/block/selectors";
import { PortState } from "../../../store/connection/port/Port";
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

  public static CANVAS_HOVER_FACTOR = 1.8;
  public static DETAILED_HOVER_FACTOR = 1.2;

  public getEntityId(): number | string {
    return this.props.id;
  }

  public get zIndex() {
    // @ts-ignore this.__comp.parent instanceOf Block
    return this.__comp.parent.zIndex + 1;
  }

  public connectedState: AnchorState;

  private shift = 0;

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
  }

  public getHoverFactor() {
    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return Anchor.DETAILED_HOVER_FACTOR;
    }
    return Anchor.CANVAS_HOVER_FACTOR;
  }

  protected stateChanged(_nextState: TAnchorState): void {
    if (this.state.size !== _nextState.size) {
      this.computeShift(_nextState, this.props);
      this.onPositionChanged();
    }
    if (this.state.raised !== _nextState.raised) {
      this.computeRenderSize(this.props.size, _nextState.raised);
    }
    super.stateChanged(_nextState);
  }

  protected propsChanged(_nextProps: T): void {
    if (this.props.lineWidth !== _nextProps.lineWidth) {
      this.computeShift(this.state, _nextProps);
      this.onPositionChanged();
    }
    super.propsChanged(_nextProps);
  }

  protected willMount(): void {
    this.props.port.setOwner(this);
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });
    this.subscribeSignal(this.props.port.$point, this.onPositionChanged);
    this.computeShift(this.state, this.props);
    this.onPositionChanged();
    super.willMount();
  }

  protected computeShift(state = this.state, props = this.props) {
    this.shift = state.size / 2 + props.lineWidth;
  }

  protected onPositionChanged = () => {
    const { x, y } = this.getPosition();
    this.setHitBox(x - this.shift, y - this.shift, x + this.shift, y + this.shift);
  };

  public override getPorts(): PortState[] {
    return [this.props.port];
  }

  /**
   * Get the position of the anchor.
   * Returns the position of the anchor in the coordinate system of the graph(ABSOLUTE).
   *
   * Example:
   * ```ts
   * const pos = anchor.getPosition(); // { x: 100, y: 100 }
   * ```
   * port.getPoint is used port.$state.value so you can use this method in signals effect and compute.
   * ```ts
   * computed(() => {
   *   return anchor.getPosition().x + 10; // { x: 110, y: 100 }
   * });
   * ```
   * @returns The position of the anchor in the coordinate system of the graph(ABSOLUTE).
   */
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
    this.props.port.removeOwner();
    this.connectedState.unsetViewComponent();
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
        break;
      }
      case "mouseleave": {
        this.setState({ raised: false });
        break;
      }
    }
  }

  private computeRenderSize(size: number, raised: boolean) {
    if (raised) {
      this.setState({ size: size * this.getHoverFactor() });
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

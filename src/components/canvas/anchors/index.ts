import { ESchedulerPriority } from "../../../lib";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { DragContext, DragDiff } from "../../../services/drag";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { selectBlockAnchor } from "../../../store/block/selectors";
import { debounce } from "../../../utils/functions";
import { TPoint } from "../../../utils/types/shapes";
import { GraphComponent, TGraphComponentProps } from "../GraphComponent";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

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
    getPosition: (anchor: TAnchor) => TPoint;
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

  public declare state: TAnchorState;

  public declare props: T;

  public declare context: TGraphLayerContext;

  public connectedState: AnchorState;

  private shift: number;

  private hitBoxHash: string;

  private debouncedSetHitBox = debounce(
    () => {
      const { x, y } = this.props.getPosition(this.props);
      this.setHitBox(x - this.shift, y - this.shift, x + this.shift, y + this.shift);
    },
    {
      priority: ESchedulerPriority.HIGHEST,
      frameInterval: 4,
    }
  );

  constructor(props: T, parent: GraphLayer) {
    super(props, parent);
    this.state = { size: props.size, raised: false, selected: false };

    this.connectedState = selectBlockAnchor(this.context.graph, props.blockId, props.id);
    this.connectedState.setViewComponent(this);
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });

    this.addEventListener("click", this);
    this.addEventListener("mouseenter", this);
    this.addEventListener("mousedown", this);
    this.addEventListener("mouseleave", this);

    this.computeRenderSize(this.props.size, this.state.raised);
    this.shift = this.props.size / 2 + props.lineWidth;
  }

  public getPosition() {
    return this.props.getPosition(this.props);
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
    super.unmount();
    this.debouncedSetHitBox.cancel();
  }

  public didIterate(): void {
    const { x: poxX, y: posY } = this.props.getPosition(this.props);
    const hash = `${poxX}/${posY}/${this.shift}`;

    if (this.hitBoxHash !== hash) {
      this.hitBoxHash = hash;
      this.debouncedSetHitBox();
    }
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
    const { x, y } = this.props.getPosition(this.props);
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

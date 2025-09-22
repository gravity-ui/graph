import { ESchedulerPriority } from "../../../lib";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { selectBlockAnchor } from "../../../store/block/selectors";
import { debounce, isMetaKeyEvent } from "../../../utils/functions";
import { TPoint } from "../../../utils/types/shapes";
import { GraphComponent, TGraphComponentProps } from "../GraphComponent";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

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
    this.subscribeSignal(this.connectedState.$selected, (selected) => {
      this.setState({ selected });
    });

    this.addEventListener("tap", this);
    this.addEventListener("pointerenter", this);
    this.addEventListener("pointerdown", this);
    this.addEventListener("pointerleave", this);

    this.computeRenderSize(this.props.size, this.state.raised);
    this.shift = this.props.size / 2 + props.lineWidth;
  }

  public getPosition() {
    return this.props.getPosition(this.props);
  }

  public toggleSelected() {
    this.connectedState.setSelection(!this.state.selected);
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
      case "tap":
      case "click": {
        const { blocksList, connectionsList } = this.context.graph.rootStore;
        const isAnyBlockSelected = blocksList.$selectedBlocks.value.length !== 0;
        const isAnyConnectionSelected = connectionsList.$selectedConnections.value.size !== 0;

        if (!isMetaKeyEvent(event) && isAnyBlockSelected) {
          blocksList.resetSelection();
        }

        if (!isMetaKeyEvent(event) && isAnyConnectionSelected) {
          connectionsList.resetSelection();
        }

        this.toggleSelected();
        break;
      }
      case "pointerenter":
      case "mouseenter": {
        this.setState({ raised: true });
        this.computeRenderSize(this.props.size, true);
        break;
      }
      case "pointerleave":
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

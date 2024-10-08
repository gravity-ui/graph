import { EventedComponent } from "../../../mixins/withEvents";
import { withHitTest } from "../../../mixins/withHitTest";
import { ECameraScaleLevel } from "../../../services/camera/CameraService";
import { frameDebouncer } from "../../../services/optimizations/frameDebouncer";
import { AnchorState, EAnchorType } from "../../../store/anchor/Anchor";
import { TBlockId } from "../../../store/block/Block";
import { selectBlockAnchor } from "../../../store/block/selectors";
import { render } from "../../../utils/renderers/render";
import { TPoint } from "../../../utils/types/shapes";
import { GraphLayer, TGraphLayerContext } from "../layers/graphLayer/GraphLayer";

export type TAnchor = {
  id: string;
  blockId: TBlockId;
  type: EAnchorType | string;
  index: number;
};

export type TAnchorProps = TAnchor & {
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

export class Anchor extends withHitTest(EventedComponent) {

  public readonly cursor = 'pointer';

  public get zIndex() {
    // @ts-ignore this.__comp.parent instanceOf Block
    return this.__comp.parent.zIndex + 1;
  }

  public declare state: TAnchorState;

  public declare props: TAnchorProps;

  public declare context: TGraphLayerContext;

  public connectedState: AnchorState;

  private shift: number;

  private hitBoxHash: number;

  private debouncedSetHitBox: (...args: any[]) => void;

  protected readonly unsubscribe: (() => void)[] = [];

  public constructor(props: TAnchorProps, parent: GraphLayer) {
    super(props, parent);
    this.state = { size: props.size, raised: false, selected: false };

    this.connectedState = selectBlockAnchor(this.context.graph, props.blockId, props.id);

    if (this.connectedState) {
      this.unsubscribe = this.subscribe();
    }

    this.debouncedSetHitBox = frameDebouncer.add(this.bindedSetHitBox.bind(this), {
      delay: 4,
      lightFrame: true,
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

  protected subscribe() {
    return [
      this.connectedState.$selected.subscribe((selected) => {
        this.setState({ selected });
      }),
    ];
  }

  protected unmount() {
    this.unsubscribe.forEach((reactionDisposer) => reactionDisposer());

    super.unmount();
  }

  public toggleSelected() {
    this.connectedState.setSelection(!this.state.selected);
  }

  public willIterate() {
    super.willIterate();
    const { x, y, width, height } = this.hitBox.getRect();

    this.shouldRender = width && height ? this.context.camera.isRectVisible(x, y, width, height) : true;
  }

  public handleEvent(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    switch (event.type) {
      case "click":
        this.toggleSelected();
        break;
      case "mouseenter":
        this.setState({ raised: true });
        this.computeRenderSize(this.props.size, true);
        break;
      case "mouseleave":
        this.setState({ raised: false });
        this.computeRenderSize(this.props.size, false);
        break;
    }
  }

  public bindedSetHitBox() {
    const { x, y } = this.props.getPosition(this.props);
    this.setHitBox(x - this.shift, y - this.shift, x + this.shift, y + this.shift);
  }

  public didRender() {
    super.didRender();
    const { x, y } = this.props.getPosition(this.props);

    const hash = x / y + this.shift;

    if (this.hitBoxHash !== hash) {
      this.hitBoxHash = hash;
      this.debouncedSetHitBox();
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
    // debugHitBox(this.context.ctx, this);

    if (this.context.camera.getCameraBlockScaleLevel() === ECameraScaleLevel.Detailed) {
      return;
    }
    const { x, y } = this.props.getPosition(this.props);
    render(this.context.ctx, (ctx) => {
      ctx.save();
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
    })
  }
}

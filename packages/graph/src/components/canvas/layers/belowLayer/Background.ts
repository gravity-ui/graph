import { ESchedulerPriority } from "../../../../lib";
import { Component, TComponentProps, TComponentState } from "../../../../lib/Component";
import { debounce } from "../../../../utils/functions";
import { IRect, Rect, TRect } from "../../../../utils/types/shapes";

import { TBelowLayerContext } from "./BelowLayer";
import { PointerGrid } from "./PointerGrid";

type TBackgroundState = TComponentState & TRect;

export class Background extends Component<TComponentProps, TBackgroundState, TBelowLayerContext> {
  private extendedUsableRect: IRect = new Rect(0, 0, 0, 0);

  protected readonly unsubscribe: () => void;

  constructor(props: {}, parent: Component) {
    super(props, parent);

    this.unsubscribe = this.subscribe();
  }

  public render() {
    const cameraState = this.context.camera.getCameraState();
    this.context.ctx.fillStyle = this.context.colors.canvas.belowLayerBackground;
    this.context.ctx.fillRect(
      -cameraState.relativeX,
      -cameraState.relativeY,
      cameraState.relativeWidth,
      cameraState.relativeHeight
    );

    this.context.ctx.lineWidth = Math.floor(3 / cameraState.scale);
    this.context.ctx.strokeStyle = this.context.colors.canvas.border;
    this.context.ctx.strokeRect(this.state.x, this.state.y, this.state.width, this.state.height);

    this.context.ctx.fillStyle = this.context.colors.canvas.layerBackground;

    this.context.ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);

    this.context.ctx.fillStyle = "black";
    this.context.ctx.font = "48px serif";
    return;
  }

  protected subscribe() {
    return this.context.graph.hitTest.onUsableRectUpdate(this.setupExtendedUsableRect);
  }

  protected stateChanged(_nextState: TBackgroundState): void {
    this.shouldUpdateChildren = true;
    super.stateChanged(_nextState);
  }

  private setupExtendedUsableRect = debounce(
    (usableRect: TRect) => {
      if (usableRect.x - this.context.constants.system.USABLE_RECT_GAP !== this.extendedUsableRect.x) {
        this.setState({
          x: usableRect.x - this.context.constants.system.USABLE_RECT_GAP,
        });
      }
      if (usableRect.y - this.context.constants.system.USABLE_RECT_GAP !== this.extendedUsableRect.y) {
        this.setState({
          y: usableRect.y - this.context.constants.system.USABLE_RECT_GAP,
        });
      }
      if (usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2 !== this.extendedUsableRect.width) {
        this.setState({
          width: usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2,
        });
      }
      if (usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2 !== this.extendedUsableRect.height) {
        this.setState({
          height: usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2,
        });
      }
    },
    {
      priority: ESchedulerPriority.HIGHEST,
    }
  );

  protected unmount() {
    super.unmount();
    this.setupExtendedUsableRect.cancel();
    this.unsubscribe();
  }

  public updateChildren() {
    return [
      PointerGrid.create({
        x: this.state.x,
        y: this.state.y,
        width: this.state.width,
        height: this.state.height,
      }),
    ];
  }
}

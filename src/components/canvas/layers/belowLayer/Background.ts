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

  protected usableRectPath = new Path2D();

  constructor(props: {}, parent: Component) {
    super(props, parent);

    this.unsubscribe = this.subscribe();
  }

  public render() {
    super.render();
    const cameraState = this.context.camera.getCameraState();
    this.context.ctx.fillStyle = this.context.colors.canvas.belowLayerBackground;
    this.context.ctx.fillRect(
      -cameraState.relativeX,
      -cameraState.relativeY,
      cameraState.relativeWidth,
      cameraState.relativeHeight
    );

    this.context.ctx.lineWidth = this.context.camera.limitScaleEffect(3, 15);
    this.context.ctx.strokeStyle = this.context.colors.canvas.border;
    this.context.ctx.fillStyle = this.context.colors.canvas.layerBackground;
    this.context.ctx.fill(this.usableRectPath);
    this.context.ctx.stroke(this.usableRectPath);
  }

  protected subscribe() {
    return this.context.graph.hitTest.onUsableRectUpdate(this.setupExtendedUsableRect);
  }

  protected isGeometryChanged(nextState: TBackgroundState) {
    return (
      nextState.x !== this.state.x ||
      nextState.y !== this.state.y ||
      nextState.height !== this.state.height ||
      nextState.width !== this.state.width
    );
  }

  protected stateChanged(nextState: TBackgroundState): void {
    if (this.isGeometryChanged(nextState)) {
      this.usableRectPath = new Path2D();
      this.usableRectPath.rect(nextState.x, nextState.y, nextState.width, nextState.height);
      this.shouldUpdateChildren = true;
    }
    super.stateChanged(nextState);
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

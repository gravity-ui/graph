import { Component, TComponentProps, TComponentState } from "../../../../lib/Component";
import { IRect, Rect, TRect } from "../../../../utils/types/shapes";

import { TBelowLayerContext } from "./BelowLayer";
import { PointerGrid } from "./PointerGrid";

type TBackgroundState = TComponentState & {
  extendedUsableRectX: number;
  extendedUsableRectY: number;
  extendedUsableRectWidth: number;
  extendedUsableRectHeight: number;
};

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
    this.context.ctx.strokeRect(
      this.state.extendedUsableRectX,
      this.state.extendedUsableRectY,
      this.state.extendedUsableRectWidth,
      this.state.extendedUsableRectHeight
    );

    this.context.ctx.fillStyle = this.context.colors.canvas.layerBackground;

    this.context.ctx.fillRect(
      this.state.extendedUsableRectX,
      this.state.extendedUsableRectY,
      this.state.extendedUsableRectWidth,
      this.state.extendedUsableRectHeight
    );

    this.context.ctx.fillStyle = "black";
    this.context.ctx.font = "48px serif";
    return;
  }

  protected subscribe() {
    return this.context.graph.hitTest.usableRect.subscribe((usableRect) => {
      this.setupExtendedUsableRect(usableRect);
    });
  }

  protected stateChanged(_nextState: TBackgroundState): void {
    this.shouldUpdateChildren = true;
    super.stateChanged(_nextState);
  }

  private setupExtendedUsableRect(usableRect: TRect) {
    if (usableRect.x - this.context.constants.system.USABLE_RECT_GAP !== this.extendedUsableRect.x) {
      this.setState({
        extendedUsableRectX: usableRect.x - this.context.constants.system.USABLE_RECT_GAP,
      });
    }
    if (usableRect.y - this.context.constants.system.USABLE_RECT_GAP !== this.extendedUsableRect.y) {
      this.setState({
        extendedUsableRectY: usableRect.y - this.context.constants.system.USABLE_RECT_GAP,
      });
    }
    if (usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2 !== this.extendedUsableRect.width) {
      this.setState({
        extendedUsableRectWidth: usableRect.width + this.context.constants.system.USABLE_RECT_GAP * 2,
      });
    }
    if (usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2 !== this.extendedUsableRect.height) {
      this.setState({
        extendedUsableRectHeight: usableRect.height + this.context.constants.system.USABLE_RECT_GAP * 2,
      });
    }
  }

  protected unmount() {
    super.unmount();
    this.unsubscribe();
  }

  public updateChildren() {
    return [
      PointerGrid.create({
        x: this.state.extendedUsableRectX,
        y: this.state.extendedUsableRectY,
        width: this.state.extendedUsableRectWidth,
        height: this.state.extendedUsableRectHeight,
      }),
    ];
  }
}

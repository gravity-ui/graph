import { ESchedulerPriority } from "../../../../lib";
import { Component, TComponentProps, TComponentState } from "../../../../lib/Component";
import { debounce } from "../../../../utils/functions";
import { TRect } from "../../../../utils/types/shapes";

import { TBelowLayerContext } from "./BelowLayer";
import { PointerGrid } from "./PointerGrid";

type TBackgroundState = TComponentState & TRect;

export class Background extends Component<TComponentProps, TBackgroundState, TBelowLayerContext> {
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
      -cameraState.relativeX - 10,
      -cameraState.relativeY - 10,
      cameraState.relativeWidth + 20,
      cameraState.relativeHeight + 20
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

  protected isGeometryChanged(nextState: TRect, currentState: TRect = this.state): boolean {
    return (
      nextState.x !== currentState.x ||
      nextState.y !== currentState.y ||
      nextState.height !== currentState.height ||
      nextState.width !== currentState.width
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
      const gap = this.context.constants.system.USABLE_RECT_GAP;
      const extendedUsableRect: TRect = {
        x: usableRect.x - gap,
        y: usableRect.y - gap,
        width: usableRect.width + gap * 2,
        height: usableRect.height + gap * 2,
      };

      if (this.isGeometryChanged(extendedUsableRect, this.getState())) {
        this.setState(extendedUsableRect);
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

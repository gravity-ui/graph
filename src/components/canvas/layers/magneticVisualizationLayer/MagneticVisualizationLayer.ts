import { Layer, LayerContext, LayerProps } from "../../../../services/Layer";
import type { MagneticDragStrategy, MagneticUpdateDetail } from "../../../../services/drag/strategies";
import { render } from "../../../../utils/renderers/render";

export class MagneticVisualizationLayer extends Layer<
  LayerProps,
  LayerContext & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
> {
  private strategy: MagneticDragStrategy | null = null;

  private snapData: MagneticUpdateDetail | null = null;

  private signalUnsubscribe: (() => void) | null = null;

  constructor(props: LayerProps) {
    super({
      canvas: {
        zIndex: 5,
        classNames: ["no-pointer-events"],
        transformByCameraPosition: true,
        ...props.canvas,
      },
      ...props,
    });

    this.setContext({
      canvas: this.getCanvas(),
      ctx: this.getCanvas().getContext("2d"),
    });
  }

  protected afterInit(): void {
    this.onGraphEvent("magnetic-start", this.handleMagneticStart);
    this.onGraphEvent("magnetic-end", this.handleMagneticEnd);
    this.onGraphEvent("block-drag-end", this.handleDragEnd);

    super.afterInit();
  }

  private handleDragEnd = (): void => {
    this.clearStrategy();
  };

  private handleMagneticStart = (event: CustomEvent<{ strategy: MagneticDragStrategy }>): void => {
    this.clearSignalSubscription();

    const { strategy } = event.detail;
    this.strategy = strategy;

    this.signalUnsubscribe = strategy.$snapData.subscribe((value) => {
      this.snapData = value;
      this.performRender();
    });
    this.snapData = strategy.$snapData.value;
    this.performRender();
  };

  private handleMagneticEnd = (event: CustomEvent<{ strategy: MagneticDragStrategy }>): void => {
    if (this.strategy && event.detail.strategy === this.strategy) {
      this.clearStrategy();
    }
  };

  private clearStrategy(): void {
    this.clearSignalSubscription();
    this.strategy = null;
    this.snapData = null;
    this.performRender();
  }

  private clearSignalSubscription(): void {
    if (this.signalUnsubscribe) {
      this.signalUnsubscribe();
      this.signalUnsubscribe = null;
    }
  }

  protected unmount(): void {
    this.clearSignalSubscription();
    this.strategy = null;
    this.snapData = null;
    super.unmount();
  }

  protected render(): void {
    super.render();
    if (!this.snapData || this.snapData.snapLines.length === 0) {
      return;
    }

    this.drawSnapLines();
  }

  private drawSnapLines(): void {
    const snapData = this.snapData;
    if (!snapData) return;

    const scale = this.context.graph.cameraService.getCameraScale();
    const lineWidth = Math.max(1, Math.round(2 / scale));

    render(this.context.ctx, (ctx) => {
      for (const line of snapData.snapLines) {
        this.drawTargetEdgeGlow(ctx, line, scale);
      }

      ctx.strokeStyle = "rgba(255, 190, 92, 0.8)";
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4 / scale, 4 / scale]);

      for (const line of snapData.snapLines) {
        ctx.beginPath();
        ctx.moveTo(line.from.x, line.from.y);
        ctx.lineTo(line.to.x, line.to.y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    });
  }

  private drawTargetEdgeGlow(
    ctx: CanvasRenderingContext2D,
    line: { targetEdgeRect: { x: number; y: number; width: number; height: number } },
    scale: number
  ): void {
    const { x, y, width, height } = line.targetEdgeRect;
    if (width <= 0 && height <= 0) return;

    const glowSize = Math.max(2, Math.round(4 / scale));
    ctx.save();
    ctx.fillStyle = "rgba(144, 238, 144, 0.25)";
    ctx.strokeStyle = "rgba(255, 215, 0, 0.6)";
    ctx.lineWidth = Math.max(1, Math.round(2 / scale));

    if (width > height) {
      ctx.fillRect(x, y - glowSize, width, height + glowSize * 2);
      ctx.strokeRect(x, y - glowSize, width, height + glowSize * 2);
    } else {
      ctx.fillRect(x - glowSize, y, width + glowSize * 2, height);
      ctx.strokeRect(x - glowSize, y, width + glowSize * 2, height);
    }

    ctx.restore();
  }
}

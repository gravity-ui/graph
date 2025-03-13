import { Component } from "../../../../lib/Component";

import { TCanvasRulerLayerContext } from "./CanvasRulerLayer";

export type TCanvasRulerProps = {
  rulerTextColor?: string;
  rulerTickColor?: string;
  rulerBackgroundColor?: string;
};

export class CanvasRuler extends Component<TCanvasRulerProps> {
  public declare context: TCanvasRulerLayerContext;

  // Constants for ruler dimensions
  private readonly RULER_WIDTH = 30; // Width of vertical ruler
  private readonly RULER_HEIGHT = 30; // Height of horizontal ruler

  // Scale steps for tick spacing
  private readonly SCALE_STEPS = [10, 100, 200, 400, 1000];

  constructor(props: TCanvasRulerProps, parent: Component) {
    super(props, parent);

    // Subscribe to color changes
    this.context.graph.on("colors-changed", () => {
      this.performRender();
    });
  }

  public render() {
    const cameraState = this.context.camera.getCameraState();
    const ctx = this.context.ctx;

    // Reset transform to render in screen coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Get colors from props or use defaults from graph colors
    const textColor = this.props.rulerTextColor || this.context.colors.block?.text || "#333333";
    const tickColor = this.props.rulerTickColor || this.context.colors.canvas?.border || "#666666";
    const backgroundColor =
      this.props.rulerBackgroundColor || this.context.colors.canvas?.belowLayerBackground || "#f0f0f0";

    // Draw rulers background
    this.drawRulerBackground(backgroundColor);

    // Draw rulers with ticks and labels
    this.drawHorizontalRuler(cameraState.scale, textColor, tickColor);
    this.drawVerticalRuler(cameraState.scale, textColor, tickColor);
  }

  private drawRulerBackground(backgroundColor: string) {
    const ctx = this.context.ctx;
    const cameraState = this.context.camera.getCameraState();

    // Draw horizontal ruler background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, cameraState.width, this.RULER_HEIGHT);

    // Draw vertical ruler background
    ctx.fillRect(0, 0, this.RULER_WIDTH, cameraState.height);
  }

  private drawHorizontalRuler(scale: number, textColor: string, tickColor: string) {
    const ctx = this.context.ctx;
    const cameraState = this.context.camera.getCameraState();
    const step = this.getTickStep(scale);

    // Calculate visible range in world coordinates
    const startX = -cameraState.x / scale;
    const endX = (cameraState.width - cameraState.x) / scale;

    // Round to nearest step
    const firstTick = Math.ceil(startX / step) * step;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = textColor;
    ctx.font = "10px Arial";
    ctx.textAlign = "center";

    // Draw ticks and labels
    for (let x = firstTick; x <= endX; x += step) {
      // Convert world coordinate to screen coordinate
      const screenX = x * scale + cameraState.x;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(screenX, this.RULER_HEIGHT);
      ctx.lineTo(screenX, this.RULER_HEIGHT - 5);
      ctx.stroke();

      // Draw label
      ctx.fillText(x.toString(), screenX, this.RULER_HEIGHT - 8);
    }

    // Draw ruler border
    ctx.strokeStyle = tickColor;
    ctx.beginPath();
    ctx.moveTo(0, this.RULER_HEIGHT);
    ctx.lineTo(cameraState.width, this.RULER_HEIGHT);
    ctx.stroke();
  }

  private drawVerticalRuler(scale: number, textColor: string, tickColor: string) {
    const ctx = this.context.ctx;
    const cameraState = this.context.camera.getCameraState();
    const step = this.getTickStep(scale);

    // Calculate visible range in world coordinates
    const startY = -cameraState.y / scale;
    const endY = (cameraState.height - cameraState.y) / scale;

    // Round to nearest step
    const firstTick = Math.ceil(startY / step) * step;

    ctx.strokeStyle = tickColor;
    ctx.fillStyle = textColor;
    ctx.font = "10px Arial";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    // Draw ticks and labels
    for (let y = firstTick; y <= endY; y += step) {
      // Convert world coordinate to screen coordinate
      const screenY = y * scale + cameraState.y;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(this.RULER_WIDTH, screenY);
      ctx.lineTo(this.RULER_WIDTH - 5, screenY);
      ctx.stroke();

      // Draw label
      ctx.fillText(y.toString(), this.RULER_WIDTH - 8, screenY);
    }

    // Draw ruler border
    ctx.strokeStyle = tickColor;
    ctx.beginPath();
    ctx.moveTo(this.RULER_WIDTH, 0);
    ctx.lineTo(this.RULER_WIDTH, cameraState.height);
    ctx.stroke();
  }

  private getTickStep(scale: number): number {
    // Determine appropriate tick step based on scale
    if (scale <= 0.1) return this.SCALE_STEPS[4]; // 1000
    if (scale <= 0.25) return this.SCALE_STEPS[3]; // 400
    if (scale <= 0.5) return this.SCALE_STEPS[2]; // 200
    if (scale <= 0.75) return this.SCALE_STEPS[1]; // 100
    return this.SCALE_STEPS[0]; // 10
  }

  protected unmount() {
    super.unmount();
  }
}

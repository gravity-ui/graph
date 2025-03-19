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

  // Available tick steps for scaling
  private readonly AVAILABLE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

  // Minimum pixel distance between ticks to prevent label overlap
  private readonly MIN_TICK_DISTANCE_PX = 30;

  constructor(props: TCanvasRulerProps, parent: Component) {
    super(props, parent);

    // Subscribe to color changes
    this.context.graph.on("colors-changed", () => {
      this.performRender();
    });
  }

  public render() {
    const cameraState = this.context.camera.getCameraState();

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

    // Draw a small square in the top-left corner with a different color or pattern
    // to visually separate the intersection
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, this.RULER_WIDTH, this.RULER_HEIGHT);

    // Add a subtle border to the intersection area
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.beginPath();
    ctx.moveTo(this.RULER_WIDTH, 0);
    ctx.lineTo(this.RULER_WIDTH, this.RULER_HEIGHT);
    ctx.lineTo(0, this.RULER_HEIGHT);
    ctx.stroke();

    // Draw origin indicator in the corner
    this.drawOriginIndicator(ctx);
  }

  private drawOriginIndicator(ctx: CanvasRenderingContext2D) {
    // Get the world origin coordinates in screen space
    const cameraState = this.context.camera.getCameraState();
    const originX = 0 * cameraState.scale + cameraState.x;
    const originY = 0 * cameraState.scale + cameraState.y;

    // Check if origin is visible in the viewport
    const isOriginVisible =
      originX >= 0 && originX <= cameraState.width && originY >= 0 && originY <= cameraState.height;

    // Draw origin indicator in the corner
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.font = "9px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Display origin coordinates or "origin" text
    if (isOriginVisible) {
      // Draw a small crosshair or dot to indicate the origin
      const cornerX = this.RULER_WIDTH / 2;
      const cornerY = this.RULER_HEIGHT / 2;

      // Draw crosshair
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.moveTo(cornerX - 5, cornerY);
      ctx.lineTo(cornerX + 5, cornerY);
      ctx.moveTo(cornerX, cornerY - 5);
      ctx.lineTo(cornerX, cornerY + 5);
      ctx.stroke();

      // Draw "0,0" text
      ctx.fillText("0,0", cornerX, cornerY);
    } else {
      // If origin is not visible, show the direction to the origin
      const cornerX = this.RULER_WIDTH / 2;
      const cornerY = this.RULER_HEIGHT / 2;

      // Determine direction to origin
      const dirX = originX < 0 ? "→" : "←";
      const dirY = originY < 0 ? "↓" : "↑";

      // Draw direction indicator
      ctx.fillText(`${dirX}${dirY}`, cornerX, cornerY);
    }
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

      // Skip drawing labels in the intersection area with vertical ruler
      const skipLabel = screenX < this.RULER_WIDTH;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(screenX, this.RULER_HEIGHT);
      ctx.lineTo(screenX, this.RULER_HEIGHT - 5);
      ctx.stroke();

      // Draw label only if not in the intersection area
      if (!skipLabel) {
        ctx.fillText(x.toString(), screenX, this.RULER_HEIGHT - 8);
      }
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

      // Skip drawing labels in the intersection area with horizontal ruler
      const skipLabel = screenY < this.RULER_HEIGHT;

      // Draw tick
      ctx.beginPath();
      ctx.moveTo(this.RULER_WIDTH, screenY);
      ctx.lineTo(this.RULER_WIDTH - 5, screenY);
      ctx.stroke();

      // Draw label only if not in the intersection area
      if (!skipLabel) {
        ctx.fillText(y.toString(), this.RULER_WIDTH - 8, screenY);
      }
    }

    // Draw ruler border
    ctx.strokeStyle = tickColor;
    ctx.beginPath();
    ctx.moveTo(this.RULER_WIDTH, 0);
    ctx.lineTo(this.RULER_WIDTH, cameraState.height);
    ctx.stroke();
  }

  private getTickStep(scale: number): number {
    // Calculate how many world units are represented by MIN_TICK_DISTANCE_PX screen pixels
    const minWorldDistance = this.MIN_TICK_DISTANCE_PX / scale;

    // For very small scales, use a more sophisticated approach
    if (minWorldDistance > 10000) {
      // Use a logarithmic approach for very large distances
      const magnitude = Math.floor(Math.log10(minWorldDistance));
      const base = Math.pow(10, magnitude);

      // Choose between 1x, 2x, or 5x the base, whichever is appropriate
      if (minWorldDistance <= 2 * base) return 2 * base;
      if (minWorldDistance <= 5 * base) return 5 * base;
      return 10 * base;
    }

    // For normal scales, use the predefined steps
    for (const step of this.AVAILABLE_STEPS) {
      if (step >= minWorldDistance) {
        return step;
      }
    }

    // If all steps are too small, return the largest available step
    return this.AVAILABLE_STEPS[this.AVAILABLE_STEPS.length - 1];
  }

  protected unmount() {
    super.unmount();
  }
}

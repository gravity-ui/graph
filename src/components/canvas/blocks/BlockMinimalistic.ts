import { TRect } from "../../../utils/types/shapes";
import { Path2DRenderInstance, Path2DRenderStyleResult } from "../connections/BatchPath2D";

export type TBlockMinimalisticParams = {
  fill: string;
  border: {
    radius: number;
    color: string;
    width: number;
  };
};

/**
 * Minimalistic block representation for batch rendering using Path2D.
 * This class wraps a Block and provides a simplified rendering interface
 * optimized for performance at low zoom levels.
 */
export class BlockMinimalistic implements Path2DRenderInstance {
  protected path: Path2D | null = null;
  protected lastGeometry: TRect | null = null;

  constructor(
    protected getGeometry: () => TRect,
    protected getVisible: () => boolean,
    protected params: TBlockMinimalisticParams
  ) {}

  public getPath(): Path2D | undefined | null {
    const geometry = this.getGeometry();

    // Rebuild path if geometry changed
    if (
      !this.path ||
      !this.lastGeometry ||
      this.lastGeometry.x !== geometry.x ||
      this.lastGeometry.y !== geometry.y ||
      this.lastGeometry.width !== geometry.width ||
      this.lastGeometry.height !== geometry.height
    ) {
      this.path = this.createPath(geometry);
      this.lastGeometry = { ...geometry };
    }

    return this.path;
  }

  protected createPath(geometry: TRect): Path2D {
    const path = new Path2D();
    const { radius } = this.params.border;

    if (radius > 0) {
      // Rounded rectangle
      const { x, y, width, height } = geometry;
      const r = Math.min(radius, width / 2, height / 2);

      path.moveTo(x + r, y);
      path.lineTo(x + width - r, y);
      path.quadraticCurveTo(x + width, y, x + width, y + r);
      path.lineTo(x + width, y + height - r);
      path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      path.lineTo(x + r, y + height);
      path.quadraticCurveTo(x, y + height, x, y + height - r);
      path.lineTo(x, y + r);
      path.quadraticCurveTo(x, y, x + r, y);
      path.closePath();
    } else {
      // Simple rectangle
      path.rect(geometry.x, geometry.y, geometry.width, geometry.height);
    }

    return path;
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    ctx.fillStyle = this.params.fill;
    ctx.strokeStyle = this.params.border.color;
    ctx.lineWidth = this.params.border.width;

    return { type: "both" };
  }

  public isPathVisible(): boolean {
    return this.getVisible();
  }

  public setParams(params: TBlockMinimalisticParams): void {
    this.params = params;
    // Invalidate path cache if border radius changed
    if (this.lastGeometry && params.border.radius !== this.params.border.radius) {
      this.path = null;
    }
  }

  public invalidate(): void {
    this.path = null;
    this.lastGeometry = null;
  }
}

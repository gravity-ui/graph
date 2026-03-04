import { ESchedulerPriority } from "../../../../lib";
import { Component } from "../../../../lib/Component";
import { HitBoxData } from "../../../../services/HitTest";
import { debounce, throttle } from "../../../../utils/functions";
import { TPoint } from "../../../../utils/types/shapes";
import { GraphComponentContext } from "../../GraphComponent";
import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "../../connections/BaseConnection";

/** Minimum distance from point P to line segment A→B, in world units. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

type ILayerWithSlots = {
  updateSlot(slotIndex: number, conn: WebGLConnection): void;
};

export class WebGLConnection extends BaseConnection<TBaseConnectionProps, TBaseConnectionState, GraphComponentContext> {
  /** Index of this connection's slot in the vertex buffer (-1 = not yet assigned) */
  public slotIndex = -1;

  public cursor?: string = "pointer";

  constructor(props: TBaseConnectionProps, parent: Component) {
    super(props, parent);
  }

  public get isHovered(): boolean {
    return this.state.hovered ?? false;
  }

  public get isSelected(): boolean {
    return this.state.selected ?? false;
  }

  /**
   * Replaces ctx.isPointInStroke — performs a math-based point-to-segment
   * distance test in world space. Equivalent threshold to the Canvas 2D version
   * (THRESHOLD_LINE_HIT * 2 CSS pixels at current zoom).
   */
  public override onHitBox(shape: HitBoxData): boolean {
    if (!this.connectionPoints || this.connectionPoints.length < 2) return false;
    const THRESHOLD = this.context.constants.connection.THRESHOLD_LINE_HIT * 2;
    const camera = this.context.camera.getCameraState();
    const dpr = window.devicePixelRatio || 1;
    // shape.x/y are physical pixels → convert to world coords via CSS pixels
    const [worldX, worldY] = this.context.camera.applyToPoint(shape.x / dpr, shape.y / dpr);
    // THRESHOLD is in CSS pixels; convert to world units for comparison
    const threshold = THRESHOLD / camera.scale;
    // Iterate over all segments — works for straight lines, polylines, and
    // sampled bezier curves (when subclasses provide more than 2 points)
    for (let i = 0; i < this.connectionPoints.length - 1; i++) {
      const a = this.connectionPoints[i];
      const b = this.connectionPoints[i + 1];
      if (distanceToSegment(worldX, worldY, a.x, a.y, b.x, b.y) <= threshold) return true;
    }
    return false;
  }

  protected override updatePoints(additionalPoints?: TPoint[]): void {
    super.updatePoints(additionalPoints);
    this.notifyLayer();
  }

  protected override stateChanged(prevState: TBaseConnectionState): void {
    super.stateChanged(prevState);
    this.notifyLayer();
  }

  private notifyLayer = throttle(
    () => {
      if (this.slotIndex < 0 || !this.connectionPoints) return;
      (this.context.layer as unknown as ILayerWithSlots).updateSlot(this.slotIndex, this);
    },
    { frameInterval: 2, priority: ESchedulerPriority.HIGHEST }
  );

  protected override render(): void {
    // No-op: rendering handled by WebGLConnectionsLayer
  }
}

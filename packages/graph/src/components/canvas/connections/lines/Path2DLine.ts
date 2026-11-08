import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { Path2DRenderStyleResult } from "../BatchPath2D";
import type { BlockConnection } from "../BlockConnection";
import { createArrowPath, createSegmentsPath } from "../geometry";
import type { TConnectionGeometry } from "../geometry";

import { ConnectionLine } from "./ConnectionLine";
import { GeometryCache, applyArrowStyle, applyLineStyle, getArrowGroup, strokeKey } from "./fallbackPath";

/** Draws a connection with Canvas2D `Path2D`; lines of one group share a style and are drawn in one pass. */
export class Path2DLine<
  C extends BlockConnection<TConnection> = BlockConnection<TConnection>,
> extends ConnectionLine<C> {
  public static override readonly renderer = "canvas";

  private readonly pathCache = new GeometryCache<Path2D>();

  private readonly arrowPathCache = new GeometryCache<Path2D>();

  /** Default: the geometry's segments. Override for any Canvas2D shape. */
  protected createPath(geometry: TConnectionGeometry): Path2D {
    return createSegmentsPath(geometry.segments);
  }

  /** Default: the geometry's arrow; an empty path without one. */
  protected createArrowPath(geometry: TConnectionGeometry): Path2D {
    return geometry.arrow ? createArrowPath(geometry.arrow) : new Path2D();
  }

  public getPath(): Path2D | undefined {
    const geometry = this.connection.getGeometry();
    if (!geometry) return undefined;
    return this.pathCache.get(geometry, (g) => this.createPath(g));
  }

  public getArrowPath(): Path2D | undefined {
    const geometry = this.connection.getGeometry();
    if (!geometry) return undefined;
    return this.arrowPathCache.get(geometry, (g) => this.createArrowPath(g));
  }

  /** Default: applies getStroke(). Override for gradients, shadows, fills (and override getGroup()). */
  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    return applyLineStyle(ctx, this.getCurrentStroke());
  }

  public styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    return applyArrowStyle(ctx, this.getCurrentArrowStroke(), this.connection.getGeometry()?.arrow?.closed);
  }

  /** Batch group: lines of one group share a style. Default: from getStroke(). */
  public getGroup(): string {
    return `line/${strokeKey(this.getCurrentStroke())}`;
  }

  protected getBatchGroup(): string {
    return this.getGroup();
  }

  protected getArrowBatchGroup(lineGroup: string): string {
    return getArrowGroup(this.connection.getGeometry()?.arrow?.closed, this.getCurrentArrowStroke(), lineGroup);
  }

  public hitTest(x: number, y: number, threshold: number): boolean {
    const path = this.getPath();
    if (!path) return false;
    const { ctx } = this.connection.context;
    const state = this.connection.state;
    const arrow = this.connection.props.showConnectionArrows ? this.connection.getGeometry()?.arrow : undefined;
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.setLineDash([]);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = this.getStroke(state).width + 2 * threshold;
      if (ctx.isPointInStroke(path, x, y)) return true;
      const arrowPath = arrow ? this.getArrowPath() : undefined;
      if (!arrow || !arrowPath) return false;
      ctx.lineWidth = this.getArrowStroke(state).width + 2 * threshold;
      return ctx.isPointInStroke(arrowPath, x, y) || (arrow.closed && ctx.isPointInPath(arrowPath, x, y));
    } finally {
      ctx.restore();
    }
  }
}

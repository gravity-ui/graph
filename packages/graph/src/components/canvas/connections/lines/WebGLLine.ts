import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TBaseConnectionState } from "../BaseConnection";
import type { Path2DRenderStyleResult } from "../BatchPath2D";
import type { BlockConnection } from "../BlockConnection";
import { ConnectionEffect, toConnectionEffect } from "../effects/ConnectionEffect";
import type { TConnectionEffectUse } from "../effects/types";
import { createArrowPath, createSegmentsPath, lineSegment } from "../geometry";
import type { TConnectionArrow, TConnectionGeometry } from "../geometry";
import { distanceToArrow, distanceToSegments } from "../geometry/distance";

import { ConnectionLine } from "./ConnectionLine";
import { GeometryCache, applyArrowStyle, applyLineStyle, getArrowGroup, strokeKey } from "./fallbackPath";
import type { TLineStroke, TWebGLShape } from "./types";

/** Stroke of a WebGL line: the shared stroke and an optional effect that recolors it. */
export type TWebGLStroke = TLineStroke & { effect?: TConnectionEffectUse };

/** Hit tolerance of the flattening: half a CSS pixel. */
const FLATNESS_CSS_PX = 0.5;

/** The arrow's outline as straight cubics; a closed arrow adds the closing side. */
function arrowSegments(arrow: TConnectionArrow): Float32Array {
  const { points, closed } = arrow;
  const count = points.length / 2;
  const sides = Math.max(0, closed ? count : count - 1);
  const out = new Float32Array(sides * 8);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % count;
    out.set(lineSegment({ x: points[2 * i], y: points[2 * i + 1] }, { x: points[2 * j], y: points[2 * j + 1] }), i * 8);
  }
  return out;
}

/**
 * Draws a connection with WebGL2 from its geometry only: no custom shapes, no Path2D per connection.
 * Hit tests are analytic; a Path2D batch holding the line (the fallback) builds Path2D from the geometry.
 */
export class WebGLLine<
  C extends BlockConnection<TConnection> = BlockConnection<TConnection>,
> extends ConnectionLine<C> {
  public static override readonly renderer = "webgl";

  private lineShape?: { geometry: TConnectionGeometry; stroke: TLineStroke; shape: TWebGLShape };

  private arrowShape?: { geometry: TConnectionGeometry; stroke: TLineStroke; shape: TWebGLShape };

  private fallback?: { stroke: TLineStroke; fallbackStroke: TLineStroke };

  private readonly pathCache = new GeometryCache<Path2D>();

  private readonly arrowPathCache = new GeometryCache<Path2D>();

  public override getStroke(state: TBaseConnectionState): TWebGLStroke {
    return super.getStroke(state);
  }

  public hitTest(x: number, y: number, threshold: number): boolean {
    const geometry = this.connection.getGeometry();
    if (!geometry) return false;
    const state = this.connection.state;
    const flatness = FLATNESS_CSS_PX / this.connection.context.camera.getCameraScale();
    const limit = this.getStroke(state).width / 2 + threshold;
    if (distanceToSegments(geometry.segments, x, y, flatness, limit) <= limit) return true;

    const arrow = this.connection.props.showConnectionArrows ? geometry.arrow : undefined;
    if (!arrow) return false;
    return distanceToArrow(arrow, x, y) <= this.getArrowStroke(state).width / 2 + threshold;
  }

  /** @internal */
  public override getWebGLShape(): TWebGLShape | undefined {
    const geometry = this.connection.getGeometry();
    if (!geometry) return undefined;
    const stroke = this.getCurrentStroke();
    const cached = this.lineShape;
    if (cached && cached.geometry === geometry && cached.stroke === stroke) return cached.shape;
    const { effect, ...plain } = stroke as TWebGLStroke;
    const shape: TWebGLShape = { segments: geometry.segments, stroke: effect ? plain : stroke };
    if (effect) {
      shape.effect = toConnectionEffect(effect.effect);
      shape.params = effect.params ?? [];
    }
    this.lineShape = { geometry, stroke, shape };
    return shape;
  }

  /** @internal */
  public override getWebGLEffect(): TWebGLShape["effect"] {
    const effect = (this.getCurrentStroke() as TWebGLStroke).effect?.effect;
    // Another object throws when the line's chunk is built (see getWebGLShape()).
    return effect instanceof ConnectionEffect ? effect : undefined;
  }

  /** @internal */
  public override getArrowWebGLShape(): TWebGLShape | undefined {
    const geometry = this.connection.getGeometry();
    const arrow = geometry?.arrow;
    if (!geometry || !arrow) return undefined;
    const stroke = this.getCurrentArrowStroke();
    const cached = this.arrowShape;
    if (cached && cached.geometry === geometry && cached.stroke === stroke) return cached.shape;
    const shape: TWebGLShape = { segments: arrowSegments(arrow), stroke };
    if (arrow.closed) shape.fill = arrow.points;
    this.arrowShape = { geometry, stroke, shape };
    return shape;
  }

  public getPath(): Path2D | undefined {
    const geometry = this.connection.getGeometry();
    if (!geometry) return undefined;
    return this.pathCache.get(geometry, (g) => createSegmentsPath(g.segments));
  }

  public getArrowPath(): Path2D | undefined {
    const geometry = this.connection.getGeometry();
    if (!geometry) return undefined;
    return this.arrowPathCache.get(geometry, (g) => (g.arrow ? createArrowPath(g.arrow) : new Path2D()));
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    return applyLineStyle(ctx, this.getFallbackStroke());
  }

  public styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult {
    return applyArrowStyle(ctx, this.getCurrentArrowStroke(), this.connection.getGeometry()?.arrow?.closed);
  }

  protected getBatchGroup(): string {
    return `line/${strokeKey(this.getFallbackStroke())}`;
  }

  /** The stroke Path2D draws: the effect's fallback stroke, or the stroke without the effect. */
  private getFallbackStroke(): TLineStroke {
    const stroke = this.getCurrentStroke();
    if (this.fallback?.stroke === stroke) return this.fallback.fallbackStroke;
    const { effect, ...plain } = stroke as TWebGLStroke;
    const fallbackStroke = effect
      ? toConnectionEffect(effect.effect).getFallbackStroke(plain, effect.params ?? [])
      : stroke;
    this.fallback = { stroke, fallbackStroke };
    return fallbackStroke;
  }

  protected getArrowBatchGroup(lineGroup: string): string {
    return getArrowGroup(this.connection.getGeometry()?.arrow?.closed, this.getCurrentArrowStroke(), lineGroup);
  }
}

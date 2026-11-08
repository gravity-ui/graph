import type { TConnection } from "../../../../store/connection/ConnectionState";
import type { TBaseConnectionState } from "../BaseConnection";
import type { Path2DRenderStyleResult, TPathBounds } from "../BatchPath2D";
import type { BlockConnection, TConnectionProps } from "../BlockConnection";
import type { IConnectionBatchItem } from "../batch";
import { getSegmentsBounds } from "../geometry";
import type { TConnectionGeometry } from "../geometry";

import type { TConnectionsRenderer, TLineStroke, TWebGLShape } from "./types";

/** @internal The selection color of a connection state: `styles.selectedBackground`, else the theme's. */
export function getSelectionColor(connection: BlockConnection<TConnection>, state: TBaseConnectionState): string {
  return state.styles?.selectedBackground || connection.context.colors.connection.selectedBackground;
}

/** Half a stroke's width; 0 for a width that is not a positive number. */
function halfWidth(stroke: TLineStroke): number {
  return stroke.width > 0 && Number.isFinite(stroke.width) ? stroke.width / 2 : 0;
}

/** The arrow item of a line: the line's bounds and visibility, the arrow's path and style. */
class LineArrowItem implements IConnectionBatchItem {
  constructor(private readonly line: ConnectionLine) {}

  public getPathBounds(): TPathBounds | undefined {
    return this.line.getPathBounds();
  }

  public isPathVisible(): boolean {
    return this.line.isPathVisible();
  }

  public isInViewport(): boolean {
    return this.line.isInViewport();
  }

  public getPath(): Path2D | undefined {
    return this.line.getArrowPath();
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    return this.line.styleArrow(ctx);
  }

  /** @internal */
  public getWebGLShape(): TWebGLShape | undefined {
    return this.line.getArrowWebGLShape();
  }
}

/**
 * Owns the look of one connection and the connection's batch items: the line and its arrow.
 * A subclass picks the renderer and overrides the stroke, the shape or the style.
 */
export abstract class ConnectionLine<C extends BlockConnection<TConnection> = BlockConnection<TConnection>>
  implements IConnectionBatchItem
{
  public static readonly renderer: TConnectionsRenderer;

  /** The arrow's batch item: its own z-level (the line's minus one) and, for Path2D, its own style group. */
  public readonly arrow: IConnectionBatchItem;

  /** Draws extra content of the connection after its chunk; set only when the connection has `afterRender()`. */
  public afterRender?: (ctx: CanvasRenderingContext2D) => void;

  private stroke?: TLineStroke;

  private arrowStroke?: TLineStroke;

  /** The state `update()` is reading strokes for; `getArrowStroke()` reuses the stroke it has just computed. */
  private updatingState?: TBaseConnectionState;

  constructor(protected readonly connection: C) {
    if (typeof connection.afterRender === "function") {
      this.afterRender = (ctx: CanvasRenderingContext2D): void => connection.afterRender?.(ctx);
    }
    this.arrow = new LineArrowItem(this);
  }

  /**
   * Default: the connection color, width 2 and the dash from `dashed` / `styles.dashes`, with hover and selection applied
   * by `withInteraction()` (the selected color, width 4).
   */
  public getStroke(state: TBaseConnectionState): TLineStroke {
    const colors = this.connection.context.colors.connection;
    const color = state.styles?.background || colors.background;
    const dash = state.dashed ? { pattern: state.styles?.dashes || [6, 4] } : undefined;
    return this.withInteraction({ color, width: 2, dash }, state);
  }

  /**
   * Hover and selection on top of a stroke: a selected line takes the selected color (`styles.selectedBackground` or
   * the theme's), a hovered or selected one is 2 units wider. The rest of the stroke — dash, effect — stays, so a
   * custom look keeps its style while selected: `return this.withInteraction({ color, width: 6, effect }, state)`.
   * A `WebGLLine` gives an effect the line's own color back: the effect shows the selection.
   */
  protected withInteraction<S extends TLineStroke>(stroke: S, state: TBaseConnectionState): S {
    if (!state.hovered && !state.selected) return stroke;
    const color = state.selected ? getSelectionColor(this.connection, state) : stroke.color;
    return { ...stroke, color, width: stroke.width + 2 };
  }

  /** Default: the line's color and width without the dash; a closed arrow is filled with the color. */
  public getArrowStroke(state: TBaseConnectionState): TLineStroke {
    const stroke = state === this.updatingState && this.stroke ? this.stroke : this.getStroke(state);
    return { color: stroke.color, width: stroke.width };
  }

  /** World point against the drawn line and arrow: a hit within `width / 2 + threshold`, threshold in world units. */
  public abstract hitTest(x: number, y: number, threshold: number): boolean;

  /**
   * Line bounds for the batch and culling; the component adds the arrow with its join padding.
   * Override when the drawn shape reaches outside the geometry's segments.
   */
  public getBounds(geometry: TConnectionGeometry): TPathBounds | undefined {
    return getSegmentsBounds(geometry.segments, this.connection.props.useTightBezierBounds !== false);
  }

  /**
   * Reads getStroke() again (and getArrowStroke() while arrows are shown) and tells the batch: group and z-level, or a
   * dirty chunk. Called by the component.
   */
  public update(
    state: TBaseConnectionState = this.connection.state,
    props: TConnectionProps = this.connection.props
  ): void {
    this.readStrokes(state, props);
    this.updateItems(state, props);
  }

  /**
   * @internal The first half of `update()`: reads getStroke() (and getArrowStroke() while arrows are shown) for the
   * state and keeps them, without telling the batch. The component reads the widths for its bounds in between.
   */
  public readStrokes(
    state: TBaseConnectionState = this.connection.state,
    props: TConnectionProps = this.connection.props
  ): void {
    this.stroke = this.getStroke(state);
    if (props.showConnectionArrows) {
      this.updatingState = state;
      try {
        this.arrowStroke = this.getArrowStroke(state);
      } finally {
        this.updatingState = undefined;
      }
    } else {
      // Read again when arrows are shown.
      this.arrowStroke = undefined;
    }
  }

  /**
   * @internal The second half of `update()`: moves the line and arrow items to the group and z-level of the strokes
   * read last.
   */
  public updateItems(
    state: TBaseConnectionState = this.connection.state,
    props: TConnectionProps = this.connection.props
  ): void {
    const batch = this.connection.context.batch;
    const zIndex = this.connection.getBatchZIndex(state);
    const group = this.getBatchGroup();
    batch.update(this, { zIndex, group });
    if (props.showConnectionArrows) {
      batch.update(this.arrow, { zIndex: zIndex - 1, group: this.getArrowBatchGroup(group) });
    } else {
      batch.delete(this.arrow);
    }
  }

  /**
   * @internal Half the width of the stroke read last, in world units: how far the drawn line reaches past its
   * geometry.
   */
  public getLineHalfWidth(): number {
    return halfWidth(this.getCurrentStroke());
  }

  /** @internal Half the width of the arrow stroke read last, in world units; undefined while arrows are not shown. */
  public getArrowHalfWidth(): number | undefined {
    return this.arrowStroke ? halfWidth(this.arrowStroke) : undefined;
  }

  /**
   * For looks that depend on outside data: the connection's `invalidateLine()`, which reads the strokes again (see
   * update()) and keeps the bounds, the hit box and the label in step with them.
   */
  public invalidate(): void {
    this.connection.invalidateLine();
  }

  /** Removes the line and arrow items from the batch. */
  public dispose(): void {
    const batch = this.connection.context.batch;
    batch.delete(this);
    batch.delete(this.arrow);
  }

  /** Batch group of the line item (Path2D groups share a style). */
  protected abstract getBatchGroup(): string;

  /** Batch group of the arrow item; `lineGroup` is the line item's group from the same update. */
  protected abstract getArrowBatchGroup(lineGroup: string): string;

  /** The stroke of the last update(), for style() and encoding. */
  protected getCurrentStroke(): TLineStroke {
    this.stroke ??= this.getStroke(this.connection.state);
    return this.stroke;
  }

  protected getCurrentArrowStroke(): TLineStroke {
    this.arrowStroke ??= this.getArrowStroke(this.connection.state);
    return this.arrowStroke;
  }

  public getPathBounds(): TPathBounds | undefined {
    return this.connection.getPathBounds();
  }

  public isPathVisible(): boolean {
    return this.connection.isPathVisible();
  }

  public isInViewport(): boolean {
    return this.connection.isInViewport();
  }

  /** @internal What the WebGL batch draws for the line; lines without WebGL shapes return `undefined`. */
  public getWebGLShape(): TWebGLShape | undefined {
    return undefined;
  }

  /** @internal What the WebGL batch draws for the arrow. */
  public getArrowWebGLShape(): TWebGLShape | undefined {
    return undefined;
  }

  /** @internal The effect of the line's WebGL shape, from the stroke read last; lines without WebGL shapes have none. */
  public getWebGLEffect(): TWebGLShape["effect"] {
    return undefined;
  }

  public abstract getPath(): Path2D | undefined;

  public abstract style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;

  public abstract getArrowPath(): Path2D | undefined;

  public abstract styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined;
}

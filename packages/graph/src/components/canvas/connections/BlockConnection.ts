import intersects from "intersects";

import { isDevelopmentBuild } from "../../../lib/detachedWarning";
import { HitBoxData } from "../../../services/HitTest";
import { ESelectionStrategy } from "../../../services/selection/types";
import { TConnection } from "../../../store/connection/ConnectionState";
import { isMetaKeyEvent } from "../../../utils/functions";
import { cachedMeasureText } from "../../../utils/renderers/text";
import { TPoint } from "../../../utils/types/shapes";

import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "./BaseConnection";
import { Path2DRenderInstance, TPathBounds } from "./BatchPath2D";
import { BlockConnections, TGraphConnectionsContext } from "./BlockConnections";
import { ConnectionLabel } from "./Label";
import type { IConnectionLabelOwner } from "./Label";
import { blockGeometry } from "./geometry";
import type { TConnectionGeometry, TConnectionGeometryFn } from "./geometry";
import { hasChangedValue } from "./hasChangedValue";
import { getLabelCoords } from "./labelHelper";
import { Path2DLine } from "./lines";
import type { ConnectionLine, TConnectionLineClass } from "./lines";
import { warnRemovedConnectionMethods } from "./removedMethods";
import type { TMultipointConnection } from "./types";

export type TConnectionProps = TBaseConnectionProps & {
  useBezier: boolean;
  bezierDirection: "vertical" | "horizontal";
  useTightBezierBounds?: boolean;
  showConnectionArrows: boolean;
  showConnectionLabels: boolean;
};

export type TBlockConnection = {
  id: string;
  addInRenderOrder(cmp: Path2DRenderInstance, setting: object): void;
  removeFromRenderOrder(cmp: Path2DRenderInstance): void;
};

/** The geometry input of connections without `points`. */
const NO_POINTS: readonly TPoint[] = Object.freeze([]);

export class BlockConnection<T extends TConnection = TConnection>
  extends BaseConnection<TConnectionProps, TBaseConnectionState, TGraphConnectionsContext, T>
  implements IConnectionLabelOwner
{
  /**
   * Connections are detached: the batch draws their lines and arrows and the label pass their labels, so the frame
   * does not walk them. A subclass that draws in `render()` or relies on other per-frame hooks declares
   * `static detached = false`.
   */
  public static override readonly detached: boolean = true;

  /** How lines are drawn; its kind picks the renderer of the whole graph. */
  public static line: TConnectionLineClass = Path2DLine;

  /** Pure shape: cubic segments and the arrow, in world coordinates. */
  public static geometry: TConnectionGeometryFn = blockGeometry;

  public readonly cursor = "pointer";

  /** Created in the constructor: `new (this.constructor.line)(this)`. Owns the look and the line and arrow items. */
  protected readonly line: ConnectionLine;

  protected labelGeometry: { x: number; y: number; width: number; height: number } | undefined = undefined;

  private labelPaintGeometry: typeof this.labelGeometry;

  private labelFont = "";

  private pathBounds: TPathBounds | undefined;

  /** Context the current geometry was computed with; constants and label sizes live there. */
  private geometryContext?: TGraphConnectionsContext;

  /** The result of `static geometry` from the last recomputation. */
  private shape: TConnectionGeometry | undefined;

  private unsubscribeLabelFontSize?: () => void;

  /** The standard label as an item of the layer's label pass. */
  protected labelShape = new ConnectionLabel(this);

  /** World rectangle of `labelGeometry` from the last bounds update. */
  private labelWorldBounds: TPathBounds | undefined;

  /**
   * Creates a new BlockConnection instance.
   *
   * @param props - The connection properties including showConnectionArrows setting
   * @param parent - The parent BlockConnections component
   */
  constructor(props: TConnectionProps, parent: BlockConnections) {
    super(props, parent);
    this.addEventListener("click", this);
    if (isDevelopmentBuild()) warnRemovedConnectionMethods(this.constructor, BlockConnection);

    // ConnectionLine records at construction whether the connection has afterRender(); a prototype method is visible
    // here, a field initializer of a subclass is not yet.
    const LineClass = (this.constructor as typeof BlockConnection).line;
    // The line class checks the connection type on its side (see TConnectionLineClass); the connection is this one.
    this.line = new LineClass(this as never);
    // Registers the line and its arrow with the batch.
    this.updateLine(this.state, props);
  }

  /**
   * Moves the line and arrow items to the group and z-level of the state and keeps the label pass in step.
   *
   * Takes the props explicitly: during `propsChanged()` `this.props` still holds the previous values.
   */
  private updateLine(state: TBaseConnectionState = this.state, props: TConnectionProps = this.props): void {
    this.line.update(state, props);
    this.syncLabel(this.getBatchZIndex(state));
  }

  /** Batch z-level: selected and hovered connections are drawn above the others. */
  public getBatchZIndex(state: TBaseConnectionState = this.state): number {
    return state.selected || state.hovered ? this.zIndex + 10 : this.zIndex;
  }

  /**
   * Re-reads the line's look: for looks that depend on data outside the connection's store. It also re-evaluates
   * an `isRenderAllowed()` override that reads such data, for the line, its arrow and the label.
   */
  public invalidateLine(): void {
    // An unmounted connection has left the batch and the label pass.
    if (!this.isEntityAvailable()) return;
    this.line.invalidate();
    this.syncLabel();
  }

  /** Keeps the label pass in step with the label's bounds, visibility and z-level. */
  private syncLabel(zIndex: number = this.getBatchZIndex()): void {
    if (this.labelWorldBounds) this.context.labels.update(this.labelShape, zIndex);
    else this.context.labels.delete(this.labelShape);
  }

  /** World rectangle of the label, including decorations prepared in `updateLabelGeometry()`. */
  public getLabelBounds(): TPathBounds | undefined {
    return this.labelWorldBounds;
  }

  /** Called by the label pass for a label in the viewport. */
  public renderLabel(ctx: CanvasRenderingContext2D): void {
    this.renderLabelText(ctx);
  }

  protected override willMount(): void {
    super.willMount();
    // The first value needs no update: mounting has just registered the line (BaseConnection.willMount).
    let mounting = true;
    this.subscribeSignal(this.connectedState.$hidden, () => {
      if (!mounting) this.updateLine();
    });
    mounting = false;
    this.syncLabelSubscription();
  }

  private syncLabelSubscription(): void {
    if (!this.state.label || !this.props.showConnectionLabels) {
      this.unsubscribeLabelFontSize?.();
      this.unsubscribeLabelFontSize = undefined;
    } else if (!this.unsubscribeLabelFontSize) {
      const fontSize = this.context.connectionLabelFontSize;
      let previous = fontSize.peek();
      this.unsubscribeLabelFontSize = fontSize.subscribe((next) => {
        if (previous === next) return;
        previous = next;
        // Offscreen labels can grow into the viewport; keep their bounds current without recomputing the geometry.
        this.updateBounds();
        this.updateCullingBounds();
      });
    }
  }

  protected override setVisibility(visible: boolean, options: { removeHitbox: boolean }): void {
    super.setVisibility(visible, options);
    this.updateLine();
  }

  /**
   * The batch draws the line and arrow when the connection may render, so one `isRenderAllowed()`
   * override hides both. State and props changes re-evaluate it; other changes call `invalidateLine()`.
   */
  public isPathVisible(): boolean {
    return this.isRenderAllowed();
  }

  /**
   * The geometry of the last recomputation; undefined without endpoints or when the geometry function returns none.
   */
  public getGeometry(): TConnectionGeometry | undefined {
    return this.shape;
  }

  /** Draws after the connection's chunk in the Path2D batch; WebGL never calls it. */
  public afterRender?(ctx: CanvasRenderingContext2D): void;

  /** World bounds of what `afterRender()` draws, joined into the batch bounds. Default: none. */
  protected getAfterRenderBounds(): TPathBounds | undefined {
    return undefined;
  }

  /** Bounds of the line and its arrow; tree culling and the hit box also cover the label. */
  public getPathBounds(): TPathBounds | undefined {
    return this.pathBounds;
  }

  protected override propsChanged(nextProps: TConnectionProps) {
    super.propsChanged(nextProps);
    this.updateLine(this.state, nextProps);
  }

  protected override stateChanged(nextState: TBaseConnectionState) {
    super.stateChanged(nextState);
    this.updateLine(nextState);
  }

  protected override checkData(): boolean {
    // Mounting computes the first geometry from the $geometry subscription; afterwards changed inputs recompute it
    // once, after every pending change is applied (BaseConnection.checkData).
    const { nextProps, nextState } = this.__data;
    if (
      this.geometryContext !== undefined &&
      (this.context !== this.geometryContext ||
        hasChangedValue(nextProps, this.props) ||
        hasChangedValue(nextState, this.state))
    ) {
      this.geometryDirty = true;
    }
    const changed = super.checkData();
    if (changed) this.syncLabelSubscription();
    return changed;
  }

  public get zIndex() {
    return this.context.constants.connection.DEFAULT_Z_INDEX;
  }

  /** A connection is drawn and hit only with endpoints and a shape from its geometry function. */
  protected override hasGeometry(): boolean {
    return super.hasGeometry() && this.shape !== undefined;
  }

  /**
   * The corners of the line's bounds (`line.getBounds()`) and of `getAfterRenderBounds()`. Updates the label first:
   * `getBBox()` joins it for the hit box and tree culling.
   */
  protected override collectBBoxPoints(props: TConnectionProps = this.props): TPoint[] {
    this.updateLabelGeometry(props);
    const points: TPoint[] = [];
    const addCorners = (bounds: TPathBounds | undefined): void => {
      if (bounds) points.push({ x: bounds[0], y: bounds[1] }, { x: bounds[2], y: bounds[3] });
    };
    if (this.shape) addCorners(this.line.getBounds(this.shape));
    addCorners(this.getAfterRenderBounds());
    return points;
  }

  /** The line's bounds joined with the standard label's: the hit box and tree culling cover the label. */
  protected override getBBox(): Readonly<[minX: number, minY: number, maxX: number, maxY: number]> {
    const bBox = super.getBBox();
    const label = this.labelGeometry;
    if (!label || !this.hasGeometry()) return bBox;
    return [
      Math.min(bBox[0], label.x),
      Math.min(bBox[1], label.y),
      Math.max(bBox[2], label.x + label.width),
      Math.max(bBox[3], label.y + label.height),
    ];
  }

  /** Reads the endpoints, runs the class's geometry, then updates bounds, culling bounds and the batch items. */
  protected override updatePoints(additionalPoints?: TPoint[], props: TConnectionProps = this.props): void {
    this.geometryContext = this.context;
    this.readConnectionPoints();
    this.shape = this.computeGeometry(props);
    this.updateBounds(additionalPoints, props);
    this.updateCullingBounds(props);
    this.updateLine(this.state, props);
  }

  /** Runs `static geometry` on the endpoints, props and data of the connection; undefined without endpoints. */
  private computeGeometry(props: TConnectionProps): TConnectionGeometry | undefined {
    if (!this.connectionPoints) return undefined;
    const connection = this.connectedState.$state.value;
    return (this.constructor as typeof BlockConnection).geometry({
      source: this.connectionPoints[0],
      target: this.connectionPoints[1],
      points: (connection as Partial<TMultipointConnection>).points ?? NO_POINTS,
      useBezier: props.useBezier,
      bezierDirection: props.bezierDirection,
      connection,
    });
  }

  private updateCullingBounds(props: TConnectionProps = this.props): void {
    const shape = this.shape;
    if (shape && this.hasGeometry()) {
      const padding = this.state.hovered || this.state.selected ? 2 : 1;
      // A sharp arrow join can extend past its vertices by the canvas miter limit.
      const arrowPoints = props.showConnectionArrows ? shape.arrow?.points : undefined;
      const arrowPadding = padding * this.context.ctx.miterLimit;
      const extend = ([left, top, right, bottom]: Readonly<[number, number, number, number]>): TPathBounds => {
        let minX = left - padding;
        let minY = top - padding;
        let maxX = right + padding;
        let maxY = bottom + padding;
        if (arrowPoints) {
          for (let i = 0; i + 1 < arrowPoints.length; i += 2) {
            minX = Math.min(minX, arrowPoints[i] - arrowPadding);
            minY = Math.min(minY, arrowPoints[i + 1] - arrowPadding);
            maxX = Math.max(maxX, arrowPoints[i] + arrowPadding);
            maxY = Math.max(maxY, arrowPoints[i + 1] + arrowPadding);
          }
        }
        return [minX, minY, maxX, maxY];
      };
      // The batch draws the line and arrow; the tree also covers the label, which the label pass draws.
      this.pathBounds = extend(this.bBox);
      const [minX, minY, maxX, maxY] = extend(this.getBBox());
      this.setCullingBounds(minX, minY, maxX, maxY);
      const label = this.labelGeometry;
      this.labelWorldBounds = label ? [label.x, label.y, label.x + label.width, label.y + label.height] : undefined;
    } else {
      this.pathBounds = undefined;
      this.labelWorldBounds = undefined;
    }
    // Chunks cache the union of their items' bounds.
    this.context.batch.markBoundsDirty(this.line);
    this.context.batch.markBoundsDirty(this.line.arrow);
    this.syncLabel();
  }

  protected override handleEvent(event: MouseEvent) {
    event.stopPropagation();
    super.handleEvent(event);

    switch (event.type) {
      case "click": {
        this.context.graph.api.selectConnections(
          [this.props.id],
          !isMetaKeyEvent(event) ? true : !this.state.selected,
          !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
        );

        break;
      }
    }
  }

  /** The line's hit test at the world center of the hit box (`THRESHOLD_LINE_HIT` in world units), then the label. */
  public onHitBox(shape: HitBoxData): boolean {
    const x = (shape.minX + shape.maxX) / 2;
    const y = (shape.minY + shape.maxY) / 2;
    const threshold = this.context.constants.connection.THRESHOLD_LINE_HIT;
    return this.line.hitTest(x, y, threshold) || this.hitTestLabel(shape);
  }

  /** Whether the point hits the label: a square of `THRESHOLD_LINE_HIT` screen pixels around it meets the label. */
  protected hitTestLabel(shape: HitBoxData): boolean {
    if (this.labelGeometry === undefined) return false;
    const x = (shape.minX + shape.maxX) / 2;
    const y = (shape.minY + shape.maxY) / 2;
    const relativeThreshold =
      this.context.constants.connection.THRESHOLD_LINE_HIT / this.context.camera.getCameraScale();

    return intersects.boxBox(
      x - relativeThreshold / 2,
      y - relativeThreshold / 2,
      relativeThreshold,
      relativeThreshold,
      this.labelGeometry.x,
      this.labelGeometry.y,
      this.labelGeometry.width,
      this.labelGeometry.height
    );
  }

  protected renderLabelText(ctx: CanvasRenderingContext2D) {
    if (!this.state.label || !this.labelPaintGeometry) {
      return;
    }

    const [labelInnerTopPadding, , , labelInnerLeftPadding] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    const { x: rectX, y: rectY, width: rectWidth, height: rectHeight } = this.labelPaintGeometry;

    if (this.context.colors.connectionLabel?.background) {
      ctx.fillStyle = this.context.colors.connectionLabel.background;
    }

    if (this.state.hovered && this.context.colors.connectionLabel?.hoverBackground) {
      ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    }

    if (this.state.selected && this.context.colors.connectionLabel?.selectedBackground) {
      ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;
    }

    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

    if (this.context.colors.connectionLabel?.text) {
      ctx.fillStyle = this.context.colors.connectionLabel.text;
    }

    if (this.state.hovered && this.context.colors.connectionLabel?.hoverText) {
      ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    }

    if (this.state.selected && this.context.colors.connectionLabel?.selectedText) {
      ctx.fillStyle = this.context.colors.connectionLabel.selectedText;
    }

    ctx.textBaseline = "top";
    ctx.font = this.labelFont;
    ctx.textAlign = "left";
    ctx.fillText(this.state.label, rectX + labelInnerLeftPadding, rectY + labelInnerTopPadding);
  }

  protected updateLabelGeometry(props: TConnectionProps): void {
    this.labelGeometry = undefined;
    this.labelPaintGeometry = undefined;
    const fontSize = this.context.connectionLabelFontSize.peek();
    if (!this.state.label || !props.showConnectionLabels || !this.connectionPoints || !fontSize) {
      return;
    }
    const [top, right, bottom, left] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    this.labelFont = `${fontSize}px sans-serif`;
    const measure = cachedMeasureText(this.state.label, { font: this.labelFont });
    const width = measure.width + left + right;
    const height = measure.height + top + bottom;
    const [source, target] = this.connectionPoints;
    const { x, y } = getLabelCoords(
      source.x,
      source.y,
      target.x,
      target.y,
      width,
      height,
      this.context.constants.system.GRID_SIZE
    );
    this.labelPaintGeometry = { x, y, width, height };
    // Subclasses may extend labelGeometry for their own decoration without resizing the standard label.
    this.labelGeometry = { ...this.labelPaintGeometry };
  }

  protected unmount(): void {
    this.unsubscribeLabelFontSize?.();
    this.unsubscribeLabelFontSize = undefined;
    super.unmount();
    this.line.dispose();
    this.context.labels.delete(this.labelShape);
  }
}

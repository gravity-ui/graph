import intersects from "intersects";

import { HitBoxData } from "../../../services/HitTest";
import { ESelectionStrategy } from "../../../services/selection/types";
import { TConnection } from "../../../store/connection/ConnectionState";
import { isMetaKeyEvent } from "../../../utils/functions";
import { cachedMeasureText } from "../../../utils/renderers/text";
import { TPoint } from "../../../utils/types/shapes";

import { ConnectionArrow } from "./Arrow";
import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "./BaseConnection";
import { Path2DRenderInstance, Path2DRenderStyleResult, TPathBounds } from "./BatchPath2D";
import { BlockConnections, TGraphConnectionsContext } from "./BlockConnections";
import { ConnectionLabel } from "./Label";
import type { IConnectionLabelOwner } from "./Label";
import { TAppearanceStroke, TConnectionAppearance, bezierSegment, lineSegment } from "./appearance";
import {
  bezierCurveLine,
  generateBezierParams,
  getArrowCoords,
  getBezierCurveBounds,
  isPointInStroke,
} from "./bezierHelpers";
import { blockGeometry } from "./geometry";
import type { TConnectionGeometry } from "./geometry";
import { hasChangedValue } from "./hasChangedValue";
import { getLabelCoords } from "./labelHelper";

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

export class BlockConnection<T extends TConnection>
  extends BaseConnection<TConnectionProps, TBaseConnectionState, TGraphConnectionsContext, T>
  implements Path2DRenderInstance, IConnectionLabelOwner
{
  /**
   * Connections are detached: the batch draws their lines and arrows and the label pass their labels, so the frame
   * does not walk them. A subclass that draws in `render()` or relies on other per-frame hooks declares
   * `static detached = false`.
   */
  public static override readonly detached: boolean = true;

  public readonly cursor = "pointer";

  protected path2d: Path2D = new Path2D();

  protected labelGeometry: { x: number; y: number; width: number; height: number } | undefined = undefined;

  private labelPaintGeometry: typeof this.labelGeometry;

  private labelFont = "";

  private pathBounds: TPathBounds | undefined;

  private arrowPath: Path2D | undefined;

  /** Context the current geometry was computed with; constants and label sizes live there. */
  private geometryContext?: TGraphConnectionsContext;

  private geometryResult: TConnectionGeometry | undefined;

  private unsubscribeLabelFontSize?: () => void;

  protected geometry: { x1: number; x2: number; y1: number; y2: number } = { x1: 0, x2: 0, y1: 0, y2: 0 };

  /**
   * The arrow shape component that renders the arrow in the middle of the connection.
   * This is conditionally added to the batch renderer based on the showConnectionArrows setting.
   */
  protected arrowShape = new ConnectionArrow(this);

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

    // Add the connection line to the batch renderer
    this.context.batch.add(this, { zIndex: this.zIndex, group: this.getClassName() });

    // We'll handle arrow addition in applyShape based on showConnectionArrows setting
    this.applyShape(this.state, props);
  }

  /**
   * Updates the visual appearance of the connection and manages arrow visibility.
   * This method centralizes all arrow rendering logic to ensure consistency.
   *
   * IMPORTANT: We must use the props parameter instead of this.props because this.props
   * may contain outdated values during re-renders, which was the source of the original bug.
   * Always pass the most current props to this method when calling it from propsChanged.
   *
   * @param state - The current state of the connection (selected, hovered, etc.)
   * @param props - The connection properties, used to check showConnectionArrows setting
   */
  protected applyShape(state: TBaseConnectionState = this.state, props: TConnectionProps = this.props) {
    const zIndex = this.getBatchZIndex(state);
    const group = this.getClassName(state);

    this.context.batch.update(this, { zIndex, group });

    if (props.showConnectionArrows) {
      this.context.batch.update(this.arrowShape, { zIndex: zIndex - 1, group: `arrow/${group}` });
    } else {
      this.context.batch.delete(this.arrowShape);
    }
    this.syncLabel(zIndex);
  }

  /** Batch z-level: selected and hovered connections are drawn above the others. */
  public getBatchZIndex(state: TBaseConnectionState = this.state): number {
    return state.selected || state.hovered ? this.zIndex + 10 : this.zIndex;
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
    this.subscribeSignal(this.connectedState.$hidden, () => this.applyShape());
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
        // Offscreen labels can grow into the viewport; keep their bounds current without rebuilding paths.
        this.updateBounds();
        this.updateCullingBounds();
      });
    }
  }

  protected override setVisibility(visible: boolean, options: { removeHitbox: boolean }): void {
    super.setVisibility(visible, options);
    this.applyShape();
  }

  /**
   * The batch draws the line and arrow when the connection may render, so one `isRenderAllowed()`
   * override hides both. State and props changes re-evaluate it; other changes call `applyShape()`.
   */
  public isPathVisible(): boolean {
    return this.isRenderAllowed();
  }

  /** The pure shape of the connection from the last geometry update; undefined without geometry. */
  public getGeometry(): TConnectionGeometry | undefined {
    return this.geometryResult;
  }

  /** Draws extra content after the connection's chunk; subclasses implement it. */
  public afterRender?(ctx: CanvasRenderingContext2D): void;

  /** Bounds of the line and its arrow; tree culling and the hit box also cover the label. */
  public getPathBounds(): TPathBounds | undefined {
    return this.pathBounds;
  }

  /** The line built by the last geometry change; batch rebuilds reuse it. */
  public getPath(): Path2D {
    return this.path2d;
  }

  /** The arrow for the current geometry, built on first use after a geometry change. */
  public getArrowPath(): Path2D {
    this.arrowPath ??= this.createArrowPath();
    return this.arrowPath;
  }

  /**
   * Creates the Path2D object for the arrow in the middle of the connection.
   * This is used by the ConnectionArrow component to render the arrow.
   *
   * @returns A Path2D object representing the arrow shape
   */
  public createArrowPath() {
    const path = new Path2D();
    const [first, ...points] = this.getArrowPoints();
    if (!first) return path;
    path.moveTo(first.x, first.y);
    for (const point of points) path.lineTo(point.x, point.y);
    return path;
  }

  protected getArrowPoints(props: TConnectionProps = this.props): TPoint[] {
    const coords = getArrowCoords(
      props.useBezier,
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      props.bezierDirection
    );
    return [
      { x: coords[0], y: coords[1] },
      { x: coords[2], y: coords[3] },
      { x: coords[4], y: coords[5] },
    ];
  }

  public styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    const { color, width } = this.getStroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    return { type: "stroke" };
  }

  protected generatePath() {
    /* Setting this.path2D is important, as hotbox checking uses the isPointInStroke method. */
    this.path2d = this.createPath();
    this.arrowPath = undefined;
    return this.path2d;
  }

  protected createPath(): Path2D {
    if (!this.geometry) {
      return new Path2D();
    }
    if (this.props.useBezier) {
      return bezierCurveLine(
        {
          x: this.geometry.x1,
          y: this.geometry.y1,
        },
        {
          x: this.geometry.x2,
          y: this.geometry.y2,
        },
        this.props.bezierDirection
      );
    }
    const path2d = new Path2D();
    path2d.moveTo(this.geometry.x1, this.geometry.y1);
    path2d.lineTo(this.geometry.x2, this.geometry.y2);

    return path2d;
  }

  public getClassName(state = this.state) {
    const hovered = state.hovered ? "hovered" : "none";
    const selected = state.selected ? "selected" : "none";
    const { color, width, dash } = this.getStroke(state);
    const pattern = dash ? dash.pattern.join(",") : "";
    const speed = dash?.speed ? `/${dash.speed}` : "";
    return `connection/${hovered}/${selected}/${color}/${width}/${pattern}${speed}`;
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    this.setRenderStyles(ctx, this.state);
    return { type: "stroke" };
  }

  protected setRenderStyles(ctx: CanvasRenderingContext2D, state = this.state, withDashed = true) {
    const { color, width, dash } = this.getStroke(state);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    if (withDashed && dash) {
      ctx.setLineDash(dash.pattern as number[]);
      // A running dash moves forward: the offset decreases with time.
      if (dash.speed) ctx.lineDashOffset = -(dash.speed * performance.now()) / 1000;
    }
  }

  protected override propsChanged(nextProps: TConnectionProps) {
    super.propsChanged(nextProps);
    this.applyShape(this.state, nextProps);
  }

  protected override stateChanged(nextState: TBaseConnectionState) {
    super.stateChanged(nextState);
    this.applyShape(nextState);
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

  protected override collectBBoxPoints(props: TConnectionProps = this.props) {
    const points = super.collectBBoxPoints(props);
    this.updateLabelGeometry(props);

    if (props.useBezier && this.connectionPoints) {
      if (props.useTightBezierBounds !== false) {
        const bezierBounds = getBezierCurveBounds(
          this.connectionPoints[0],
          this.connectionPoints[1],
          props.bezierDirection
        );
        points.push(
          { x: bezierBounds.x, y: bezierBounds.y },
          { x: bezierBounds.x + bezierBounds.width, y: bezierBounds.y + bezierBounds.height }
        );
      } else {
        const bezierParams = generateBezierParams(
          this.connectionPoints[0],
          this.connectionPoints[1],
          props.bezierDirection
        );
        points.push(bezierParams[1], bezierParams[2]);
      }
    }

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

  protected override updatePoints(additionalPoints?: TPoint[], props: TConnectionProps = this.props) {
    this.geometryContext = this.context;
    super.updatePoints(additionalPoints, props);
    this.geometryResult = this.connectionPoints
      ? blockGeometry({
          source: this.connectionPoints[0],
          target: this.connectionPoints[1],
          points: [],
          useBezier: props.useBezier,
          bezierDirection: props.bezierDirection,
          connection: this.connectedState.$state.value,
        })
      : undefined;

    if (this.connectionPoints) {
      this.geometry.x1 = this.connectionPoints[0].x;
      this.geometry.y1 = this.connectionPoints[0].y;
      this.geometry.x2 = this.connectionPoints[1].x;
      this.geometry.y2 = this.connectionPoints[1].y;
    }

    this.generatePath();
    this.updateCullingBounds(props);
    this.applyShape(this.state, props);
  }

  private updateCullingBounds(props: TConnectionProps = this.props): void {
    if (this.hasGeometry()) {
      const padding = this.state.hovered || this.state.selected ? 2 : 1;
      // A sharp arrow join can extend past its vertices by the canvas miter limit.
      const arrowPoints = props.showConnectionArrows ? this.getArrowPoints(props) : [];
      const arrowPadding = padding * this.context.ctx.miterLimit;
      const extend = ([left, top, right, bottom]: Readonly<[number, number, number, number]>): TPathBounds => {
        let minX = left - padding;
        let minY = top - padding;
        let maxX = right + padding;
        let maxY = bottom + padding;
        for (const point of arrowPoints) {
          minX = Math.min(minX, point.x - arrowPadding);
          minY = Math.min(minY, point.y - arrowPadding);
          maxX = Math.max(maxX, point.x + arrowPadding);
          maxY = Math.max(maxY, point.y + arrowPadding);
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
    this.context.batch.markBoundsDirty(this);
    this.context.batch.markBoundsDirty(this.arrowShape);
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

  public onHitBox(shape: HitBoxData): boolean {
    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;

    if (isPointInStroke(this.context.ctx, this.path2d, shape.x, shape.y, THRESHOLD_LINE_HIT * 2)) {
      return true;
    }

    // Or if pointer over label
    if (this.labelGeometry !== undefined) {
      const x = (shape.minX + shape.maxX) / 2;
      const y = (shape.minY + shape.maxY) / 2;
      const relativeTreshold = THRESHOLD_LINE_HIT / this.context.camera.getCameraScale();

      return intersects.boxBox(
        x - relativeTreshold / 2,
        y - relativeTreshold / 2,
        relativeTreshold,
        relativeTreshold,
        this.labelGeometry.x,
        this.labelGeometry.y,
        this.labelGeometry.width,
        this.labelGeometry.height
      );
    }
    return false;
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

  public getStrokeColor(state: TConnection) {
    if (state.selected) return state.styles?.selectedBackground || this.context.colors.connection?.selectedBackground;

    return state.styles?.background || this.context.colors.connection?.background;
  }

  /**
   * The stroke of the line: color, width (world units) and dash. Override it to style connections from their data;
   * both Path2D and WebGL draw it. A dash with `speed` runs from source to target.
   */
  public getStroke(state: TBaseConnectionState = this.state): TAppearanceStroke {
    const color = this.getStrokeColor(state) ?? this.context.colors.connection.background;
    const width = state.hovered || state.selected ? 4 : 2;
    const dash = state.dashed ? { pattern: state.styles?.dashes || [6, 4] } : undefined;
    return { color, width, dash };
  }

  /** The line as cubic segments with its stroke; undefined when a subclass draws its own `createPath()`. */
  public getAppearance(state: TBaseConnectionState = this.state): TConnectionAppearance | undefined {
    if (this.createPath !== BlockConnection.prototype.createPath || !this.connectionPoints) return undefined;
    const { x1, y1, x2, y2 } = this.geometry;
    const segments = this.props.useBezier
      ? bezierSegment(generateBezierParams({ x: x1, y: y1 }, { x: x2, y: y2 }, this.props.bezierDirection))
      : lineSegment(x1, y1, x2, y2);
    return { kind: "curve", segments: new Float32Array(segments), stroke: this.getStroke(state) };
  }

  /** The arrow chevron as two straight segments; undefined when a subclass draws its own `createArrowPath()`. */
  public getArrowAppearance(state: TBaseConnectionState = this.state): TConnectionAppearance | undefined {
    if (this.createArrowPath !== BlockConnection.prototype.createArrowPath || !this.connectionPoints) return undefined;
    const [a, b, c] = this.getArrowPoints();
    if (!a || !b || !c) return undefined;
    const stroke = this.getStroke(state);
    return {
      kind: "curve",
      segments: new Float32Array([...lineSegment(a.x, a.y, b.x, b.y), ...lineSegment(b.x, b.y, c.x, c.y)]),
      stroke: { color: stroke.color, width: stroke.width },
    };
  }

  /** Whether the stroke changes with time: a running dash or a pulse. */
  public isAnimated(): boolean {
    const { dash, pulse } = this.getStroke();
    return Boolean(dash?.speed || pulse?.period);
  }

  protected unmount(): void {
    this.unsubscribeLabelFontSize?.();
    this.unsubscribeLabelFontSize = undefined;
    super.unmount();
    this.context.batch.delete(this);
    this.context.batch.delete(this.arrowShape);
    this.context.labels.delete(this.labelShape);
  }
}

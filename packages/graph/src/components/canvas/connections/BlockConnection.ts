import intersects from "intersects";

import type { TComponentMode } from "../../../lib/CoreComponent";
import { isDevelopmentBuild } from "../../../lib/detachedWarning";
import { resolveSceneSize } from "../../../lib/scene/size";
import type { TScenePrimitive, TSceneStroke, TSceneStyle } from "../../../lib/scene/types";
import { largestSize } from "../../../lib/scene/webgl/levelBounds";
import { HitBoxData } from "../../../services/HitTest";
import type { TSceneKey } from "../../../services/scene/sceneKey";
import { ESelectionStrategy } from "../../../services/selection/types";
import type { TStyleParts, TStyleTarget } from "../../../services/styles/types";
import { entityKey } from "../../../services/tags/TagStore";
import { TConnection } from "../../../store/connection/ConnectionState";
import { isMetaKeyEvent } from "../../../utils/functions";
import { cachedMeasureText } from "../../../utils/renderers/text";
import { TPoint, TRect } from "../../../utils/types/shapes";

import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "./BaseConnection";
import { Path2DRenderInstance, TPathBounds } from "./BatchPath2D";
import { BlockConnections, TGraphConnectionsContext } from "./BlockConnections";
import { ConnectionLabel } from "./Label";
import type { IConnectionLabelOwner } from "./Label";
import { blockGeometry } from "./geometry";
import type { TConnectionGeometry, TConnectionGeometryFn } from "./geometry";
import { distanceToArrow, distanceToSegments } from "./geometry/distance";
import { turnedPolylineStrokes } from "./geometry/polylineStroke";
import { stockBezierSegments } from "./geometry/segments";
import { hasChangedValue } from "./hasChangedValue";
import { getLabelCoords } from "./labelHelper";
import { SceneLine } from "./lines";
import type { ConnectionLine, TConnectionLineClass, TLineStroke } from "./lines";
import { getSelectionColor } from "./lines/ConnectionLine";
import { arrowSegments } from "./lines/SceneLine";
import type { TLineInteraction } from "./lines/types";
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

function sceneStroke(stroke: TLineStroke): TSceneStroke {
  return { color: stroke.color, width: stroke.width, dash: stroke.dash?.pattern.slice() };
}

/** Connection geometries may reuse their buffers. The scene owns the shaft until its next published update. */
function snapshotShaft(primitives: TScenePrimitive[]): TScenePrimitive[] {
  const shaft = primitives[0];
  if (shaft?.kind === "path" && shaft.part === "line") {
    const segments = shaft.segments.slice();
    if (stockBezierSegments.has(shaft.segments)) stockBezierSegments.add(segments);
    if (turnedPolylineStrokes.has(shaft.segments)) turnedPolylineStrokes.add(segments);
    primitives[0] = { ...shaft, segments };
  }
  return primitives;
}

function sameNumbers(a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function sameStroke(a: TSceneStroke | undefined, b: TSceneStroke | undefined): boolean {
  return (
    a === b ||
    Boolean(
      a && b && a.color === b.color && a.align === b.align && Object.is(a.width, b.width) && sameNumbers(a.dash, b.dash)
    )
  );
}

/** Both lists came from this component's standard shaft, arrow and label writer. External primitives always republish. */
function samePrimitive(a: TScenePrimitive, b: TScenePrimitive): boolean {
  if (a === b) return true;
  if (
    a.kind !== b.kind ||
    a.part !== b.part ||
    a.minScale !== b.minScale ||
    a.maxScale !== b.maxScale ||
    a.levelMask !== b.levelMask
  )
    return false;
  if (a.kind === "path" && b.kind === "path") {
    return (
      sameStroke(a.stroke, b.stroke) &&
      sameStroke(a.canvasStroke, b.canvasStroke) &&
      a.effect?.effect === b.effect?.effect &&
      Object.is(a.effect?.minScale, b.effect?.minScale) &&
      Object.is(a.effect?.maxScale, b.effect?.maxScale) &&
      sameNumbers(a.effect?.params, b.effect?.params) &&
      a.effectShowsSelection === b.effectShowsSelection &&
      a.interaction?.hovered === b.interaction?.hovered &&
      a.interaction?.selected === b.interaction?.selected &&
      a.interaction?.selectionColor === b.interaction?.selectionColor &&
      stockBezierSegments.has(a.segments) === stockBezierSegments.has(b.segments) &&
      turnedPolylineStrokes.has(a.segments) === turnedPolylineStrokes.has(b.segments) &&
      sameNumbers(a.segments, b.segments)
    );
  }
  if (a.kind === "polygon" && b.kind === "polygon")
    return a.fill === b.fill && sameStroke(a.stroke, b.stroke) && sameNumbers(a.points, b.points);
  return !hasChangedValue(a, b) && !hasChangedValue(b, a);
}

export class BlockConnection<T extends TConnection = TConnection>
  extends BaseConnection<TConnectionProps, TBaseConnectionState, TGraphConnectionsContext, T>
  implements IConnectionLabelOwner
{
  /**
   * Retained connections submit their line, arrow and labels together. A subclass that draws in `render()` or
   * relies on other per-frame hooks declares
   * `static override readonly mode = "immediate";`.
   */
  public static override readonly mode: TComponentMode = "retained";

  /** The line's appearance and optional Canvas drawing hooks. The graph scene picks its renderer. */
  public static line: TConnectionLineClass = SceneLine;

  /** Pure shape: cubic segments and the arrow, in world coordinates. */
  public static geometry: TConnectionGeometryFn = blockGeometry;

  public declare readonly __styleParts?: TStyleParts<"line" | "arrow" | "labelBackground" | "label">;

  public readonly cursor = "pointer";

  /** Created in the constructor: `new (this.constructor.line)(this)`. Owns the look and the line and arrow items. */
  protected readonly line: ConnectionLine;

  private readonly lineUsesCanvasHooks: boolean;

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

  private sceneKey?: TSceneKey;

  private submittedPrimitives?: readonly TScenePrimitive[];

  private unbindSceneStyle?: () => void;

  private sceneHitStyle?: TSceneStyle;

  private sceneHitHalfWidth = 0;

  private sceneInteraction?: TLineInteraction;

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

    const LineClass = (this.constructor as typeof BlockConnection).line;
    // The line class checks the connection type on its side (see TConnectionLineClass); the connection is this one.
    this.line = new LineClass(this as never);
    this.lineUsesCanvasHooks = this.line.usesCanvasDrawing();
    this.updateLine(this.state, props);
  }

  /**
   * Moves the line and arrow items to the group and z-level of the state and keeps the label pass in step.
   *
   * Takes the props explicitly: during `propsChanged()` `this.props` still holds the previous values.
   */
  private updateLine(state: TBaseConnectionState = this.state, props: TConnectionProps = this.props): void {
    if (this.geometryDirty && this.usesSceneDrawing()) return;
    this.line.readStrokes(state, props);
    this.updateDrawing(state, props);
  }

  protected hasCanvasDecorations(defaultAfterRender?: BlockConnection["afterRender"]): boolean {
    return (
      this.afterRender !== defaultAfterRender ||
      this.renderLabel !== BlockConnection.prototype.renderLabel ||
      this.renderLabelText !== BlockConnection.prototype.renderLabelText
    );
  }

  private usesSceneDrawing(): boolean {
    const mode = (this.constructor as typeof BlockConnection).mode;
    return mode === "retained" && !this.lineUsesCanvasHooks && !this.hasCanvasDecorations();
  }

  public getSceneKey(): TSceneKey | undefined {
    return this.sceneKey;
  }

  private updateDrawing(state: TBaseConnectionState = this.state, props: TConnectionProps = this.props): void {
    if (this.usesSceneDrawing()) {
      this.syncScene(state, props);
    } else {
      this.line.updateItems(state, props);
      this.syncLabel(this.getBatchZIndex(state));
    }
  }

  private syncScene(state: TBaseConnectionState, props: TConnectionProps): void {
    const scene = this.context.graph.scene;
    const key = this.sceneKey;
    const geometry = this.shape;
    const pathBounds = this.pathBounds;
    const visible = this.isRenderAllowed();
    if (!visible || !geometry || !pathBounds) {
      if (key && !scene.store.get(key.elementId)?.hidden) scene.store.update(key.elementId, { hidden: true });
      return;
    }
    const primitives = this.scenePrimitives(geometry, state, props);
    const label = this.labelWorldBounds ?? pathBounds;
    const bounds = {
      minX: Math.min(pathBounds[0], label[0]),
      minY: Math.min(pathBounds[1], label[1]),
      maxX: Math.max(pathBounds[2], label[2]),
      maxY: Math.max(pathBounds[3], label[3]),
    };
    const zIndex = this.zIndex;
    const standardLabels = this.appendSceneLabels === BlockConnection.prototype.appendSceneLabels;
    if (key) {
      const element = scene.store.get(key.elementId);
      const patch: Parameters<typeof scene.store.update>[1] = {};
      if (!element || hasChangedValue(bounds, element.bounds)) patch.bounds = bounds;
      if (
        !element ||
        !standardLabels ||
        element.primitives !== this.submittedPrimitives ||
        element.primitives.length !== primitives.length ||
        !primitives.every((primitive, i) => samePrimitive(primitive, element.primitives[i]))
      )
        patch.primitives = snapshotShaft(primitives);
      if (element?.zIndex !== zIndex) patch.zIndex = zIndex;
      if (element?.hidden) patch.hidden = false;
      if (Object.keys(patch).length) scene.store.update(key.elementId, patch);
      if (patch.primitives) this.submittedPrimitives = standardLabels ? primitives : undefined;
    } else {
      const id = this.getEntityId();
      const elementId = entityKey("connection", id);
      scene.store.add({
        id: elementId,
        entityType: "connection",
        x: 0,
        y: 0,
        zIndex,
        bounds,
        primitives: snapshotShaft(primitives),
      });
      this.submittedPrimitives = standardLabels ? primitives : undefined;
      this.sceneKey = { elementId, sub: 0 };
      this.unbindSceneStyle = scene.bindStyle(
        elementId,
        { type: "connection", id },
        this.constructor as TStyleTarget,
        (style) => this.updateSceneHitStyle(style)
      );
    }
  }

  private updateSceneHitStyle(style: TSceneStyle): void {
    const previous = this.sceneHitStyle;
    this.sceneHitStyle = style;
    const line = style.parts?.line?.width;
    const arrow = style.parts?.arrow?.width;
    const halfWidth = Math.max(largestSize(line ?? 0), largestSize(arrow ?? 0)) / 2;
    if (halfWidth !== this.sceneHitHalfWidth) {
      this.sceneHitHalfWidth = halfWidth;
      if (this.isRenderAllowed() && this.shape) this.updateHitBox();
    }
    if (previous?.raise !== style.raise || previous?.base !== style.base || previous?.parts !== style.parts) {
      this.context.graph.getGraphLayer().requestRetarget();
    }
  }

  private getSceneInteraction(state: TBaseConnectionState): TLineInteraction {
    const hovered = Boolean(state.hovered);
    const selected = Boolean(state.selected);
    const selectionColor = getSelectionColor(this, state);
    const current = this.sceneInteraction;
    if (current?.hovered === hovered && current.selected === selected && current.selectionColor === selectionColor) {
      return current;
    }
    this.sceneInteraction = { hovered, selected, selectionColor };
    return this.sceneInteraction;
  }

  private scenePrimitives(
    geometry: TConnectionGeometry,
    state: TBaseConnectionState,
    props: TConnectionProps
  ): TScenePrimitive[] {
    const shape = this.line.getSceneShape();
    const strokes = this.line.getSceneStrokes();
    const primitives: TScenePrimitive[] = [
      {
        kind: "path",
        part: "line",
        segments: shape?.segments ?? geometry.segments,
        stroke: sceneStroke(shape?.stroke ?? strokes.shaft),
        canvasStroke: shape?.effect ? sceneStroke(strokes.shaft) : undefined,
        effect: shape?.effect
          ? { effect: shape.effect, params: shape.params?.slice() ?? [], ...shape.effectScaleRange }
          : undefined,
        interaction: { ...(shape?.interaction ?? this.getSceneInteraction(state)) },
        effectShowsSelection: shape?.effectShowsSelection,
      },
    ];
    const arrow = props.showConnectionArrows ? geometry.arrow : undefined;
    if (arrow && strokes.arrow && arrow.points.length >= 4) {
      const { points, closed } = arrow;
      const stroke = sceneStroke(strokes.arrow);
      if (closed) {
        for (let i = 2; i + 3 < points.length; i += 2) {
          const triangle =
            points.length === 6
              ? points.slice()
              : new Float32Array([points[0], points[1], points[i], points[i + 1], points[i + 2], points[i + 3]]);
          primitives.push({ kind: "polygon", part: "arrow", points: triangle, fill: stroke.color });
        }
      }
      primitives.push({ kind: "path", part: "arrow", segments: arrowSegments(arrow), stroke });
    }
    this.appendSceneLabels(primitives, state);
    return primitives;
  }

  protected appendSceneLabels(primitives: TScenePrimitive[], state: TBaseConnectionState): void {
    if (!state.label || !this.labelPaintGeometry) return;
    const rect = this.labelPaintGeometry;
    const [top, right, , left] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    const size = this.context.connectionLabelFontSize.peek();
    const { background, text } = this.getLabelColors(state);
    primitives.push(
      { kind: "rect", part: "labelBackground", ...rect, fill: background },
      {
        kind: "text",
        part: "label",
        text: state.label,
        color: text,
        family: "sans-serif",
        x: rect.x + left,
        y: rect.y + top,
        size,
        lineHeight: size,
        width: rect.width - left - right + 1,
        wrap: false,
      }
    );
  }

  protected getLabelColors({ selected, hovered }: TBaseConnectionState): { background: string; text: string } {
    const colors = this.context.colors.connectionLabel;
    return {
      background: (selected && colors.selectedBackground) || (hovered && colors.hoverBackground) || colors.background,
      text: (selected && colors.selectedText) || (hovered && colors.hoverText) || colors.text,
    };
  }

  /** Batch z-level: selected and hovered connections are drawn above the others. */
  public getBatchZIndex(state: TBaseConnectionState = this.state): number {
    return state.selected || state.hovered ? this.zIndex + 10 : this.zIndex;
  }

  /**
   * Re-reads the line's look: for looks that depend on data outside the connection's store. It also re-evaluates
   * an `isRenderAllowed()` override that reads such data, for the line, its arrow and the label.
   *
   * A stroke whose width follows the camera (a width in screen pixels, read again on zoom) passes
   * `{ followsCamera: true }`: the hit box it resizes then asks GraphLayer for no new pointer target, as camera moves
   * keep today's rule (settled item 11). A width that follows data asks, so hover follows it under a still pointer.
   */
  public invalidateLine(options?: { readonly followsCamera?: boolean }): void {
    // An unmounted connection has left the batch and the label pass.
    if (!this.isEntityAvailable()) return;
    const lineHalfWidth = this.line.getLineHalfWidth();
    const arrowHalfWidth = this.line.getArrowHalfWidth();
    this.line.readStrokes();
    if (lineHalfWidth !== this.line.getLineHalfWidth() || arrowHalfWidth !== this.line.getArrowHalfWidth()) {
      // Bounds and the hit box pad by half the stroke widths.
      const updateBounds = (): void => {
        this.updateBounds();
        this.updateCullingBounds();
      };
      if (options?.followsCamera) this.withCameraDerivedHitBox(updateBounds);
      else updateBounds();
    }
    this.updateDrawing();
  }

  /** Keeps the label pass in step with the label's bounds, visibility and z-level. */
  private syncLabel(zIndex: number = this.getBatchZIndex()): void {
    if (this.usesSceneDrawing()) return;
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
        const updateBounds = (): void => {
          this.updateBounds();
          this.updateCullingBounds();
          this.updateDrawing();
        };
        // A zoom that changed the font size resizes the box without a retarget (settled item 11: camera moves keep
        // today's rule); a change of the graph constants (the label's threshold) asks for one.
        if (this.context.isLabelFontSizeFromCamera?.()) this.withCameraDerivedHitBox(updateBounds);
        else updateBounds();
      });
    }
  }

  /** Hidden or shown (by `setVisibility` or by delegation): the line follows `isRenderAllowed()`. */
  protected override hiddenChanged(hidden: boolean): void {
    super.hiddenChanged(hidden);
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

  protected override shouldReceiveParentProps(props: Readonly<TConnectionProps> | undefined): boolean {
    // Extensions keep their full reconciliation lifecycle; only the built-in view skips unchanged parent props.
    return (
      this.constructor !== BlockConnection ||
      hasChangedValue(props, this.__data.nextProps ?? this.props) ||
      this.hasDispatchObserver("graph-component-change")
    );
  }

  protected override propsChanged(nextProps: TConnectionProps) {
    super.propsChanged(nextProps);
    if (hasChangedValue(nextProps, this.props)) this.updateLine(this.state, nextProps);
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
  protected override collectBoundsPoints(props: TConnectionProps = this.props): TPoint[] {
    this.updateLabelGeometry(props);
    const points: TPoint[] = [];
    const addCorners = (bounds: TPathBounds | undefined): void => {
      if (bounds) points.push({ x: bounds[0], y: bounds[1] }, { x: bounds[2], y: bounds[3] });
    };
    if (this.shape) addCorners(this.line.getBounds(this.shape));
    addCorners(this.getAfterRenderBounds());
    return points;
  }

  /**
   * The hit test reaches half the stroke width past the line and the arrow (the wider of them while arrows are shown),
   * plus `THRESHOLD_LINE_HIT`: the hit box pads by as much, so the broad phase never cuts the hit test off.
   */
  protected override getHitBoxPadding(): number {
    return (
      super.getHitBoxPadding() +
      Math.max(this.line.getLineHalfWidth(), this.line.getArrowHalfWidth() ?? 0, this.sceneHitHalfWidth)
    );
  }

  /** The bounds and the label, joined with the arrow's points while arrows are shown: the hit test covers the arrow. */
  protected override getHitBoxRect(): TRect {
    const rect = super.getHitBoxRect();
    const arrow = this.line.getArrowHalfWidth() === undefined ? undefined : this.shape?.arrow?.points;
    if (!arrow || arrow.length < 2) return rect;
    let minX = rect.x;
    let minY = rect.y;
    let maxX = rect.x + rect.width;
    let maxY = rect.y + rect.height;
    for (let i = 0; i + 1 < arrow.length; i += 2) {
      minX = Math.min(minX, arrow[i]);
      minY = Math.min(minY, arrow[i + 1]);
      maxX = Math.max(maxX, arrow[i]);
      maxY = Math.max(maxY, arrow[i + 1]);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

  /**
   * Reads the endpoints, runs the class's geometry, then updates bounds, culling bounds and the batch items. The strokes
   * are read before the bounds, which pad by half their widths, and the batch is told after.
   */
  protected override updatePoints(additionalPoints?: TPoint[], props: TConnectionProps = this.props): void {
    this.geometryContext = this.context;
    this.readConnectionPoints();
    this.shape = this.computeGeometry(props);
    this.line.readStrokes(this.state, props);
    this.updateBounds(additionalPoints, props);
    this.updateCullingBounds(props);
    this.updateDrawing(this.state, props);
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
      sourceDelegated: this.connectedState.$sourcePortState.value.isDelegated,
      targetDelegated: this.connectedState.$targetPortState.value.isDelegated,
    });
  }

  private updateCullingBounds(props: TConnectionProps = this.props): void {
    const shape = this.shape;
    if (shape && this.hasGeometry()) {
      // Strokes reach half their width past the geometry: 1 for the default width, 2 hovered or selected.
      const padding = this.line.getLineHalfWidth();
      // A sharp arrow join can extend past its vertices by the canvas miter limit.
      const arrowPoints = props.showConnectionArrows ? shape.arrow?.points : undefined;
      const arrowPadding = (this.line.getArrowHalfWidth() ?? padding) * this.context.ctx.miterLimit;
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
    if (!this.usesSceneDrawing()) {
      // Chunks cache the union of their items' bounds.
      this.context.batch.markBoundsDirty(this.line);
      this.context.batch.markBoundsDirty(this.line.arrow);
      this.syncLabel();
    }
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
    if (!this.isRenderAllowed()) return false;
    if (!this.usesSceneDrawing()) return this.line.hitTest(x, y, threshold) || this.hitTestLabel(shape);
    const paintedLabel = this.isScenePartVisible("label") || this.isScenePartVisible("labelBackground");
    return this.hitSceneStroke(x, y, threshold) || (paintedLabel && this.hitTestLabel(shape));
  }

  private hitSceneStroke(x: number, y: number, threshold: number): boolean {
    if (this.line.hitTest !== SceneLine.prototype.hitTest) {
      const shaftVisible = Boolean(this.shape?.segments.length) && this.isScenePartVisible("line");
      const arrowVisible = this.props.showConnectionArrows && this.shape?.arrow && this.isScenePartVisible("arrow");
      return Boolean(shaftVisible || arrowVisible) && this.line.hitTest(x, y, threshold);
    }
    return this.hitSceneGeometry(x, y, threshold);
  }

  /** @internal Default scene picking, including resolved part visibility and camera-dependent stroke widths. */
  public hitSceneGeometry(x: number, y: number, threshold: number): boolean {
    const geometry = this.shape;
    if (!geometry) return false;
    const scale = this.context.camera.getCameraScale();
    const style = this.sceneHitStyle;
    const lineSize = style?.parts?.line?.width;
    const width =
      (lineSize === undefined ? this.line.getLineHalfWidth() : resolveSceneSize(lineSize, scale) / 2) + threshold;
    if (
      this.isScenePartVisible("line") &&
      geometry.segments.length &&
      distanceToSegments(geometry.segments, x, y, 0.5 / scale, width) <= width
    )
      return true;
    const arrowWidth = this.line.getArrowHalfWidth();
    const arrowSize = style?.parts?.arrow?.width;
    return (
      geometry.arrow !== undefined &&
      arrowWidth !== undefined &&
      this.isScenePartVisible("arrow") &&
      distanceToArrow(geometry.arrow, x, y) <=
        (arrowSize === undefined ? arrowWidth : resolveSceneSize(arrowSize, scale) / 2) + threshold
    );
  }

  private isScenePartVisible(part: string): boolean {
    const style = this.sceneHitStyle;
    return (style?.parts?.[part]?.visible ?? style?.base?.[part]?.visible) !== false;
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
    this.unbindSceneStyle?.();
    if (this.sceneKey) this.context.graph.scene.store.delete(this.sceneKey.elementId);
    this.sceneKey = undefined;
    this.submittedPrimitives = undefined;
    super.unmount();
    this.line.dispose();
    this.context.labels.delete(this.labelShape);
  }
}

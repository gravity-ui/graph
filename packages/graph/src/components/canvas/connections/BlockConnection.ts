import intersects from "intersects";

import { HitBoxData } from "../../../services/HitTest";
import { ESelectionStrategy } from "../../../services/selection/types";
import { TConnection } from "../../../store/connection/ConnectionState";
import { isMetaKeyEvent } from "../../../utils/functions";
import { getFontSize } from "../../../utils/functions/text";
import { cachedMeasureText } from "../../../utils/renderers/text";

import { ConnectionArrow } from "./Arrow";
import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "./BaseConnection";
import { Path2DRenderInstance, Path2DRenderStyleResult } from "./BatchPath2D";
import { BlockConnections, TGraphConnectionsContext } from "./BlockConnections";
import { bezierCurveLine, getArrowCoords, isPointInStroke } from "./bezierHelpers";
import { getLabelCoords } from "./labelHelper";

export type TConnectionProps = TBaseConnectionProps & {
  useBezier: boolean;
  bezierDirection: "vertical" | "horizontal";
  showConnectionArrows: boolean;
  showConnectionLabels: boolean;
};

export class BlockConnection<T extends TConnection>
  extends BaseConnection<TConnectionProps, TBaseConnectionState, TGraphConnectionsContext, T>
  implements Path2DRenderInstance
{
  public readonly cursor = "pointer";

  protected path2d!: Path2D;

  private labelGeometry = { x: 0, y: 0, width: 0, height: 0 };

  protected geometry: { x1: number; x2: number; y1: number; y2: number } = { x1: 0, x2: 0, y1: 0, y2: 0 };

  /**
   * The arrow shape component that renders the arrow in the middle of the connection.
   * This is conditionally added to the batch renderer based on the showConnectionArrows setting.
   */
  protected arrowShape = new ConnectionArrow(this);

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
    const zIndex = state.selected || state.hovered ? this.zIndex + 10 : this.zIndex;
    this.context.batch.update(this, { zIndex: zIndex, group: this.getClassName(state) });

    // Handle arrow visibility based on the provided props
    if (props.showConnectionArrows) {
      // Update will handle adding if not already in batch or updating if it is
      this.context.batch.update(this.arrowShape, { zIndex: zIndex - 1, group: `arrow/${this.getClassName(state)}` });
    } else {
      // Remove arrow from batch if showConnectionArrows is false
      this.context.batch.delete(this.arrowShape);
    }
  }

  public getPath(): Path2D {
    return this.generatePath();
  }

  /**
   * Creates the Path2D object for the arrow in the middle of the connection.
   * This is used by the ConnectionArrow component to render the arrow.
   *
   * @returns A Path2D object representing the arrow shape
   */
  public createArrowPath() {
    const coords = getArrowCoords(
      this.props.useBezier,
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      this.props.bezierDirection
    );
    const path = new Path2D();
    path.moveTo(coords[0], coords[1]);
    path.lineTo(coords[2], coords[3]);
    path.lineTo(coords[4], coords[5]);
    return path;
  }

  public styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    ctx.lineWidth = this.state.hovered || this.state.selected ? 4 : 2;
    const strokeColor = this.getStrokeColor(this.state);
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
    }
    return { type: "stroke" };
  }

  protected generatePath() {
    /* Setting this.path2D is important, as hotbox checking uses the isPointInStroke method. */
    this.path2d = this.createPath();
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
    const stroke = this.getStrokeColor(state);
    const dash = state.dashed ? (state.styles?.dashes || [6, 4]).join(",") : "";
    return `connection/${hovered}/${selected}/${stroke}/${dash}`;
  }

  public style(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    this.setRenderStyles(ctx, this.state);
    return { type: "stroke" };
  }

  protected setRenderStyles(ctx: CanvasRenderingContext2D, state = this.state, withDashed = true) {
    ctx.lineWidth = state.hovered || state.selected ? 4 : 2;
    const strokeColor = this.getStrokeColor(state);
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
    }
    if (withDashed && state.dashed) {
      ctx.setLineDash(state.styles?.dashes || [6, 4]);
    }
  }

  public afterRender?(ctx: CanvasRenderingContext2D): void {
    const cameraClose =
      this.context.camera.getCameraScale() >= this.context.constants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;

    if (this.state.label && this.props.showConnectionLabels && cameraClose) {
      this.renderLabelText(ctx);
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

  public get zIndex() {
    return this.context.constants.connection.DEFAULT_Z_INDEX;
  }

  protected override updatePoints() {
    super.updatePoints();

    if (this.connectionPoints) {
      this.geometry.x1 = this.connectionPoints[0].x;
      this.geometry.y1 = this.connectionPoints[0].y;
      this.geometry.x2 = this.connectionPoints[1].x;
      this.geometry.y2 = this.connectionPoints[1].y;

      this.applyShape();
    }
  }

  protected override handleEvent(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
    super.handleEvent(event);

    switch (event.type) {
      case "click": {
        const { blocksList } = this.context.graph.rootStore;
        const isAnyBlockSelected = blocksList.$selectedBlocks.value.length !== 0;
        const isAnyAnchorSelected = Boolean(blocksList.$selectedAnchor.value);

        if (!isMetaKeyEvent(event) && isAnyBlockSelected) {
          blocksList.resetSelection();
        }

        if (!isMetaKeyEvent(event) && isAnyAnchorSelected) {
          blocksList.resetSelection();
        }

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

  private renderLabelText(ctx: CanvasRenderingContext2D) {
    if (!this.state.label) return;

    const [labelInnerTopPadding, labelInnerRightPadding, labelInnerBottomPadding, labelInnerLeftPadding] =
      this.context.constants.connection.LABEL.INNER_PADDINGS;
    const padding = this.context.constants.system.GRID_SIZE / 8;
    const fontSize = Math.max(14, getFontSize(9, this.context.camera.getCameraScale()));
    const font = `${fontSize}px sans-serif`;

    const measure = cachedMeasureText(this.state.label, {
      font,
    });
    if (!measure) return;

    const height = measure.height;
    const width = measure.width;

    const { x, y, aligment } = getLabelCoords(
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      measure.width + padding * 2 + labelInnerLeftPadding + labelInnerRightPadding,
      measure.height + labelInnerTopPadding + labelInnerBottomPadding,
      this.context.constants.system.GRID_SIZE
    );

    this.labelGeometry = { x, y, width, height };

    const connectionLabelColors = this.context.colors?.connectionLabel;
    if (!connectionLabelColors) return;

    const bgColor = connectionLabelColors.background ?? "#000";
    const hoverBgColor = connectionLabelColors.hoverBackground ?? bgColor;
    const selectedBgColor = connectionLabelColors.selectedBackground ?? bgColor;
    const textColor = connectionLabelColors.text ?? "#fff";
    const hoverTextColor = connectionLabelColors.hoverText ?? textColor;
    const selectedTextColor = connectionLabelColors.selectedText ?? textColor;

    ctx.fillStyle = this.state.selected ? selectedBgColor : this.state.hovered ? hoverBgColor : bgColor;

    ctx.fillRect(
      x - labelInnerLeftPadding,
      y - labelInnerTopPadding,
      measure.width + labelInnerLeftPadding + labelInnerRightPadding,
      measure.height + labelInnerTopPadding + labelInnerBottomPadding
    );

    ctx.fillStyle = this.state.selected ? selectedTextColor : this.state.hovered ? hoverTextColor : textColor;

    ctx.textBaseline = "top";
    ctx.textAlign = aligment;
    ctx.font = font;
    ctx.fillText(this.state.label, x + padding, y + padding);
  }

  public getStrokeColor(state: TConnection): string {
    const connectionColors = this.context.colors.connection;
    if (state.selected) {
      return state.styles?.selectedBackground || connectionColors!.selectedBackground!;
    }

    return state.styles?.background || connectionColors!.background!;
  }

  protected unmount(): void {
    super.unmount();
    this.context.batch.delete(this);
    this.context.batch.delete(this.arrowShape);
  }
}

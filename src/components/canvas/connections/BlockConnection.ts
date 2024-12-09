import intersects from "intersects";

import { HitBoxData } from "../../../services/HitTest";
import { TConnection } from "../../../store/connection/ConnectionState";
import { isMetaKeyEvent } from "../../../utils/functions";
import { getFontSize } from "../../../utils/functions/text";
import { cachedMeasureText } from "../../../utils/renderers/text";
import { ESelectionStrategy } from "../../../utils/types/types";

import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "./BaseConnection";
import { Path2DRenderInstance } from "./BatchPath2D";
import { BlockConnections, TGraphConnectionsContext } from "./BlockConnections";
import { bezierCurveLine, getArrowCoords, isPointInStroke } from "./bezierHelpers";
import { getLabelCoords } from "./labelHelper";

export type TConnectionProps = TBaseConnectionProps & {
  useBezier: boolean;
  bezierDirection: "vertical" | "horizontal";
  showConnectionArrows: boolean;
  showConnectionLabels: boolean;
};

export type TBlockConnection = {
  id: string;
  addInRenderOrder(cmp, setting: object): void;
  removeFromRenderOrder(cmp): void;
};

export class BlockConnection extends BaseConnection<
  TConnectionProps,
  TBaseConnectionState,
  TGraphConnectionsContext
> implements Path2DRenderInstance {

  public readonly cursor = "pointer";

  protected path2d: Path2D;

  private labelGeometry = { x: 0, y: 0, width: 0, height: 0 };

  protected geometry: { x1: number, x2: number, y1: number, y2: number } = { x1: 0, x2: 0, y1: 0, y2: 0 };

  constructor(props: TConnectionProps, parent: BlockConnections) {
    super(props, parent);
    this.addEventListener("click", this);

    this.context.batch.add(this, {zIndex: this.zIndex, group: this.getClassName()});
  }

  public createPath(): Path2D {
    if(!this.geometry) {
      return new Path2D();
    }
    if (this.props.useBezier) {
      this.path2d = bezierCurveLine(
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
    } else {
      this.path2d = new Path2D();
      this.path2d.moveTo(this.geometry.x1, this.geometry.y1);
      this.path2d.lineTo(this.geometry.x2, this.geometry.y2);
    }

    return this.path2d;
  }

  public getClassName(state = this.state) {
    const hovered = state.hovered ? 'hovered' : 'none';
    const selected = state.selected ? 'selected' : 'none';
    const stroke = this.getStrokeColor(state);
    const dash = state.dashed ? (state.styles?.dashes || [6, 4]).join(',') : "";
    return `connection/${hovered}/${selected}/${stroke}/${dash}`;
  }
  
  public style(ctx: CanvasRenderingContext2D): { type: "stroke"; } | { type: "fill"; fillRule?: CanvasFillRule; } | undefined {
    this.setRenderStyles(ctx, this.state)
    return { type: "stroke" };
  }

  protected setRenderStyles(ctx: CanvasRenderingContext2D, state = this.state, withDashed = true) {
    ctx.lineWidth = state.hovered || state.selected ? 4 : 2;
    ctx.strokeStyle = this.getStrokeColor(state);
    if (withDashed && state.dashed) {
      ctx.setLineDash(state.styles?.dashes || [6, 4]);
    }
  }

  public afterRender?(ctx: CanvasRenderingContext2D): void {
    const cameraClose =
      this.context.camera.getCameraScale() >= this.context.constants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;

    if (this.props.showConnectionArrows && cameraClose) {
      ctx.stroke(this.renderArrow());
    }
    
    if (this.state.label && this.props.showConnectionLabels && cameraClose) {
      this.renderLabelText(ctx);
    }
  }

  protected override propsChanged(nextProps: TConnectionProps) {
    super.propsChanged(nextProps);

    this.context.batch.update(this, {zIndex: this.zIndex, group: this.getClassName()});
  }

  protected override stateChanged(nextState: TBaseConnectionState) {
    super.stateChanged(nextState);
    this.context.batch.update(this, {zIndex: this.zIndex, group: this.getClassName(nextState)});
  }

  public get zIndex() {
    return this.context.constants.connection.DEFAULT_Z_INDEX;
  }

  protected override updatePoints() {
    super.updatePoints();

    if (!this.connectedState) {
      this.geometry = {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
      }
      return;
    }
    const useAnchors = this.context.graph.rootStore.settings.getConfigFlag("useBlocksAnchors");
    const source = useAnchors ? (this.anchorsPoints?.[0] || this.connectionPoints[0]) : this.connectionPoints[0];
    const target = useAnchors ? (this.anchorsPoints?.[1] || this.connectionPoints[1]) : this.connectionPoints[1];

    if(!source || !target) {
      this.context.batch.update(this, {zIndex: this.zIndex, group: this.getClassName(this.state)});
      return;
    }
    this.geometry = {
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
    }
    this.context.batch.update(this, {zIndex: this.zIndex, group: this.getClassName(this.state)});
  }

  protected override handleEvent(event) {
    event.stopPropagation();
    super.handleEvent(event);

    switch (event.type) {
      case "click":
        this.context.graph.api.selectConnections(
          [this.props.id],
          !isMetaKeyEvent(event) ? true : !this.state.selected,
          !isMetaKeyEvent(event) ? ESelectionStrategy.REPLACE : ESelectionStrategy.APPEND
        );
        break;
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
    const [
      labelInnerTopPadding,
      labelInnerRightPadding,
      labelInnerBottomPadding,
      labelInnerLeftPadding,
    ] = this.context.constants.connection.LABEL.INNER_PADDINGS;
    const padding = this.context.constants.system.GRID_SIZE / 8;
    const fontSize = Math.max(14, getFontSize(9, this.context.camera.getCameraScale()));
    const font = `${fontSize}px sans-serif`;

    const measure = cachedMeasureText(this.state.label, {
      font,
    });
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

    ctx.fillStyle = this.context.colors.connectionLabel.text;

    if (this.state.hovered) ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    if (this.state.selected) ctx.fillStyle = this.context.colors.connectionLabel.selectedText;

    ctx.textBaseline = "top";
    ctx.textAlign = aligment;
    ctx.font = font;
    ctx.fillText(this.state.label, x + padding, y + padding);

    ctx.fillStyle = this.context.colors.connectionLabel.background;

    if (this.state.hovered) ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    if (this.state.selected) ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;

    ctx.fillRect(
      x - labelInnerLeftPadding,
      y - labelInnerTopPadding,
      measure.width + labelInnerLeftPadding + labelInnerRightPadding,
      measure.height + labelInnerTopPadding + labelInnerBottomPadding,
    );
  }

  public renderArrow() {
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

  public getStrokeColor(state: TConnection) {
    if (state.selected) return state.styles?.selectedBackground || this.context.colors.connection.selectedBackground;

    return state.styles?.background || this.context.colors.connection.background;
  }

  protected unmount(): void {
    super.unmount();
    this.context.batch.delete(this);
  }
}

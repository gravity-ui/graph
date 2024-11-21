import intersects from "intersects";

import { HitBoxData } from "../../../services/HitTest";
import { TConnection } from "../../../store/connection/ConnectionState";
import { isMetaKeyEvent } from "../../../utils/functions";
import { getFontSize } from "../../../utils/functions/text";
import { cachedMeasureText } from "../../../utils/renderers/text";
import { ESelectionStrategy } from "../../../utils/types/types";
import { GraphLayer } from "../layers/graphLayer/GraphLayer";

import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "./BaseConnection";
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


export class BlockConnection extends BaseConnection<TConnectionProps> {
  public readonly cursor = "pointer";

  protected path2d: Path2D;

  private labelGeometry = { x: 0, y: 0, width: 0, height: 0 };


  constructor(props: TConnectionProps, parent: GraphLayer) {
    super(props, parent);
    this.addEventListener("click", this);
  }

  protected override propsChanged(nextProps: TConnectionProps) {
    super.propsChanged(nextProps);

    this.addInRenderOrder(nextProps, this.state);
  }

  protected override stateChanged(nextState) {
    this.addInRenderOrder(this.props, nextState);
  }

  public addInRenderOrder(props, state) {
    this.props.addInRenderOrder(this, this.computeRenderSettings(props, state));
  }

  protected willIterate() {
    super.willIterate();
    if (this.firstIterate) {
      this.addInRenderOrder(this.props, this.state);
      return;
    }
  }

  public computeRenderSettings(props, state: TBaseConnectionState) {
    let lineWidth = 2;
    let zIndex = 1;
    let lineDash: number[] | boolean = false;
    const strokeStyle = this.getStrokeColor(state);

    if (state.selected) {
      zIndex = 2;
    } else if (state.hovered) {
      zIndex = 3;
    }

    if (state.dashed) {
      lineDash = state.styles?.dashes || [6, 4];
    }

    if (state.hovered || state.selected) {
      lineWidth = 4;
    }

    return { zIndex, lineWidth, lineDash, strokeStyle };
  }

  public get zIndex() {
    return this.context.constants.connection.DEFAULT_Z_INDEX;
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
      case "mouseenter":
        this.setState({ hovered: true });
        break;
      case "mouseleave":
        this.setState({ hovered: false });
        break;
    }
  }

  public onHitBox(shape: HitBoxData): boolean {
    if (!super.onHitBox(shape)) {
      return false;
    }

    const THRESHOLD_LINE_HIT = this.context.constants.connection.THRESHOLD_LINE_HIT;

    // If pointer over line
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

  private renderLabelText() {
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

    this.context.ctx.fillStyle = this.context.colors.connectionLabel.text;

    if (this.state.hovered) this.context.ctx.fillStyle = this.context.colors.connectionLabel.hoverText;
    if (this.state.selected) this.context.ctx.fillStyle = this.context.colors.connectionLabel.selectedText;

    this.context.ctx.textBaseline = "top";
    this.context.ctx.textAlign = aligment;
    this.context.ctx.font = font;
    this.context.ctx.fillText(this.state.label, x + padding, y + padding);

    this.context.ctx.fillStyle = this.context.colors.connectionLabel.background;

    if (this.state.hovered) this.context.ctx.fillStyle = this.context.colors.connectionLabel.hoverBackground;
    if (this.state.selected) this.context.ctx.fillStyle = this.context.colors.connectionLabel.selectedBackground;

    this.context.ctx.fillRect(
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

    this.context.ctx.moveTo(coords[0], coords[1]);
    this.context.ctx.lineTo(coords[2], coords[3]);
    this.context.ctx.lineTo(coords[4], coords[5]);
  }

  public getStrokeColor(state: TConnection) {
    if (state.selected) return state.styles?.selectedBackground || this.context.colors.connection.selectedBackground;

    return state.styles?.background || this.context.colors.connection.background;
  }

  public render() {
    super.render();

    this.updateGeometry(this.sourceBlock, this.targetBlock);

    const cameraClose =
      this.context.camera.getCameraScale() >= this.context.constants.connection.MIN_ZOOM_FOR_CONNECTION_ARROW_AND_LABEL;

    if (this.props.showConnectionArrows && cameraClose) {
      this.renderArrow();
    }

    if (this.state.label && this.props.showConnectionLabels && cameraClose) {
      this.renderLabelText();
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
        this.context.ctx,
        this.props.bezierDirection
      );
      return;
    } else {
      this.path2d = new Path2D();
      this.path2d.moveTo(this.geometry.x1, this.geometry.y1);
      this.path2d.lineTo(this.geometry.x2, this.geometry.y2);
      this.context.ctx.moveTo(this.geometry.x1, this.geometry.y1);
      this.context.ctx.lineTo(this.geometry.x2, this.geometry.y2);
    }

    //stroking line in withBatchedConnection
  }
}

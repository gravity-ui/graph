import { BlockConnection, getLabelCoords } from "@gravity-ui/graph";
import type { Path2DRenderStyleResult, TBaseConnectionState, TConnection } from "@gravity-ui/graph";

import { UIKIT_GRAPH_CONSTANTS } from "../constants";
import { getUikitGraphStore } from "../store/UikitGraphStore";
import { getUikitTextStyle } from "../text/font";
import { measureUikitText, renderUikitText } from "../text/renderUikitText";

import { getUikitConnectionLineWidth, getUikitConnectionStroke } from "./connectionStyle";
import { traceRoundedRect } from "./roundedRect";

/** Connection with uikit line colors, screen-pixel widths and a uikit label pill. */
export class UikitConnection<T extends TConnection = TConnection> extends BlockConnection<T> {
  protected override willMount(): void {
    super.willMount();
    const store = getUikitGraphStore(this.context.graph);
    const handleThemeChange = (): void => {
      // The stroke color is part of the batch group, so the shape has to be re-applied.
      this.applyShape();
      this.performRender();
    };
    this.subscribeSignal(store.$palette, handleThemeChange);
    // The label size depends on the typography.
    this.subscribeSignal(store.$typography, handleThemeChange);
  }

  public override getStrokeColor(state: TBaseConnectionState): string {
    return getUikitConnectionStroke(state, this.context.colors, getUikitGraphStore(this.context.graph).$palette.value);
  }

  protected override setRenderStyles(
    ctx: CanvasRenderingContext2D,
    state: TBaseConnectionState = this.state,
    withDashed = true
  ): void {
    super.setRenderStyles(ctx, state, withDashed);
    ctx.lineWidth = getUikitConnectionLineWidth(state, this.context.camera.getCameraScale());
  }

  public override styleArrow(ctx: CanvasRenderingContext2D): Path2DRenderStyleResult | undefined {
    const result = super.styleArrow(ctx);
    ctx.lineWidth = getUikitConnectionLineWidth(this.state, this.context.camera.getCameraScale());
    return result;
  }

  protected override renderLabelText(ctx: CanvasRenderingContext2D): void {
    if (!this.isVisible() || !this.state.label) {
      return;
    }
    const graph = this.context.graph;
    const scale = this.context.camera.getCameraScale();
    // The text would be skipped as too small; an empty pill is noise.
    if (getUikitTextStyle(graph, "caption-2").fontSize * scale < UIKIT_GRAPH_CONSTANTS.text.minScreenFontSize) {
      return;
    }
    const { labelPaddingX, labelPaddingY, labelRadius } = UIKIT_GRAPH_CONSTANTS.connection;
    const text = measureUikitText(graph, this.state.label, {
      variant: "caption-2",
      whiteSpace: "nowrap",
      maxWidth: Infinity,
    });
    const width = text.width + labelPaddingX * 2;
    const height = text.height + labelPaddingY * 2;
    const { x, y } = getLabelCoords(
      this.geometry.x1,
      this.geometry.y1,
      this.geometry.x2,
      this.geometry.y2,
      width,
      height,
      this.context.constants.system.GRID_SIZE
    );
    this.labelGeometry = { x, y, width, height };

    const colors = this.context.colors.connectionLabel;
    let background = colors.background;
    let foreground = colors.text;
    if (this.state.hovered) {
      background = colors.hoverBackground;
      foreground = colors.hoverText;
    }
    if (this.state.selected) {
      background = colors.selectedBackground;
      foreground = colors.selectedText;
    }

    traceRoundedRect(ctx, x, y, width, height, labelRadius);
    ctx.fillStyle = background;
    ctx.fill();
    renderUikitText(
      ctx,
      graph,
      this.state.label,
      { x: x + labelPaddingX, y: y + labelPaddingY, width: text.width + 1, height: text.height },
      { variant: "caption-2", whiteSpace: "nowrap", fill: foreground }
    );
  }
}

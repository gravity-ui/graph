import { CanvasBlock, ECameraScaleLevel, ESchedulerPriority, debounce } from "@gravity-ui/graph";
import type { TRect } from "@gravity-ui/graph";
import { signal } from "@preact/signals-core";

import { UIKIT_GRAPH_CONSTANTS } from "../constants";
import { getUikitGraphStore } from "../store/UikitGraphStore";
import { renderUikitText } from "../text/renderUikitText";
import type { TUikitBlockTheme } from "../theme/types";

import { getUikitBlockSurfaceStyle } from "./blockSurfaceStyle";
import { traceRoundedRect } from "./roundedRect";
import type { TUikitBlock } from "./types";

/** Canvas block with a uikit surface on every LOD level. Override `renderContent` for custom content. */
export class UikitBlock<T extends TUikitBlock = TUikitBlock> extends CanvasBlock<T> {
  /** Canvas hover state; React blocks use native :hover. */
  public readonly $hovered = signal(false);

  // TODO(graph-core): hover state on Block — BaseConnection has one, Block does not.
  protected debounceHover = debounce(
    (hovered: boolean) => {
      this.$hovered.value = hovered;
    },
    { priority: ESchedulerPriority.LOWEST, frameInterval: UIKIT_GRAPH_CONSTANTS.hover.frameInterval, frameTimeout: 0 }
  );

  protected override willMount(): void {
    super.willMount();
    this.addEventListener("mouseenter", () => this.debounceHover(true));
    this.addEventListener("mouseleave", () => this.debounceHover(false));
    const store = getUikitGraphStore(this.context.graph);
    this.subscribeSignal(this.$hovered, () => this.performRender());
    this.subscribeSignal(store.$palette, () => this.performRender());
    this.subscribeSignal(store.$typography, () => this.performRender());
  }

  protected override unmount(): void {
    // A pending hover update would keep the unmounted graph reachable from the global scheduler.
    this.debounceHover.cancel();
    super.unmount();
  }

  protected getBlockTheme(): TUikitBlockTheme {
    return this.state.meta?.theme ?? "normal";
  }

  protected renderSurface(ctx: CanvasRenderingContext2D): void {
    const style = getUikitBlockSurfaceStyle({
      theme: this.getBlockTheme(),
      selected: Boolean(this.state.selected),
      hovered: this.$hovered.value,
      scale: this.context.camera.getCameraScale(),
      colors: this.context.colors,
      palette: getUikitGraphStore(this.context.graph).$palette.value,
    });
    const { x, y, width, height } = this.state;
    const inset = style.lineWidth / 2;
    traceRoundedRect(ctx, x + inset, y + inset, width - style.lineWidth, height - style.lineWidth, style.radius);
    for (const fill of style.fills) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.lineWidth = style.lineWidth;
    ctx.strokeStyle = style.stroke;
    ctx.stroke();
  }

  protected override getContentRect(): TRect {
    const { padding } = UIKIT_GRAPH_CONSTANTS.block;
    return {
      x: this.state.x + padding,
      y: this.state.y + padding,
      width: this.state.width - padding * 2,
      height: this.state.height - padding * 2,
    };
  }

  /** Draws block content inside `rect`; surface, hover and selection stay in the base class. */
  protected renderContent(ctx: CanvasRenderingContext2D, rect: TRect, _level: ECameraScaleLevel): void {
    const graph = this.context.graph;
    const title = renderUikitText(ctx, graph, this.state.name, rect, { variant: "subheader-1", ellipsis: true });
    const description = this.state.meta?.description;
    if (!description || title.lines.length === 0) {
      return;
    }
    const offset = title.height + UIKIT_GRAPH_CONSTANTS.block.gap;
    renderUikitText(
      ctx,
      graph,
      description,
      { ...rect, y: rect.y + offset, height: rect.height - offset },
      { variant: "caption-2", color: "secondary", ellipsis: true }
    );
  }

  public override renderMinimalisticBlock(ctx: CanvasRenderingContext2D): void {
    this.renderSurface(ctx);
  }

  public override renderSchematicView(ctx: CanvasRenderingContext2D): void {
    this.renderSurface(ctx);
    this.renderContent(ctx, this.getContentRect(), ECameraScaleLevel.Schematic);
  }

  /** The React block covers this level; the surface avoids a gap before React mounts. */
  public override renderDetailedView(ctx: CanvasRenderingContext2D): void {
    this.renderSurface(ctx);
  }
}

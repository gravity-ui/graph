import { Component, TComponentState } from "../../../../lib/Component";
import { TRect } from "../../../../utils/types/shapes";

import type { TBelowLayerContext } from "./BelowLayer";
import { GridLayerPatterns } from "./GridLayerPatterns";
import type { TResolvedGridLayer } from "./gridLayerMath";
import { getGridTilePx, getVisibleWorldRect, intersectRects, isPatternLayer, resolveGridLayers } from "./gridLayerMath";

/**
 * Background dot grid rendered as a stack of layers (`constants.system.GRID_LAYERS`).
 * Layers are drawn from the smallest step to the largest, so coarser dots end up on top.
 */
export class GridLayers extends Component<TRect, TComponentState, TBelowLayerContext> {
  private readonly patterns = new GridLayerPatterns();

  constructor(props: TRect, parent: Component) {
    super(props, parent);

    this.shouldUpdateChildren = false;
    this.shouldRenderChildren = false;
  }

  public render(): void {
    const cameraState = this.context.camera.getCameraState();
    const region = intersectRects(this.props, getVisibleWorldRect(cameraState));
    if (!region) {
      this.patterns.retain([]);
      return;
    }

    const { GRID_SIZE, GRID_LAYERS, GRID_LAYER_FADE } = this.context.constants.system;
    const layers = resolveGridLayers(GRID_LAYERS, GRID_SIZE, cameraState.scale, GRID_LAYER_FADE);
    const dpr = this.context.layer.getDRP();
    const color = this.context.colors.canvas.dots;
    const ctx = this.context.ctx;
    const patternSteps: number[] = [];

    for (const layer of layers) {
      ctx.globalAlpha = layer.opacity;
      if (isPatternLayer(layer.spacingPx, dpr)) {
        patternSteps.push(layer.stepWorld);
        this.renderPatternLayer(layer, region, dpr, color);
      } else {
        this.renderDirectLayer(layer, region, cameraState.scale, color);
      }
    }
    ctx.globalAlpha = 1;

    this.patterns.retain(patternSteps);
  }

  protected unmount(): void {
    this.patterns.clear();
    super.unmount();
  }

  private renderPatternLayer(layer: TResolvedGridLayer, region: TRect, dpr: number, color: string): void {
    const ctx = this.context.ctx;
    const pattern = this.patterns.get(ctx, {
      stepWorld: layer.stepWorld,
      tilePx: getGridTilePx(layer.spacingPx, dpr),
      dotSizePx: layer.dotSize * dpr,
      color,
    });
    if (!pattern) {
      return;
    }
    ctx.fillStyle = pattern;
    ctx.fillRect(region.x, region.y, region.width, region.height);
  }

  private renderDirectLayer(layer: TResolvedGridLayer, region: TRect, scale: number, color: string): void {
    const ctx = this.context.ctx;
    const step = layer.stepWorld;
    const radius = layer.dotSize / 2 / scale;
    const startI = Math.ceil((region.x - radius) / step);
    const endI = Math.floor((region.x + region.width + radius) / step);
    const startJ = Math.ceil((region.y - radius) / step);
    const endJ = Math.floor((region.y + region.height + radius) / step);

    const path = new Path2D();
    for (let i = startI; i <= endI; i += 1) {
      for (let j = startJ; j <= endJ; j += 1) {
        const x = i * step;
        const y = j * step;
        path.moveTo(x + radius, y);
        path.arc(x, y, radius, 0, Math.PI * 2);
      }
    }

    // Clip like the pattern fill does, so edge dots are cut at the usable rect border
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.width, region.height);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fill(path);
    ctx.restore();
  }
}

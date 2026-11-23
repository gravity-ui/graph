import type { TComponentMode } from "../../../lib/CoreComponent";
import type { TScenePrimitive } from "../../../lib/scene/types";
import { clamp } from "../../../utils/functions/clamp";
import { TMeasureTextOptions } from "../../../utils/functions/text";
import { TTExtRect, renderText } from "../../../utils/renderers/text";

import { Block } from "./Block";
import type { TBlock, TBlockComponentState, TBlockProps, TBlockViewOptions } from "./Block";

/** The scene draws nothing for a legacy block: its element only orders it and is hit (spec §5.1). */
const NO_PRIMITIVES: readonly TScenePrimitive[] = Object.freeze([]);

/**
 * @deprecated Kept for one release (decision 1). A block drawn imperatively on the GraphLayer canvas in the frame walk,
 * as before the v2 scene: `render()` dispatches by level to `renderMinimalisticBlock`, `renderSchematicView` and
 * `renderDetailedView`, which subclasses override. It draws under every scene block, gets no tags, styles or WebGL,
 * and is hit by its scene order, so where it overlaps a scene block the picture and the hit order can disagree. Its
 * anchors draw in the scene, above it. Port the look to level methods (`minimalistic`, `schematic`, `detailed`) on
 * `CanvasBlock` instead.
 */
export class LegacyCanvasBlock<T extends TBlock = TBlock, Props extends TBlockProps = TBlockProps> extends Block<
  T,
  Props
> {
  /** Walked every frame: `render()` draws on the GraphLayer canvas. */
  public static override readonly mode: TComponentMode = "immediate";

  /** @internal Marks the class for the development check of imperative members in `Block` subclasses. */
  public static readonly legacyCanvas = true;

  protected shouldRenderText = false;

  /** Its element has no primitives: the frame walk draws the block on the GraphLayer canvas. */
  protected override minimalistic(): readonly TScenePrimitive[] {
    return NO_PRIMITIVES;
  }

  protected override schematic(): readonly TScenePrimitive[] {
    return NO_PRIMITIVES;
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return NO_PRIMITIVES;
  }

  /** Whether the walk paints it now: allowed to render and in the viewport. */
  public override isRendered(): boolean {
    return this.shouldRender && this.isVisible();
  }

  /** The scene raise, and the tree zIndex that orders legacy blocks on the GraphLayer canvas. */
  protected override raiseOnDragStart(): void {
    super.raiseOnDragStart();
    this.raiseBlock();
  }

  protected calcZIndex(): number {
    const raised = this.connectedState.$selected.value || this.lastDragEvent ? 1 : 0;
    return this.context.constants.block.DEFAULT_Z_INDEX + raised;
  }

  protected raiseBlock(): void {
    this.zIndex = this.calcZIndex();
    this.performRender();
  }

  /** Raises the tree zIndex on selection, which keeps the paint order of legacy blocks on the GraphLayer canvas. */
  protected stateChanged(nextState: TBlockComponentState<T>): void {
    if (!this.firstIterate && nextState.selected !== this.state.selected) {
      this.raiseBlock();
    }
    return super.stateChanged(nextState);
  }

  public getRenderIndex(): number {
    return this.renderOrder;
  }

  protected willRender(): void {
    super.willRender();

    const scale = this.context.camera.getCameraScale();
    this.shouldRenderText = scale > this.context.constants.block.SCALES[0];
  }

  protected renderStroke(color: string): void {
    const lineWidth = clamp(
      this.context.camera.getRelative(this.context.constants.block.BORDER_WIDTH),
      this.context.constants.block.BORDER_WIDTH,
      10
    );
    this.context.ctx.lineWidth = lineWidth;
    this.context.ctx.strokeStyle = color;
    this.context.ctx.strokeRect(
      this.state.x + lineWidth / 2,
      this.state.y + lineWidth / 2,
      this.state.width - lineWidth,
      this.state.height - lineWidth
    );
  }

  protected renderText(
    text: string,
    ctx = this.context.ctx,
    { rect, renderParams }: { rect: TTExtRect; renderParams: TMeasureTextOptions } = {
      rect: this.getContentRect(),
      renderParams: { font: this.props.font },
    }
  ): void {
    renderText(text, ctx, rect, renderParams);
  }

  public renderMinimalisticBlock(ctx: CanvasRenderingContext2D, options?: TBlockViewOptions): void {
    this.renderSchematicView(ctx, options);
  }

  protected renderBody(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.context.colors.block.background;
    ctx.strokeStyle = this.context.colors.block.border;

    ctx.fillRect(this.state.x, this.state.y, this.state.width, this.state.height);
    this.renderStroke(
      this.state.selected ? this.context.colors.block.selectedBorder : this.context.colors.block.border
    );
  }

  public renderSchematicView(ctx: CanvasRenderingContext2D, options?: TBlockViewOptions): void {
    this.renderBody(ctx);

    if (options?.text ?? this.shouldRenderText) {
      ctx.fillStyle = this.context.colors.block.text;
      ctx.textAlign = "center";
      this.renderText(this.state.name, ctx);
    }
  }

  public renderDetailedView(ctx: CanvasRenderingContext2D): void {
    return this.renderBody(ctx);
  }

  protected render(): void {
    switch (this.context.graph.scene.$level.value) {
      case "minimalistic": {
        this.renderMinimalisticBlock(this.context.ctx);
        break;
      }
      case "schematic": {
        this.renderSchematicView(this.context.ctx);
        break;
      }
      case "detailed": {
        this.renderDetailedView(this.context.ctx);
        break;
      }
    }
  }
}

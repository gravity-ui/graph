import { CanvasBlock } from "@gravity-ui/graph";
import type { TBlockViewOptions } from "@gravity-ui/graph";

import { etlKindBadges, etlStatusColors, etlStatusLabels, etlStatusTints, formatRows } from "./etl";
import type { TEtlBlock } from "./etl";

const fontFamily = '"YS Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const secondaryText = "#6b7280";
const radius = 12;
/** The content starts after the status stripe (8) and the padding (16); sizes are in world units. */
const paddingLeft = 24;
const paddingRight = 16;

const fittedTexts = new Map<string, string>();

/** The text, cut with an ellipsis to the width in the current font. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const key = `${ctx.font}|${maxWidth}|${text}`;
  const cached = fittedTexts.get(key);
  if (cached !== undefined) return cached;
  let fitted = text;
  if (ctx.measureText(text).width > maxWidth) {
    let end = text.length;
    while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
    fitted = `${text.slice(0, end).trimEnd()}…`;
  }
  fittedTexts.set(key, fitted);
  return fitted;
}

/**
 * An ETL stage on canvas. Far away the card is tinted with the status color; at the schematic level it shows the kind,
 * the name and the status; from the detailed level on the React card (EtlBlockView) covers it.
 */
export class EtlBlock extends CanvasBlock<TEtlBlock> {
  public override renderMinimalisticBlock(ctx: CanvasRenderingContext2D): void {
    this.renderCard(ctx, etlStatusTints[this.state.status], 24);
  }

  public override renderSchematicView(ctx: CanvasRenderingContext2D, options?: TBlockViewOptions): void {
    this.renderCard(ctx, this.context.colors.block.background, 8);
    if (options?.text ?? true) this.renderContent(ctx);
  }

  /** GraphBlock hides the canvas block once the React card mounts; until then the canvas draws the same card. */
  public override renderDetailedView(ctx: CanvasRenderingContext2D): void {
    this.renderSchematicView(ctx);
  }

  /** The rounded card, the status stripe on its left and the border: 1 screen pixel, 2.5 while selected. */
  private renderCard(ctx: CanvasRenderingContext2D, fill: string, stripe: number): void {
    const { x, y, width, height, status, selected } = this.state;
    const scale = this.context.camera.getCameraScale();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = etlStatusColors[status];
    ctx.fillRect(x, y, stripe, height);
    ctx.restore();

    const lineWidth = Math.min(selected ? Math.max(3, 2.5 / scale) : Math.max(1, 1 / scale), 20);
    const inset = lineWidth / 2;
    ctx.beginPath();
    ctx.roundRect(x + inset, y + inset, width - lineWidth, height - lineWidth, Math.max(radius - inset, 0));
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = selected ? this.context.colors.block.selectedBorder : this.context.colors.block.border;
    ctx.stroke();
  }

  /** The kind badge and the throughput, the name, the status; small texts only where the zoom makes them readable. */
  private renderContent(ctx: CanvasRenderingContext2D): void {
    const { x, y, width, name, kind, status, rowsPerSecond, error } = this.state;
    const scale = this.context.camera.getCameraScale();
    const left = x + paddingLeft;
    const right = x + width - paddingRight;

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    const badge = etlKindBadges[kind];
    ctx.font = `700 17px ${fontFamily}`;
    const badgeWidth = ctx.measureText(badge).width + 16;
    ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
    ctx.beginPath();
    ctx.roundRect(left, y + 16, badgeWidth, 28, 6);
    ctx.fill();
    ctx.fillStyle = secondaryText;
    ctx.fillText(badge, left + 8, y + 30);

    if (scale >= 0.4 && status === "running" && rowsPerSecond !== undefined) {
      ctx.font = `500 18px ${fontFamily}`;
      ctx.textAlign = "right";
      ctx.fillText(`${formatRows(rowsPerSecond)} rows/s`, right, y + 30);
      ctx.textAlign = "left";
    }

    ctx.font = `600 28px ${fontFamily}`;
    ctx.fillStyle = this.context.colors.block.text;
    ctx.fillText(fitText(ctx, name, right - left), left, y + 70);

    ctx.fillStyle = etlStatusColors[status];
    ctx.beginPath();
    ctx.arc(left + 7, y + 108, 7, 0, Math.PI * 2);
    ctx.fill();

    if (scale >= 0.35) {
      const label = status === "failed" && error ? `${etlStatusLabels[status]}: ${error}` : etlStatusLabels[status];
      ctx.font = `500 21px ${fontFamily}`;
      ctx.fillStyle = status === "failed" ? etlStatusColors.failed : secondaryText;
      ctx.fillText(fitText(ctx, label, right - left - 22), left + 22, y + 108);
    }
  }
}

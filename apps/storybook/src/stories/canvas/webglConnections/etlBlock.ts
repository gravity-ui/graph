import { CanvasBlock, selectedTag } from "@gravity-ui/graph";
import type { TScenePrimitive, TStyleRule } from "@gravity-ui/graph";

import { etlKindBadges, etlStatusColors, etlStatusLabels, etlStatusTints, formatRows } from "./etl";
import type { TEtlBlock } from "./etl";

const fontFamily = '"YS Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const secondaryText = "#6b7280";
const radius = 12;
/** The content starts after the status stripe (8) and the padding (16); sizes are in world units. */
const paddingLeft = 24;
const paddingRight = 16;

type TMeasure = (text: string, font: string) => number;

const font = (weight: string, size: number): string => `${weight} ${size}px ${fontFamily}`;

/**
 * An ETL stage on canvas. Far away the card is tinted with the status color; at the schematic level it shows the kind,
 * the name and the status; from the detailed level on the React card (EtlBlockView) covers it.
 */
export class EtlBlock extends CanvasBlock<TEtlBlock> {
  private schematicPrimitives?: readonly TScenePrimitive[];

  protected override minimalistic(): TScenePrimitive[] {
    return this.card(etlStatusTints[this.state.status], 24);
  }

  protected override schematic(): readonly TScenePrimitive[] {
    this.schematicPrimitives = [...this.card(undefined, 8), ...this.content()];
    return this.schematicPrimitives;
  }

  /** The scene prepares schematic before detailed. Share the same list while the React card mounts. */
  protected override detailed(): readonly TScenePrimitive[] {
    return this.schematicPrimitives ?? this.schematic();
  }

  /** The card, the status stripe on its left and the border (1 screen pixel; the selected width is a rule). */
  private card(fill: string | undefined, stripe: number): TScenePrimitive[] {
    const { width, height, status } = this.state;
    return [
      { kind: "rect", part: "body", x: 0, y: 0, width, height, radius, fill },
      {
        kind: "rect",
        x: 0,
        y: 0,
        width: stripe,
        height,
        radius: [radius, 0, 0, radius],
        fill: etlStatusColors[status],
      },
      {
        kind: "rect",
        part: "border",
        x: 0,
        y: 0,
        width,
        height,
        radius,
        border: { width: { px: 1, minWorld: 1, maxWorld: 20 }, align: "inside" },
      },
    ];
  }

  /**
   * The kind badge, the throughput, the name and the status; small texts only where the zoom makes them readable. The
   * name and the status keep one line and end with "…" where the card is too narrow (`overflow: "ellipsis"`).
   */
  private content(): TScenePrimitive[] {
    const measure: TMeasure = (text, cssFont) => this.measureText(text, cssFont);
    const { width, name, kind, status, rowsPerSecond, error } = this.state;
    const left = paddingLeft;
    const right = width - paddingRight;
    const badge = etlKindBadges[kind];
    const badgeWidth = measure(badge, font("bold", 17)) + 16;
    const label = status === "failed" && error ? `${etlStatusLabels[status]}: ${error}` : etlStatusLabels[status];
    const out: TScenePrimitive[] = [
      { kind: "rect", x: left, y: 16, width: badgeWidth, height: 28, radius: 6, fill: "rgba(0, 0, 0, 0.06)" },
      {
        kind: "text",
        text: badge,
        family: fontFamily,
        weight: "bold",
        size: 17,
        lineHeight: 20,
        color: secondaryText,
        x: left + 8,
        y: 21,
        width: badgeWidth - 8,
      },
      {
        kind: "text",
        part: "title",
        text: name,
        family: fontFamily,
        weight: "bold",
        size: 28,
        lineHeight: 32,
        x: left,
        y: 56,
        width: right - left,
        wrap: false,
        maxLines: 1,
        overflow: "ellipsis",
      },
      { kind: "circle", cx: left + 7, cy: 108, r: 7, fill: etlStatusColors[status] },
      {
        kind: "text",
        text: label,
        family: fontFamily,
        size: 21,
        lineHeight: 24,
        color: status === "failed" ? etlStatusColors.failed : secondaryText,
        x: left + 22,
        y: 97,
        width: right - left - 22,
        wrap: false,
        maxLines: 1,
        overflow: "ellipsis",
        minScale: 0.35,
      },
    ];
    if (status === "running" && rowsPerSecond !== undefined) {
      out.push({
        kind: "text",
        text: `${formatRows(rowsPerSecond)} rows/s`,
        family: fontFamily,
        size: 18,
        lineHeight: 20,
        color: secondaryText,
        x: left,
        y: 21,
        width: right - left,
        align: "right",
        minScale: 0.4,
      });
    }
    return out;
  }
}

/** The selected card's border: 2.5 screen pixels, at least 3 world units (it was max(3, 2.5 / scale), capped 20). */
export const etlBlockRules: TStyleRule<typeof EtlBlock>[] = [
  {
    target: EtlBlock,
    tags: [selectedTag],
    style: { parts: { border: { width: { px: 2.5, minWorld: 3, maxWorld: 20 } } } },
  },
];

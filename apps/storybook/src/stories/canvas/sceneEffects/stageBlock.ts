import { Anchor, CanvasBlock, defineTag, selectedTag } from "@gravity-ui/graph";
import type {
  TAnchorClass,
  TAnchorView,
  TBlock,
  TBlockView,
  TScenePrimitive,
  TStyleParts,
  TStyleRule,
} from "@gravity-ui/graph";

import { etlKindBadges, etlStatusColors, etlStatusTints, formatRows } from "../webglConnections/etl";
import type { TEtlStageKind } from "../webglConnections/etl";

import {
  effectParts,
  glowOutline,
  marchingBorder,
  onScales,
  orbitingComet,
  pulsingOutline,
  spinner,
  strokeInside,
  throughputParticles,
} from "./effectPaths";
import type { TBox, TEffectPart } from "./effectPaths";

export const STAGE_IS = "scene-effects-stage";

export type TStageStatus = "running" | "queued" | "failed" | "paused" | "succeeded";

export const STAGE_STATUSES: readonly TStageStatus[] = ["running", "queued", "failed", "paused", "succeeded"];

/** The status of a stage without a status tag: static, no effect (the rules, the HTML card and the simulation). */
export const DEFAULT_STAGE_STATUS: TStageStatus = "paused";

/** A stage of the ETL graph. Its status is not data: it is the `statusTag` value, so a change re-encodes nothing. */
export type TStageBlock = TBlock & {
  is: typeof STAGE_IS;
  kind: TEtlStageKind;
  /** The pipeline (and group) the stage belongs to. */
  pipeline: string;
  rowsPerSecond: number;
};

export function isStageBlock(block: TBlock): block is TStageBlock {
  return block.is === STAGE_IS;
}

/** The status of a stage: a tag with a value out of five, so all stages share five style rows per state. */
export const statusTag = defineTag<TStageStatus>("status");

/** "Focus on failures" puts this tag on every stage that has not failed; a rule dims them. */
export const dimmedTag = defineTag("dimmed");

export const stageStatusColors: Record<TStageStatus, string> = {
  running: etlStatusColors.running,
  queued: "#7a5af8",
  failed: etlStatusColors.failed,
  paused: etlStatusColors.paused,
  succeeded: etlStatusColors.succeeded,
};

/** The fill of a far-away stage: the status colour over white. */
const stageStatusTints: Record<TStageStatus, string> = {
  running: etlStatusTints.running,
  queued: "#e4defd",
  failed: etlStatusTints.failed,
  paused: etlStatusTints.paused,
  succeeded: etlStatusTints.succeeded,
};

export const stageStatusLabels: Record<TStageStatus, string> = {
  running: "Running",
  queued: "Queued",
  failed: "Failed",
  paused: "Paused",
  succeeded: "Succeeded",
};

/** The effect parts each status shows; the selection adds the glow. */
export const stageStatusEffects: Record<TStageStatus, readonly TEffectPart[]> = {
  running: ["march", "particles"],
  queued: ["comet", "spinner"],
  failed: ["pulse"],
  paused: [],
  succeeded: [],
};

/** The effect parts a stage draws: the gallery's gradient and sparkline are not used here. */
const STAGE_EFFECTS: readonly TEffectPart[] = ["march", "comet", "pulse", "particles", "spinner", "glow"];

const fontFamily = '"YS Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const secondaryText = "#6b7280";
const radius = 12;
/** The selection glow's colour (StageCardView.css repeats it for the HTML card's glow). */
const STAGE_SELECTION_COLOR = "#ffcc00";

/**
 * The look of the effects in one zoom range. Path widths are world units (WebGL resolves them at scale 1), so each
 * range has its own widths, dashes and speeds: about 1.2 to 3 screen pixels wide across the range. The outlines lie
 * inside the card: a stroke's outer edge is the card's edge.
 */
type TEffectsLook = {
  march: number;
  dash: [number, number];
  marchSpeed: number;
  comet: number;
  pulse: number;
  /** The particles' line: its width, the spacing of the particles and their y in the card. */
  particles: number;
  spacing: number;
  particlesY: (height: number) => number;
  glow: number;
};

/**
 * Scales below 0.1: about 1.2 to 2.8 px at 0.05 to 0.1. Inside a card 136 high, a 28-unit ring leaves the middle 80
 * for the tint and the particles.
 */
const farLook: TEffectsLook = {
  march: 24,
  dash: [150, 100],
  marchSpeed: 400,
  comet: 28,
  pulse: 28,
  particles: 36,
  spacing: 130,
  particlesY: (height) => height / 2,
  glow: 16,
};

/** Scales from 0.1 to the schematic level (0.225). */
const midLook: TEffectsLook = {
  march: 14,
  dash: [60, 40],
  marchSpeed: 160,
  comet: 18,
  pulse: 18,
  particles: 20,
  spacing: 64,
  particlesY: (height) => height / 2,
  glow: 8,
};

/** The schematic and detailed levels. */
const nearLook: TEffectsLook = {
  march: 4,
  dash: [16, 10],
  marchSpeed: 40,
  comet: 6,
  pulse: 6,
  particles: 9,
  spacing: 30,
  particlesY: (height) => height - 22,
  glow: 2,
};

/** Rows per second → how fast the particles run, relative: 0.5 to 2. */
function flowRate(rowsPerSecond: number): number {
  return 0.5 + Math.min(rowsPerSecond, 60000) / 40000;
}

/** The effects of one zoom range, from `left` (after the stripe) to the card's right edge. */
function effects(view: TBlockView<TStageBlock>, look: TEffectsLook, left: number): TScenePrimitive[] {
  const { width, height, rowsPerSecond } = view;
  const card: TBox = { x: 0, y: 0, width, height, radius };
  return [
    marchingBorder(strokeInside(card, look.march), {
      width: look.march,
      color: stageStatusColors.running,
      on: look.dash[0],
      off: look.dash[1],
      speed: look.marchSpeed,
    }),
    orbitingComet(strokeInside(card, look.comet), {
      width: look.comet,
      color: stageStatusColors.queued,
      share: 0.3,
      laps: 0.4,
    }),
    pulsingOutline(strokeInside(card, look.pulse), { width: look.pulse, color: stageStatusColors.failed, period: 1.2 }),
    throughputParticles(left, width - 20, look.particlesY(height), {
      width: look.particles,
      color: stageStatusColors.running,
      spacing: look.spacing,
      speed: look.spacing * 1.2 * flowRate(rowsPerSecond),
    }),
    glowOutline(strokeInside(card, look.glow), { width: look.glow, color: STAGE_SELECTION_COLOR }),
  ];
}

/**
 * The status stripe and the body: the stripe colour fills the whole rounded card, and the body covers it from
 * `stripe` to the right edge with only its right corners rounded. The visible band keeps the card's rounded corners
 * at any stripe width (a stripe rect narrower than twice the radius would clamp its corners and stick out).
 */
function stripeAndBody(width: number, height: number, stripe: number): TScenePrimitive[] {
  return [
    { kind: "rect", part: "stripe", x: 0, y: 0, width, height, radius },
    { kind: "rect", part: "body", x: stripe, y: 0, width: width - stripe, height, radius: [0, radius, radius, 0] },
  ];
}

/** The detailed scene keeps the ports visible when a stage has no HTML card. */
class StageAnchor extends Anchor {
  protected override detailed(view: TAnchorView = this.getViewData()): readonly TScenePrimitive[] {
    return this.schematic(view);
  }
}

/**
 * An ETL stage drawn in the scene on every level. Far away it is a card tinted by its status with thick effect rings
 * (two zoom ranges); closer it shows the kind, the name and the throughput. The status stripe and every effect are
 * parts styled by `stageRules`: the status tag decides which effects show.
 */
export class StageBlock extends CanvasBlock<TStageBlock> {
  public declare readonly __styleParts?: TStyleParts<
    "body" | "border" | "title" | "halo" | "badge" | "stripe" | TEffectPart
  >;

  private schematicCache?: { view: object; primitives: readonly TScenePrimitive[] };

  protected override getAnchorClass(): TAnchorClass {
    return StageAnchor;
  }

  protected override minimalistic(view: TBlockView<TStageBlock>): readonly TScenePrimitive[] {
    const stripe = 36;
    return [
      ...stripeAndBody(view.width, view.height, stripe),
      ...effects(view, farLook, stripe + 24).map((primitive) => onScales(primitive, undefined, 0.1)),
      ...effects(view, midLook, stripe + 24).map((primitive) => onScales(primitive, 0.1)),
    ];
  }

  protected override schematic(view: TBlockView<TStageBlock>): readonly TScenePrimitive[] {
    if (this.schematicCache?.view !== view) {
      this.schematicCache = { view, primitives: this.near(view) };
    }
    return this.schematicCache.primitives;
  }

  /** The same list as the schematic level, so it is merged once. */
  protected override detailed(view: TBlockView<TStageBlock>): readonly TScenePrimitive[] {
    return this.schematic(view);
  }

  private near(view: TBlockView<TStageBlock>): TScenePrimitive[] {
    const { width, height, name, kind, pipeline, rowsPerSecond } = view;
    const left = 24;
    return [
      ...stripeAndBody(width, height, 8),
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
      {
        kind: "text",
        text: `${etlKindBadges[kind]} · ${pipeline.toUpperCase()}`,
        family: fontFamily,
        weight: "bold",
        size: 15,
        lineHeight: 18,
        color: secondaryText,
        x: left,
        y: 14,
        width: width - left - 48,
        wrap: false,
      },
      {
        kind: "text",
        part: "title",
        text: name,
        family: fontFamily,
        weight: "bold",
        size: 24,
        lineHeight: 28,
        x: left,
        y: 38,
        width: width - left - 16,
        wrap: false,
        overflow: "ellipsis",
      },
      {
        kind: "text",
        text: `${formatRows(rowsPerSecond)} rows/s`,
        family: fontFamily,
        size: 17,
        lineHeight: 20,
        color: secondaryText,
        x: left,
        y: 74,
        width: width - left - 16,
        wrap: false,
        minScale: 0.35,
      },
      ...effects(view, nearLook, left),
      ...spinner(width - 26, 26, 11, {
        width: 4,
        color: stageStatusColors.queued,
        track: "rgba(122, 90, 248, 0.15)",
        period: 1,
      }),
    ];
  }
}

/**
 * The stage stylesheet: the effects are hidden until a status shows them; the status colours the stripe, and far away
 * the whole card; the selection adds the glow and a wider border; "Focus on failures" dims the tagged stages.
 */
export const stageRules: TStyleRule<typeof StageBlock>[] = [
  {
    target: StageBlock,
    style: { parts: { stripe: { color: "#c4c6cc" }, ...effectParts(STAGE_EFFECTS, { visible: false }) } },
  },
  {
    target: StageBlock,
    tags: [statusTag],
    style: (values) => {
      const status = values.get(statusTag) ?? DEFAULT_STAGE_STATUS;
      return {
        parts: {
          stripe: { color: stageStatusColors[status] },
          ...effectParts(stageStatusEffects[status], { visible: true }),
        },
      };
    },
  },
  {
    target: StageBlock,
    tags: [statusTag],
    scope: { levels: ["minimalistic"] },
    style: (values) => ({
      parts: { body: { color: stageStatusTints[values.get(statusTag) ?? DEFAULT_STAGE_STATUS] } },
    }),
  },
  {
    target: StageBlock,
    tags: [selectedTag],
    style: { parts: { glow: { visible: true }, border: { width: { px: 2.5, minWorld: 3, maxWorld: 20 } } } },
  },
  { target: StageBlock, tags: [dimmedTag], style: { dim: 0.75 } },
];

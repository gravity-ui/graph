import { Anchor, CanvasBlock, defineTag, hoveredTag, selectedTag } from "@gravity-ui/graph";
import type {
  TAnchorClass,
  TBlock,
  TBlockId,
  TBlockProps,
  TSceneEffectScaleRange,
  TScenePrimitive,
  TStyleParts,
  TStyleRule,
} from "@gravity-ui/graph";
import type { ReadonlySignal } from "@preact/signals-core";

import { etlKindBadges, etlStatusColors, etlStatusTints, formatRows } from "../webglConnections/etl";
import type { TEtlStageKind } from "../webglConnections/etl";

import {
  effectParts,
  glowOutline,
  marchingBorder,
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

type TStageState = TStageBlock & { levelTransitions?: boolean };

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

/** The same status tint is used from the overview through the detailed HTML card. */
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

/** The effect parts each status shows independently of interaction. */
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
const stripeWidth = 8;
/** The HTML card uses the same yellow for its selected border and shadow. */
const STAGE_SELECTION_COLOR = "#ffcc00";

/** Path widths are in world units. Each zoom range keeps the status strokes legible inside the card. */
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

/** Scales below 0.1. */
const farLook: TEffectsLook = {
  march: 12,
  dash: [150, 100],
  marchSpeed: 400,
  comet: 14,
  pulse: 14,
  particles: 36,
  spacing: 130,
  particlesY: (height) => height / 2,
  glow: 8,
};

/** Scales from 0.1 to the schematic level (0.225). */
const midLook: TEffectsLook = {
  march: 5,
  dash: [60, 40],
  marchSpeed: 160,
  comet: 6,
  pulse: 6,
  particles: 20,
  spacing: 64,
  particlesY: (height) => height / 2,
  glow: 3,
};

const overviewBands = [
  { look: farLook, minScale: 0, maxScale: 0.1 },
  { look: midLook, minScale: 0.1, maxScale: undefined },
];

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
function effects(
  stage: TStageBlock,
  look: TEffectsLook,
  left: number,
  range: TSceneEffectScaleRange
): TScenePrimitive[] {
  const { width, height, rowsPerSecond } = stage;
  const card: TBox = { x: 0, y: 0, width, height, radius };
  return [
    marchingBorder(
      strokeInside(card, look.march),
      {
        width: look.march,
        color: stageStatusColors.running,
        on: look.dash[0],
        off: look.dash[1],
        speed: look.marchSpeed,
      },
      range
    ),
    orbitingComet(
      strokeInside(card, look.comet),
      { width: look.comet, color: stageStatusColors.queued, share: 0.3, laps: 0.4 },
      range
    ),
    pulsingOutline(
      strokeInside(card, look.pulse),
      { width: look.pulse, color: stageStatusColors.failed, period: 1.2 },
      range
    ),
    throughputParticles(
      left,
      width - 20,
      look.particlesY(height),
      {
        width: look.particles,
        color: stageStatusColors.running,
        spacing: look.spacing,
        speed: look.spacing * 1.2 * flowRate(rowsPerSecond),
      },
      range
    ),
    glowOutline(strokeInside(card, look.glow), { width: look.glow, color: STAGE_SELECTION_COLOR }, range),
  ];
}

/** Exposing the left edge of the rounded body gives the narrow status stripe the same corners at every level. */
function stageFace(width: number, height: number): TScenePrimitive[] {
  return [
    { kind: "rect", part: "body", x: 0, y: 0, width, height, radius },
    {
      kind: "rect",
      part: "surface",
      x: stripeWidth,
      y: 0,
      width: width - stripeWidth,
      height,
      radius: [0, radius, radius, 0],
    },
  ];
}

/** The detailed scene keeps the ports visible when a stage has no HTML card. */
class StageAnchor extends Anchor {
  protected override detailed(): readonly TScenePrimitive[] {
    return this.schematic();
  }
}

/**
 * An ETL stage drawn in the scene on every level. Far away it is a card tinted by its status with thin effect rings
 * (two zoom ranges); closer it shows the kind, the name and the throughput. The status stripe and every effect are
 * parts styled by `stageRules`: the status tag decides which effects show.
 */
export class StageBlock extends CanvasBlock<TStageState> {
  public declare readonly __styleParts?: TStyleParts<
    "body" | "border" | "title" | "halo" | "badge" | "surface" | TEffectPart
  >;

  private schematicPrimitives?: readonly TScenePrimitive[];
  protected readonly effectRange: TSceneEffectScaleRange = {};

  protected override getAnchorClass(): TAnchorClass {
    return StageAnchor;
  }

  /** Selection and status go through the style rules. Only card size and contents change its primitives. */
  protected override shouldUpdateScene(_nextProps: TBlockProps, next: TStageState): boolean {
    const { width, height, name, kind, pipeline, rowsPerSecond } = this.state;
    return (
      width !== next.width ||
      height !== next.height ||
      name !== next.name ||
      kind !== next.kind ||
      pipeline !== next.pipeline ||
      rowsPerSecond !== next.rowsPerSecond ||
      this.state.levelTransitions !== next.levelTransitions
    );
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    const primitives = stageFace(this.state.width, this.state.height);
    for (const { look, minScale, maxScale } of overviewBands) {
      for (const primitive of effects(this.state, look, stripeWidth + 24, this.effectRange)) {
        if (primitive.kind === "path" && primitive.part === "particles") {
          // A solid throughput stroke looks like a full progress bar when the particles are inactive.
          const start = Math.max(minScale, this.effectRange.minScale ?? 0);
          if (maxScale === undefined || start < maxScale) {
            primitives.push({ ...primitive, minScale: start, maxScale, canvasStroke: {} });
          }
        } else {
          primitives.push({ ...primitive, minScale, maxScale });
        }
      }
    }
    return primitives;
  }

  protected override schematic(): readonly TScenePrimitive[] {
    this.schematicPrimitives = this.near();
    return this.schematicPrimitives;
  }

  /** The encoder visits schematic before detailed. Reuse the same list for both levels. */
  protected override detailed(): readonly TScenePrimitive[] {
    return this.schematicPrimitives ?? this.schematic();
  }

  private near(): TScenePrimitive[] {
    const { width, height, name, kind, pipeline, rowsPerSecond, levelTransitions } = this.state;
    const schematicScale = this.context.constants.block.SCALES[1];
    const labelFade = levelTransitions ? { minScale: schematicScale, fadeInUntil: schematicScale + 0.075 } : undefined;
    const left = 24;
    return [
      ...stageFace(width, height),
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
        ...labelFade,
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
        ...labelFade,
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
        fadeInUntil: levelTransitions ? 0.42 : undefined,
      },
      ...effects(this.state, nearLook, left, this.effectRange),
      ...spinner(
        width - 26,
        26,
        11,
        { width: 4, color: stageStatusColors.queued, track: "rgba(122, 90, 248, 0.15)", period: 1 },
        this.effectRange
      ),
    ];
  }
}

/** A fixed story configuration: zoom only changes effect activity, not the block's generated primitives. */
export function createStageBlock(minScale: number, levelTransitions: ReadonlySignal<boolean>): typeof StageBlock {
  return class extends StageBlock {
    protected override readonly effectRange = { minScale };

    protected override subscribe(id: TBlockId): void {
      super.subscribe(id);
      // Rebinding a retained block replaces its entity state; initialize the local setting for the new binding too.
      this.setState({ levelTransitions: levelTransitions.peek() });
    }

    protected override willMount(): void {
      super.willMount();
      this.subscribeSignal(levelTransitions, (enabled) => {
        if (this.getNextState().levelTransitions !== enabled) this.setState({ levelTransitions: enabled });
      });
    }
  };
}

/**
 * The status determines the stripe, surface tint and visible effects. "Focus on failures" dims the tagged stages.
 */
export const stageRules: TStyleRule<typeof StageBlock>[] = [
  {
    target: StageBlock,
    style: {
      parts: {
        body: { color: "#c4c6cc" },
        surface: { color: "#ffffff" },
        ...effectParts(STAGE_EFFECTS, { visible: false }),
      },
    },
  },
  {
    target: StageBlock,
    tags: [statusTag],
    style: (values) => {
      const status = values.get(statusTag) ?? DEFAULT_STAGE_STATUS;
      return {
        parts: {
          body: { color: stageStatusColors[status] },
          surface: { color: stageStatusTints[status] },
          ...effectParts(stageStatusEffects[status], { visible: true }),
        },
      };
    },
  },
  { target: StageBlock, tags: [hoveredTag], style: { parts: { border: { color: "#5787c8" } } } },
  {
    target: StageBlock,
    tags: [selectedTag],
    style: {
      parts: {
        border: { color: STAGE_SELECTION_COLOR, width: { px: 2.5, minWorld: 3, maxWorld: 20 } },
        glow: { visible: true },
      },
    },
  },
  { target: StageBlock, tags: [dimmedTag], style: { dim: 0.75 } },
];

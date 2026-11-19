import { CanvasBlock, defineTag } from "@gravity-ui/graph";
import type { Graph, TBlock, TBlockProps, TScenePrimitive, TStyleParts, TStyleRule, TTag } from "@gravity-ui/graph";

import { formatRows } from "../webglConnections/etl";

import {
  EFFECT_PARTS,
  effectParts,
  glowOutline,
  gradientOutline,
  marchingBorder,
  orbitingComet,
  pulsingOutline,
  sparkline,
  spinner,
  strokeInside,
  throughputParticles,
} from "./effectPaths";
import type { TBox, TEffectPart } from "./effectPaths";

export const EFFECT_CARD_IS = "scene-effect-card";

const CARD_WIDTH = 320;
const CARD_HEIGHT = 180;
const CARD_GAP = 80;
const CARD_COLUMNS = 4;

const fontFamily = '"YS Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const monoFamily = 'Menlo, Consolas, "Courier New", monospace';

const blue = "#2f7cf6";
const purple = "#7a5af8";
const red = "#e5484d";
const green = "#30a46c";

/** The effect colours, shared with the HTML cards. */
export const effectCardColors = { blue, purple, red, green } as const;

/** The cards' corner radius. */
export const EFFECT_CARD_RADIUS = 14;

/** A gallery card: one effect, its name and the API it uses. */
export type TEffectCard = TBlock & {
  is: typeof EFFECT_CARD_IS;
  effect: TEffectPart;
  /** The API the effect uses, as scene text on the card. */
  api: string;
  /** The value the throughput card shows: its particles run faster with more rows. */
  rowsPerSecond?: number;
};

export function isEffectCard(block: TBlock): block is TEffectCard {
  return block.is === EFFECT_CARD_IS;
}

/** One tag per effect: the tag on a card shows the card's effect part. */
export const effectTags: Record<TEffectPart, TTag> = {
  march: defineTag("fx:march"),
  comet: defineTag("fx:comet"),
  pulse: defineTag("fx:pulse"),
  particles: defineTag("fx:particles"),
  spinner: defineTag("fx:spinner"),
  glow: defineTag("fx:glow"),
  gradient: defineTag("fx:gradient"),
  spark: defineTag("fx:spark"),
};

export const effectTitles: Record<TEffectPart, string> = {
  march: "Marching border",
  comet: "Orbiting comet",
  pulse: "Pulsing outline",
  particles: "Throughput particles",
  spinner: "Spinner",
  glow: "Glow outline",
  gradient: "Gradient outline",
  spark: "Live sparkline",
};

const effectApis: Record<TEffectPart, string> = {
  march: "dashFlow.use({ pattern: fitPattern(L, 14, 10), speed: 40 }): whole periods, no seam",
  comet: "dashFlow.use({ pattern: [0.3 L, 0.7 L], speed: L / 3, fade: true }), L = outline length",
  pulse: "pulse.use({ period: 1.2 }): a failed stage",
  particles: "particles.use({ spacing: 36, speed: 20 + rows / 500 })",
  spinner: "a circle as 4 cubics, dashFlow.use({ pattern: [0.3 C, 0.7 C], speed: C })",
  glow: "glow.use([]); the slider writes glow.uniforms.intensity",
  gradient: "gradient.use({ from, to, laps: 0.3 })",
  spark: "pulse.use({ period: 2, wavelength: 400 }) on a smoothed polyline",
};

/** Throughput → particle speed in world units per second, as the card's API text says. */
export function particleSpeed(rowsPerSecond: number): number {
  return 20 + rowsPerSecond / 500;
}

export function effectCardId(effect: TEffectPart): string {
  return `card-${effect}`;
}

/** The eight cards in a 4 × 2 grid. */
export const effectCards: TEffectCard[] = EFFECT_PARTS.map((effect, index) => ({
  is: EFFECT_CARD_IS,
  id: effectCardId(effect),
  name: effectTitles[effect],
  effect,
  api: effectApis[effect],
  rowsPerSecond: effect === "particles" ? 18400 : undefined,
  x: (index % CARD_COLUMNS) * (CARD_WIDTH + CARD_GAP),
  y: Math.floor(index / CARD_COLUMNS) * (CARD_HEIGHT + CARD_GAP),
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  anchors: [],
}));

/** The gallery subscribes only while the encode counter is visible. */
export const onCardEncode = new WeakMap<Graph, () => void>();

/** A sparkline over 24 values: two waves, so it looks like data. */
export function sparkPoints(x0: number, x1: number, top: number, bottom: number): [number, number][] {
  const count = 24;
  const mid = (top + bottom) / 2;
  const amplitude = (bottom - top) / 2;
  return Array.from({ length: count }, (_, i) => [
    x0 + ((x1 - x0) * i) / (count - 1),
    mid - amplitude * (0.6 * Math.sin(i * 0.9) + 0.35 * Math.sin(i * 2.3 + 1)),
  ]);
}

/** The stroke widths of the outline effects, which lie inside the card; the HTML cards use the same. */
export const effectCardStrokes = { march: 3, comet: 5, pulse: 6, glow: 2, gradient: 5 } as const;

/** The effect of a card; every primitive is the effect's part. The outlines' outer edge is the card's edge. */
function effectPrimitives(cardData: TEffectCard): TScenePrimitive[] {
  const { width, height } = cardData;
  const card: TBox = { x: 0, y: 0, width, height, radius: EFFECT_CARD_RADIUS };
  const { march, comet, pulse, glow, gradient } = effectCardStrokes;
  switch (cardData.effect) {
    case "march":
      return [marchingBorder(strokeInside(card, march), { width: march, color: blue, on: 14, off: 10, speed: 40 })];
    case "comet":
      return [orbitingComet(strokeInside(card, comet), { width: comet, color: purple, share: 0.3, laps: 1 / 3 })];
    case "pulse":
      return [pulsingOutline(strokeInside(card, pulse), { width: pulse, color: red, period: 1.2 })];
    case "particles":
      return [
        throughputParticles(24, width - 24, height - 32, {
          width: 12,
          color: blue,
          spacing: 36,
          speed: particleSpeed(cardData.rowsPerSecond ?? 0),
        }),
      ];
    case "spinner":
      return spinner(width - 52, height - 44, 22, {
        width: 6,
        color: purple,
        track: "rgba(122, 90, 248, 0.15)",
        period: 1,
      });
    case "glow":
      return [glowOutline(strokeInside(card, glow), { width: glow, color: blue })];
    case "gradient":
      return [gradientOutline(strokeInside(card, gradient), { width: gradient, laps: 0.3 })];
    case "spark":
      return [
        sparkline(sparkPoints(24, width - 24, height - 60, height - 14), {
          width: 3,
          color: green,
          period: 2,
          wavelength: 400,
        }),
      ];
    default:
      return [];
  }
}

/**
 * A gallery card on every level: the body, a 1px border, the name, the API and the effect. The effect is the card's
 * effect part; the part is hidden by a base rule and shown by the effect's tag (`effectCardRules`).
 */
export class EffectCard extends CanvasBlock<TEffectCard> {
  public declare readonly __styleParts?: TStyleParts<"body" | "border" | "title" | "halo" | "badge" | TEffectPart>;

  private cardPrimitives?: readonly TScenePrimitive[];

  protected override shouldUpdateScene(_nextProps: TBlockProps, next: TEffectCard): boolean {
    const { width, height, name, api, effect, rowsPerSecond } = this.state;
    return (
      width !== next.width ||
      height !== next.height ||
      name !== next.name ||
      api !== next.api ||
      effect !== next.effect ||
      rowsPerSecond !== next.rowsPerSecond
    );
  }

  protected override schematic(): readonly TScenePrimitive[] {
    onCardEncode.get(this.context.graph)?.();
    this.cardPrimitives = [...this.card(), ...effectPrimitives(this.state)];
    return this.cardPrimitives;
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return this.cardPrimitives ?? this.schematic();
  }

  private card(): TScenePrimitive[] {
    const { width, height, name, api, effect, rowsPerSecond } = this.state;
    const out: TScenePrimitive[] = [
      { kind: "rect", part: "body", x: 0, y: 0, width, height, radius: EFFECT_CARD_RADIUS },
      {
        kind: "rect",
        part: "border",
        x: 0,
        y: 0,
        width,
        height,
        radius: EFFECT_CARD_RADIUS,
        border: { width: { px: 1, minWorld: 1, maxWorld: 8 }, align: "inside" },
      },
      {
        kind: "text",
        part: "title",
        text: name,
        family: fontFamily,
        weight: "bold",
        size: 22,
        lineHeight: 26,
        x: 20,
        y: 16,
        width: width - 40,
        wrap: false,
        overflow: "ellipsis",
      },
      {
        kind: "text",
        text: api,
        family: monoFamily,
        size: 12,
        lineHeight: 16,
        color: "#4b5563",
        x: 20,
        y: 50,
        width: width - 40,
        height: 48,
        overflow: "ellipsis",
      },
      {
        kind: "text",
        text: `part "${effect}", tag ${effectTags[effect].name}`,
        family: monoFamily,
        size: 11,
        lineHeight: 14,
        color: "#8b8d98",
        x: 20,
        y: 100,
        width: width - 40,
        wrap: false,
      },
    ];
    if (effect === "particles" && rowsPerSecond !== undefined) {
      out.push({
        kind: "text",
        text: `${formatRows(rowsPerSecond)} rows/s`,
        family: fontFamily,
        weight: "bold",
        size: 16,
        lineHeight: 20,
        color: blue,
        x: 20,
        y: 118,
        width: width - 40,
        wrap: false,
      });
    }
    return out;
  }
}

/** Every effect part hidden by a base rule; each effect's tag shows its part (a state rule). */
export const effectCardRules: TStyleRule<typeof EffectCard>[] = [
  { target: EffectCard, style: { parts: effectParts(EFFECT_PARTS, { visible: false }) } },
  ...EFFECT_PARTS.map(
    (part): TStyleRule<typeof EffectCard> => ({
      target: EffectCard,
      tags: [effectTags[part]],
      style: { parts: effectParts([part], { visible: true }) },
    })
  ),
];

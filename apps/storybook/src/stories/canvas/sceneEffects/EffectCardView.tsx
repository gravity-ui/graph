import React from "react";

import type { Graph } from "@gravity-ui/graph";
import { GraphBlock } from "@gravity-ui/graph-react";

import { formatRows } from "../webglConnections/etl";

import { EFFECT_CARD_RADIUS, effectCardColors, effectCardStrokes, particleSpeed, sparkPoints } from "./effectCard";
import type { TEffectCard } from "./effectCard";
import type { TEffectPart } from "./effectPaths";
import { CometRing, DashedRing, GlowRing, GradientRing, Particles, PulseRing, Sparkline, Spinner } from "./htmlEffects";

import "./EffectCardView.css";

/** How each HTML card builds its effect in CSS. */
const htmlTechniques: Record<TEffectPart, string> = {
  march: "CSS: SVG stroke-dashoffset, dashes fitted to the outline",
  comet: "CSS: conic-gradient ring, @property angle keyframes",
  pulse: "CSS: border ring, opacity keyframes",
  particles: "CSS: radial-gradient dots, translateX keyframes",
  spinner: "CSS: border-top arc, rotate keyframes",
  glow: "CSS: box-shadow, opacity keyframes",
  gradient: "CSS: conic-gradient ring, @property angle keyframes",
  spark: "CSS: SVG path of the same cubics, a moving dash",
};

/** Hidden unless the card holds its effect's tag (`graph-tag-fx-*` on the wrapper, see EffectCardView.css). */
const EFFECT_CLASS = "scene-fx-card__effect";

/** The CSS version of the card's effect, at the place and size of the scene's. */
const HtmlEffect = ({ card }: { card: TEffectCard }): React.JSX.Element | null => {
  const { width, height } = card;
  const radius = EFFECT_CARD_RADIUS;
  const { blue, purple, red, green } = effectCardColors;
  const strokes = effectCardStrokes;
  switch (card.effect) {
    case "march":
      return (
        <DashedRing
          className={EFFECT_CLASS}
          width={width}
          height={height}
          radius={radius}
          thickness={strokes.march}
          color={blue}
          on={14}
          off={10}
          speed={40}
        />
      );
    case "comet":
      return <CometRing className={EFFECT_CLASS} radius={radius} thickness={strokes.comet} period={3} color={purple} />;
    case "pulse":
      return <PulseRing className={EFFECT_CLASS} radius={radius} thickness={strokes.pulse} period={1.2} color={red} />;
    case "particles":
      // The scene's line runs from x 24 to width - 24 at y height - 32, 12 wide; the wrapper's border is 1px.
      return (
        <Particles
          className={EFFECT_CLASS}
          size={12}
          spacing={36}
          speed={particleSpeed(card.rowsPerSecond ?? 0)}
          color={blue}
          style={{ left: 23, width: width - 48, top: height - 32 - 6 - 1 }}
        />
      );
    case "spinner":
      // The scene's circle: centre (width - 52, height - 44), radius 22, 6 wide.
      return (
        <Spinner
          className={EFFECT_CLASS}
          size={50}
          thickness={6}
          color={purple}
          track="rgba(122, 90, 248, 0.15)"
          period={1}
          style={{ position: "absolute", left: width - 52 - 25 - 1, top: height - 44 - 25 - 1 }}
        />
      );
    case "glow":
      return <GlowRing className={EFFECT_CLASS} radius={radius} thickness={strokes.glow} period={2} color={blue} />;
    case "gradient":
      return <GradientRing className={EFFECT_CLASS} radius={radius} thickness={strokes.gradient} period={3} />;
    case "spark":
      return (
        <Sparkline
          className={EFFECT_CLASS}
          points={sparkPoints(24, width - 24, height - 60, height - 14)}
          width={width}
          height={height}
          color={green}
          thickness={3}
          period={2}
        />
      );
    default:
      return null;
  }
};

/**
 * The React card of a gallery effect at the detailed level: it replaces the scene card (`GraphBlock`'s default
 * `autoHideCanvas`), so the WebGL effects show only when zoomed out. The effect's tag reaches the HTML as a
 * `graph-tag-fx-*` class on the wrapper, so the effect buttons switch the CSS effect too.
 */
export const EffectCardView = ({ graph, block }: { graph: Graph; block: TEffectCard }): React.JSX.Element => (
  <GraphBlock graph={graph} block={block} className="scene-fx-card">
    <div className="scene-fx-card__body">
      <div className="scene-fx-card__header">
        <span className="scene-fx-card__title">{block.name}</span>
        <span className="scene-fx-card__badge">HTML</span>
      </div>
      <div className="scene-fx-card__api">{block.api}</div>
      <div className="scene-fx-card__css">{htmlTechniques[block.effect]}</div>
      {block.effect === "particles" && block.rowsPerSecond !== undefined && (
        <div className="scene-fx-card__rows">{formatRows(block.rowsPerSecond)} rows/s</div>
      )}
    </div>
    <HtmlEffect card={block} />
  </GraphBlock>
);

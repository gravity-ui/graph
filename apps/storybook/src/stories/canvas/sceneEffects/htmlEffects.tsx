import React from "react";
import type { CSSProperties } from "react";

import { fitPattern, roundedRectPath, smoothPolylinePath, strokeInside } from "./effectPaths";
import type { TBox } from "./effectPaths";

import "./htmlEffects.css";

/*
 * The CSS twins of the scene effects, for the React cards that replace the scene blocks at the detailed level. Each is
 * one light element with a CSS animation; most animate `transform` or `opacity`, which the compositor runs.
 */

/** GraphBlock's wrapper has a 1px border: absolute children are placed from inside it. */
const WRAPPER_BORDER = 1;

/** An inline style with custom properties (`--fx-*`), read by htmlEffects.css. */
type TFxStyle = CSSProperties & { [variable: `--${string}`]: string | number };

/** Types an inline style with custom properties; a `TFxStyle` is a `CSSProperties`. */
function fxStyle(style: TFxStyle): CSSProperties {
  return style;
}

function classes(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/**
 * A ring inside the card, as the scene's outline effects: its outer edge is the card's edge (the wrapper's border
 * box), `thickness` wide.
 */
type TRingProps = {
  /** The card's corner radius, in CSS pixels (world units at scale 1). */
  radius: number;
  /** The ring's thickness. */
  thickness: number;
  /** Seconds per cycle. */
  period: number;
  className?: string;
};

/** A ring element over the card's border box, with its thickness and cycle. */
function ringStyle({ radius, thickness, period }: TRingProps, color?: string): CSSProperties {
  return fxStyle({
    inset: -WRAPPER_BORDER,
    borderRadius: radius,
    animationDuration: `${period}s`,
    "--fx-thickness": `${thickness}px`,
    ...(color === undefined ? {} : { "--fx-color": color }),
  });
}

/**
 * The marching border: an SVG rounded rect inside the card with a dash pattern fitted to its outline (no seam), its
 * `stroke-dashoffset` moving one period per `(on + off) / speed` seconds, as `dashFlow` moves its dashes.
 */
export const DashedRing = ({
  width,
  height,
  radius,
  thickness,
  color,
  on,
  off,
  speed,
  className,
}: {
  /** The card's size and corner radius. */
  width: number;
  height: number;
  radius: number;
  thickness: number;
  color: string;
  on: number;
  off: number;
  /** Pixels per second. */
  speed: number;
  className?: string;
}): React.JSX.Element => {
  // The scene's outline: half a stroke in from the card's edge.
  const ring: TBox = strokeInside({ x: 0, y: 0, width, height, radius }, thickness);
  const [dash, gap] = fitPattern(roundedRectPath(ring).length, on, off);
  return (
    <svg
      className={classes("scene-fx-svg", className)}
      width={width}
      height={height}
      style={{ left: -WRAPPER_BORDER, top: -WRAPPER_BORDER }}
      aria-hidden
    >
      <rect
        className="scene-fx-dash"
        x={ring.x}
        y={ring.y}
        width={ring.width}
        height={ring.height}
        rx={ring.radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${gap}`}
        style={fxStyle({ animationDuration: `${(dash + gap) / speed}s`, "--fx-dash-shift": `${-(dash + gap)}px` })}
      />
    </svg>
  );
};

/** One comet running around the card: a conic gradient on a ring, its start angle animated (`@property`). */
export const CometRing = (props: TRingProps & { color: string }): React.JSX.Element => (
  <div
    className={classes("scene-fx-conic", "scene-fx-comet", props.className)}
    style={ringStyle(props, props.color)}
    aria-hidden
  />
);

/** A blue-to-orange outline whose colours run around the card: a full conic gradient on a ring, turning. */
export const GradientRing = (props: TRingProps): React.JSX.Element => (
  <div
    className={classes("scene-fx-conic", "scene-fx-gradient", props.className)}
    style={ringStyle(props)}
    aria-hidden
  />
);

/** The pulsing outline: a ring whose opacity breathes, as `pulse` without a wavelength. */
export const PulseRing = (props: TRingProps & { color: string }): React.JSX.Element => (
  <div className={classes("scene-fx-pulse", props.className)} style={ringStyle(props, props.color)} aria-hidden />
);

/** A soft halo around the card: a coloured edge inside it and a box-shadow outside, breathing. */
export const GlowRing = (props: TRingProps & { color: string }): React.JSX.Element => (
  <div className={classes("scene-fx-glow", props.className)} style={ringStyle(props, props.color)} aria-hidden />
);

/** A spinner: a faint circle and a rotating arc of it (a coloured top border). */
export const Spinner = ({
  size,
  thickness,
  color,
  track,
  period,
  className,
  style,
}: {
  size: number;
  thickness: number;
  color: string;
  track: string;
  period: number;
  className?: string;
  style?: CSSProperties;
}): React.JSX.Element => (
  <span
    className={classes("scene-fx-spinner", className)}
    style={fxStyle({
      ...style,
      width: size,
      height: size,
      borderWidth: thickness,
      animationDuration: `${period}s`,
      "--fx-color": color,
      "--fx-track": track,
    })}
    aria-hidden
  />
);

/**
 * Round particles running along a line: a strip of radial-gradient dots, one spacing wider than the line, moved by one
 * spacing per `spacing / speed` seconds (`transform`).
 */
export const Particles = ({
  size,
  spacing,
  speed,
  color,
  className,
  style,
}: {
  /** The dots' diameter, the line's height. */
  size: number;
  spacing: number;
  /** Pixels per second. */
  speed: number;
  color: string;
  className?: string;
  style?: CSSProperties;
}): React.JSX.Element => (
  <div className={classes("scene-fx-particles", className)} style={{ ...style, height: size }} aria-hidden>
    <div
      className="scene-fx-particles__strip"
      style={fxStyle({
        animationDuration: `${spacing / Math.max(speed, 1)}s`,
        "--fx-spacing": `${spacing}px`,
        "--fx-size": `${size}px`,
        "--fx-color": color,
      })}
    />
  </div>
);

/** An SVG path of cubic segments (8 numbers each: p0, c1, c2, p3), as the scene paths are built. */
function cubicsToPath(segments: Float32Array): string {
  const commands: string[] = [];
  for (let i = 0; i + 7 < segments.length; i += 8) {
    if (i === 0) commands.push(`M${segments[0]} ${segments[1]}`);
    const [c1x, c1y, c2x, c2y, x, y] = segments.subarray(i + 2, i + 8);
    commands.push(`C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
  }
  return commands.join(" ");
}

/**
 * A sparkline: the scene's smoothed polyline as an SVG path, and a brighter dash of it travelling along it
 * (`stroke-dashoffset`), as the `pulse` wave travels.
 */
export const Sparkline = ({
  points,
  width,
  height,
  color,
  thickness,
  period,
  className,
}: {
  /** Points in the card's frame. */
  points: readonly (readonly [number, number])[];
  /** The card's size. */
  width: number;
  height: number;
  color: string;
  thickness: number;
  period: number;
  className?: string;
}): React.JSX.Element => {
  const d = cubicsToPath(smoothPolylinePath(points).segments);
  return (
    <svg
      className={classes("scene-fx-svg", className)}
      width={width}
      height={height}
      style={{ left: -WRAPPER_BORDER, top: -WRAPPER_BORDER }}
      aria-hidden
    >
      <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={thickness} strokeLinecap="round" />
      <path
        className="scene-fx-spark"
        d={d}
        pathLength={100}
        fill="none"
        stroke={color}
        strokeWidth={thickness + 1}
        strokeLinecap="round"
        style={{ animationDuration: `${period}s` }}
      />
    </svg>
  );
};

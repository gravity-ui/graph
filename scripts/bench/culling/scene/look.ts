// scripts/bench/culling/scene/look.ts
// The Nirvana-like look of the scene bench. Both columns draw it: walk through NirvanaLikeBlock, interpreter through
// scene elements. Colours repeat the defaults of packages/graph/src/graphConfig.ts, so no setColors() is needed.
import type { TTileRect } from "GRAPH_SRC/lib/culling/TileIndex";
import type { TScenePrimitive, TSceneStroke } from "GRAPH_SRC/lib/scene/types";

export const COLORS = {
  blockText: "#272727",
  blockBorder: "#dfdfdf",
  anchor: "#4a4a4a",
  connection: "#272727",
  progress: "#5b8def",
  icon: "#5c5c5c",
};

export type TStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export const STATUSES: readonly TStatus[] = ["queued", "running", "completed", "failed", "cancelled"];

const STATUS_FILL: Record<TStatus, string> = {
  queued: "#e0e0e0",
  running: "#cfe3ff",
  completed: "#d6f0d6",
  failed: "#f8d4d4",
  cancelled: "#ececec",
};

export type TBlockMeta = {
  status: TStatus;
  progress: number;
  name: string;
  subname: string;
  version: string;
  icons: number;
  inputs: number;
  outputs: number;
};

export const BLOCK = { width: 240, header: 72, row: 26, footer: 40, radius: 8, border: 2, anchorRadius: 9 };

/** Core block text threshold and the default LOD thresholds. */
export const TEXT_SCALE = 0.125;
export const SCHEMATIC_SCALE = 0.225;
export const DETAILED_SCALE = 0.7;

export const GROUP_STYLE = {
  background: "rgba(100, 100, 100, 0.1)",
  border: "rgba(100, 100, 100, 0.3)",
  borderWidth: 2,
  selectedBackground: "rgba(100, 100, 100, 0.2)",
  selectedBorder: "rgba(100, 100, 100, 0.5)",
  highlightedBackground: "rgba(100, 200, 100, 0.3)",
  highlightedBorder: "rgba(100, 200, 100, 0.8)",
};

export const CONNECTION_STROKE: TSceneStroke = { color: COLORS.connection, width: 2 };

const ICON_VIEWBOX = 16;
const ICON_SOURCES = ["M2 2h12v12H2z", "M8 1l7 14H1z", "M8 1a7 7 0 1 1-0.01 0z", "M2 6h12v4H2zM6 2h4v12H6z"];
let icons: Path2D[] | undefined;

/** Path2D exists only in the browser; build the icons on first use. */
function icon(index: number): Path2D {
  icons ??= ICON_SOURCES.map((source) => new Path2D(source));
  return icons[index % icons.length];
}

export function blockHeight(meta: TBlockMeta): number {
  return BLOCK.header + BLOCK.row * Math.max(meta.inputs, meta.outputs) + BLOCK.footer;
}

export function anchorPosition(isInput: boolean, index: number): { x: number; y: number } {
  return { x: isInput ? 0 : BLOCK.width, y: BLOCK.header + BLOCK.row * (index + 0.5) };
}

/** Body, status, progress, texts and icons; anchors are separate (core components in the walk column). */
export function blockPrimitives(meta: TBlockMeta, height: number): TScenePrimitive[] {
  const width = BLOCK.width;
  const primitives: TScenePrimitive[] = [
    {
      kind: "rect",
      x: 0,
      y: 0,
      width,
      height,
      radius: BLOCK.radius,
      fill: STATUS_FILL[meta.status],
      border: { color: COLORS.blockBorder, width: BLOCK.border, align: "outside" },
    },
  ];
  if (meta.status === "running") {
    primitives.push({
      kind: "rect",
      x: 0,
      y: height - 6,
      width: width * meta.progress,
      height: 6,
      radius: [0, 0, 0, BLOCK.radius],
      fill: COLORS.progress,
    });
  }
  primitives.push(
    {
      kind: "text",
      text: meta.name,
      family: "sans-serif",
      weight: "bold",
      size: 16,
      lineHeight: 20,
      color: COLORS.blockText,
      x: 12,
      y: 12,
      width: width - 24,
      height: 40,
      align: "center",
      minScale: TEXT_SCALE,
    },
    {
      kind: "text",
      text: meta.subname,
      family: "sans-serif",
      size: 13,
      lineHeight: 16,
      color: COLORS.blockText,
      x: 12,
      y: 52,
      width: width - 24,
      height: 16,
      align: "center",
      minScale: SCHEMATIC_SCALE,
    },
    {
      kind: "text",
      text: meta.version,
      family: "sans-serif",
      size: 12,
      lineHeight: 14,
      color: COLORS.blockText,
      x: 12,
      y: height - 28,
      width: 80,
      height: 14,
      align: "left",
      minScale: SCHEMATIC_SCALE,
    }
  );
  for (let i = 0; i < meta.icons; i++) {
    primitives.push({
      kind: "icon",
      path: icon(i),
      viewBox: ICON_VIEWBOX,
      x: width - 12 - (i + 1) * 20,
      y: height - 30,
      size: 16,
      color: COLORS.icon,
      minScale: SCHEMATIC_SCALE,
    });
  }
  return primitives;
}

/** Anchors as the core Anchor draws them: a circle of radius 9, hidden at the Detailed level. */
export function anchorPrimitives(meta: TBlockMeta): TScenePrimitive[] {
  const primitives: TScenePrimitive[] = [];
  const add = (isInput: boolean, count: number): void => {
    for (let i = 0; i < count; i++) {
      const point = anchorPosition(isInput, i);
      primitives.push({
        kind: "circle",
        cx: point.x,
        cy: point.y,
        r: BLOCK.anchorRadius,
        fill: COLORS.anchor,
        maxScale: DETAILED_SCALE,
      });
    }
  };
  add(true, meta.inputs);
  add(false, meta.outputs);
  return primitives;
}

export function blockBounds(height: number): TTileRect {
  const side = Math.max(BLOCK.border, BLOCK.anchorRadius);
  return { minX: -side, minY: -BLOCK.border, maxX: BLOCK.width + side, maxY: height + BLOCK.border };
}

/**
 * The default Group look: a rounded rect with a centred border. The walk column defines groups with zero padding,
 * so both columns draw exactly the given rect.
 */
export function groupPrimitives(width: number, height: number): TScenePrimitive[] {
  return [
    {
      kind: "rect",
      x: 0,
      y: 0,
      width,
      height,
      radius: 8,
      fill: GROUP_STYLE.background,
      border: { color: GROUP_STYLE.border, width: GROUP_STYLE.borderWidth },
    },
  ];
}

/** What Path2DLine draws for a multipoint geometry: the line, and a closed arrow filled and stroked. */
export function connectionPrimitives(geometry: {
  segments: Float32Array;
  arrow?: { points: Float32Array; closed: boolean };
}): TScenePrimitive[] {
  const primitives: TScenePrimitive[] = [{ kind: "path", segments: geometry.segments, stroke: CONNECTION_STROKE }];
  if (geometry.arrow?.closed) {
    primitives.push({
      kind: "polygon",
      points: geometry.arrow.points,
      fill: COLORS.connection,
      stroke: CONNECTION_STROKE,
    });
  }
  return primitives;
}

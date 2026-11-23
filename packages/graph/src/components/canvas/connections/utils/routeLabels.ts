import intersects from "intersects";

import type { TPathGap } from "../../../../lib/scene/types";
import { rotateBounds } from "../../../../lib/scene/utils/rotateBounds";
import { cachedMeasureText } from "../../../../utils/renderers/text";
import type { TRect } from "../../../../utils/types/shapes";
import type { TConnectionArrow, TConnectionRouteLabel } from "../geometry";
import { pointAtDistance } from "../geometry/pathMetrics";

export type TPlacedRouteLabel = TRect & { id: string; text: string; rotation: number; bounds: TRect; gap: TPathGap };

export type TRouteLabelLayout = {
  labels: TPlacedRouteLabel[];
  gaps: TPathGap[];
  bounds: TRect;
};

const CLEARANCE = 4;

function arrowLength(arrow: TConnectionArrow | undefined): number {
  if (arrow?.position !== "end" || arrow.points.length !== 6) return 0;
  const { points, closed } = arrow;
  const tip = closed ? 0 : 2;
  const left = closed ? 2 : 0;
  return Math.hypot(points[tip] - (points[left] + points[4]) / 2, points[tip + 1] - (points[left + 1] + points[5]) / 2);
}

/** Packs labels in declaration order. A skipped label never removes any stroke. */
export function layoutRouteLabels(
  specs: readonly Readonly<TConnectionRouteLabel>[],
  segments: Float32Array,
  distances: Float64Array,
  fontSize: number,
  padding: readonly number[],
  arrow: TConnectionArrow | undefined
): TRouteLabelLayout | undefined {
  const length = distances[distances.length - 1];
  if (!(length > 0) || !Number.isFinite(length)) return undefined;
  const labels: TPlacedRouteLabel[] = [];
  const [top, right, bottom, left] = padding;
  const font = `${fontSize}px sans-serif`;
  const endSpace = CLEARANCE + arrowLength(arrow);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { id, text, at } of specs) {
    if (!id || !text || !Number.isFinite(at) || labels.some((label) => label.id === id)) continue;
    const measure = cachedMeasureText(text, { font });
    const width = measure.width + left + right;
    const height = measure.height + top + bottom;
    const radius = width / 2 + CLEARANCE;
    const start = radius + CLEARANCE;
    const end = length - radius - endSpace;
    if (start > end) continue;
    const distance = Math.max(start, Math.min(end, at * length));
    const gap: TPathGap = [distance - radius, distance + radius];
    if (labels.some((other) => other.gap[0] < gap[1] + CLEARANCE && gap[0] < other.gap[1] + CLEARANCE)) continue;

    const point = pointAtDistance(segments, distances, distance);
    const rotation = point.angle - Math.PI * Math.round(point.angle / Math.PI);
    const x = point.x - width / 2;
    const y = point.y - height / 2;
    const box = rotateBounds({ minX: x, minY: y, maxX: x + width, maxY: y + height }, point.x, point.y, rotation);
    const bounds = { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
    if (
      labels.some(({ bounds: b }) =>
        intersects.boxBox(b.x, b.y, b.width, b.height, bounds.x, bounds.y, bounds.width, bounds.height)
      )
    ) {
      continue;
    }
    labels.push({ id, text, x, y, width, height, rotation, gap, bounds });
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }
  if (!labels.length) return undefined;
  return {
    labels,
    gaps: labels.map(({ gap }) => gap),
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

export function hitRouteLabel(label: TPlacedRouteLabel, x: number, y: number, threshold: number): boolean {
  const cx = label.x + label.width / 2;
  const cy = label.y + label.height / 2;
  const c = Math.cos(label.rotation);
  const s = Math.sin(label.rotation);
  const dx = x - cx;
  const dy = y - cy;
  return intersects.boxBox(
    cx + dx * c + dy * s - threshold / 2,
    cy - dx * s + dy * c - threshold / 2,
    threshold,
    threshold,
    label.x,
    label.y,
    label.width,
    label.height
  );
}

import { lineSegment } from "../../components/canvas/connections/geometry/segments";
import type { TPoint } from "../../utils/types/shapes";

import { fadeColor, parseColorAlpha } from "./colorAlpha";
import type { TSceneOutline } from "./types";

/** Paints from outside in. The two halo bands compose to one third and two thirds of the requested alpha. */
export function blockOutlineStrokes(outline: TSceneOutline): readonly Readonly<{ color: string; width: number }>[] {
  const { color, width, halo } = outline;
  if (!halo || !Number.isFinite(halo.width) || halo.width <= 0) return [outline];
  const alpha = parseColorAlpha(halo.color);
  if (alpha <= 0) return [outline];
  return [
    { color: fadeColor(halo.color, 1 / 3), width: width + 2 * halo.width },
    { color: fadeColor(halo.color, 1 / (3 - alpha)), width: width + halo.width },
    { color, width },
  ];
}

type TCircle = Readonly<TPoint & { r: number }>;
type TCorner = TCircle & { dx: number; dy: number; start: number };
type TInterval = [number, number];
type TPiece = { cubic: number[]; arcArea: number };

const TURN = Math.PI * 2;
const QUARTER = Math.PI / 2;

/** Complement of the covered intervals within [0, length]. */
function gaps(covered: TInterval[], length: number): TInterval[] {
  const result: TInterval[] = [];
  let cursor = 0;
  for (const [start, end] of covered.sort((a, b) => a[0] - b[0])) {
    if (start > cursor) result.push([cursor, Math.min(start, length)]);
    cursor = Math.max(cursor, end);
    if (cursor >= length) return result;
  }
  if (cursor < length) result.push([cursor, length]);
  return result;
}

function side(
  pieces: TPiece[],
  circles: readonly TCircle[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  length: number
): void {
  if (length <= 0) return;
  const covered: TInterval[] = [];
  for (const circle of circles) {
    const along = (circle.x - x) * dx + (circle.y - y) * dy;
    const across = Math.abs((circle.x - x) * dy - (circle.y - y) * dx);
    if (across >= circle.r) continue;
    const reach = Math.sqrt((circle.r - across) * (circle.r + across));
    covered.push([along - reach, along + reach]);
  }
  for (const [a, b] of gaps(covered, length)) {
    pieces.push({ cubic: lineSegment({ x: x + dx * a, y: y + dy * a }, { x: x + dx * b, y: y + dy * b }), arcArea: 0 });
  }
}

function angle(value: number): number {
  return value < 0 ? value + TURN : value;
}

/** Angles of the subject circle covered by the other disk. */
function coverDisk(circle: TCircle, other: TCircle, covered: TInterval[]): void {
  const dx = other.x - circle.x;
  const dy = other.y - circle.y;
  if (Math.abs(dx) >= circle.r + other.r || Math.abs(dy) >= circle.r + other.r) return;
  const d = Math.hypot(dx, dy);
  if (d + circle.r <= other.r) {
    covered.push([0, TURN]);
    return;
  }
  if (d >= circle.r + other.r || d + other.r <= circle.r) return;
  const cosine = (d * d + (circle.r - other.r) * (circle.r + other.r)) / (2 * d * circle.r);
  const half = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const a = angle(Math.atan2(dy, dx) - half);
  const b = a + 2 * half;
  covered.push([a, Math.min(b, TURN)]);
  if (b > TURN) covered.push([0, b - TURN]);
}

/** Rectangle membership is constant between successive crossings of its straight sides and corner arcs. */
function coveredByBlock(circle: TCircle, width: number, height: number, corners: readonly TCorner[]): TInterval[] {
  if (!(width > 0 && height > 0)) return [];
  const { x, y, r } = circle;
  const cuts = [0, TURN];
  for (const [ratio, normal] of [
    [-x / r, 0],
    [(width - x) / r, 0],
    [-y / r, QUARTER],
    [(height - y) / r, QUARTER],
  ]) {
    if (Math.abs(ratio) > 1) continue;
    const delta = Math.acos(ratio);
    cuts.push(angle(normal - delta), angle(normal + delta));
  }
  for (const corner of corners) {
    const intersections: TInterval[] = [];
    coverDisk(circle, corner, intersections);
    for (const [a, b] of intersections) cuts.push(a, b);
  }
  cuts.sort((a, b) => a - b);
  const covered: TInterval[] = [];
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] === cuts[i - 1]) continue;
    const mid = (cuts[i - 1] + cuts[i]) / 2;
    const px = x + r * Math.cos(mid);
    const py = y + r * Math.sin(mid);
    if (px < 0 || px > width || py < 0 || py > height) continue;
    const inside = corners.every(
      (corner) =>
        (px - corner.x) * corner.dx <= 0 ||
        (py - corner.y) * corner.dy <= 0 ||
        Math.hypot(px - corner.x, py - corner.y) <= corner.r * (1 + 1e-12)
    );
    if (inside) covered.push([cuts[i - 1], cuts[i]]);
  }
  return covered;
}

function arc(pieces: TPiece[], { x, y, r }: TCircle, start: number, end: number): void {
  const count = Math.ceil((end - start) / QUARTER);
  const step = (end - start) / count;
  const control = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < count; i++) {
    const a = start + i * step;
    const b = start + (i + 1) * step;
    const ax = r * Math.cos(a);
    const ay = r * Math.sin(a);
    const bx = r * Math.cos(b);
    const by = r * Math.sin(b);
    pieces.push({
      cubic: [
        x + ax,
        y + ay,
        x + ax - control * ay,
        y + ay + control * ax,
        x + bx + control * by,
        y + by - control * bx,
        x + bx,
        y + by,
      ],
      // Twice the area between the circular arc and its chord.
      arcArea: r * r * (step - Math.sin(step)),
    });
  }
}

function circumference(pieces: TPiece[], circle: TCircle, disks: readonly TCircle[], covered: TInterval[]): void {
  for (const other of disks) {
    if (other !== circle) coverDisk(circle, other, covered);
  }
  for (const [a, b] of gaps(covered, TURN)) arc(pieces, circle, a, b);
}

/** The straight sides end at the four circular arcs, in CSS corner order. */
function roundedBody(
  pieces: TPiece[],
  disks: readonly TCircle[],
  width: number,
  height: number,
  radius: number | readonly number[]
): TCorner[] {
  const raw = Array.from({ length: 4 }, (_, i) => {
    const r = typeof radius === "number" ? radius : radius[i] ?? 0;
    return Number.isFinite(r) && r > 0 ? r : 0;
  });
  const [a, b, c, d] = raw;
  const factor = Math.min(1, width / (a + b), width / (c + d), height / (a + d), height / (b + c));
  const [tl, tr, br, bl] = raw.map((r) => r * factor);
  side(pieces, disks, tl, 0, 1, 0, width - tl - tr);
  side(pieces, disks, width, tr, 0, 1, height - tr - br);
  side(pieces, disks, width - br, height, -1, 0, width - br - bl);
  side(pieces, disks, 0, height - bl, 0, -1, height - bl - tl);
  const corners: TCorner[] = [
    { x: tl, y: tl, r: tl, dx: -1, dy: -1, start: Math.PI },
    { x: width - tr, y: tr, r: tr, dx: 1, dy: -1, start: 3 * QUARTER },
    { x: width - br, y: height - br, r: br, dx: 1, dy: 1, start: 0 },
    { x: bl, y: height - bl, r: bl, dx: -1, dy: 1, start: QUARTER },
  ].filter((c) => c.r > 0);
  for (const corner of corners) {
    const hidden: TInterval[] = [
      [0, corner.start],
      [corner.start + QUARTER, TURN],
    ];
    for (const disk of disks) {
      // A coincident anchor shares the corner boundary. Let the body emit that arc once.
      if (disk.x !== corner.x || disk.y !== corner.y || disk.r !== corner.r) coverDisk(corner, disk, hidden);
    }
    for (const [a, b] of gaps(hidden, TURN)) arc(pieces, corner, a, b);
  }
  return corners;
}

function samePoint(ax: number, ay: number, bx: number, by: number, epsilon: number): boolean {
  return Math.abs(ax - bx) <= epsilon && Math.abs(ay - by) <= epsilon;
}

function contours(pieces: TPiece[]): Float32Array[] {
  const result: Float32Array[] = [];
  while (pieces.length > 0) {
    const [first] = pieces.splice(0, 1);
    const path: number[] = [];
    const [x, y] = first.cubic;
    let piece = first;
    let area = 0;
    while (true) {
      const c = piece.cubic;
      const endX = c[6];
      const endY = c[7];
      // Sum in local coordinates to keep the winding reliable for small detached ports far from the block.
      area += (c[0] - x) * (endY - y) - (c[1] - y) * (endX - x) + piece.arcArea;
      path.push(...c);
      const epsilon = 1e-10 * Math.max(1, Math.abs(endX), Math.abs(endY), Math.abs(c[0] - endX), Math.abs(c[1] - endY));
      if (samePoint(endX, endY, x, y, epsilon)) {
        path[path.length - 2] = x;
        path[path.length - 1] = y;
        // All input boundaries keep the interior on the same side. Holes have negative winding.
        if (area > 0) result.push(new Float32Array(path));
        break;
      }
      const next = pieces.findIndex(({ cubic }) => samePoint(endX, endY, cubic[0], cubic[1], epsilon));
      if (next < 0) break;
      piece = pieces.splice(next, 1)[0];
      piece.cubic[0] = endX;
      piece.cubic[1] = endY;
    }
  }
  return result;
}

/** @internal Closed exterior contours of a block and its circular anchors, in local path coordinates. */
export function blockOutlineSegments(
  width: number,
  height: number,
  circles: readonly TCircle[],
  radius: number | readonly number[] = 0
): Float32Array[] {
  const hasBlock =
    width > 0 && height > 0 && Number.isFinite(Math.fround(width)) && Number.isFinite(Math.fround(height));
  const disks: TCircle[] = [];
  for (const circle of circles) {
    const { x, y, r } = circle;
    if (!(r > 0) || !Number.isFinite(Math.fround(Math.max(Math.abs(x), Math.abs(y)) + r))) continue;
    if (!disks.some((other) => other.x === x && other.y === y && other.r === r)) disks.push(circle);
  }
  const pieces: TPiece[] = [];
  let corners: TCorner[] = [];
  if (hasBlock && radius) {
    corners = roundedBody(pieces, disks, width, height, radius);
  } else if (hasBlock) {
    side(pieces, disks, 0, 0, 1, 0, width);
    side(pieces, disks, width, 0, 0, 1, height);
    side(pieces, disks, width, height, -1, 0, width);
    side(pieces, disks, 0, height, 0, -1, height);
  }
  for (const disk of disks) {
    circumference(pieces, disk, disks, hasBlock ? coveredByBlock(disk, width, height, corners) : []);
  }
  return contours(pieces);
}

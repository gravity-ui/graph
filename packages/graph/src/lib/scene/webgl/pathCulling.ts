import { INSTANCE_FLOATS } from "../../../components/canvas/connections/webgl/encode";
import { ALL_LEVELS_MASK, isOnLevel } from "../levels";

import type { TInstanceUpload } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import { CURVE_DETAIL_OFFSET } from "./curveTessellation";
import { PATH_ELEMENT_FLOATS } from "./encodePaths";
import type { ElementTable } from "./tables";

/** Large enough to keep fragmented connection order from becoming a draw per connection. */
const CHUNK_SIZE = 128;
const FLOAT_BYTES = 4;

type TRange = { first: number; count: number; curveChords?: number };
type TRangeOptions = { bridgeGap?: number; curveChords?: 8 };
type TRangeVisitor = (first: number, count: number, curveChords?: number) => void;
type TOrigin = { x: number; y: number; chunks: Set<number> };
type TBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelHalfWidth: number;
  curveChords: number;
  untranslated: boolean;
};
type TCohort = TBounds & { minScale: number; maxScale: number; mask: number };
type TChunk = TBounds & { elements: Set<number>; cohorts: TCohort[] };

function emptyBounds(): TBounds {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    pixelHalfWidth: 0,
    curveChords: 0,
    untranslated: true,
  };
}

function resetBounds(box: TBounds): void {
  box.minX = box.minY = Infinity;
  box.maxX = box.maxY = -Infinity;
  box.pixelHalfWidth = box.curveChords = 0;
  box.untranslated = true;
}

/**
 * Conservative bounds of resident curve instances, in buffer order. Upload spans invalidate only touched chunks;
 * moving an element refreshes its chunks without rewriting any instances. Each chunk caches a hull per exact
 * scale/level predicate, so visibility changes combine hulls instead of rereading all resident instances.
 * Width clamps are overestimated by world and pixel extents: camera, DPR and effect changes need no new geometry.
 */
export class PathCulling {
  /** The coarse curve certificate excludes float32 origin addition; translated batches keep full detail. */
  public untranslated = true;
  private chunks: TChunk[] = [];
  private readonly origins = new Map<number, TOrigin>();
  private readonly dirty = new Set<number>();
  private full = true;
  private count = 0;
  private originRevision = -1;
  private level: TSceneFrame["level"];
  private levelSensitive = false;
  private from = Infinity;
  private to = -Infinity;

  public invalidate(upload: TInstanceUpload, floats: number): void {
    if (upload.kind === "full") this.full = true;
    if (this.full || upload.kind !== "range") return;
    for (const span of upload.spans) {
      const first = Math.floor(span.byteOffset / FLOAT_BYTES / floats / CHUNK_SIZE);
      const end = Math.ceil((span.byteOffset / FLOAT_BYTES + span.data.length) / floats / CHUNK_SIZE);
      for (let chunk = first; chunk < end; chunk++) this.dirty.add(chunk);
    }
  }

  public update(paths: Float32Array, elements: Float32Array, table: ElementTable, frame: TSceneFrame): void {
    const { data, originRevision } = table;
    const count = paths.length / INSTANCE_FLOATS;
    const scale = Math.fround(frame.scale);
    const resized = this.count !== count;
    let visibilityChanged =
      this.full ||
      resized ||
      (this.levelSensitive && this.level !== frame.level) ||
      scale < this.from ||
      scale >= this.to;
    this.level = frame.level;
    if (this.full) {
      this.chunks = [];
      this.origins.clear();
      this.dirty.clear();
      this.count = count;
      for (let chunk = 0; chunk < Math.ceil(count / CHUNK_SIZE); chunk++) this.dirty.add(chunk);
      this.full = false;
    } else {
      if (resized) this.resizeChunks(count);
      if (this.originRevision !== originRevision) {
        this.origins.forEach((origin, element) => {
          const at = element * 4;
          const x = data[at];
          const y = data[at + 1];
          if (Object.is(origin.x, x) && Object.is(origin.y, y)) return;
          for (const chunk of origin.chunks) this.dirty.add(chunk);
          origin.x = x;
          origin.y = y;
        });
      }
    }
    this.originRevision = originRevision;
    if (this.dirty.size > 0) {
      for (const chunk of this.dirty) this.writeChunk(chunk, paths, elements, data);
      this.dirty.clear();
      visibilityChanged = true;
    }
    if (visibilityChanged) this.selectHulls(scale);
  }

  private forgetChunk(index: number): void {
    for (const element of this.chunks[index]?.elements ?? []) {
      const origin = this.origins.get(element);
      origin?.chunks.delete(index);
      if (origin?.chunks.size === 0) this.origins.delete(element);
    }
  }

  private resizeChunks(count: number): void {
    const length = Math.ceil(count / CHUNK_SIZE);
    for (let index = length; index < this.chunks.length; index++) this.forgetChunk(index);
    this.chunks.length = Math.min(this.chunks.length, length);
    for (const index of this.dirty) if (index >= length) this.dirty.delete(index);
    for (let index = Math.floor(Math.min(count, this.count) / CHUNK_SIZE); index < length; index++)
      this.dirty.add(index);
    this.count = count;
  }

  /** Recombines cached predicates only; stable camera movement does not visit these hulls either. */
  private selectHulls(scale: number): void {
    this.from = -Infinity;
    this.to = Infinity;
    this.levelSensitive = false;
    this.untranslated = true;
    for (const box of this.chunks) {
      resetBounds(box);
      for (const cohort of box.cohorts) {
        for (const boundary of [cohort.minScale, cohort.maxScale]) {
          if (scale < boundary) this.to = Math.min(this.to, boundary);
          else this.from = Math.max(this.from, boundary);
        }
        if (cohort.mask !== ALL_LEVELS_MASK) this.levelSensitive = true;
        if (scale < cohort.minScale || scale >= cohort.maxScale || !isOnLevel(cohort.mask, this.level)) continue;
        box.minX = Math.min(box.minX, cohort.minX);
        box.minY = Math.min(box.minY, cohort.minY);
        box.maxX = Math.max(box.maxX, cohort.maxX);
        box.maxY = Math.max(box.maxY, cohort.maxY);
        box.pixelHalfWidth = Math.max(box.pixelHalfWidth, cohort.pixelHalfWidth);
        box.curveChords = Math.max(box.curveChords, cohort.curveChords);
        box.untranslated &&= cohort.untranslated;
      }
      this.untranslated &&= box.untranslated;
    }
  }

  public ranges(
    first: number,
    count: number,
    frame: TSceneFrame,
    extraWidth: number,
    options?: TRangeOptions
  ): TRange[] {
    const result: TRange[] = [];
    this.forEachRange(
      first,
      count,
      frame,
      extraWidth,
      (first, count, curveChords) => {
        result.push(curveChords === undefined ? { first, count } : { first, count, curveChords });
      },
      options
    );
    return result;
  }

  /** Filters only this draw's range, keeping its order and merging adjacent spans without allocating draw records. */
  public forEachRange(
    first: number,
    count: number,
    frame: TSceneFrame,
    extraWidth: number,
    visit: TRangeVisitor,
    options?: TRangeOptions
  ): void {
    if (count === 0) return;
    const width = Math.fround(frame.width);
    const height = Math.fround(frame.height);
    const dpr = Math.fround(frame.dpr);
    const halo = Math.fround(extraWidth);
    const x = Math.fround(frame.x);
    const y = Math.fround(frame.y);
    const scale = Math.fround(frame.scale);
    if (!(scale > 0 && dpr > 0) || !Number.isFinite(x + y + scale + width + height + dpr + halo)) {
      visit(first, count, undefined);
      return;
    }
    const bridgeGap = options?.bridgeGap ?? 0;
    const minimumChords = options?.curveChords;
    const end = first + count;
    let runFirst = first;
    let runEnd = first;
    let runChords: number | undefined;
    for (let index = Math.floor(first / CHUNK_SIZE); index < Math.ceil(end / CHUNK_SIZE); index++) {
      const box = this.chunks[index];
      if (box.minX > box.maxX || box.minY > box.maxY) continue;
      const x0 = box.minX * scale + x;
      const y0 = box.minY * scale + y;
      const x1 = box.maxX * scale + x;
      const y1 = box.maxY * scale + y;
      // Include float32 evaluation and projection error, even when a large camera offset cancels the world position.
      const extent = box.pixelHalfWidth + halo + 1.5 / dpr;
      const rounding =
        (Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1), Math.abs(x), Math.abs(y), extent) + 1) *
        2 ** -20;
      const pad = extent + rounding;
      if (
        Number.isFinite(x0 + y0 + x1 + y1 + pad) &&
        (x0 - pad > width || y0 - pad > height || x1 + pad < 0 || y1 + pad < 0)
      )
        continue;
      const from = Math.max(first, index * CHUNK_SIZE);
      const to = Math.min(end, (index + 1) * CHUNK_SIZE);
      const curveChords = minimumChords === undefined ? undefined : Math.max(minimumChords, box.curveChords);
      if (runEnd > runFirst && runEnd + bridgeGap >= from && runChords === curveChords) {
        runEnd = to;
      } else {
        if (runEnd > runFirst) visit(runFirst, runEnd - runFirst, runChords);
        runFirst = from;
        runEnd = to;
        runChords = curveChords;
      }
    }
    if (runEnd > runFirst) visit(runFirst, runEnd - runFirst, runChords);
  }

  private writeChunk(index: number, paths: Float32Array, elements: Float32Array, table: Float32Array): void {
    this.forgetChunk(index);
    const box: TChunk = { ...emptyBounds(), elements: new Set(), cohorts: [] };
    let cohort: TCohort | undefined;
    const first = index * CHUNK_SIZE;
    const end = Math.min(this.count, first + CHUNK_SIZE);
    for (let instance = first; instance < end; instance++) {
      const p = instance * INSTANCE_FLOATS;
      const e = instance * PATH_ELEMENT_FLOATS;
      const minScale = elements[e + 4];
      const maxScale = elements[e + 5];
      const mask = elements[e + 6] % 8;
      if (cohort?.minScale !== minScale || cohort.maxScale !== maxScale || cohort.mask !== mask) {
        cohort = box.cohorts.find(
          (known) => known.minScale === minScale && known.maxScale === maxScale && known.mask === mask
        );
        if (!cohort) {
          cohort = { ...emptyBounds(), minScale, maxScale, mask };
          box.cohorts.push(cohort);
        }
      }
      cohort.curveChords = Math.max(cohort.curveChords, paths[p + CURVE_DETAIL_OFFSET]);
      const element = elements[e];
      const ox = table[element * 4];
      const oy = table[element * 4 + 1];
      cohort.untranslated &&= ox * ox + oy * oy === 0;
      let origin = this.origins.get(element);
      if (!origin) {
        origin = { x: ox, y: oy, chunks: new Set() };
        this.origins.set(element, origin);
      }
      origin.chunks.add(index);
      box.elements.add(element);
      const mode = Math.floor(elements[e + 6] / 8);
      // clamp(px / scale, minWorld, maxWorld) <= minWorld + px / scale, likewise for world/minPx.
      const worldHalfWidth = Math.max(0, mode === 1 ? elements[e + 3] : paths[p + 12]) / 2;
      let pixelHalfWidth = 0;
      if (mode === 1) pixelHalfWidth = Math.max(0, paths[p + 12]) / 2;
      else if (mode === 2) pixelHalfWidth = Math.max(0, elements[e + 3]) / 2;
      cohort.pixelHalfWidth = Math.max(cohort.pixelHalfWidth, pixelHalfWidth);
      for (let point = 0; point < 8; point += 2) {
        const px = Math.fround(paths[p + point] + ox);
        const py = Math.fround(paths[p + point + 1] + oy);
        cohort.minX = Math.min(cohort.minX, px - worldHalfWidth);
        cohort.minY = Math.min(cohort.minY, py - worldHalfWidth);
        cohort.maxX = Math.max(cohort.maxX, px + worldHalfWidth);
        cohort.maxY = Math.max(cohort.maxY, py + worldHalfWidth);
      }
    }
    this.chunks[index] = box;
  }
}

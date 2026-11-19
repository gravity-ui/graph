/* eslint-disable no-bitwise -- Conservative screen occupancy uses packed integer bitsets. */
import type { TTileRect } from "../../culling/TileIndex";

import type { InstanceRanges } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import type { TTranslucentRun } from "./translucentOrder";

const CELLS = 64;
const WORDS = (CELLS * CELLS) / 32;
const LOOKAHEAD = 128;
const MIN_DRAWS_TO_REFINE = 512;

type TOwnerRun = TTranslucentRun & { owners: string[]; position: number; barrier: boolean };

/** A large direct pass may justify packing on the next frame if it still has the same camera and programs. */
export class TranslucentRefinement {
  private frame?: TSceneFrame;
  private activity = 0;

  public clear(): void {
    this.frame = undefined;
  }

  public record(frame: TSceneFrame, drawCalls: number, activity: number): boolean {
    this.frame = drawCalls >= MIN_DRAWS_TO_REFINE ? { ...frame } : undefined;
    this.activity = activity;
    return this.frame !== undefined;
  }

  public take(frame: TSceneFrame, activity: number): boolean {
    const previous = this.frame;
    this.clear();
    return (
      previous !== undefined &&
      this.activity === activity &&
      previous.x === frame.x &&
      previous.y === frame.y &&
      previous.scale === frame.scale &&
      previous.level === frame.level &&
      previous.width === frame.width &&
      previous.height === frame.height &&
      previous.dpr === frame.dpr
    );
  }
}

/** The owners touched by each resident draw range; rebuilt only when the active schedule changes. */
export function translucentRunOwners(
  runs: readonly TTranslucentRun[],
  sources: readonly InstanceRanges[],
  barriers: readonly boolean[] = []
): TOwnerRun[] {
  const result = runs.map(
    (run): TOwnerRun => ({ ...run, owners: [], position: 0, barrier: barriers[run.source] ?? false })
  );
  const perSource = sources.map((): TOwnerRun[] => []);
  for (const run of result) perSource[run.source].push(run);
  sources.forEach((source, index) => {
    const list = perSource[index].sort((a, b) => a.first - b.first);
    list.forEach((run, position) => {
      run.position = position;
    });
    let at = 0;
    source.forEachRange((id, first, count) => {
      while (at < list.length && list[at].first + list[at].count <= first) at++;
      for (let next = at; next < list.length && list[next].first < first + count; next++) {
        const owners = list[next].owners;
        if (owners[owners.length - 1] !== id) owners.push(id);
      }
    });
  });
  return result;
}

function footprint(source: TOwnerRun, clip: TTileRect, boundsOf: (id: string) => TTileRect | undefined): Uint32Array {
  const width = clip.maxX - clip.minX,
    height = clip.maxY - clip.minY;
  const bits = new Uint32Array(WORDS);
  if (source.barrier) bits.fill(0xffffffff);
  for (const id of source.barrier ? [] : source.owners) {
    const box = boundsOf(id);
    if (!box) continue;
    if (!Number.isFinite(box.minX + box.minY + box.maxX + box.maxY)) {
      bits.fill(0xffffffff);
      break;
    }
    if (box.maxX < clip.minX || box.maxY < clip.minY || box.minX > clip.maxX || box.minY > clip.maxY) continue;
    const left = Math.max(0, Math.min(CELLS - 1, Math.floor(((box.minX - clip.minX) / width) * CELLS)));
    const right = Math.max(0, Math.min(CELLS - 1, Math.floor(((box.maxX - clip.minX) / width) * CELLS)));
    const top = Math.max(0, Math.min(CELLS - 1, Math.floor(((box.minY - clip.minY) / height) * CELLS)));
    const bottom = Math.max(0, Math.min(CELLS - 1, Math.floor(((box.maxY - clip.minY) / height) * CELLS)));
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        const bit = y * CELLS + x;
        bits[bit >>> 5] |= 1 << (bit & 31);
      }
  }
  return bits;
}

/**
 * Hoists a consecutive resident range beside its previous draw only across disjoint painted footprints. A shared
 * cell is an overlap (including false positives), so every pair that can blend retains its original order. The
 * fixed lookahead bounds work, and the overscanned world clip lets the caller retain this order while the camera
 * remains inside it. Empty footprints cannot paint inside that clip.
 */
export function coalesceTranslucentRuns(
  input: readonly TOwnerRun[],
  clip: TTileRect,
  boundsOf: (id: string) => TTileRect | undefined
): TTranslucentRun[] {
  const width = clip.maxX - clip.minX;
  const height = clip.maxY - clip.minY;
  if (!(width > 0 && height > 0) || !Number.isFinite(clip.minX + clip.minY + width + height)) return [...input];
  const bounds = new Map<string, TTileRect | undefined>();
  const result: (TTranslucentRun & { bits: Uint32Array; position: number })[] = [];
  const lastSource = new Map<number, number>();
  for (const source of input) {
    const bits = footprint(source, clip, (id) => {
      if (!bounds.has(id)) bounds.set(id, boundsOf(id));
      return bounds.get(id);
    });
    const previousIndex = lastSource.get(source.source);
    const previous = previousIndex === undefined ? undefined : result[previousIndex];
    let merge =
      previous !== undefined &&
      previous.position + 1 === source.position &&
      source.first >= previous.first + previous.count &&
      result.length - (previousIndex as number) <= LOOKAHEAD;
    if (merge) {
      for (let i = (previousIndex as number) + 1; i < result.length && merge; i++) {
        for (let word = 0; word < WORDS; word++) {
          if (bits[word] & result[i].bits[word]) {
            merge = false;
            break;
          }
        }
      }
    }
    if (merge && previous) {
      previous.count = source.first + source.count - previous.first;
      previous.position = source.position;
      for (let word = 0; word < WORDS; word++) previous.bits[word] |= bits[word];
    } else {
      lastSource.set(source.source, result.length);
      result.push({ source: source.source, first: source.first, count: source.count, position: source.position, bits });
    }
  }
  return result
    .filter((run) => run.bits.some((word) => word !== 0))
    .map(({ source, first, count }) => ({ source, first, count }));
}

/** Eight table slots fit over a 21-bit physical record index in the existing Float32 draw ID. */
export const MIXED_PATH_SOURCE_BITS = 21;
export const MIXED_PATH_SOURCE_STRIDE = 2 ** MIXED_PATH_SOURCE_BITS;
export const MIXED_PATH_MAX_SOURCES = 8;
const SUBPIXEL_GUARD = 1 - 2 ** -16;

type TSceneRootDepth = { key: number; entityType?: string; hidden?: boolean };
type TPathIdSpan = { first: number; count: number };

type TPathOrderPosition = TPathIdSpan & {
  /** The root's current SceneDepth key and the encoded absolute sub of this primitive. */
  key: number;
  sub: number;
  /** Tie order from the existing connection path program/source order. */
  tie: number;
};
export type TMixedPathRange = TPathOrderPosition & {
  /** A table slot, or a virtual slot sharing a texture with a different fixed template. */
  source: number;
  native?: never;
};
export type TNativePathRange<T> = TPathOrderPosition & { native: T; source?: never };
export type TLowerPathCommand<T> = TPathIdSpan & { native?: T };

/** Keeps texture selectors independent of the order in which currently visible spans were discovered. */
export function canonicalizeMixedSources<T extends { tie: number; chords: number }, N>(
  sources: T[],
  ranges: (TMixedPathRange | TNativePathRange<N>)[]
): void {
  const original = [...sources];
  sources.sort((a, b) => a.tie - b.tie || a.chords - b.chords);
  if (sources.every((source, index) => source === original[index])) return;
  const selectors = original.map((source) => sources.indexOf(source));
  // Cached physical pages keep the selectors with which they were collected.
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.source !== undefined && selectors[range.source] !== range.source)
      ranges[i] = { ...range, source: selectors[range.source] };
  }
}

/** Pass only roots. A child follows the root's key and plane by construction. */
export function separatedConnectionDepths(roots: Iterable<TSceneRootDepth>): boolean {
  let lastConnection = -Infinity;
  let firstOther = Infinity;
  for (const { key, entityType, hidden } of roots) {
    if (hidden) continue;
    if (!Number.isFinite(key)) return false;
    if (entityType === "connection") lastConnection = Math.max(lastConnection, key);
    else firstOther = Math.min(firstOther, key);
  }
  return lastConnection !== -Infinity && lastConnection < firstOther;
}

type TMixedRange<N> = TMixedPathRange | TNativePathRange<N>;
type TDepthBand<N> = { inputs: TMixedRange<N>[]; spans: TPathIdSpan[]; count: number };
const DEPTH_BAND_SIZE = 128;

/** Full stock plans receive immutable ranges from physical pages. Only bands with different ranges need sorting. */
export class MixedStockDepthBands<N> {
  private bands = new Map<number, TDepthBand<N>>();

  public clear(): void {
    this.bands.clear();
  }

  public schedule(input: readonly TMixedRange<N>[]): ReturnType<typeof mixedPathSchedule<N>> {
    const groups = new Map<number, TMixedRange<N>[]>();
    let lastKey: number | undefined;
    let group: TMixedRange<N>[] | undefined;
    for (const range of input) {
      if (range.native !== undefined || !Number.isFinite(range.key)) {
        this.clear();
        return mixedPathSchedule(input);
      }
      const key = Math.floor(range.key / DEPTH_BAND_SIZE);
      if (!group || key !== lastKey) {
        lastKey = key;
        group = groups.get(key);
        if (!group) {
          group = [];
          groups.set(key, group);
        }
      }
      group.push(range);
    }

    const next = new Map<number, TDepthBand<N>>();
    const spans: TPathIdSpan[] = [];
    let count = 0;
    for (const [key, inputs] of [...groups].sort(([a], [b]) => a - b)) {
      let band = this.bands.get(key);
      const previous = band?.inputs;
      if (!band || inputs.length !== previous?.length || inputs.some((range, i) => range !== previous[i])) {
        const schedule = mixedPathSchedule(inputs);
        if (!schedule) return undefined;
        band = { inputs, spans: schedule.spans, count: schedule.commands[0]?.count ?? 0 };
      }
      next.set(key, band);
      count += band.count;
      // A run can cross a depth boundary. Joining it must leave the cached band's endpoint intact.
      const tail = spans[spans.length - 1];
      const first = band.spans[0];
      let i = 0;
      if (tail && first && tail.first + tail.count === first.first) {
        spans[spans.length - 1] = { first: tail.first, count: tail.count + first.count };
        i++;
      }
      for (; i < band.spans.length; i++) spans.push(band.spans[i]);
    }
    this.bands = next;
    return { spans, commands: count ? [{ first: 0, count }] : [] };
  }
}

/** Packs stock addresses while keeping per-program barriers in the original painter order. */
export function mixedPathSchedule<T>(
  input: readonly (TMixedPathRange | TNativePathRange<T>)[]
): { spans: TPathIdSpan[]; commands: TLowerPathCommand<T>[] } | undefined {
  const ordered = [...input].sort((a, b) => a.key - b.key || a.sub - b.sub || a.tie - b.tie || a.first - b.first);
  return packOrderedPaths(
    ordered,
    (range) => range.source,
    (range) => range.native
  );
}

/** Physical commands already in painter order can use the same packing without sorting or adding depth keys. */
export function packOrderedPaths<D extends TPathIdSpan, T>(
  ordered: readonly D[],
  sourceOf: (draw: D, index: number) => number | undefined,
  nativeOf: (draw: D) => T | undefined
): { spans: TPathIdSpan[]; commands: TLowerPathCommand<T>[] } | undefined {
  const spans: TPathIdSpan[] = [];
  const commands: TLowerPathCommand<T>[] = [];
  let offset = 0;
  for (let i = 0; i < ordered.length; i++) {
    const draw = ordered[i];
    const { first, count } = draw;
    if (count === 0) continue;
    if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 0) return undefined;
    const command = commands[commands.length - 1];
    const source = sourceOf(draw, i);
    if (source === undefined) {
      const native = nativeOf(draw);
      if (native === undefined) return undefined;
      if (command?.native === native && command.first + command.count === first) command.count += count;
      else commands.push({ native, first, count });
      continue;
    }
    // The Float32 record selector and physical slot stay exactly representable.
    if (
      !Number.isInteger(source) ||
      source < 0 ||
      source >= MIXED_PATH_MAX_SOURCES ||
      first + count > MIXED_PATH_SOURCE_STRIDE
    )
      return undefined;
    const ref = source * MIXED_PATH_SOURCE_STRIDE + first;
    const last = spans[spans.length - 1];
    if (last && command?.native === undefined && last.first + last.count === ref) last.count += count;
    else spans.push({ first: ref, count });
    if (command && command.native === undefined) command.count += count;
    else commands.push({ first: offset, count });
    offset += count;
  }
  return { spans, commands };
}

export type TSubpixelPathWidth = { worldWidth: number; pixelWidth: number };

/** The largest encoded uncapped world and pixel inputs of the nominal opaque paths. */
export function fullySubpixelPaths(
  { worldWidth, pixelWidth }: TSubpixelPathWidth,
  scale: number,
  dpr: number
): boolean {
  const zoom = Math.fround(scale);
  const ratio = Math.fround(dpr);
  return (
    zoom > 0 &&
    ratio > 0 &&
    worldWidth >= 0 &&
    pixelWidth >= 0 &&
    Math.max(worldWidth * zoom, pixelWidth) * ratio < SUBPIXEL_GUARD
  );
}

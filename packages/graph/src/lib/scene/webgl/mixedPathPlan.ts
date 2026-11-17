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
  for (const range of ranges) if (range.source !== undefined) range.source = selectors[range.source];
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

/** Packs stock addresses while keeping per-program barriers in the original painter order. */
export function mixedPathSchedule<T>(
  input: readonly (TMixedPathRange | TNativePathRange<T>)[]
): { spans: TPathIdSpan[]; commands: TLowerPathCommand<T>[] } | undefined {
  const ordered = [...input].sort((a, b) => a.key - b.key || a.sub - b.sub || a.tie - b.tie || a.first - b.first);
  const spans: TPathIdSpan[] = [];
  const commands: TLowerPathCommand<T>[] = [];
  let offset = 0;
  for (const { first, count, source, native } of ordered) {
    if (count === 0) continue;
    if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 0) return undefined;
    const command = commands[commands.length - 1];
    if (native !== undefined) {
      if (command?.native === native && command.first + command.count === first) command.count += count;
      else commands.push({ native, first, count });
      continue;
    }
    // The Float32 record selector and physical slot stay exactly representable.
    if (
      source === undefined ||
      !Number.isInteger(source) ||
      source < 0 ||
      source >= MIXED_PATH_MAX_SOURCES ||
      first + count > MIXED_PATH_SOURCE_STRIDE
    )
      return undefined;
    const ref = source * MIXED_PATH_SOURCE_STRIDE + first;
    const last = spans[spans.length - 1];
    if (last && last.first + last.count === ref) last.count += count;
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

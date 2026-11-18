import {
  MIXED_PATH_SOURCE_STRIDE,
  MixedStockDepthBands,
  canonicalizeMixedSources,
  fullySubpixelPaths,
  mixedPathSchedule,
  packOrderedPaths,
  separatedConnectionDepths,
} from "./mixedPathPlan";

describe("mixed connection path planning", () => {
  it("requires existing scene order to place connection roots below every other visible root", () => {
    const connection = { key: 7, entityType: "connection" };
    const background = { key: 6, entityType: "custom-background" };
    const block = { key: 8, entityType: "block" };
    expect(separatedConnectionDepths([connection, { ...background, hidden: true }, block])).toBe(true);
    expect(separatedConnectionDepths([connection, background, block])).toBe(false);
    expect(separatedConnectionDepths([connection, { ...block, key: 7 }])).toBe(false);
    expect(separatedConnectionDepths([block])).toBe(false);
  });

  it("orders stock spans by root key, sub, and original source precedence", () => {
    const stride = MIXED_PATH_SOURCE_STRIDE;
    const input = [
      { key: 4, sub: 0, tie: 0, source: 2, first: 2, count: 1 },
      { key: 3, sub: 4, tie: 1, source: 2, first: 1, count: 1 },
      { key: 3, sub: 4, tie: 0, source: 5, first: 6, count: 2 },
      { key: 3, sub: 0, tie: 0, source: 4, first: 9, count: 1 },
    ];
    expect(mixedPathSchedule(input)).toEqual({
      spans: [
        { first: 4 * stride + 9, count: 1 },
        { first: 5 * stride + 6, count: 2 },
        { first: 2 * stride + 1, count: 2 },
      ],
      commands: [{ first: 0, count: 5 }],
    });
    expect(input[0].key).toBe(4);
  });

  it("preserves one native command between consecutive stock record addresses", () => {
    const native = { name: "hover" };
    expect(
      mixedPathSchedule([
        { key: 2, sub: 1, tie: 0, source: 1, first: 12, count: 3 },
        { key: 2, sub: 0, tie: 2, native, first: 17, count: 1 },
        { key: 1, sub: 4, tie: 0, source: 1, first: 10, count: 2 },
        { key: 2, sub: 0, tie: 2, native, first: 16, count: 1 },
      ])
    ).toEqual({
      spans: [
        { first: MIXED_PATH_SOURCE_STRIDE + 10, count: 2 },
        { first: MIXED_PATH_SOURCE_STRIDE + 12, count: 3 },
      ],
      commands: [
        { first: 0, count: 2 },
        { native, first: 16, count: 2 },
        { first: 2, count: 3 },
      ],
    });
  });

  it("packs preordered draws even when addresses descend and repeats straddle a native barrier", () => {
    const draws = [
      { first: 8, count: 1, slot: 0 },
      { first: 0, count: 2, slot: 0 },
      { first: 9, count: 1, native: "label" },
      { first: 2, count: 1, slot: 0 },
    ];
    expect(
      packOrderedPaths(
        draws,
        (draw) => draw.slot,
        (draw) => draw.native
      )
    ).toEqual({
      spans: [
        { first: 8, count: 1 },
        { first: 0, count: 2 },
        { first: 2, count: 1 },
      ],
      commands: [
        { first: 0, count: 3 },
        { native: "label", first: 9, count: 1 },
        { first: 3, count: 1 },
      ],
    });
  });

  it("keeps two runs of one custom shader apart when a stock primitive paints between them", () => {
    const native = { name: "hover" };
    expect(
      mixedPathSchedule([
        { key: 4, sub: 4, tie: 1, native, first: 1, count: 1 },
        { key: 4, sub: 3, tie: 0, source: 0, first: 3, count: 1 },
        { key: 4, sub: 2, tie: 1, native, first: 0, count: 1 },
      ])?.commands
    ).toEqual([
      { native, first: 0, count: 1 },
      { first: 0, count: 1 },
      { native, first: 1, count: 1 },
    ]);
  });

  it("packs exact float32 record addresses and declines a source overflow", () => {
    const range = { key: 1, sub: 0, tie: 0, source: 7, first: MIXED_PATH_SOURCE_STRIDE - 2, count: 2 };
    const ids = mixedPathSchedule([range])?.spans;
    expect(ids).toEqual([{ first: 2 ** 24 - 2, count: 2 }]);
    expect(ids?.map(({ first }) => Math.fround(first + 1))).toEqual([2 ** 24 - 1]);
    expect(mixedPathSchedule([{ ...range, count: 3 }])).toBeUndefined();
    expect(mixedPathSchedule([{ ...range, source: 8 }])).toBeUndefined();
  });

  it("keeps physical source selectors stable when draw discovery order changes", () => {
    const sources = [
      { tie: 3, chords: 16 },
      { tie: 2, chords: 16 },
      { tie: 3, chords: 8 },
    ];
    const ranges = sources.map((_, source) => ({ key: 0, sub: 0, tie: 0, source, first: 4, count: 1 }));
    const physical = ranges.slice();
    canonicalizeMixedSources(sources, ranges);
    expect(physical.map(({ source }) => source)).toEqual([0, 1, 2]);
    expect(sources).toEqual([
      { tie: 2, chords: 16 },
      { tie: 3, chords: 8 },
      { tie: 3, chords: 16 },
    ]);
    expect(ranges.map(({ source }) => source)).toEqual([2, 0, 1]);
  });

  it("reuses depth bands and joins their physical endpoints without changing cached spans", () => {
    const bands = new MixedStockDepthBands<string>();
    const run = (key: number, first: number, count = 1) => ({ key, sub: 0, tie: 0, source: 0, first, count });
    const left = run(120, 1),
      right = run(132, 2),
      far = run(400, 19);
    const joined = bands.schedule([far, right, left]);
    expect(joined).toEqual(mixedPathSchedule([left, right, far]));
    const moved = [far, { ...right, first: 4 }, left];
    const split = bands.schedule(moved);
    expect(split).toEqual(mixedPathSchedule(moved));
    expect(split?.spans.at(-1)).toBe(joined?.spans.at(-1));
    expect(joined?.spans[0]).toEqual({ first: 1, count: 2 });
    const native = { key: 129, sub: 0, tie: 0, first: 0, count: 1, native: "custom" };
    expect(bands.schedule([...moved, native])).toEqual(mixedPathSchedule([...moved, native]));
    expect(bands.schedule([right, left])).toEqual(mixedPathSchedule([left, right]));
    expect(bands.schedule([run(200, MIXED_PATH_SOURCE_STRIDE, 1)])).toBeUndefined();
    expect(bands.schedule([])).toEqual({ spans: [], commands: [] });
  });

  it("uses world and CSS width envelopes to bound effective device-pixel stroke widths", () => {
    expect(fullySubpixelPaths({ worldWidth: 15, pixelWidth: 0.4 }, 0.02, 2)).toBe(true);
    expect(fullySubpixelPaths({ worldWidth: 15, pixelWidth: 0.4 }, 0.05, 2)).toBe(false);
    expect(fullySubpixelPaths({ worldWidth: 0, pixelWidth: 0.5 }, 0.02, 2)).toBe(false);
    expect(fullySubpixelPaths({ worldWidth: 0, pixelWidth: 0.5 }, 0.02, 1)).toBe(true);
    expect(fullySubpixelPaths({ worldWidth: 0, pixelWidth: 0.2 }, NaN, 1)).toBe(false);
  });
});

import type { TVisibilitySpan } from "../instanceVisibility";
import { filterTranslucentRuns } from "../translucentOrder";
import type { TTranslucentPart, TTranslucentRun } from "../translucentOrder";
import { TranslucentVisibility } from "../translucentVisibility";

const part = (...runs: TTranslucentRun[]): TTranslucentPart => ({ runs, first: 0, end: runs.length });

class Visibility {
  public visibilityRevision = 0;
  public readonly visible = new Set<number>();
  private delta: TVisibilitySpan[] = [];

  constructor(private readonly slots = 1024) {}

  public any = jest.fn((first: number, count: number): boolean => {
    for (let i = first; i < first + count; i++) if (this.visible.has(i)) return true;
    return false;
  });

  public update(value: number): void {
    if (!this.visible.delete(value)) this.visible.add(value);
    this.visibilityRevision++;
    this.delta = [{ first: value, end: value + 1 }];
  }

  public get coverage(): "none" | "partial" | "all" {
    if (this.visible.size === 0) return "none";
    return this.visible.size === this.slots ? "all" : "partial";
  }

  public changesSince(revision: number): readonly TVisibilitySpan[] | undefined {
    if (revision === this.visibilityRevision) return [];
    if (revision === this.visibilityRevision - 1) return this.delta;
    return undefined;
  }
}

describe("cached visibility of translucent order parts", () => {
  it("rebuilds only the part group whose physical dependencies changed", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility(1024 * 128);
    const inspected = jest.fn();
    const input = Array.from({ length: 384 }, (_, page) => {
      const offset = page * 128;
      source.visible.add(offset);
      const runs = [{ source: 0, first: offset, count: 1 }];
      return {
        get runs() {
          inspected(page);
          return runs;
        },
        first: 0,
        end: 1,
      };
    });
    expect(cache.update(input, [source], [false]).flat()).toHaveLength(384);
    inspected.mockClear();
    source.any.mockClear();
    source.update(0);
    expect(cache.update(input, [source], [false]).flat()).toHaveLength(383);
    expect(inspected).not.toHaveBeenCalled();
    expect(source.any.mock.calls).toEqual([[0, 1]]);
  });

  it("reuses a part across changed order pages and rechecks one that was absent for an edit", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility(4096);
    const parts = Array.from({ length: 256 }, (_, i) => {
      source.visible.add(4 * i);
      return part({ source: 0, first: 4 * i, count: 1 });
    });
    const page = parts.slice(0, 128);
    const other = parts.slice(128);
    const apply = (pages: TTranslucentPart[][]) => cache.update(pages.flat(), [source], [false], pages).flat();
    expect(apply([page, other])).toHaveLength(256);
    source.any.mockClear();
    const inserted = part({ source: 0, first: 2000, count: 1 });
    expect(apply([[inserted, ...page], other])).toHaveLength(256);
    expect(source.any.mock.calls).toEqual([[2000, 1]]);
    apply([other]);
    source.update(4);
    apply([other]);
    source.update(512);
    const expected = parts.flatMap((p) => p.runs).filter(({ first }) => source.visible.has(first));
    expect(apply([page, other])).toEqual(expected);
  });

  it("keeps unchanged command groups across local visibility edits", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility(4096);
    const input = Array.from({ length: 640 }, (_, i) => {
      source.visible.add(i * 2);
      return part({ source: 0, first: i * 2, count: 1 });
    });
    const update = () => cache.update(input, [source], [false]);
    const before = update();
    const stable = before.find((group) => group.some((run) => run.first === 800));
    expect(stable).toBeDefined();
    source.update(8);
    source.update(1024);
    const after = update();
    expect(after).toContain(stable);
    expect(after.flat()).toEqual(before.flat().filter((run) => run.first !== 8 && run.first !== 1024));
    expect(update()).toBe(after);
  });

  it("repairs joins through singleton and empty groups when a gap changes", () => {
    const cache = new TranslucentVisibility();
    const a = new Visibility();
    const hidden = new Visibility();
    const offsets = [0, 128, 256, 384];
    offsets.forEach((first) => a.visible.add(first));
    const input = Array.from({ length: 7 * 128 }, (_, i) =>
      i % 256 === 0 ? part({ source: 0, first: i / 2, count: 1 }) : part({ source: 1, first: i, count: 1 })
    );
    const update = () => cache.update(input, [a, hidden], [true, false]).flat();
    expect(update()).toEqual([{ source: 0, first: 0, count: 385 }]);
    a.update(64);
    expect(update()).toEqual([
      { source: 0, first: 0, count: 1 },
      { source: 0, first: 128, count: 257 },
    ]);
    a.update(64);
    expect(update()).toEqual([{ source: 0, first: 0, count: 385 }]);
    expect(cache.update(input, [a, hidden], [false, false]).flat()).toEqual(
      offsets.map((first) => ({ source: 0, first, count: 1 }))
    );
  });

  it("does not revisit a prepared block if a neighboring slot was never queried", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility();
    source.visible.add(0);
    const runs = Array.from({ length: 128 }, (_, i) => ({ source: 0, first: i * 4, count: 1 }));
    const input = [part(...runs)];

    expect(cache.update(input, [source], [false]).flat()).toEqual([runs[0]]);
    source.any.mockClear();
    source.update(1);
    const delta = {
      first: 1,
      get end() {
        return 2;
      },
    };
    const readEnd = jest.spyOn(delta, "end", "get");
    jest.spyOn(source, "changesSince").mockReturnValue([delta]);
    expect(cache.update(input, [source], [false]).flat()).toEqual([runs[0]]);
    expect(source.any).not.toHaveBeenCalled();
    expect(readEnd.mock.calls.length).toBeLessThan(runs.length);
  });

  it("does not reproject a block when a change falls between its non-bridged physical runs", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility(4096);
    const input = Array.from({ length: 32 }, (_, i) => {
      source.visible.add(i);
      return part({ source: 0, first: i, count: 1 }, { source: 0, first: 2048 + i, count: 1 });
    });
    const draw = () => cache.update(input, [source], [false], [input]);
    const before = draw();
    let revision = source.visibilityRevision;
    const readRevision = jest.fn(() => revision);
    Object.defineProperty(source, "visibilityRevision", {
      get: readRevision,
      set(value: number) {
        revision = value;
      },
    });

    source.update(1024);
    readRevision.mockClear();
    source.any.mockClear();
    expect(draw()).toBe(before);
    expect(source.any).not.toHaveBeenCalled();
    // One source journal and snapshot; none of the 32 unchanged part projections is revisited.
    expect(readRevision.mock.calls.length).toBeLessThan(4);

    source.update(2048);
    expect(draw().flat()).toEqual(
      filterTranslucentRuns(
        input.flatMap((p) => p.runs),
        (_, first, count) => source.any(first, count),
        () => false
      )
    );
  });

  it("keeps an untouched part validated while the whole group skips visibility revisions", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility();
    const runs = [2, 8, 128, 160].map((first) => ({ source: 0, first, count: 1 }));
    const input = [part(runs[0], runs[1]), part(runs[2], runs[3])];
    const draw = () => cache.update(input, [source], [false], [input]).flat();
    source.visible.add(8);
    source.visible.add(160);
    expect(draw()).toEqual([runs[1], runs[3]]);

    for (const outside of [300, 400]) {
      source.update(outside);
      draw();
    }
    source.any.mockClear();
    source.update(2);
    expect(draw()).toEqual([runs[0], runs[1], runs[3]]);
    expect(source.any.mock.calls.every(([first]) => first < 128)).toBe(true);
  });

  it("seeks directly to a distant part in a long journal of visibility changes", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility();
    const first = 12_000;
    const input = [part({ source: 0, first, count: 1 }, { source: 0, first: first + 3, count: 1 })];
    source.visible.add(first + 3);
    const draw = () => cache.update(input, [source], [false]).flat();
    expect(draw()).toEqual([input[0].runs[1]]);

    let reads = 0;
    const changes = Array.from({ length: first / 2 + 1 }, (_, index) => ({
      first: index * 2,
      get end() {
        reads++;
        return index * 2 + 1;
      },
    }));
    source.update(first);
    jest.spyOn(source, "changesSince").mockReturnValue(changes);
    expect(draw()).toEqual(input[0].runs);
    expect(reads).toBeLessThan(64);
  });

  it("skips a long journal inside a gap between two non-bridged runs", () => {
    const cache = new TranslucentVisibility();
    const last = 16_384;
    const source = new Visibility(last + 1);
    source.visible.add(0);
    source.visible.add(last);
    const input = [part({ source: 0, first: 0, count: 1 }, { source: 0, first: last, count: 1 })];
    const draw = () => cache.update(input, [source], [false]);
    const before = draw();
    let reads = 0;
    const changes = Array.from({ length: last / 2 }, (_, i) => {
      const first = i * 2 + 1;
      source.visible.add(first);
      return {
        first,
        get end() {
          reads++;
          return first + 1;
        },
      };
    });
    source.visibilityRevision++;
    jest.spyOn(source, "changesSince").mockReturnValue(changes);
    source.any.mockClear();
    expect(draw()).toBe(before);
    expect(source.any).not.toHaveBeenCalled();
    expect(reads).toBeLessThan(64);

    // The last gap span touches the run. Extending it by one now changes the run itself.
    changes[changes.length - 1] = { first: last - 1, end: last + 1 };
    source.update(last);
    expect(draw().flat()).toEqual([input[0].runs[0]]);
  });

  it("rechecks an inactive gap when visibility changes or an intermediate raw run disappears", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility();
    for (const i of [0, 256, 512]) source.visible.add(i);
    const input = [
      part({ source: 0, first: 0, count: 1 }),
      part({ source: 0, first: 256, count: 1 }),
      part({ source: 0, first: 512, count: 1 }),
    ];
    expect(cache.update(input, [source], [true]).flat()).toEqual([{ source: 0, first: 0, count: 513 }]);
    source.update(128);
    expect(cache.update(input, [source], [true]).flat()).toEqual([
      { source: 0, first: 0, count: 1 },
      { source: 0, first: 256, count: 257 },
    ]);
    source.update(256);
    expect(cache.update(input, [source], [true]).flat()).toEqual([
      { source: 0, first: 0, count: 1 },
      { source: 0, first: 512, count: 1 },
    ]);
  });

  it("queries only the partial coverage and invalidates a skipped body when it reappears", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility(4);
    const input = [part({ source: 0, first: 0, count: 1 }, { source: 0, first: 3, count: 1 })];
    const query = () => cache.update(input, [source], [true]).flat();
    expect(query()).toEqual([]);
    for (let i = 0; i < 4; i++) source.update(i);
    expect(query()).toEqual(input[0].runs);
    expect(source.any).not.toHaveBeenCalled();

    source.update(1);
    source.update(2);
    expect(query()).toEqual([{ source: 0, first: 0, count: 4 }]);
    source.update(0);
    source.update(3);
    expect(query()).toEqual([]);
    source.update(3);
    expect(query()).toEqual([{ source: 0, first: 3, count: 1 }]);
  });

  it("uses complete source coverage directly and restores a bridge across group boundaries when partial", () => {
    const cache = new TranslucentVisibility();
    const source = new Visibility(3),
      other = new Visibility();
    source.visible.add(0);
    source.visible.add(2);
    other.visible.add(8);
    const first = { source: 0, first: 0, count: 1 },
      last = { source: 0, first: 2, count: 1 },
      unrelated = { source: 1, first: 8, count: 1 };
    const groups = [[part(first)], [part(last), part(unrelated)]];
    const parts = groups.flat();
    const draw = () => cache.update(parts, [source, other], [true, false], groups).flat();
    const joined = [{ source: 0, first: 0, count: 3 }, unrelated];
    expect(draw()).toEqual(joined);
    const journal = jest.spyOn(source, "changesSince");
    source.update(1);
    expect(draw()).toEqual([first, last, unrelated]);
    expect(journal).toHaveBeenCalledTimes(1);
    source.update(1);
    expect(draw()).toEqual(joined);

    source.visible.clear();
    source.visibilityRevision++;
    journal.mockClear().mockReturnValueOnce([{ first: 0, end: 3 }]);
    expect(draw()).toEqual([unrelated]);
    expect(journal).toHaveBeenCalledTimes(1);
    source.update(2);
    expect(draw()).toEqual([last, unrelated]);
  });

  it("matches flat filtering through visibility, source replacement and clipped order changes", () => {
    const cache = new TranslucentVisibility();
    const a = new Visibility();
    const b = new Visibility();
    const bridge = [true, false];
    let sources = [a, b];
    const aRuns = part(
      { source: 0, first: 0, count: 4 },
      { source: 0, first: 5, count: 1 },
      { source: 0, first: 9, count: 3 }
    );
    const mixed = [
      aRuns,
      part({ source: 1, first: 55, count: 5 }, { source: 1, first: 61, count: 3 }),
      part({ source: 0, first: 288, count: 5 }),
    ];
    const compare = (parts: TTranslucentPart[]): void => {
      const expected = filterTranslucentRuns(
        parts.flatMap(({ runs, first, end }) => runs.slice(first, end)),
        (source, first, count) => sources[source].any(first, count),
        (source) => bridge[source]
      );
      expect(cache.update(parts, sources, bridge).flat()).toEqual(expected);
    };

    let seed = 67;
    const next = (mod: number): number => {
      seed = (seed * 16807) % 2147483647;
      return seed % mod;
    };
    for (let i = 0; i < 90; i++) {
      for (let j = 0; j <= i % 3; j++) sources[next(2)].update(next(300));
      if (i === 41) sources = [new Visibility(), b];
      if (i % 3 === 0) compare([{ ...aRuns, first: 1 }, ...mixed.slice(1)]);
      else if (i % 3 === 1) compare(mixed);
      else compare(mixed.slice(1));
    }
  });
});

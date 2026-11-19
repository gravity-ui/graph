import { InstanceRanges } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import { InstanceVisibility, OpaqueVisibility } from "./instanceVisibility";
import type { TVisibilitySpan } from "./instanceVisibility";
import { STYLE_ROW_TEXELS, USE_BASE_ALPHA } from "./tables";
import { filterTranslucentRuns, orderTranslucent } from "./translucentOrder";

const frame = (scale: number, level: TSceneFrame["level"] = "schematic"): TSceneFrame => ({
  scale,
  level,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  dpr: 2,
  time: 0,
  dimColor: "#000",
});
const table = new Float32Array([0, 0, 1, 0, 0, 0, -1, 0]);
const styles = (): Float32Array => new Float32Array(STYLE_ROW_TEXELS * 4).fill(-1);

function paths(count: number, mask = 7): Float32Array {
  const data = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) data.set([0, 0, 1, 0, 0.1, 0.5, mask, 0], i * 8);
  return data;
}

/** Counts actual source reads, so a local edit cannot silently regress to scanning every resident record. */
class ObservedRanges extends InstanceRanges {
  public reads = 0;

  public override get data(): Float32Array {
    const owner = this;
    return new Proxy(super.data, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) owner.reads++;
        return Reflect.get(target, key, target);
      },
    });
  }
}

describe("instance visibility cohorts", () => {
  it("filters a retained order through owner, level, scale and part visibility changes", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("held-by-html", [1, 0, 1, 0, 0.1, 0.5, 7, 0]);
    ranges.set("shown", [0, 0, 1, 0, 0.1, 0.5, 2, 0]);
    ranges.retainLayout();
    const visibility = new InstanceVisibility("path"),
      paint = styles(),
      elements = table.slice();
    visibility.update(ranges, elements, paint, frame(0.2), 1);
    const runs = orderTranslucent(
      [{ instances: ranges }],
      (id) => (id === "shown" ? 0 : 1),
      () => 0,
      5,
      false
    );
    expect(runs).toEqual([
      { source: 0, first: 1, count: 1 },
      { source: 0, first: 0, count: 1 },
    ]);
    const visible = () =>
      filterTranslucentRuns(
        runs,
        (_source, first, count) => visibility.any(first, count),
        () => false
      );
    expect(visible()).toEqual([runs[0]]);
    elements[6] = 1;
    visibility.update(ranges, elements, paint, frame(0.2), 2);
    expect(visible()).toEqual(runs);
    visibility.update(ranges, elements, paint, frame(0.2, "detailed"), 2);
    expect(visible()).toEqual([runs[1]]);
    visibility.update(ranges, elements, paint, frame(0.5), 2);
    expect(visible()).toEqual([]);
    paint[7] = -2;
    visibility.update(ranges, elements, paint, frame(0.2), 3);
    expect(visible()).toEqual([]);
    paint[7] = -1;
    visibility.update(ranges, elements, paint, frame(0.2), 4);
    expect(visible()).toEqual(runs);
  });

  it("matches float scale boundaries, level masks, hidden owners and hidden parts", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("a", [0, 0, 1, 0, 0.1, 0.5, 2, 0, 0, 0, 1, 0, 0.1, 0.5, 2, 0]);
    ranges.set("b", [1, 0, 1, 0, 0, 10, 7, 0]);
    const visibility = new InstanceVisibility("path");
    const paint = styles();
    visibility.update(ranges, table, paint, frame(0.1));
    expect(visibility.any(0, 1)).toBe(true);
    expect(visibility.any(1, 2)).toBe(true);
    expect(visibility.any(2, 1)).toBe(false);
    expect(visibility.any(0, 0)).toBe(false);
    expect(visibility.from).toBe(Math.fround(0.1));
    expect(visibility.to).toBe(0.5);
    visibility.update(ranges, table, paint, frame(0.5));
    expect(visibility.any(0, 3)).toBe(false);
    visibility.update(ranges, table, paint, frame(0.2, "detailed"));
    expect(visibility.any(0, 3)).toBe(false);
    paint[7] = -2;
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(0, 3)).toBe(false);
  });

  it("refreshes changed visibility data without relying on buffer identity", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("a", [0, 0, 0, 0, 0, 0.1, 7, 0]);
    const visibility = new InstanceVisibility("path");
    visibility.update(ranges, table, styles(), frame(0.2));
    expect(visibility.any(0, 1)).toBe(false);
    ranges.edit("a", (data) => {
      data[5] = 1;
    });
    visibility.update(ranges, table, styles(), frame(0.2));
    expect(visibility.any(0, 1)).toBe(true);
  });

  it("tests both rectangle paint slots, as the vertex shader does", () => {
    const data = new Float32Array(28);
    data[2] = 1;
    data[3] = 2;
    data[26] = 1;
    data[27] = 7;
    const ranges = new InstanceRanges(28);
    ranges.set("rect", data);
    const visibility = new InstanceVisibility("rect"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(0, 1)).toBe(true);
    paint[11] = -2;
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(0, 1)).toBe(false);
  });

  it("reads only the dirty chunk and preserves predicates at both chunk edges", () => {
    const ranges = new ObservedRanges(8);
    ranges.set("paths", paths(512));
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2));
    ranges.takeUpload();
    ranges.reads = 0;
    ranges.editSpan("paths", 128, 1, (data, at) => (data[at + 4] = 0.3));
    visibility.invalidate(ranges.takeUpload(), ranges);
    visibility.update(ranges, table, paint, frame(0.2));
    expect(ranges.reads).toBeGreaterThan(0);
    expect(ranges.reads).toBeLessThanOrEqual(128 * 6);
    expect(visibility.any(127, 1)).toBe(true);
    expect(visibility.any(128, 1)).toBe(false);
    expect(visibility.any(128, 2)).toBe(true);
    expect(visibility.any(255, 2)).toBe(true);
    expect(visibility.to).toBe(Math.fround(0.3));
    ranges.reads = 0;
    visibility.update(ranges, table, paint, frame(0.3));
    expect(visibility.any(128, 1)).toBe(true);
    expect(ranges.reads).toBe(0);
  });

  it("accumulates dirty chunks before a read and falls back for an unreported revision", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("paths", paths(384));
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2));
    ranges.takeUpload();
    for (const first of [0, 256]) {
      ranges.editSpan("paths", first, 1, (data, at) => (data[at + 5] = 0.15));
      visibility.invalidate(ranges.takeUpload(), ranges);
    }
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(0, 1)).toBe(false);
    expect(visibility.any(256, 1)).toBe(false);
    expect(visibility.any(128, 1)).toBe(true);
    ranges.editSpan("paths", 128, 1, (data, at) => (data[at + 5] = 0.15));
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(128, 1)).toBe(false);
  });

  it("trims whole and partial tail chunks without a payload upload, then accepts reused slots", () => {
    const ranges = new ObservedRanges(8);
    ranges.set("head", paths(140));
    ranges.set("tail", paths(150));
    ranges.retainLayout();
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2));
    ranges.takeUpload();
    ranges.delete("tail");
    const upload = ranges.takeUpload();
    expect(upload.kind).toBe("none");
    visibility.invalidate(upload, ranges);
    ranges.reads = 0;
    visibility.update(ranges, table, paint, frame(0.2));
    expect(ranges.reads).toBeLessThanOrEqual(12 * 6);
    expect(visibility.any(139, 1)).toBe(true);
    expect(visibility.any(140, 200)).toBe(false);
    ranges.set("tail", paths(150));
    visibility.invalidate(ranges.takeUpload(), ranges);
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(289, 1)).toBe(true);
    ranges.delete("head");
    ranges.delete("tail");
    visibility.invalidate(ranges.takeUpload(), ranges);
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(0, 290)).toBe(false);
    expect(visibility.from).toBe(-Infinity);
    expect(visibility.to).toBe(Infinity);
  });

  it("keeps retained holes hidden with no level and reevaluates cached owner and style visibility", () => {
    const ranges = new ObservedRanges(8);
    ranges.set("head", paths(140, 2));
    ranges.set("hole", paths(128));
    ranges.set("tail", paths(140, 4));
    ranges.retainLayout();
    const visibility = new InstanceVisibility("path"),
      paint = styles(),
      elements = table.slice();
    const allLevels = { ...frame(0.2), level: undefined };
    visibility.update(ranges, elements, paint, allLevels);
    ranges.takeUpload();
    ranges.delete("hole");
    visibility.invalidate(ranges.takeUpload(), ranges);
    visibility.update(ranges, elements, paint, allLevels);
    expect(visibility.any(140, 128)).toBe(false);
    expect(visibility.any(139, 130)).toBe(true);
    ranges.reads = 0;
    visibility.update(ranges, elements, paint, frame(0.2, "schematic"));
    expect(visibility.any(0, 140)).toBe(true);
    expect(visibility.any(268, 140)).toBe(false);
    paint[7] = -2;
    visibility.update(ranges, elements, paint, allLevels);
    expect(visibility.any(0, 408)).toBe(false);
    paint[7] = -1;
    elements[2] = -1;
    visibility.update(ranges, elements, paint, allLevels);
    expect(visibility.any(0, 408)).toBe(false);
    elements[2] = 1;
    visibility.update(ranges, elements, paint, allLevels);
    expect(visibility.any(268, 140)).toBe(true);
    expect(ranges.reads).toBe(0);
  });

  it("rebuilds for a replacement source even when it reports only a partial upload", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("paths", paths(384, 2));
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2));
    const replacement = new InstanceRanges(8);
    replacement.set("paths", paths(384, 4));
    replacement.takeUpload();
    replacement.editSpan("paths", 1, 1, (data, at) => (data[at + 6] = 2));
    visibility.invalidate(replacement.takeUpload(), replacement);
    visibility.update(replacement, table, paint, frame(0.2));
    expect(visibility.any(0, 1)).toBe(false);
    expect(visibility.any(1, 1)).toBe(true);
    expect(visibility.any(256, 128)).toBe(false);
  });

  it("finds active records only in middle chunks or before a partial endpoint", () => {
    const ranges = new InstanceRanges(8);
    const data = paths(512, 4);
    data[150 * 8 + 6] = 2;
    data[280 * 8 + 6] = 2;
    ranges.set("paths", data);
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2));
    expect(visibility.any(1, 500)).toBe(true);
    expect(visibility.any(151, 129)).toBe(false);
    expect(visibility.any(151, 130)).toBe(true);
    expect(visibility.any(281, 231)).toBe(false);
    expect(visibility.any(128, 22)).toBe(false);
    expect(visibility.any(128, 23)).toBe(true);
    visibility.update(ranges, table, paint, frame(0.2, "detailed"));
    expect(visibility.any(150, 1)).toBe(false);
    expect(visibility.any(151, 129)).toBe(true);
  });

  it("caches a prepared visibility state until its predicate or scene revision changes", () => {
    const ranges = new ObservedRanges(8);
    ranges.set("paths", paths(256));
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2), 1);
    const revision = visibility.visibilityRevision;
    ranges.reads = 0;
    visibility.update(ranges, table, paint, frame(0.3), 1);
    expect(visibility.visibilityRevision).toBe(revision);
    expect(visibility.any(0, 256)).toBe(true);
    paint[7] = -2;
    visibility.update(ranges, table, paint, frame(0.3), 2);
    expect(visibility.visibilityRevision).toBeGreaterThan(revision);
    expect(visibility.any(0, 256)).toBe(false);
    paint[7] = -1;
    visibility.update(ranges, table, paint, frame(0.5), 3);
    expect(visibility.any(0, 256)).toBe(false);
    visibility.update(ranges, table, paint, frame(0.3), 3);
    expect(visibility.any(0, 256)).toBe(true);
    expect(ranges.reads).toBe(0);
  });

  it("rechecks only chunks of a hidden or restyled owner and preserves the other scale boundaries", () => {
    const ranges = new InstanceRanges(8);
    for (let owner = 0; owner < 4; owner++) {
      const data = paths(128);
      for (let at = 0; at < data.length; at += 8) data[at] = owner;
      data[4] = 0.15 + owner * 0.025;
      ranges.set(String(owner), data);
    }
    const elements = new Float32Array([0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0]);
    const visibility = new InstanceVisibility("path");
    let reads = 0;
    const observed = new Proxy(elements, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, target);
      },
    });
    const paint = styles();
    visibility.update(ranges, observed, paint, frame(0.3), 1);
    const from = visibility.from;
    reads = 0;
    elements[6] = -1;
    visibility.invalidateOwner(ranges, "1");
    visibility.update(ranges, observed, paint, frame(0.3), 1);
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(4);
    expect(visibility.any(128, 128)).toBe(false);
    expect(visibility.any(128, 129)).toBe(true);
    expect(visibility.from).toBe(from);
    visibility.update(ranges, observed, paint, frame(0.2), 1);
    expect(visibility.any(384, 1)).toBe(false);
  });

  it("checks only addressed owners when the new level shows the same masks", () => {
    const ranges = new InstanceRanges(8);
    const elements = new Float32Array(512 * 4);
    for (let owner = 0; owner < 512; owner++) {
      ranges.set(String(owner), [owner, 0, 1, 0, 0.1, 0.5, owner % 2 ? 7 : 6, 0]);
      elements[owner * 4 + 2] = -1;
    }
    const reads = new Set<number>();
    const observed = new Proxy(elements, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads.add(Math.floor(Number(key) / 4));
        return Reflect.get(target, key, target);
      },
    });
    const visibility = new InstanceVisibility("path");
    const paint = styles();
    visibility.update(ranges, observed, paint, frame(0.2, "detailed"), 1);
    reads.clear();
    const revision = visibility.visibilityRevision;
    for (const owner of [406, 209, 207]) {
      elements[owner * 4 + 2] = 1;
      visibility.invalidateOwner(ranges, String(owner));
    }
    visibility.update(ranges, observed, paint, frame(0.2), 1);
    expect([...reads]).toEqual([207, 209, 406]);
    expect(visibility.changesSince(revision)).toEqual([
      { first: 207, end: 208 },
      { first: 209, end: 210 },
      { first: 406, end: 407 },
    ]);
    expect(visibility.any(2, 396)).toBe(true);
    for (const owner of [209, 207]) {
      elements[owner * 4 + 2] = -1;
      visibility.invalidateOwner(ranges, String(owner));
    }
    visibility.update(ranges, observed, paint, frame(0.2), 1);
    expect(visibility.any(2, 396)).toBe(false);
    expect(visibility.any(406, 1)).toBe(true);
  });

  it("drops invalidations beyond a temporary tail removed before the next visibility update", () => {
    const ranges = new InstanceRanges(8);
    const visibility = new InstanceVisibility("path");
    const paint = styles();
    ranges.set("old", paths(128));
    visibility.update(ranges, table, paint, frame(0.2), 1);
    ranges.takeUpload();
    const revision = visibility.visibilityRevision;
    ranges.set("temporary", paths(128));
    visibility.invalidateOwner(ranges, "temporary");
    ranges.delete("temporary");
    visibility.invalidate(ranges.takeUpload(), ranges);
    visibility.update(ranges, table, paint, frame(0.2), 1);
    expect(visibility.changesSince(revision)).toEqual([]);
    expect(visibility.coverage).toBe("all");
  });

  it("clips pending owner edits to the surviving chunks when a predicate also changes", () => {
    const ranges = new InstanceRanges(8),
      visibility = new InstanceVisibility("path"),
      paint = styles();
    ranges.set("head", paths(128));
    ranges.set("tail", paths(130));
    visibility.update(ranges, table, paint, frame(0.2), 1);
    ranges.takeUpload();
    visibility.invalidateOwner(ranges, "tail");
    ranges.delete("tail");
    ranges.editSpan("head", 5, 1, (row, at) => {
      row[at + 6] = 4;
    });
    visibility.invalidate(ranges.takeUpload(), ranges);
    const rev = visibility.visibilityRevision;
    visibility.update(ranges, table, paint, frame(0.2), 1);
    expect(visibility.changesSince(rev)).toEqual([
      { first: 5, end: 6 },
      { first: 128, end: 258 },
    ]);
    expect(visibility.any(5, 1)).toBe(false);
    expect(visibility.any(6, 1)).toBe(true);
  });

  it("keeps constant-time range answers across page boundaries, global LOD changes and source replacement", () => {
    const ranges = new InstanceRanges(8),
      visibility = new InstanceVisibility("path"),
      paint = styles();
    const page = 64 * 128;
    visibility.update(ranges, table, paint, frame(0.2), 1);
    expect(visibility.coverage).toBe("none");
    ranges.set("start", paths(page - 1, 0));
    ranges.set("border", paths(2, 2));
    ranges.set("gap", paths(page - 1, 0));
    ranges.set("tail", paths(1, 4));
    visibility.update(ranges, table, paint, frame(0.2), 1);
    expect(visibility.any(0, page - 1)).toBe(false);
    expect(visibility.any(0, 2 * page)).toBe(true);
    expect(visibility.any(page, 1)).toBe(true);
    expect(visibility.any(page + 1, page)).toBe(false);
    visibility.update(ranges, table, paint, frame(0.2, "detailed"), 1);
    expect(visibility.any(0, 2 * page)).toBe(false);
    expect(visibility.any(1, 2 * page)).toBe(true);
    const replacement = new InstanceRanges(8);
    replacement.set("border", paths(1, 4));
    visibility.update(replacement, table, paint, frame(0.2, "detailed"), 1);
    expect(visibility.coverage).toBe("all");
    expect(visibility.any(1, 2 * page)).toBe(false);
    replacement.delete("border");
    visibility.update(replacement, table, paint, frame(0.2, "detailed"), 1);
    expect(visibility.coverage).toBe("none");
    expect(visibility.any(0, 2 * page)).toBe(false);
  });

  it("reports changed active slots even when a dirty chunk keeps its visible count", () => {
    const ranges = new InstanceRanges(8);
    const data = paths(384);
    data[128 * 8 + 6] = 4;
    ranges.set("paths", data);
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    const update = () => visibility.update(ranges, table, paint, frame(0.2), 1);
    update();
    ranges.takeUpload();
    const before = visibility.visibilityRevision;

    ranges.editSpan("paths", 0, 1, (data, at) => (data[at + 5] = 0.45));
    visibility.invalidate(ranges.takeUpload(), ranges);
    update();
    expect(visibility.visibilityRevision).toBe(before);
    expect(visibility.changesSince(before)).toEqual([]);

    ranges.editSpan("paths", 128, 5, (data, at) => {
      data[at + 6] = 2;
      data[at + 4 * 8 + 6] = 4;
    });
    visibility.invalidate(ranges.takeUpload(), ranges);
    update();
    expect(visibility.any(128, 1)).toBe(true);
    expect(visibility.any(132, 1)).toBe(false);
    const spans = [
      { first: 128, end: 129 },
      { first: 132, end: 133 },
    ];
    expect(visibility.changesSince(before)).toEqual(spans);

    update();
    expect(visibility.changesSince(before)).toEqual(spans);
    const latest = visibility.visibilityRevision;
    visibility.update(ranges, table, paint, frame(0.2, "detailed"), 1);
    expect(visibility.changesSince(latest)).toEqual(spans);
    expect(visibility.changesSince(before)).toBeUndefined();
  });

  it("reports active tail truncation and rejects proofs across physical sources", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("head", paths(140));
    ranges.set("tail", paths(150));
    ranges.retainLayout();
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    const update = (source = ranges) => visibility.update(source, table, paint, frame(0.2), 1);
    update();
    ranges.takeUpload();
    const before = visibility.visibilityRevision;

    ranges.delete("tail");
    const upload = ranges.takeUpload();
    expect(upload.kind).toBe("none");
    visibility.invalidate(upload, ranges);
    update();
    expect(visibility.changesSince(before)).toEqual([{ first: 140, end: 290 }]);

    const latest = visibility.visibilityRevision;
    const replacement = new InstanceRanges(8);
    replacement.set("head", paths(140));
    update(replacement);
    expect(visibility.changesSince(latest)).toBeUndefined();
    expect(visibility.any(139, 1)).toBe(true);
  });

  it("matches exact physical deltas through retained slot reuse and global predicate changes", () => {
    const ranges = new InstanceRanges(8);
    ranges.set("steady", paths(190));
    ranges.retainLayout();
    const visibility = new InstanceVisibility("path"),
      paint = styles(),
      maxSlots = 512;
    const measure = (scale: number, level: TSceneFrame["level"], stateRevision: number): boolean[] => {
      visibility.invalidate(ranges.takeUpload(), ranges);
      visibility.update(ranges, table, paint, frame(scale, level), stateRevision);
      const full = new InstanceVisibility("path");
      full.update(ranges, table, paint, frame(scale, level), stateRevision);
      const slots = Array.from({ length: maxSlots }, (_, first) => visibility.any(first, 1));
      expect(slots).toEqual(Array.from({ length: maxSlots }, (_, first) => full.any(first, 1)));
      return slots;
    };
    let previous = measure(0.2, "schematic", 0);
    for (let i = 1; i <= 45; i++) {
      const id = `churn${i % 3}`;
      if (i % 5 > 1) ranges.set(id, paths(1 + ((i * 73) % 97), i % 2 ? 6 : 2));
      else ranges.delete(id);
      paint[7] = i % 7 === 0 ? -2 : -1;
      const revision = visibility.visibilityRevision;
      const next = measure(i % 6 === 0 ? 0.6 : 0.2, i % 5 === 1 ? "detailed" : "schematic", i);
      const expected: TVisibilitySpan[] = [];
      for (let slot = 0; slot < next.length; slot++) {
        if (next[slot] === previous[slot]) continue;
        const last = expected.at(-1);
        if (last?.end === slot) last.end++;
        else expected.push({ first: slot, end: slot + 1 });
      }
      expect(visibility.changesSince(revision)).toEqual(expected);
      previous = next;
    }
  });

  it("keeps its visibility revision for changed path subs and widths with the same predicates", () => {
    const ranges = new ObservedRanges(8);
    ranges.set("paths", paths(384));
    const visibility = new InstanceVisibility("path"),
      paint = styles();
    visibility.update(ranges, table, paint, frame(0.2), 1);
    ranges.takeUpload();
    const revision = visibility.visibilityRevision;
    ranges.reads = 0;
    ranges.editSpan("paths", 128, 1, (data, at) => {
      data[at + 1] = 3;
      data[at + 3] = 20;
      data[at + 6] += 8;
      data[at + 7] = 40;
    });
    visibility.invalidate(ranges.takeUpload(), ranges);
    visibility.update(ranges, table, paint, frame(0.2), 2);
    expect(visibility.visibilityRevision).toBe(revision);
    expect(visibility.any(127, 130)).toBe(true);
    expect(ranges.reads).toBeLessThanOrEqual(128 * 6);
    expect(visibility.from).toBe(Math.fround(0.1));
    expect(visibility.to).toBe(0.5);
    // The cached cohort still observes later style and scale changes.
    paint[7] = -2;
    visibility.update(ranges, table, paint, frame(0.2), 3);
    expect(visibility.visibilityRevision).toBeGreaterThan(revision);
    expect(visibility.any(0, 384)).toBe(false);
    paint[7] = -1;
    visibility.update(ranges, table, paint, frame(0.5), 4);
    expect(visibility.any(0, 384)).toBe(false);
    visibility.update(ranges, table, paint, frame(0.2), 4);
    expect(visibility.any(128, 1)).toBe(true);
  });
});

describe("opaque batch visibility", () => {
  it.each([1, USE_BASE_ALPHA, 0.5])("shares faded glyphs between passes according to encoded alpha %s", (alpha) => {
    const data = new Float32Array(28);
    data[15] = alpha;
    data[22] = 0.3;
    data[24] = 0.2;
    data[25] = 0.7;
    data[26] = 6;
    const ranges = new InstanceRanges(28);
    ranges.set("label", data);
    const blended = new InstanceVisibility("glyph-blended");
    const revealed = new OpaqueVisibility("glyph-revealed");
    const elements = table.slice();
    const paint = styles();
    const shown = (scale: number, level: TSceneFrame["level"] = "schematic", revision = 0): boolean[] => {
      const camera = frame(scale, level);
      blended.update(ranges, elements, paint, camera, revision);
      return [blended.any(0, 1), revealed.any(ranges, elements, paint, camera, revision)];
    };
    const complete = alpha === 0.5 ? [true, false] : [false, true];
    expect(shown(0.19)).toEqual([false, false]);
    expect(shown(0.25)).toEqual([true, false]);
    expect(shown(0.3)).toEqual(complete);
    expect(shown(0.6, "detailed")).toEqual(complete);
    expect(shown(0.6, "minimalistic")).toEqual([false, false]);
    expect(shown(0.7)).toEqual([false, false]);
    expect(shown(0.25)).toEqual([true, false]);
    elements[2] = -1;
    expect(shown(0.5, "schematic", 1)).toEqual([false, false]);
    elements[2] = 0;
    expect(shown(0.5, "schematic", 2)).toEqual(complete);
  });

  it.each([
    ["rect", 28, 25, 27],
    ["triangle", 12, 10, 3],
    ["glyph", 27, 24, 26],
  ] as const)(
    "rechecks a reused %s slot, both sides of a zoom boundary, and hidden owners and paint",
    (kind, stride, scales, mask) => {
      const data = new Float32Array(stride),
        ranges = new ObservedRanges(stride);
      const owners = table.slice(),
        paint = styles(),
        visibility = new OpaqueVisibility(kind);
      data[2] = 1;
      if (kind === "rect") data[3] = 2;
      data[scales] = 0.1;
      data[scales + 1] = 0.5;
      data[mask] = 2;
      data[0] = 1;
      ranges.set("hidden", data);
      data[0] = 0;
      ranges.set("winner", data);
      const any = (scale: number, state = 0, level: TSceneFrame["level"] = "schematic") =>
        visibility.any(ranges, owners, paint, frame(scale, level), state);
      expect(any(0.1)).toBe(true);
      ranges.delete("winner");
      data[0] = 1;
      ranges.set("replacement", data);
      expect(any(0.1)).toBe(false);
      owners[6] = 1;
      expect(any(0.1, 1)).toBe(true);
      paint[kind === "rect" ? 11 : 7] = -2;
      expect(any(0.1, 2)).toBe(false);
      paint.fill(-1);
      expect(any(0.1, 3)).toBe(true);
      expect(any(0.5, 3)).toBe(false);
      ranges.reads = 0;
      expect(any(0.6, 4)).toBe(false);
      expect(ranges.reads).toBe(0);
      expect(any(0.2, 4, "detailed")).toBe(false);
      expect(any(0.1, 4)).toBe(true);
      ranges.edit("replacement", (row) => {
        row[mask] = 4;
      });
      expect(any(0.1, 4, "detailed")).toBe(true);
    }
  );
});

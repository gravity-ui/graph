import { InstanceRanges } from "./InstanceRanges";
import type { TSceneFrame } from "./backendTypes";
import { InstanceVisibility } from "./instanceVisibility";
import { STYLE_ROW_TEXELS } from "./tables";

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

import { DEFAULT_TEXT_POLICY, TEXT_METRICS_PX, layoutText, placeText, resolveTextSize } from "../textLayout";
import type { ISceneTextMetrics } from "../textLayout";
import type { TScenePrimitive, TSceneTextPolicy } from "../types";

import { InstanceRanges } from "./InstanceRanges";
import { GLYPH_FLOATS, GLYPH_SUB_FLOATS, encodeText, textGlyphCount, writeTextGlyphs } from "./encodeText";
import type { TTextEncodeInput, TTextGlyphPlaces } from "./encodeText";
import { ATLAS_FONT_PX, GlyphAtlas, SDF_BUFFER, glyphCapacity, glyphRun, layoutGlyphs } from "./glyphs";
import { USE_BASE_ALPHA } from "./tables";

type TText = Extract<TScenePrimitive, { kind: "text" }>;

function atlas(): GlyphAtlas {
  return new GlyphAtlas(
    () => ({
      data: new Uint8ClampedArray(100),
      width: 10,
      height: 10,
      glyphLeft: 0,
      glyphTop: 0,
      glyphWidth: 10,
      glyphHeight: 10,
      glyphAdvance: 10,
    }),
    128
  );
}

/** Half the font size per character at TEXT_METRICS_PX, the baseline 0.8 of the size below a line's top. */
const metrics: ISceneTextMetrics = { generation: 0, width: (value) => value.length * 50, top: () => 80 };

/** Texts laid out at a camera scale under a policy. */
function input(scale = 1, policy: TSceneTextPolicy = DEFAULT_TEXT_POLICY): TTextEncodeInput {
  return {
    policy,
    metrics,
    layoutOf: (primitive) => layoutText(primitive, resolveTextSize(primitive, scale, policy), metrics),
  };
}

/** The floats of a hidden glyph of a text: its element and slot, an empty scale range, zeros. */
function hiddenGlyph(element: number, slot: number): number[] {
  const floats = new Array<number>(GLYPH_FLOATS).fill(0);
  floats[0] = element;
  floats[2] = slot;
  floats[24] = 1e9;
  return floats;
}

function text(patch: Partial<TText> = {}): TText {
  return {
    kind: "text",
    text: "a",
    family: "f",
    size: 12,
    lineHeight: 14,
    color: "#00f",
    x: 0,
    y: 0,
    width: 100,
    ...patch,
  };
}

describe("encodeText", () => {
  it("writes the level mask of a primitive", () => {
    const { opaque } = encodeText([text({ levelMask: 4 })], 0, () => 2, atlas(), input());
    expect(opaque[26]).toBe(4);
  });

  it("writes one glyph per non-space character, with the text's anchor, size and no clip while its lines fit", () => {
    const { opaque, translucent } = encodeText([text({ text: "a b", x: 3, y: 4 })], 7, () => 2, atlas(), input());
    expect(translucent).toHaveLength(0);
    expect(opaque).toHaveLength(2 * GLYPH_FLOATS);
    // The element, the clip's left, the part slot and the clip's right (none: the line fits the box); the subs lie in
    // a list of their own.
    expect(Array.from(opaque.slice(0, 4))).toEqual([7, -1e9, 2, 1e9]);
    expect(Array.from(opaque.slice(12, 16))).toEqual([0, 0, 1, 1]);
    expect(Array.from(opaque.slice(16, 20))).toEqual([0, 12, 0, 1e9]);
    // The anchor, the size the quads are placed at and the clip's top.
    expect(Array.from(opaque.slice(20, 24))).toEqual([3, 4, TEXT_METRICS_PX, -1e9]);
    expect(Array.from(opaque.slice(24, 28))).toEqual([0, 1e9, 7, 1e9]);
    for (let i = 0; i < 2; i++) {
      const at = i * GLYPH_FLOATS;
      for (const uv of opaque.slice(at + 8, at + 12)) {
        expect(uv).toBeGreaterThanOrEqual(0);
        expect(uv).toBeLessThanOrEqual(1);
      }
    }
  });

  it("clips the glyphs of a text whose layout overflows its box to the box, as Canvas2D does", () => {
    // One unwrapped line of 10 characters, 61 wide at size 12, in a 30-wide box: clipped to [3, 33] x [5, 35].
    const wide = text({ text: "aaaaaaaaaa", wrap: false, x: 3, y: 5, width: 30, height: 30 });
    const { opaque } = encodeText([wide], 0, () => 2, atlas(), input());
    expect([opaque[1], opaque[3], opaque[23], opaque[27]]).toEqual([3, 33, 5, 35]);
  });

  it("writes a camera-aware size as pixels clamped by world units, and the world size under a policy off", () => {
    const aware = text({ cameraAware: { maxWorld: 96 }, height: 30, y: 5 });
    const on = encodeText([aware], 0, () => 2, atlas(), input()).opaque;
    expect(Array.from(on.slice(16, 20))).toEqual([1, 12, 0, 96]);
    const off = encodeText([aware], 0, () => 2, atlas(), input(1, { cameraAware: false })).opaque;
    expect(Array.from(off.slice(16, 20))).toEqual([0, 12, 0, 1e9]);
    expect(
      Array.from(encodeText([text({ cameraAware: true })], 0, () => 2, atlas(), input()).opaque.slice(16, 20))
    ).toEqual([1, 12, 0, 1e9]);
  });

  it("puts translucent text into translucent", () => {
    const { opaque, translucent } = encodeText([text({ color: "rgba(0,0,0,0.5)" })], 0, () => 0, atlas(), input());
    expect(opaque).toHaveLength(0);
    expect(translucent).toHaveLength(GLYPH_FLOATS);
  });

  it("writes each glyph's sub to the sub list of its pass, in step with the glyphs, and not into the glyph", () => {
    const rect: TScenePrimitive = { kind: "rect", x: 0, y: 0, width: 1, height: 1, fill: "#fff" };
    const { opaque, translucent, subs } = encodeText(
      [
        text({ text: "ab" }),
        rect,
        text({ text: "c d", color: "rgba(0,0,0,0.5)" }),
        text({ text: " " }),
        text({ text: "e" }),
      ],
      3,
      () => 2,
      atlas(),
      input(),
      10
    );
    expect(Array.from(subs.opaque)).toEqual([10, 10, 14]);
    expect(Array.from(subs.translucent)).toEqual([12, 12]);
    expect(opaque).toHaveLength(subs.opaque.length * GLYPH_FLOATS);
    expect(translucent).toHaveLength(subs.translucent.length * GLYPH_FLOATS);
    // Float 1 is the clip's left (none: the lines fit), not a sub.
    for (const list of [opaque, translucent]) {
      for (let at = 0; at < list.length; at += GLYPH_FLOATS) expect(list[at + 1]).toBe(-1e9);
    }
    const none = encodeText([rect], 0, () => 2, atlas(), input());
    expect(none.subs.opaque).toHaveLength(0);
    expect(none.subs.translucent).toHaveLength(0);
  });

  it("returns its opaque glyphs and subs as views of the encoder's lists, the translucent ones as copies", () => {
    const shared = atlas();
    const faded = (value: string): TText => text({ text: value, cameraAware: true, color: "rgba(0, 0, 0, 0.5)" });
    const first = encodeText([text({ text: "ab" }), faded("cd")], 2, () => 2, shared, input(), 4);
    expect([first.opaque[0], first.subs.opaque[0]]).toEqual([2, 4]);
    expect([first.translucent[0], first.subs.translucent[0]]).toEqual([2, 5]);
    const translucent = Array.from(first.translucent);
    const subs = Array.from(first.subs.translucent);
    encodeText([text({ text: "xyz" }), faded("uvw")], 3, () => 2, shared, input(), 9);
    // Read in place, not copied: the next encode, which reuses the encoder's lists, wrote over the views.
    expect([first.opaque[0], first.subs.opaque[0]]).toEqual([3, 9]);
    // A camera-aware translucent text's glyphs and subs are copies of their own (the backend keeps them to cut its
    // steps again on a re-layout): unchanged.
    expect(Array.from(first.translucent)).toEqual(translucent);
    expect(Array.from(first.subs.translucent)).toEqual(subs);
  });

  it("leaves InstanceRanges copies of its opaque views: later encodes do not change what the ranges hold", () => {
    const shared = atlas();
    const glyphs = new InstanceRanges(GLYPH_FLOATS);
    const subs = new InstanceRanges(GLYPH_SUB_FLOATS);
    const a = encodeText([text({ text: "ab" })], 1, () => 2, shared, input(), 4);
    const aFloats = [...Array.from(a.opaque), ...Array.from(a.subs.opaque)];
    glyphs.set("a", a.opaque);
    subs.set("a", a.subs.opaque);
    const b = encodeText([text({ text: "c" })], 2, () => 2, shared, input(), 6);
    const bFloats = [...Array.from(b.opaque), ...Array.from(b.subs.opaque)];
    glyphs.set("b", b.opaque);
    subs.set("b", b.subs.opaque);
    // Another encode with the same lists, wider than both: it writes over every float their views showed.
    encodeText([text({ text: "wxyz" })], 3, () => 2, shared, input(), 8);
    const held = (id: string): number[] => {
      const out: number[] = [];
      for (const ranges of [glyphs, subs]) {
        const { data, floats } = ranges;
        ranges.forEachRange((at, offset, count) => {
          if (at === id) out.push(...Array.from(data.subarray(offset * floats, (offset + count) * floats)));
        });
      }
      return out;
    };
    expect(held("a")).toEqual(aFloats);
    expect(held("b")).toEqual(bFloats);
  });

  it("offsets the depth sub-order by the sub base and checks the budget", () => {
    expect(encodeText([text()], 0, () => 2, atlas(), input(), 5).subs.opaque[0]).toBe(5);
    expect(() => encodeText([text(), text()], 0, () => 2, atlas(), input(), 31, 31)).toThrow(RangeError);
    expect(encodeText([text(), text()], 0, () => 2, atlas(), input(), 31).subs.opaque[1]).toBe(32);
  });

  describe("places glyphs where Canvas2D draws the shared layout's lines", () => {
    // The fake glyphs: 10 atlas px quads and advances, the quad 3 atlas px (SDF_BUFFER) left of the pen and above the
    // baseline. Runs are at TEXT_METRICS_PX; the shader scales them by the resolved size over it.
    const k = TEXT_METRICS_PX / ATLAS_FONT_PX;
    /** The vertex shader's world position of a glyph quad's corner (0, 0): anchor + quad x resolved / layout size. */
    const shaderCorner = (out: ArrayLike<number>, at: number, size: number): { x: number; y: number } => {
      const s = size / out[at + 22];
      return { x: out[at + 20] + out[at + 4] * s, y: out[at + 21] + out[at + 5] * s };
    };

    for (const verticalAlign of ["top", "middle", "bottom"] as const) {
      for (const camera of [1, 0.5, 0.125]) {
        it(`${verticalAlign}, camera scale ${camera}`, () => {
          const primitive = text({
            text: "aa aa",
            cameraAware: { maxWorld: 96 },
            lineHeight: 16,
            x: 3,
            y: 4,
            width: 40,
            height: 200,
            align: "center",
            verticalAlign,
          });
          const size = resolveTextSize(primitive, camera);
          const layout = layoutText(primitive, size, metrics);
          const { opaque } = encodeText([primitive], 0, () => 2, atlas(), input(camera));
          const glyphs = layout.lines.join("").replace(/ /g, "").length;
          // A camera-aware text keeps a glyph per character and one for "…": the lines' glyphs, then hidden ones.
          expect(opaque).toHaveLength(glyphCapacity(primitive.text) * GLYPH_FLOATS);
          for (let at = glyphs * GLYPH_FLOATS; at < opaque.length; at += GLYPH_FLOATS) {
            expect(Array.from(opaque.slice(at, at + GLYPH_FLOATS))).toEqual(hiddenGlyph(0, 2));
          }
          const place = placeText(primitive, layout.lines.length, size, metrics);
          let at = 0;
          layout.lines.forEach((line, row) => {
            const first = shaderCorner(opaque, at, size);
            const s = size / TEXT_METRICS_PX;
            // Undo the quad's offset from the pen and the baseline, scaled with it; instances are float32.
            const pen = first.x + SDF_BUFFER * k * s;
            const baseline = first.y + SDF_BUFFER * k * s;
            expect(baseline).toBeCloseTo(place.top + row * place.pitch + place.baseline, 3);
            // The line starts half its measured width left of the anchor.
            expect(pen).toBeCloseTo(place.x - (layout.widths[row] * s) / 2, 3);
            at += line.replace(/ /g, "").length * GLYPH_FLOATS;
          });
        });
      }
    }
  });

  it("counts a glyph per character that can draw one, and one for the ellipsis", () => {
    expect(glyphCapacity("")).toBe(1);
    expect(glyphCapacity("ab cd")).toBe(5);
    // Whitespace a line never draws a glyph for; other characters, a no-break space and a vertical tab among them,
    // can draw one (an unwrapped line keeps them).
    expect(glyphCapacity(" a\tb\nc\fd\re ")).toBe(6);
    expect(glyphCapacity("a\u00a0b\vc")).toBe(6);
    // A surrogate pair takes two: the layout can split it into two lone halves.
    expect(glyphCapacity("😀 😀")).toBe(5);
  });

  it("keeps a camera-aware text's glyph count whatever its lines, the hidden ones out of every scale range", () => {
    const primitive = text({
      text: "Load the daily partitions",
      cameraAware: { maxWorld: 40 },
      lineHeight: 14,
      width: 120,
      height: 60,
    });
    const counts = [1, 0.5, 0.3, 0.2].map((camera) => {
      const places: TTextGlyphPlaces = { counts: [], firsts: [], translucent: [] };
      const { opaque, subs } = encodeText([primitive], 4, () => 2, atlas(), input(camera), 3, undefined, places);
      const lines = layoutText(primitive, resolveTextSize(primitive, camera), metrics).lines;
      const drawn = lines.join("").replace(/ /g, "").length;
      for (let at = drawn * GLYPH_FLOATS; at < opaque.length; at += GLYPH_FLOATS) {
        expect(Array.from(opaque.slice(at, at + GLYPH_FLOATS))).toEqual(hiddenGlyph(4, 2));
      }
      expect(Array.from(subs.opaque)).toEqual(new Array(opaque.length / GLYPH_FLOATS).fill(3));
      return { lines: lines.length, drawn, count: places.counts[0], floats: opaque.length };
    });
    // Other lines at each scale, one count.
    expect(new Set(counts.map((at) => at.lines)).size).toBeGreaterThan(1);
    expect(new Set(counts.map((at) => at.drawn)).size).toBeGreaterThan(1);
    for (const { count, floats } of counts) {
      expect(count).toBe(glyphCapacity(primitive.text));
      expect(floats).toBe(count * GLYPH_FLOATS);
    }
    // A world text keeps the glyphs of its lines.
    const world = text({ text: "Load the daily partitions", lineHeight: 14, width: 120, height: 60 });
    const places: TTextGlyphPlaces = { counts: [], firsts: [], translucent: [] };
    encodeText([world], 0, () => 2, atlas(), input(), 0, undefined, places);
    expect(places.counts).toEqual(["Loadthedailypartitions".length]);
  });

  it("rewrites a text's glyphs in place with the floats a full encode at the new lines writes", () => {
    const shared = atlas();
    const primitive = text({ text: "Load the daily partitions", cameraAware: true, width: 120, height: 60 });
    // A copy: the opaque glyphs are a view that the next encode overwrites.
    const at = (camera: number): Float32Array =>
      encodeText([primitive], 6, () => 2, shared, input(camera)).opaque.slice();
    const before = at(1);
    const after = at(0.25);
    expect(Array.from(after)).not.toEqual(Array.from(before));
    // The floats of scale 1, then the text's glyphs rewritten for scale 0.25 in place, between two other floats.
    const out = new Float32Array(before.length + 2);
    out.set(before, 1);
    const layout = layoutText(primitive, resolveTextSize(primitive, 0.25), metrics);
    const run = glyphRun(primitive, layout, shared, metrics);
    const count = textGlyphCount(primitive, run);
    writeTextGlyphs(out, 1, count, primitive, layout, run, {
      elementIndex: 6,
      slot: 2,
      policy: DEFAULT_TEXT_POLICY,
      atlas: shared,
    });
    expect(Array.from(out.subarray(1, 1 + after.length))).toEqual(Array.from(after));
    expect([out[0], out[out.length - 1]]).toEqual([0, 0]);
    // A run that places more glyphs than the text keeps is refused.
    expect(() =>
      writeTextGlyphs(out, 1, 2, primitive, layout, run, {
        elementIndex: 6,
        slot: 2,
        policy: DEFAULT_TEXT_POLICY,
        atlas: shared,
      })
    ).toThrow(RangeError);
  });

  it("packs every glyph a camera-aware text may show, and the ellipsis, once per text and font", () => {
    const shared = atlas();
    const glyph = jest.spyOn(shared, "glyph");
    // At 0.1 the 120-world-unit text keeps no line in its box: no glyph is placed, but all of them are packed.
    const aware = text({ text: "ab cd", cameraAware: true, lineHeight: 12, width: 40, height: 20 });
    encodeText([aware], 0, () => 2, shared, input(0.1));
    const packed = new Set(glyph.mock.calls.map(([char]) => char));
    expect(packed).toEqual(new Set(["a", "b", "c", "d", "…"]));
    // Again, the same text or a copy: lookups only, nothing new packed.
    shared.takeDirty();
    encodeText([aware], 0, () => 2, shared, input(0.1));
    encodeText([{ ...aware }], 0, () => 2, shared, input(0.1));
    expect(shared.takeDirty()).toBe(false);
    // A camera-aware text whose lines place every character packs only the ellipsis more; one cut by "…" packs all.
    glyph.mockClear();
    encodeText(
      [text({ text: "ef gh", cameraAware: true, lineHeight: 12, width: 100, height: 40 })],
      0,
      () => 2,
      shared,
      input()
    );
    expect(new Set(glyph.mock.calls.map(([char]) => char))).toEqual(new Set(["e", "f", "g", "h", "…"]));
    glyph.mockClear();
    const cut = text({ text: "ijklmnop", cameraAware: true, wrap: false, overflow: "ellipsis", width: 30, height: 40 });
    encodeText([cut], 0, () => 2, shared, input());
    expect(new Set(glyph.mock.calls.map(([char]) => char))).toEqual(new Set([..."ijklmnop", "…"]));
    // A world text packs only the glyphs it draws.
    glyph.mockClear();
    encodeText([text({ text: "xy zw", lineHeight: 12, width: 100, height: 4 })], 0, () => 2, shared, input());
    expect(glyph).not.toHaveBeenCalled();
  });

  it("keeps no strings: thousands of distinct camera-aware labels leave the atlas only their glyphs", () => {
    const shared = atlas();
    const letters = "abcdefghijklmnop";
    // 3,000 distinct 20-character labels of 16 letters, none placed (no line fits at 0.1): every one is prefilled.
    for (let i = 0; i < 3000; i++) {
      let label = "";
      for (let n = i + 4096; label.length < 20; n = Math.floor(n / 16) || i + 4096) label += letters[n % 16];
      encodeText(
        [text({ text: label, cameraAware: true, lineHeight: 12, width: 40, height: 20 })],
        0,
        () => 2,
        shared,
        input(0.1)
      );
    }
    // The 16 letters and the ellipsis.
    expect(shared.glyphAt(16)).toBeDefined();
    expect(shared.glyphAt(17)).toBeUndefined();
    // Every collection the atlas owns holds glyphs or fonts, no text.
    let entries = 0;
    const count = (value: unknown, depth: number): void => {
      if (!(value instanceof Map || value instanceof Set || Array.isArray(value)) || depth > 2) return;
      for (const entry of value instanceof Map ? value.values() : value) {
        entries++;
        count(entry, depth + 1);
      }
    };
    for (const value of Object.values(shared)) count(value, 0);
    expect(entries).toBeLessThanOrEqual(3 * 17 + 2);
  });

  it("keeps a camera-aware text with surrogate pairs in place, whole or split as it zooms (Codex's cases)", () => {
    // 60 units per UTF-16 code unit and 30 per space at TEXT_METRICS_PX: at size 10 "😀😀" fits a 25-wide box whole
    // (two glyphs), at size 30 each line holds one code unit (four lone halves, each wider than a space).
    const units: ISceneTextMetrics = {
      generation: 0,
      width: (value) =>
        Array.from({ length: value.length }, (_, i) => (value[i] === " " ? 30 : 60)).reduce((a, b) => a + b, 0),
      top: () => 80,
    };
    const unitInput = (camera: number): TTextEncodeInput => ({
      policy: DEFAULT_TEXT_POLICY,
      metrics: units,
      layoutOf: (primitive) => layoutText(primitive, resolveTextSize(primitive, camera), units),
    });
    const emoji = text({ text: "😀😀", size: 10, cameraAware: { maxWorld: 30 }, lineHeight: 10, width: 25 });
    expect(layoutText(emoji, resolveTextSize(emoji, 1), units).lines).toEqual(["😀😀"]);
    expect(layoutText(emoji, resolveTextSize(emoji, 1 / 3), units).lines).toEqual([
      "\ud83d",
      "\ude00",
      "\ud83d",
      "\ude00",
    ]);
    // From size 10 to 30 (two whole pairs, then four halves), and from 30 to 10, where the first lines place every
    // unit.
    for (const [from, to] of [
      [1, 1 / 3],
      [1 / 3, 1],
    ]) {
      const shared = atlas();
      const places: TTextGlyphPlaces = { counts: [], translucent: [] };
      encodeText([emoji], 3, () => 2, shared, unitInput(from), 0, undefined, places);
      expect(places.counts).toEqual([5]);
      shared.takeDirty();
      const layout = layoutText(emoji, resolveTextSize(emoji, to), units);
      const run = glyphRun(emoji, layout, shared, units);
      // At most five glyphs in five slots: rewritten in place, no fallback; the first encode packed both halves and
      // both pairs, so the atlas is unchanged.
      expect(textGlyphCount(emoji, run)).toBe(5);
      expect(shared.takeDirty()).toBe(false);
      const fresh = encodeText([emoji], 3, () => 2, shared, unitInput(to)).opaque;
      const inPlace = new Float32Array(fresh.length);
      writeTextGlyphs(inPlace, 0, 5, emoji, layout, run, {
        elementIndex: 3,
        slot: 2,
        policy: DEFAULT_TEXT_POLICY,
        atlas: shared,
      });
      expect(Array.from(inPlace)).toEqual(Array.from(fresh));
      expect(shared.takeDirty()).toBe(false);
    }
  });

  it("rewrites only the slots that change: up to the larger of the old and the new placed glyphs", () => {
    const shared = atlas();
    const primitive = text({ text: "Load the daily partitions", cameraAware: true, width: 120, height: 60 });
    // A copy: the opaque glyphs are a view that the next encode overwrites.
    const at = (camera: number): Float32Array =>
      encodeText([primitive], 6, () => 2, shared, input(camera)).opaque.slice();
    const before = at(1);
    const after = at(0.25);
    const wide = layoutText(primitive, resolveTextSize(primitive, 0.25), metrics);
    const run = glyphRun(primitive, wide, shared, metrics);
    const placed = run.glyphs.length / 3;
    const count = glyphCapacity(primitive.text);
    const target = { elementIndex: 6, slot: 2, policy: DEFAULT_TEXT_POLICY, atlas: shared };
    // Scale 1 places more glyphs than 0.25: the slots up to scale 1's placed count are written, the rest stay.
    const old = layoutText(primitive, resolveTextSize(primitive, 1), metrics);
    const oldPlaced = glyphRun(primitive, old, shared, metrics).glyphs.length / 3;
    expect(oldPlaced).toBeGreaterThan(placed);
    const out = Float32Array.from(before);
    out.fill(NaN, oldPlaced * GLYPH_FLOATS);
    writeTextGlyphs(out, 0, oldPlaced, primitive, wide, run, target);
    expect(Array.from(out.subarray(0, oldPlaced * GLYPH_FLOATS))).toEqual(
      Array.from(after.subarray(0, oldPlaced * GLYPH_FLOATS))
    );
    // Not written: still NaN, where the buffer keeps the hidden glyphs both encodes hold.
    expect(Number.isNaN(out[oldPlaced * GLYPH_FLOATS])).toBe(true);
    expect(Array.from(before.subarray(oldPlaced * GLYPH_FLOATS))).toEqual(
      Array.from(after.subarray(oldPlaced * GLYPH_FLOATS))
    );
    expect(count).toBeGreaterThan(oldPlaced);
  });

  it("encodes an unset colour as the base paint, in the opaque pass", () => {
    const { opaque, translucent } = encodeText(
      [text({ color: undefined, part: "title" })],
      0,
      () => 1,
      atlas(),
      input()
    );
    expect(translucent).toHaveLength(0);
    expect(opaque).toHaveLength(GLYPH_FLOATS);
    expect(Array.from(opaque.slice(12, 16))).toEqual([0, 0, 0, USE_BASE_ALPHA]);
  });

  it("places a text's glyphs once and encodes them again at its new place", () => {
    const shared = atlas();
    const glyph = jest.spyOn(shared, "glyph");
    const title = (x: number): TText => text({ text: "ab cd", x, y: 2, align: "center" });
    // A copy: the opaque glyphs are a view that the next encode overwrites.
    const first = encodeText([title(0)], 0, () => 1, shared, input()).opaque.slice();
    // Each glyph's quad and texture rect are layoutGlyphs'.
    const placements = layoutGlyphs(title(0), ["ab cd"], shared, metrics).glyphs;
    expect(first).toHaveLength(placements.length * GLYPH_FLOATS);
    placements.forEach((p, index) => {
      expect(Array.from(first.slice(index * GLYPH_FLOATS + 4, index * GLYPH_FLOATS + 12))).toEqual(
        Array.from(new Float32Array([p.x, p.y, p.w, p.h, p.u0, p.v0, p.u1, p.v1]))
      );
    });
    const calls = glyph.mock.calls.length;
    const moved = encodeText([title(30)], 0, () => 1, shared, input()).opaque;
    expect(glyph.mock.calls.length).toBe(calls);
    expect(moved).toHaveLength(first.length);
    for (let at = 0; at < first.length; at += GLYPH_FLOATS) {
      // The same quads, paint and (no) clip; the anchor moves with the text.
      expect(moved[at + 20] - first[at + 20]).toBe(30);
      for (let float = 0; float < GLYPH_FLOATS; float++) {
        if (float === 20) continue;
        expect(moved[at + float]).toBe(first[at + float]);
      }
    }
  });
});

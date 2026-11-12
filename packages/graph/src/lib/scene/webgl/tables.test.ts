// packages/graph/src/lib/scene/webgl/tables.test.ts
import { DIM_TEXEL, ElementTable, HIDDEN_ALPHA, PART_SLOTS, STYLE_ROW_TEXELS, StyleTable, TABLE_WIDTH } from "./tables";

describe("ElementTable", () => {
  it("writes one texel per element and reports dirty rows", () => {
    const table = new ElementTable();
    table.write("a", 10, 20, 7, false, 2);
    const i = table.indexOf("a");
    expect([...table.data.subarray(i * 4, i * 4 + 4)]).toEqual([10, 20, 7, 2]);
    expect(table.takeDirtyRows()).toEqual([0, 1]);
    expect(table.takeDirtyRows()).toBeNull();
  });

  it("marks hidden elements with key -1 and reuses freed slots", () => {
    const table = new ElementTable();
    table.write("a", 0, 0, 3, true, 0);
    expect(table.data[table.indexOf("a") * 4 + 2]).toBe(-1);
    const slot = table.indexOf("a");
    table.free("a");
    expect(table.indexOf("b")).toBe(slot);
  });

  it("grows by whole rows", () => {
    const table = new ElementTable();
    for (let i = 0; i <= TABLE_WIDTH; i++) table.write(`e${i}`, 0, 0, 0, false, 0);
    expect(table.rows).toBe(2);
  });
});

describe("StyleTable", () => {
  it("writes colour overrides per part slot", () => {
    const table = new StyleTable();
    const border = table.slotOf("border");
    table.setStyles([{}, { parts: { border: { color: "#ff0000" } } }, { parts: { title: { visible: false } } }]);
    const texel = (row: number, slot: number): number[] => [
      ...table.data.subarray((row * STYLE_ROW_TEXELS + slot) * 4, (row * STYLE_ROW_TEXELS + slot) * 4 + 4),
    ];
    expect(texel(0, border)).toEqual([0, 0, 0, -1]);
    expect(texel(1, border)).toEqual([1, 0, 0, 1]);
    expect(texel(2, table.slotOf("title"))[3]).toBe(-2);
    expect(table.takeDirty()).toBe(true);
  });

  it("keeps slot 0 for primitives without a part", () => {
    expect(new StyleTable().slotOf(undefined)).toBe(0);
  });

  it("writes base colours after the override texels of a row", () => {
    const table = new StyleTable();
    const slot = table.slotOf("body");
    table.setStyles([{}, { base: { body: { color: "#ff0000" } }, parts: { body: { color: "#0000ff" } } }]);
    const row = 1;
    const override = (row * STYLE_ROW_TEXELS + slot) * 4;
    const base = (row * STYLE_ROW_TEXELS + PART_SLOTS + slot) * 4;
    expect(Array.from(table.data.slice(override, override + 4))).toEqual([0, 0, 1, 1]);
    expect(Array.from(table.data.slice(base, base + 4))).toEqual([1, 0, 0, 1]);
  });

  it("leaves translucent colours out of the table: the encoder bakes them", () => {
    const table = new StyleTable();
    const slot = table.slotOf("border");
    table.setStyles([{}, { parts: { border: { color: "rgba(255, 0, 0, 0.5)" } } }]);
    const row = 1;
    const at = (row * STYLE_ROW_TEXELS + slot) * 4;
    expect(table.data[at + 3]).toBe(-1);
  });

  it("hides a part by base visible: false unless the override shows it", () => {
    const table = new StyleTable();
    const slot = table.slotOf("title");
    table.setStyles([
      {},
      { base: { title: { visible: false } } },
      { base: { title: { visible: false } }, parts: { title: { visible: true } } },
      { base: { title: { visible: false, color: "#ff0000" } }, parts: { title: { color: "#0000ff" } } },
      { base: { title: { visible: true } }, parts: { title: { visible: false } } },
    ]);
    const alpha = (row: number): number => table.data[(row * STYLE_ROW_TEXELS + slot) * 4 + 3];
    expect(alpha(1)).toBe(HIDDEN_ALPHA);
    expect(alpha(2)).toBe(-1);
    expect(alpha(3)).toBe(HIDDEN_ALPHA);
    expect(alpha(4)).toBe(HIDDEN_ALPHA);
    const base = (3 * STYLE_ROW_TEXELS + PART_SLOTS + slot) * 4;
    expect(Array.from(table.data.slice(base, base + 4))).toEqual([1, 0, 0, 1]);
  });

  it("leaves a translucent base colour out of the table and keeps visible: false in the override texel", () => {
    const table = new StyleTable();
    const slot = table.slotOf("body");
    table.setStyles([
      {},
      { base: { body: { color: "#ff000080" } }, parts: { body: { color: "#00ff0080", visible: false } } },
    ]);
    const override = (STYLE_ROW_TEXELS + slot) * 4;
    const base = (STYLE_ROW_TEXELS + PART_SLOTS + slot) * 4;
    expect(table.data[base + 3]).toBe(-1);
    expect(table.data[override + 3]).toBe(-2);
  });

  it("leaves the override colour of a faded part out of the table: the encoder bakes it, faded", () => {
    const table = new StyleTable();
    const body = table.slotOf("body");
    const border = table.slotOf("border");
    table.setStyles([
      {},
      { opacity: 0.5, parts: { body: { color: "#ff0000" }, border: { color: "#00ff00", visible: false } } },
      { parts: { body: { color: "#ff0000", opacity: 0.5 }, border: { color: "#00ff00", opacity: 1 } } },
      { opacity: 1, parts: { body: { color: "#ff0000" } } },
    ]);
    const override = (row: number, slot: number): number[] => {
      const at = (row * STYLE_ROW_TEXELS + slot) * 4;
      return Array.from(table.data.slice(at, at + 4));
    };
    // The element's opacity fades every part: no colour, but visible: false still hides.
    expect(override(1, body)[3]).toBe(-1);
    expect(override(1, border)[3]).toBe(HIDDEN_ALPHA);
    // A part's own opacity fades only that part.
    expect(override(2, body)[3]).toBe(-1);
    expect(override(2, border)).toEqual([0, 1, 0, 1]);
    // Opacity 1 changes nothing.
    expect(override(3, body)).toEqual([1, 0, 0, 1]);
  });

  it("writes the effective dim of every part slot after the base texels; slot 0 holds the element dim", () => {
    expect(STYLE_ROW_TEXELS).toBe(3 * PART_SLOTS);
    expect(DIM_TEXEL).toBe(2 * PART_SLOTS);
    const table = new StyleTable();
    const body = table.slotOf("body");
    const border = table.slotOf("border");
    table.setStyles([
      {},
      { dim: 0.4, parts: { border: { dim: 0.1 } } },
      { dim: 0.4, base: { body: { dim: 0.2 } }, parts: { body: { dim: 0.7 } } },
      { base: { body: { dim: 3 } }, parts: { border: { color: "#ff0000" } } },
    ]);
    const dim = (row: number, slot: number): number[] => {
      const at = (row * STYLE_ROW_TEXELS + DIM_TEXEL + slot) * 4;
      return Array.from(table.data.slice(at, at + 4));
    };
    // No dim: zero in every slot.
    for (let slot = 0; slot < PART_SLOTS; slot++) expect(dim(0, slot)).toEqual([0, 0, 0, 0]);
    // The element dim on slot 0, on a part the row does not name and on a slot registered later; the part's own dim.
    expect(dim(1, 0)[0]).toBeCloseTo(0.4);
    expect(dim(1, body)[0]).toBeCloseTo(0.4);
    expect(dim(1, border)[0]).toBeCloseTo(0.1);
    expect(dim(1, PART_SLOTS - 1)[0]).toBeCloseTo(0.4);
    // The override's dim wins over the base's.
    expect(dim(2, body)[0]).toBeCloseTo(0.7);
    expect(dim(2, 0)[0]).toBeCloseTo(0.4);
    // Clamped to [0, 1]; a part without a dim of its own and no element dim has none.
    expect(dim(3, body)[0]).toBe(1);
    expect(dim(3, border)[0]).toBe(0);
    expect(dim(3, 0)[0]).toBe(0);
  });
});

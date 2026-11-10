// packages/graph/src/lib/scene/webgl/tables.test.ts
import { ElementTable, StyleTable, TABLE_WIDTH } from "./tables";

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
    table.setStyles([{}, { border: { color: "#ff0000" } }, { title: { visible: false } }]);
    const texel = (row: number, slot: number): number[] => [
      ...table.data.subarray((row * 8 + slot) * 4, (row * 8 + slot) * 4 + 4),
    ];
    expect(texel(0, border)).toEqual([0, 0, 0, -1]);
    expect(texel(1, border)).toEqual([1, 0, 0, 1]);
    expect(texel(2, table.slotOf("title"))[3]).toBe(-2);
    expect(table.takeDirty()).toBe(true);
  });

  it("keeps slot 0 for primitives without a part", () => {
    expect(new StyleTable().slotOf(undefined)).toBe(0);
  });
});

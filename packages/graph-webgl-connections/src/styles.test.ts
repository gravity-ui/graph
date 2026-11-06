import { MAX_STYLES, StyleTable, parseColor } from "./styles";

describe("parseColor", () => {
  it("parses hex colors", () => {
    expect(parseColor("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(parseColor("#0f08")).toEqual([0, 1, 0, 0x88 / 255]);
    expect(parseColor("#272727")?.[0]).toBeCloseTo(0x27 / 255);
  });

  it("parses rgb and rgba colors", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual([1, 0, 0, 1]);
    expect(parseColor("rgba(0, 0, 255, 0.5)")).toEqual([0, 0, 1, 0.5]);
    expect(parseColor("rgb(0 255 0 / 50%)")).toEqual([0, 1, 0, 0.5]);
  });

  it("returns undefined for formats it does not know", () => {
    expect(parseColor("tomato")).toBeUndefined();
  });
});

describe("StyleTable", () => {
  it("interns equal styles into one slot", () => {
    const table = new StyleTable();
    const a = table.intern({ color: "#ff0000", width: 2, arrow: true });
    const b = table.intern({ color: "#ff0000", width: 2, arrow: true });
    const c = table.intern({ color: "#ff0000", width: 4, dash: [6, 4] });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(table.size).toBe(2);
    expect(table.hasArrow(a)).toBe(true);
    expect(Array.from(table.params.subarray(c * 4, c * 4 + 4))).toEqual([4, 6, 4, 0]);
    expect(Array.from(table.colors.subarray(a * 4, a * 4 + 4))).toEqual([1, 0, 0, 1]);
  });

  it("falls back to the first slot when the table is full", () => {
    const table = new StyleTable();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < MAX_STYLES; i++) table.intern({ color: "#000000", width: i + 1 });
    expect(table.intern({ color: "#000000", width: 1000 })).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

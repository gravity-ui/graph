let text: typeof import("./text");

beforeEach(async () => {
  jest.resetModules();
  text = await import("./text");
});

afterEach(() => jest.restoreAllMocks());

test("measureText reports an unavailable context and can retry after recovery", () => {
  const { measureText } = text;
  const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext");
  getContext.mockReturnValueOnce(null);
  expect(() => measureText("unavailable", "12px sans-serif")).toThrow(
    "Cannot measure text: a 2D Canvas context is unavailable"
  );
  const measured = measureText("recovered", "12px sans-serif");
  expect(Number.isFinite(measured)).toBe(true);
  expect(measured).toBeGreaterThan(0);
});

test("measureText caches a numeric width and fresh measurement bypasses the cache", () => {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("Test requires a Canvas context");
  const { measureText } = text;
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  const measure = jest.spyOn(context, "measureText");
  const cached = measureText("cache-contract", "14px sans-serif");
  expect(measureText("cache-contract", "14px sans-serif")).toBe(cached);
  expect(measure).toHaveBeenCalledTimes(1);
  expect(measureText("cache-contract", "14px sans-serif", false)).toBe(cached);
  expect(measure).toHaveBeenCalledTimes(2);
});

test("multiline measurement keeps wrapping, empty text and size scaling behavior", () => {
  const { getFontSize, measureMultilineText } = text;
  expect(getFontSize(24, 2)).toBe(12);
  expect(measureMultilineText("", "12px sans-serif", { lineHeight: 12 })).toEqual({
    width: 0,
    height: 3,
    lineHeight: 12,
    linesWords: [],
    linesWidths: [],
  });
  const result = measureMultilineText("one two three", "12px sans-serif", {
    lineHeight: 12,
    wordWrap: true,
    maxWidth: 8,
  });
  expect(result.linesWords).toEqual(["one", "two", "three"]);
  expect(result.width).toBe(Math.max(...result.linesWidths));
  expect(result.height).toBe(39);
});

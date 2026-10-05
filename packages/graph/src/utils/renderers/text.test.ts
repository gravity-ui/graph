import { layoutText } from "./text";

test("omitted font uses the canvas font for measurement and layout", () => {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("Test requires a Canvas context");
  context.font = "24px sans-serif";
  const result = layoutText("font fallback", context, { x: 0, y: 0, width: 100 }, {});
  expect(result.measures.lineHeight).toBe(24);
  expect(result.lineHeight).toBe(24);
});

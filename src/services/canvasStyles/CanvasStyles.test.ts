import { CanvasStyles } from "./CanvasStyles";

describe("CanvasStyles", () => {
  it("matches selector subsets by class names", () => {
    const styles = new CanvasStyles();

    styles.register({
      selector: ".block",
      style: { fill: { color: "red" } },
    });
    styles.register({
      selector: ".block.highlighted",
      style: { stroke: { color: "orange" } },
    });

    const result = styles.resolve(["highlighted", "block"]);
    expect(result.fill?.color).toBe("red");
    expect(result.stroke?.color).toBe("orange");
  });

  it("supports grouped API by style purpose", () => {
    const styles = new CanvasStyles();

    styles.register({
      selector: ".block",
      style: {
        fill: { color: "red" },
        stroke: { color: "blue", width: "3px", dash: "dashed" },
        text: { color: "purple", family: "YS Text", size: "14px", weight: 500 },
        composite: { opacity: 0.8 },
      },
    });

    const result = styles.resolve(["block"]);
    expect(result.fill?.color).toBe("red");
    expect(result.stroke?.color).toBe("blue");
    expect(result.stroke?.width).toBe(3);
    expect(result.stroke?.dash).toEqual([6, 4]);
    expect(result.text?.color).toBe("purple");
    expect(result.text?.family).toBe("YS Text");
    expect(result.text?.size).toBe(14);
    expect(result.composite?.opacity).toBe(0.8);
  });

  it("supports stroke scaleWithCamera flag", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: { width: 2, scaleWithCamera: true },
      },
    });
    styles.register({
      selector: ".block.selected",
      style: {
        stroke: { scaleWithCamera: false },
      },
    });

    const base = styles.resolve(["block"]);
    expect(base.stroke?.scaleWithCamera).toBe(true);

    const selected = styles.resolve(["block", "selected"]);
    expect(selected.stroke?.scaleWithCamera).toBe(false);
  });

  it("supports stroke maxWidth", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: { width: 2, maxWidth: "9px" },
      },
    });
    styles.register({
      selector: ".block.selected",
      style: {
        stroke: { maxWidth: 7 },
      },
    });

    const base = styles.resolve(["block"]);
    expect(base.stroke?.maxWidth).toBe(9);

    const selected = styles.resolve(["block", "selected"]);
    expect(selected.stroke?.maxWidth).toBe(7);
  });

  it("supports text scaleWithCamera flag", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        text: { size: 14, scaleWithCamera: true },
      },
    });
    styles.register({
      selector: ".block.selected",
      style: {
        text: { scaleWithCamera: false },
      },
    });

    const base = styles.resolve(["block"]);
    expect(base.text?.scaleWithCamera).toBe(true);

    const selected = styles.resolve(["block", "selected"]);
    expect(selected.text?.scaleWithCamera).toBe(false);
  });

  it("adapts stroke width and text size with scale adapter on resolve", () => {
    const styles = new CanvasStyles();
    styles.register({
      selector: ".block",
      style: {
        stroke: { width: 3, maxWidth: 8, scaleWithCamera: false },
        text: { size: 12, scaleWithCamera: false },
      },
    });
    styles.register({
      selector: ".block.selected",
      style: {
        stroke: { width: 4, scaleWithCamera: true },
        text: { size: 10, scaleWithCamera: true },
      },
    });

    const scaleAdapter = {
      getCameraScale: () => 2,
      limitScaleEffect: (value: number, max?: number) => Math.min(value * 3, max ?? Number.POSITIVE_INFINITY),
    };

    const base = styles.resolve(["block"], { scaleAdapter });
    expect(base.stroke?.width).toBe(8);
    expect(base.text?.size).toBe(6);

    const selected = styles.resolve(["block", "selected"], { scaleAdapter });
    expect(selected.stroke?.width).toBe(4);
    expect(selected.text?.size).toBe(10);
  });

  it("uses selector specificity over registration order", () => {
    const styles = new CanvasStyles();

    styles.register({
      selector: ".block.highlighted",
      style: { composite: { opacity: 1 } },
    });
    styles.register({
      selector: ".highlighted",
      style: { composite: { opacity: 0.6 } },
    });

    const result = styles.resolve(["block", "highlighted"]);
    expect(result.composite?.opacity).toBe(1);
  });

  it("supports simple selectors", () => {
    const styles = new CanvasStyles();

    styles.register({
      selector: ".dimmed",
      style: { composite: { opacity: 0.4 } },
    });

    const result = styles.resolve(["dimmed"]);
    expect(result.composite?.opacity).toBe(0.4);
  });

  it("drops unsupported style properties from runtime payload", () => {
    const styles = new CanvasStyles();

    styles.register({
      selector: ".block",
      style: {
        fill: { color: "red" },
        // Simulate remote JSON with unsupported fields
        ...({
          shadowBlur: 10,
          imageSmoothingEnabled: false,
        } as unknown as Record<string, unknown>),
      } as unknown as Parameters<CanvasStyles["register"]>[0]["style"],
    });

    const result = styles.resolve(["block"]);
    expect(result.fill?.color).toBe("red");
    expect("shadowBlur" in result).toBe(false);
    expect("imageSmoothingEnabled" in result).toBe(false);
  });
});

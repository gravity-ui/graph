import { SceneStore } from "./SceneStore";
import { elementBounds } from "./elementBounds";
import { layoutText, textBounds } from "./textLayout";
import { clearSceneTextMetrics, peekSceneTextLayout, sceneTextMetrics } from "./textMetrics";
import type { TScenePrimitive } from "./types";

describe("elementBounds", () => {
  it("is the origin without primitives", () => {
    expect(elementBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("joins strokes at their largest extent, text boxes and icons", () => {
    expect(
      elementBounds([
        {
          kind: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          border: { width: { px: 4, minWorld: 4, maxWorld: 40 }, align: "outside" },
        },
        { kind: "text", text: "t", family: "f", size: 12, lineHeight: 14, x: 10, y: 60, width: 30, height: 14 },
        { kind: "icon", path: {} as Path2D, viewBox: 16, x: 120, y: 0, size: 16 },
      ])
    ).toEqual({ minX: -40, minY: -40, maxX: 140, maxY: 90 });
  });

  it("is the box of a camera-aware text with a height, at any size: its lines never leave it", () => {
    // The 13 px name could grow to 104 world units; it is clipped to its 144 x 48 box.
    const name = {
      kind: "text" as const,
      text: "Name",
      family: "f",
      size: 13,
      cameraAware: { maxWorld: 104 },
      lineHeight: 16,
      x: 8,
      y: 0,
      width: 144,
      height: 48,
      align: "center" as const,
      verticalAlign: "middle" as const,
    };
    expect(elementBounds([{ kind: "rect", x: 0, y: 0, width: 160, height: 48, fill: "#000" }, name])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 160,
      maxY: 48,
    });
  });

  it("covers the lines of a heightless text at its largest size", () => {
    // jest-canvas-mock measures one unit per character at TEXT_METRICS_PX (100 px): at 40 world units "t" is 1.4 wide
    // and fits the 30-wide box, so the text has one line of 56 (14 x 40 / 10) at its largest size, plus 20 around.
    const text = { kind: "text" as const, text: "t", family: "f", lineHeight: 14, x: 0, y: 0, width: 30 };
    expect(elementBounds([{ ...text, size: 10, cameraAware: { maxWorld: 40 } }])).toEqual({
      minX: 0,
      minY: -20,
      maxX: 30,
      maxY: 76,
    });
    // A world text: one line of 14 at size 10, 5 around.
    expect(elementBounds([{ ...text, size: 10 }])).toEqual({ minX: 0, minY: -5, maxX: 30, maxY: 19 });
  });

  it("covers a heightless text that declares cameraAware in both modes: the setting or a style can turn it off", () => {
    // Camera-aware it is at most 5 world units; turned off it is its size, 10: the bounds take the larger.
    const text = { kind: "text" as const, text: "t", family: "f", lineHeight: 14, x: 0, y: 0, width: 30 };
    expect(elementBounds([{ ...text, size: 10, cameraAware: { maxWorld: 5 } }])).toEqual(
      elementBounds([{ ...text, size: 10 }])
    );
  });

  it("keeps an element found where its world text draws lines that v1's filter drops at its largest size", () => {
    // Codex's case: Arial-like widths ("i" 0.222 em, a space 0.278 em). Ten "i" in a 16-wide box draw five lines at
    // size 10 (the world mode, the setting off) through y = 50, and none at the camera-aware maximum of 40.
    const widths: Record<string, number> = { i: 0.222, " ": 0.278 };
    const measure = jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      value: string
    ): TextMetrics {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      return { width: [...value].reduce((sum, char) => sum + (widths[char] ?? 0.5) * px, 0) } as TextMetrics;
    });
    // jest-canvas-mock binds measureText into a context when it creates it: the shared metrics make a new one.
    Reflect.set(sceneTextMetrics, "context", undefined);
    clearSceneTextMetrics();
    try {
      const primitives: TScenePrimitive[] = [
        {
          kind: "text",
          text: "i i i i i i i i i i",
          family: "Arial",
          size: 10,
          lineHeight: 10,
          x: 0,
          y: 0,
          width: 16,
          cameraAware: { maxWorld: 40 },
        },
      ];
      const [text] = primitives as Extract<TScenePrimitive, { kind: "text" }>[];
      expect(layoutText(text, 40, sceneTextMetrics).lines).toEqual([]);
      expect(layoutText(text, 10, sceneTextMetrics).lines).toEqual(["i i", "i i", "i i", "i i", "i i"]);
      const bounds = elementBounds(primitives);
      expect(bounds.maxY).toBeGreaterThanOrEqual(50);
      const store = new SceneStore(100);
      store.add({ id: "e", zIndex: 1, x: 0, y: 0, bounds, primitives });
      expect(store.query({ minX: 0, minY: 35, maxX: 16, maxY: 36 }).map((element) => element.id)).toEqual(["e"]);
    } finally {
      measure.mockRestore();
      Reflect.set(sceneTextMetrics, "context", undefined);
      clearSceneTextMetrics();
    }
  });

  it("bounds a heightless world text by its laid-out lines and keeps that layout for the renderers", () => {
    const primitive: TScenePrimitive = {
      kind: "text",
      text: "Load the daily partitions of the warehouse",
      family: "sans-serif",
      size: 12,
      lineHeight: 16,
      x: 4,
      y: 6,
      width: 80,
    };
    const bounds = elementBounds([primitive]);
    const layout = peekSceneTextLayout(primitive, 12);
    expect(layout?.lines).toEqual(layoutText(primitive, 12, sceneTextMetrics).lines);
    expect(layout?.lines.length).toBeGreaterThan(0);
    expect(bounds).toEqual(textBounds(primitive, 12, sceneTextMetrics, layout?.lines.length));
    // Its laid-out lines lie inside: the bounding wrap gives as many lines here.
    expect(bounds).toEqual(textBounds(primitive, 12, sceneTextMetrics));
    // A text with a height (its bounds are its box) keeps nothing.
    const boxed = { ...primitive, height: 40 };
    elementBounds([boxed]);
    expect(peekSceneTextLayout(boxed, 12)).toBeUndefined();
  });

  it("stays finite for a zero line height", () => {
    const text = { kind: "text" as const, text: "t", family: "f", lineHeight: 0, x: 0, y: 0, width: 30 };
    const bounds = elementBounds([{ ...text, size: 10, cameraAware: { maxWorld: 40 } }]);
    expect(Object.values(bounds).every(Number.isFinite)).toBe(true);
  });
});

import { layoutText } from "../../text/textLayout";
import { sceneTextMetrics } from "../../text/textMetrics";
import type { TSceneElement, TScenePrimitive } from "../../types";
import { drawElements, isPrimitiveVisible } from "../drawPrimitives";
import { appendSegments } from "../drawShapes";

jest.mock("../../text/textLayout", () => {
  const actual: typeof import("../../text/textLayout") = jest.requireActual("../../text/textLayout");
  return { ...actual, layoutText: jest.fn(actual.layoutText) };
});

/** The inspection methods jest-canvas-mock adds to a context. */
type TMockContext = CanvasRenderingContext2D & {
  __getEvents(): { type: string; props: { value?: unknown } }[];
  __getDrawCalls(): { type: string }[];
};

function createContext(): TMockContext {
  return document.createElement("canvas").getContext("2d") as TMockContext;
}

function element(patch: Partial<TSceneElement>): TSceneElement {
  return {
    id: "element",
    childOrder: 0,
    zIndex: 0,
    order: 1,
    styleId: 0,
    x: 0,
    y: 0,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    primitives: [],
    hidden: false,
    ...patch,
  };
}

const SEGMENTS = new Float32Array([0, 0, 1, 0, 2, 0, 3, 0]);

function line(id: string): TSceneElement {
  return element({ id, primitives: [{ kind: "path", segments: SEGMENTS, stroke: { color: "#123", width: 2 } }] });
}

describe("scene primitives", () => {
  it("closes a solid contour once, including the join between the final and first segments", () => {
    const segments = new Float32Array([...SEGMENTS, 3, 0, 2, 0, 1, 0, 0, 0]);
    const path = new Path2D();
    appendSegments(path, segments, 1, 2);
    expect(path.closePath).not.toHaveBeenCalled();
    appendSegments(path, segments, 1, 2, true);
    expect(path.closePath).toHaveBeenCalledTimes(1);
  });

  it("omits WebGL sprites from interpreted draws and exports", () => {
    const ctx = createContext();
    const sprite = { kind: "sprite" as const, x: 10, y: 15, width: 24, height: 32, image: new Image() };
    expect(drawElements(ctx, [element({ primitives: [sprite] })], 1)).toBe(0);
    expect(ctx.__getDrawCalls()).toHaveLength(0);
  });

  it("shows a primitive only inside its scale range", () => {
    const circle = { kind: "circle" as const, cx: 0, cy: 0, r: 1, minScale: 0.2, maxScale: 0.7 };
    expect(isPrimitiveVisible(circle, 0.2)).toBe(true);
    expect(isPrimitiveVisible(circle, 0.69)).toBe(true);
    expect(isPrimitiveVisible(circle, 0.7)).toBe(false);
    expect(isPrimitiveVisible(circle, 0.1)).toBe(false);
  });

  it("recolours the part a style names", () => {
    const ctx = createContext();
    const rect = {
      kind: "rect" as const,
      part: "border",
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      border: { color: "#000", width: 2 },
    };
    drawElements(ctx, [element({ styleId: 1, primitives: [rect] })], 1, {
      styles: [{}, { parts: { border: { color: "#ffcc00" } } }],
    });
    const colors = ctx
      .__getEvents()
      .filter((event) => event.type === "strokeStyle")
      .map((event) => event.props.value);
    expect(colors).toEqual(["#ffcc00"]);
  });

  it("dims the paints of a styled element towards the dim colour", () => {
    const fills = (dimColor: string | undefined): unknown[] => {
      const ctx = createContext();
      const rect = { kind: "rect" as const, x: 0, y: 0, width: 4, height: 4, fill: "#000000" };
      drawElements(ctx, [element({ styleId: 1, primitives: [rect] })], 1, { styles: [{}, { dim: 0.5 }], dimColor });
      return ctx
        .__getEvents()
        .filter((event) => event.type === "fillStyle")
        .map((event) => event.props.value);
    };
    expect(fills("#ffffff")).toEqual(["#808080"]);
    expect(fills(undefined)).toEqual(["#000000"]);
  });

  it("fades every paint of a styled element by its opacity", () => {
    const ctx = createContext();
    const rect = {
      kind: "rect" as const,
      part: "body",
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      fill: "#000000",
      border: { color: "#ffffff", width: 1 },
    };
    drawElements(ctx, [element({ styleId: 1, primitives: [rect] })], 1, {
      styles: [{}, { opacity: 0.5, parts: { body: { opacity: 0.8 } } }],
    });
    const values = (type: string): unknown[] =>
      ctx
        .__getEvents()
        .filter((event) => event.type === type)
        .map((event) => event.props.value);
    expect(values("fillStyle")).toEqual(["rgba(0, 0, 0, 0.4)"]);
    expect(values("strokeStyle")).toEqual(["rgba(255, 255, 255, 0.4)"]);
  });

  it("composites every translucent path over the path below it", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const faded = (id: string): TSceneElement => ({ ...line(id), styleId: 1 });
    const styles = [{}, { opacity: 0.5 }];
    expect(drawElements(ctx, [line("a"), faded("b"), faded("c"), line("d")], 1, { styles })).toBe(4);
    expect(stroke).toHaveBeenCalledTimes(4);
    const colors = ctx
      .__getEvents()
      .filter((event) => event.type === "strokeStyle")
      .map((event) => event.props.value);
    expect(colors).toEqual(["#112233", "rgba(17, 34, 51, 0.5)", "rgba(17, 34, 51, 0.5)", "#112233"]);
  });

  it("skips a part a style hides and keeps the primitive without a style", () => {
    const ctx = createContext();
    const rect = { kind: "rect" as const, part: "glow", x: 0, y: 0, width: 4, height: 4, fill: "#f00" };
    const hidden = element({ styleId: 1, primitives: [rect] });
    expect(drawElements(ctx, [hidden], 1, { styles: [{}, { parts: { glow: { visible: false } } }] })).toBe(0);
    expect(ctx.__getDrawCalls().filter((call) => call.type === "fillRect")).toHaveLength(0);
    drawElements(ctx, [element({ primitives: [rect] })], 1, { styles: [{}, { parts: { glow: { visible: false } } }] });
    expect(ctx.__getDrawCalls().filter((call) => call.type === "fillRect")).toHaveLength(1);
  });

  it("hides a part by a base rule's visible: false unless the state layer shows it", () => {
    const ctx = createContext();
    const rect = { kind: "rect" as const, part: "title", x: 0, y: 0, width: 4, height: 4, fill: "#f00" };
    const styled = element({ styleId: 1, primitives: [rect] });
    expect(drawElements(ctx, [styled], 1, { styles: [{}, { base: { title: { visible: false } } }] })).toBe(0);
    const shown = { base: { title: { visible: false } }, parts: { title: { visible: true } } };
    expect(drawElements(ctx, [styled], 1, { styles: [{}, shown] })).toBe(1);
  });

  it("draws no stroke whose width is unset after styling, and takes the base width", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const border = jest.spyOn(ctx, "strokeRect");
    const rect = { kind: "rect" as const, part: "border", x: 0, y: 0, width: 4, height: 4, border: { color: "#000" } };
    const path = { kind: "path" as const, part: "line", segments: SEGMENTS, stroke: { color: "#123" } };
    drawElements(ctx, [element({ primitives: [rect, path] })], 1);
    expect(stroke).not.toHaveBeenCalled();
    expect(border).not.toHaveBeenCalled();
    drawElements(ctx, [element({ styleId: 1, primitives: [rect, path] })], 1, {
      styles: [{}, { base: { border: { width: 2 }, line: { width: 3 } } }],
    });
    expect(stroke).toHaveBeenCalledTimes(1);
    expect(border).toHaveBeenCalledTimes(1);
    const widths = ctx
      .__getEvents()
      .filter((event) => event.type === "lineWidth")
      .map((event) => event.props.value);
    expect(widths).toEqual([2, 3]);
  });

  it.each([0, -2, Infinity, NaN, { px: 4, maxWorld: 0 }])("skips a stroke with width %p", (width) => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const hidden = element({ primitives: [{ kind: "path", segments: SEGMENTS, stroke: { color: "#456", width } }] });
    drawElements(ctx, [line("visible"), hidden], 2);
    expect(stroke).toHaveBeenCalledTimes(1);
    expect(ctx.lineWidth).toBe(2);
  });

  it.each([
    { align: undefined, radii: [10] },
    { align: "inside" as const, radii: [10, 8] },
    { align: "outside" as const, radii: [10, 12] },
  ])("places a circle's $align border without moving its fill", ({ align, radii }) => {
    const ctx = createContext();
    const arc = jest.spyOn(ctx, "arc");
    const circle: TScenePrimitive = {
      kind: "circle",
      cx: 2,
      cy: 3,
      r: 10,
      fill: "#fff",
      border: { color: "#000", width: { px: 8 }, dash: [3, 2], align },
    };
    drawElements(ctx, [element({ x: 100, y: 50, primitives: [circle] })], 2);
    expect(arc.mock.calls).toEqual(radii.map((r) => [102, 53, r, 0, 2 * Math.PI]));
    expect(ctx.beginPath).toHaveBeenCalledTimes(radii.length);
    expect(ctx.__getDrawCalls().map(({ type }) => type)).toEqual(["fill", "stroke"]);
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.getLineDash()).toEqual([3, 2]);
  });

  it("saturates an oversized inside circle border at the face", () => {
    const ctx = createContext();
    const arc = jest.spyOn(ctx, "arc");
    const circle: TScenePrimitive = {
      kind: "circle",
      cx: 0,
      cy: 0,
      r: 5,
      fill: "#fff",
      border: { color: "#000", width: 20, dash: [3, 2], align: "inside" },
    };
    drawElements(ctx, [element({ primitives: [circle] })], 1);
    expect(arc).toHaveBeenLastCalledWith(0, 0, 2.5, 0, 2 * Math.PI);
    expect(ctx.__getDrawCalls().map(({ type }) => type)).toEqual(["fill", "stroke"]);
    expect(ctx.lineWidth).toBe(5);
    expect(ctx.getLineDash()).toEqual([3, 2]);
  });

  it("insets an inside border and outsets an outside one by half its width", () => {
    const ctx = createContext();
    const roundRect = jest.spyOn(Path2D.prototype, "roundRect");
    const rect = { kind: "rect" as const, x: 0, y: 0, width: 40, height: 20, radius: 8 };
    drawElements(
      ctx,
      [
        element({ x: 100, y: 50, primitives: [{ ...rect, border: { color: "#000", width: 4, align: "inside" } }] }),
        element({ x: 100, y: 50, primitives: [{ ...rect, border: { color: "#000", width: 4, align: "outside" } }] }),
      ],
      1
    );
    expect(roundRect).toHaveBeenNthCalledWith(1, 102, 52, 36, 16, 6);
    expect(roundRect).toHaveBeenNthCalledWith(2, 98, 48, 44, 24, 10);
    roundRect.mockRestore();
  });

  it("draws square bodies and their inset borders without roundRect", () => {
    const ctx = createContext();
    // A browser without CanvasRenderingContext2D.roundRect.
    Object.defineProperty(ctx, "roundRect", { value: undefined, configurable: true });
    const fill = jest.spyOn(ctx, "fillRect");
    const stroke = jest.spyOn(ctx, "strokeRect");
    const border = { color: "#000", width: 4, align: "inside" as const };
    const plain = { kind: "rect" as const, x: 0, y: 0, width: 40, height: 20, fill: "#fff", border };
    expect(() =>
      drawElements(
        ctx,
        [
          element({ x: 100, y: 50, primitives: [plain] }),
          element({ x: 100, y: 50, primitives: [{ ...plain, radius: 0 }] }),
          element({ x: 100, y: 50, primitives: [{ ...plain, radius: [0, 0, 0, 0] }] }),
        ],
        1
      )
    ).not.toThrow();
    expect(fill).toHaveBeenCalledTimes(3);
    expect(stroke).toHaveBeenCalledTimes(3);
    expect(fill).toHaveBeenCalledWith(100, 50, 40, 20);
    expect(stroke).toHaveBeenCalledWith(102, 52, 36, 16);
  });

  it.each([{ radius: 0 }, { radius: [0, 0, 0, 0] }])(
    "expands an explicit zero radius with an outside border ($radius)",
    ({ radius }) => {
      const ctx = createContext();
      const roundRect = jest.spyOn(Path2D.prototype, "roundRect");
      const rect = {
        kind: "rect" as const,
        x: 10,
        y: 20,
        width: 40,
        height: 20,
        radius,
        border: { color: "#123", width: 12, align: "outside" as const },
      };
      try {
        drawElements(ctx, [element({ primitives: [rect] })], 1);
        expect(roundRect).toHaveBeenCalledWith(4, 14, 52, 32, typeof radius === "number" ? 6 : [6, 6, 6, 6]);
      } finally {
        roundRect.mockRestore();
      }
    }
  );

  it("reuses rectangle geometry across paints and refreshes changed insets and origins", () => {
    const ctx = createContext();
    const fill = jest.spyOn(ctx, "fill");
    const stroke = jest.spyOn(ctx, "stroke");
    const rect = {
      kind: "rect" as const,
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      radius: 8,
      fill: "#fff",
      border: { color: "#000", width: { px: 4 }, align: "inside" as const },
    };
    const layer = element({ x: 100, y: 50, primitives: [rect] });
    drawElements(ctx, [layer], 1);
    drawElements(ctx, [layer], 1);
    drawElements(ctx, [layer], 2);
    drawElements(ctx, [{ ...layer, x: 120 }], 2);

    expect(fill.mock.calls[0][0]).toBeInstanceOf(Path2D);
    expect(stroke.mock.calls[0][0]).toBeInstanceOf(Path2D);
    expect(fill.mock.calls[1][0]).toBe(fill.mock.calls[0][0]);
    expect(stroke.mock.calls[1][0]).toBe(stroke.mock.calls[0][0]);
    expect(fill.mock.calls[2][0]).toBe(fill.mock.calls[0][0]);
    expect(stroke.mock.calls[2][0]).not.toBe(stroke.mock.calls[0][0]);
    expect(fill.mock.calls[3][0]).not.toBe(fill.mock.calls[0][0]);
    expect(stroke.mock.calls[3][0]).not.toBe(stroke.mock.calls[2][0]);
  });

  it("strokes consecutive paths of one stroke style with one call", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    expect(drawElements(ctx, [line("a"), line("b"), line("c")], 1)).toBe(3);
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it("ends a run after maxRun paths and polygons", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    expect(drawElements(ctx, [line("a"), line("b"), line("c")], 1, { maxRun: 2 })).toBe(3);
    expect(stroke).toHaveBeenCalledTimes(2);
  });

  it("treats maxRun Infinity as unbounded", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    drawElements(ctx, [line("a"), line("b"), line("c")], 1, { maxRun: Infinity });
    expect(stroke).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, NaN])("rejects maxRun %p, which is not a positive integer", (maxRun) => {
    const ctx = createContext();
    expect(() => drawElements(ctx, [line("a")], 1, { maxRun })).toThrow(RangeError);
  });

  it("flushes a path run before a later shape so the draw order holds", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const fill = jest.spyOn(ctx, "fillRect");
    const block = element({
      id: "block",
      primitives: [{ kind: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#fff" }],
    });
    drawElements(ctx, [line("a"), block, line("b")], 1);
    expect(stroke).toHaveBeenCalledTimes(2);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(stroke.mock.invocationCallOrder[0]).toBeLessThan(fill.mock.invocationCallOrder[0]);
    expect(fill.mock.invocationCallOrder[0]).toBeLessThan(stroke.mock.invocationCallOrder[1]);
  });

  it.each([true, false])(
    "fills only the painted polygon when its neighbour is unfilled (filled first: %s)",
    (filledFirst) => {
      const ctx = createContext();
      const fill = jest.spyOn(ctx, "fill");
      const stroke = jest.spyOn(ctx, "stroke");
      const outline = { color: "#123", width: 2 };
      const polygon = (x: number, color?: string): TScenePrimitive => ({
        kind: "polygon",
        points: new Float32Array([x, 0, x + 4, 2, x, 4]),
        stroke: outline,
        fill: color,
      });
      const filled = polygon(10, "#abc");
      const empty = polygon(40);
      drawElements(ctx, [element({ primitives: filledFirst ? [filled, empty] : [empty, filled] })], 1);
      expect(fill).toHaveBeenCalledTimes(1);
      const path = fill.mock.calls[0][0] as Path2D;
      expect(path.moveTo).toHaveBeenCalledTimes(1);
      expect(path.moveTo).toHaveBeenCalledWith(10, 0);
      expect(stroke).toHaveBeenCalledTimes(2);
      expect(stroke.mock.invocationCallOrder[0] < fill.mock.invocationCallOrder[0]).toBe(!filledFirst);
    }
  );

  it("paints each polygon separately so opposite windings cannot cancel or cover a later stroke", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const fill = jest.spyOn(ctx, "fill");
    const outline = { color: "#123", width: 2 };
    const polygon = (points: number[]): TScenePrimitive => ({
      kind: "polygon",
      points: new Float32Array(points),
      stroke: outline,
      fill: "#abc",
    });
    drawElements(ctx, [element({ primitives: [polygon([0, 0, 4, 2, 0, 4]), polygon([0, 4, 4, 2, 0, 0])] })], 1);
    expect(fill).toHaveBeenCalledTimes(2);
    expect(stroke).toHaveBeenCalledTimes(2);
    expect(fill.mock.invocationCallOrder[0]).toBeLessThan(stroke.mock.invocationCallOrder[0]);
    expect(stroke.mock.invocationCallOrder[0]).toBeLessThan(fill.mock.invocationCallOrder[1]);
    expect(fill.mock.invocationCallOrder[1]).toBeLessThan(stroke.mock.invocationCallOrder[1]);
  });

  it("reuses a series of opaque paths until its geometry, origin or style changes", () => {
    const ctx = createContext();
    const paths = Array.from({ length: 154 }, (_, i) => ({ ...line(String(i)), order: i }));
    const options = { styles: [{}, { opacity: 0.5 }] };
    const addPath = jest.spyOn(Path2D.prototype, "addPath");
    try {
      drawElements(ctx, paths, 1, options);
      const first = addPath.mock.calls.map(([path]) => path);
      expect(first).toHaveLength(2);
      addPath.mockClear();
      drawElements(ctx, paths, 2, options);
      expect(addPath.mock.calls.map(([path]) => path)).toEqual(first);
      addPath.mockClear();
      paths[1].x = 4;
      drawElements(ctx, paths, 2, options);
      expect(addPath.mock.calls[0][0]).not.toBe(first[0]);
      expect(addPath.mock.calls[1][0]).toBe(first[1]);
      addPath.mockClear();
      paths[2].primitives = line("replacement").primitives;
      paths[150].styleId = 1;
      drawElements(ctx, paths, 2, options);
      expect(addPath).toHaveBeenCalledTimes(1);
      expect(addPath.mock.calls[0][0]).not.toBe(first[0]);
    } finally {
      addPath.mockRestore();
    }
  });

  it("draws a primitive only on the levels of its mask", () => {
    const rect = { kind: "rect" as const, x: 0, y: 0, width: 4, height: 4, fill: "#f00", levelMask: 2 };
    expect(isPrimitiveVisible(rect, 1, "schematic")).toBe(true);
    expect(isPrimitiveVisible(rect, 1, "minimalistic")).toBe(false);
    expect(isPrimitiveVisible(rect, 1)).toBe(true);
    const ctx = createContext();
    expect(drawElements(ctx, [element({ primitives: [rect] })], 1, { level: "detailed" })).toBe(0);
    expect(drawElements(ctx, [element({ primitives: [rect] })], 1, { level: "schematic" })).toBe(1);
  });

  it("skips text and draws hidden elements on request, without copying elements", () => {
    const rect = { kind: "rect" as const, x: 0, y: 0, width: 4, height: 4, fill: "#f00" };
    const text = { kind: "text" as const, text: "t", family: "f", size: 4, lineHeight: 4, x: 0, y: 0, width: 4 };
    const hidden = element({ primitives: [rect, text], hidden: true });
    const ctx = createContext();
    expect(drawElements(ctx, [hidden], 1)).toBe(0);
    expect(drawElements(ctx, [hidden], 1, { drawHidden: true })).toBe(2);
    expect(drawElements(ctx, [hidden], 1, { drawHidden: true, skipText: true })).toBe(1);
  });

  describe("text", () => {
    type TText = Extract<TScenePrimitive, { kind: "text" }>;

    beforeEach(() => {
      // Half the font size per character at TEXT_METRICS_PX (100 px), and the alphabetic baseline 80 px below a top.
      jest.spyOn(sceneTextMetrics, "width").mockImplementation((text) => text.length * 50);
      jest.spyOn(sceneTextMetrics, "top").mockImplementation(() => 80);
    });

    afterEach(() => jest.restoreAllMocks());

    /** A 10 px name (80 world units at most), 12 per line at that size, centred in a 120 x 48 box at (4, 20). */
    const name = (patch: Partial<TText> = {}): TText => ({
      kind: "text",
      text: "aaa bbb ccc",
      family: "f",
      size: 10,
      cameraAware: { maxWorld: 80 },
      lineHeight: 12,
      color: "#fff",
      x: 4,
      y: 20,
      width: 120,
      height: 48,
      align: "center",
      verticalAlign: "middle",
      ...patch,
    });

    it("reveals text with zoom in both directions and preserves the opacity of the next label", () => {
      const ctx = createContext();
      ctx.globalAlpha = 0.8;
      const alphas: number[] = [];
      jest.spyOn(ctx, "fillText").mockImplementation(() => {
        alphas.push(ctx.globalAlpha);
      });
      const plain = name({ text: "A", cameraAware: false });
      const fading = { ...plain, minScale: 1, fadeInUntil: 2 };
      const block = element({ primitives: [fading, plain] });
      for (const scale of [1, 1.25, 2, 1.25, 1]) drawElements(ctx, [block], scale);
      expect(alphas).toEqual([0.8, 0.125, 0.8, 0.8, 0.8, 0.125, 0.8, 0.8]);
      expect(ctx.globalAlpha).toBe(0.8);
    });

    // A character is half the size wide, rounded as v1 (floor + 1): at size 10 "aaa" is 16 and a space 6, so the
    // three words take 66 of the 120; at 20 two of them fit (84), and two lines of 24 fill the 48; at 40 one line of 48
    // holds "aaa" (82), the rest is dropped.
    const FITS: ReadonlyArray<[camera: number, size: number, lines: string[]]> = [
      [1, 10, ["aaa bbb ccc"]],
      [0.5, 20, ["aaa bbb", "ccc"]],
      [0.25, 40, ["aaa"]],
      [0.125, 80, []],
    ];

    for (const [camera, size, lines] of FITS) {
      it(`re-fits a camera-aware name to its box at the resolved size ${size}`, () => {
        const ctx = createContext();
        const states: string[] = [];
        // The state at each call: the clip's restore() resets it afterwards.
        const fillText = jest.spyOn(ctx, "fillText").mockImplementation(() => {
          states.push(`${ctx.textAlign} ${ctx.textBaseline} ${ctx.font}`);
        });
        drawElements(ctx, [element({ x: 100, y: 50, primitives: [name()] })], camera);
        const pitch = 1.2 * size;
        // The block of lines is centred on the box's centre (44); each line's top is drawn with textBaseline "top".
        const top = 44 - (lines.length * pitch) / 2;
        expect(fillText.mock.calls).toEqual(lines.map((line, row) => [line, 100 + 64, 50 + top + row * pitch]));
        for (const state of states) expect(state).toMatch(new RegExp(`^center top .*\\b${size}px`));
      });
    }

    it("keeps a world text's lines and size at any zoom, its top on the box's top", () => {
      for (const camera of [1, 0.25]) {
        const ctx = createContext();
        const fillText = jest.spyOn(ctx, "fillText");
        const world = name({ cameraAware: undefined, verticalAlign: "top", text: "aaa bbb", width: 30 });
        drawElements(ctx, [element({ primitives: [world] })], camera);
        expect(fillText.mock.calls).toEqual([
          ["aaa", 4 + 15, 20],
          ["bbb", 4 + 15, 32],
        ]);
      }
    });

    it("draws a camera-aware text at its world size while the policy turns camera awareness off", () => {
      const ctx = createContext();
      const fillText = jest.spyOn(ctx, "fillText");
      drawElements(ctx, [element({ primitives: [name()] })], 0.25, { textPolicy: { cameraAware: false } });
      expect(fillText.mock.calls).toEqual([["aaa bbb ccc", 64, 44 - 6]]);
      expect(ctx.font).toContain("10px");
    });

    it("clips a text that can leave its box, and only such a text", () => {
      const ctx = createContext();
      const rect = jest.spyOn(ctx, "rect");
      const clip = jest.spyOn(ctx, "clip");
      const save = jest.spyOn(ctx, "save");
      const restore = jest.spyOn(ctx, "restore");
      // The name's line fits the box at scale 1: no clip.
      drawElements(ctx, [element({ x: 100, y: 50, primitives: [name()] })], 1);
      expect(clip).not.toHaveBeenCalled();
      // One unwrapped line wider than the box: clipped to it.
      drawElements(ctx, [element({ x: 100, y: 50, primitives: [name({ wrap: false, width: 30 })] })], 1);
      expect(rect).toHaveBeenCalledWith(104, 70, 30, 48);
      expect(clip).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
    });

    it("lays a text out again only when its size leaves the range of its line breaks", () => {
      const layout = jest.mocked(layoutText);
      layout.mockClear();
      const ctx = createContext();
      const primitive = name();
      const draw = (camera: number): void => {
        drawElements(ctx, [element({ primitives: [primitive] })], camera);
      };
      draw(1);
      expect(layout).toHaveBeenCalledTimes(1);
      // 10.5 and 11 keep one line: the 120-wide box holds the three words up to about 18.
      draw(10 / 10.5);
      draw(10 / 11);
      expect(layout).toHaveBeenCalledTimes(1);
      draw(0.5);
      expect(layout).toHaveBeenCalledTimes(2);
    });

    it("draws one line of a text with a zero line height on the box's top", () => {
      const ctx = createContext();
      const fillText = jest.spyOn(ctx, "fillText");
      const text = name({
        cameraAware: undefined,
        lineHeight: 0,
        text: "aaa bbb",
        verticalAlign: "top",
        align: "left",
      });
      drawElements(ctx, [element({ primitives: [text] })], 1);
      expect(fillText.mock.calls).toEqual([["aaa bbb", 4, 20]]);
    });
  });

  it("skips hidden elements and primitives outside their scale range", () => {
    const ctx = createContext();
    const visible = { kind: "circle" as const, cx: 0, cy: 0, r: 1, fill: "#000" };
    const drawn = drawElements(
      ctx,
      [
        element({ hidden: true, primitives: [visible] }),
        element({ primitives: [visible, { ...visible, minScale: 0.5 }] }),
      ],
      0.3
    );
    expect(drawn).toBe(1);
  });
});

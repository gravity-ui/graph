import { drawElements, isPrimitiveVisible } from "./drawPrimitives";
import type { TSceneElement } from "./types";

beforeAll(() => {
  // jest-canvas-mock 2.5 has no roundRect.
  if (!("roundRect" in CanvasRenderingContext2D.prototype)) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, "roundRect", {
      value: function roundRect(): void {},
      configurable: true,
      writable: true,
    });
  }
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

  it("does not merge paths of different opacities into one run", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const faded = (id: string): TSceneElement => ({ ...line(id), styleId: 1 });
    const styles = [{}, { opacity: 0.5 }];
    expect(drawElements(ctx, [line("a"), faded("b"), faded("c"), line("d")], 1, { styles })).toBe(4);
    // a | b c | d: the faded paths share a run, but never with an opaque one.
    expect(stroke).toHaveBeenCalledTimes(3);
    const colors = ctx
      .__getEvents()
      .filter((event) => event.type === "strokeStyle")
      .map((event) => event.props.value);
    expect(colors).toEqual(["#112233", "rgba(17, 34, 51, 0.5)", "#112233"]);
  });

  it("skips a part a style hides and keeps the primitive without a style", () => {
    const ctx = createContext();
    const rect = { kind: "rect" as const, part: "glow", x: 0, y: 0, width: 4, height: 4, fill: "#f00" };
    const hidden = element({ styleId: 1, primitives: [rect] });
    expect(drawElements(ctx, [hidden], 1, { styles: [{}, { parts: { glow: { visible: false } } }] })).toBe(0);
    expect(ctx.__getDrawCalls().filter((call) => call.type === "fill")).toHaveLength(0);
    drawElements(ctx, [element({ primitives: [rect] })], 1, { styles: [{}, { parts: { glow: { visible: false } } }] });
    expect(ctx.__getDrawCalls().filter((call) => call.type === "fill")).toHaveLength(1);
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
    const rect = { kind: "rect" as const, part: "border", x: 0, y: 0, width: 4, height: 4, border: { color: "#000" } };
    const path = { kind: "path" as const, part: "line", segments: SEGMENTS, stroke: { color: "#123" } };
    drawElements(ctx, [element({ primitives: [rect, path] })], 1);
    expect(stroke).not.toHaveBeenCalled();
    drawElements(ctx, [element({ styleId: 1, primitives: [rect, path] })], 1, {
      styles: [{}, { base: { border: { width: 2 }, line: { width: 3 } } }],
    });
    expect(stroke).toHaveBeenCalledTimes(2);
    const widths = ctx
      .__getEvents()
      .filter((event) => event.type === "lineWidth")
      .map((event) => event.props.value);
    expect(widths).toEqual([2, 3]);
  });

  it("insets an inside border and outsets an outside one by half its width", () => {
    const ctx = createContext();
    const roundRect = jest.spyOn(ctx, "roundRect");
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
    const fill = jest.spyOn(ctx, "fill");
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

  it("fills a polygon run once and strokes it with the paths of the same style", () => {
    const ctx = createContext();
    const stroke = jest.spyOn(ctx, "stroke");
    const fill = jest.spyOn(ctx, "fill");
    const arrow = new Float32Array([0, 0, 4, 2, 0, 4]);
    const connection = (id: string): TSceneElement =>
      element({
        id,
        primitives: [
          { kind: "path", segments: SEGMENTS, stroke: { color: "#123", width: 2 } },
          { kind: "polygon", points: arrow, fill: "#123", stroke: { color: "#123", width: 2 } },
        ],
      });
    drawElements(ctx, [connection("a"), connection("b")], 1);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(stroke).toHaveBeenCalledTimes(1);
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

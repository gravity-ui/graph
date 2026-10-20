import { Graph } from "@gravity-ui/graph";

import { getUikitGraphStore } from "../store/UikitGraphStore";
import { DEFAULT_UIKIT_PALETTE } from "../theme/palette";

import { clearUikitTextCache } from "./measure";
import { measureUikitText, renderUikitText } from "./renderUikitText";

function createContext(): CanvasRenderingContext2D {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected a 2d context");
  jest.spyOn(ctx, "measureText").mockImplementation((text: string) => ({ width: text.length * 10 }) as TextMetrics);
  return ctx;
}

describe("renderUikitText", () => {
  let graph: Graph;

  beforeEach(() => {
    clearUikitTextCache();
    graph = new Graph({});
    jest.spyOn(graph.cameraService, "getCameraScale").mockReturnValue(1);
  });

  afterEach(() => graph.unmount());

  it("draws wrapped lines with half-leading like CSS", () => {
    const ctx = createContext();
    const fillText = jest.spyOn(ctx, "fillText");

    const layout = renderUikitText(ctx, graph, "alpha beta gamma", { x: 0, y: 0, width: 100, height: 100 });

    // body-1: 13px font, 18px line height → (18 - 13) / 2 = 2.5 px half-leading.
    expect(fillText.mock.calls).toEqual([
      ["alpha beta", 0, 2.5],
      ["gamma", 0, 20.5],
    ]);
    expect(layout).toEqual({ lines: ["alpha beta", "gamma"], width: 100, height: 36 });
  });

  it("uses the palette color and lets fill win", () => {
    const ctx = createContext();
    getUikitGraphStore(graph).$palette.value = {
      ...DEFAULT_UIKIT_PALETTE,
      text: { ...DEFAULT_UIKIT_PALETTE.text, secondary: "#123456" },
    };

    renderUikitText(ctx, graph, "a", { x: 0, y: 0, width: 100, height: 20 }, { color: "secondary" });
    expect(ctx.fillStyle).toBe("#123456");

    renderUikitText(ctx, graph, "a", { x: 0, y: 0, width: 100, height: 20 }, { fill: "#ff0000" });
    expect(ctx.fillStyle).toBe("#ff0000");
  });

  it("drops lines that do not fit the rect height", () => {
    const ctx = createContext();
    const fillText = jest.spyOn(ctx, "fillText");

    renderUikitText(ctx, graph, "alpha beta gamma", { x: 0, y: 0, width: 100, height: 18 });

    expect(fillText.mock.calls.map(([line]) => line)).toEqual(["alpha beta"]);
  });

  it("aligns to the rect center", () => {
    const ctx = createContext();
    const fillText = jest.spyOn(ctx, "fillText");

    renderUikitText(ctx, graph, "a", { x: 10, y: 0, width: 100, height: 20 }, { align: "center" });

    expect(fillText).toHaveBeenCalledWith("a", 60, 2.5);
  });

  it("skips text that is too small on screen", () => {
    const ctx = createContext();
    const fillText = jest.spyOn(ctx, "fillText");
    jest.spyOn(graph.cameraService, "getCameraScale").mockReturnValue(0.1);

    expect(renderUikitText(ctx, graph, "a", { x: 0, y: 0, width: 100, height: 20 }).lines).toEqual([]);
    expect(fillText).not.toHaveBeenCalled();
  });
});

describe("measureUikitText", () => {
  it("measures without drawing", () => {
    clearUikitTextCache();
    const graph = new Graph({});
    const ctx = createContext();

    expect(measureUikitText(graph, "abc", { variant: "caption-2", maxWidth: Infinity }, ctx)).toEqual({
      lines: ["abc"],
      width: 30,
      height: 16,
    });
    graph.unmount();
  });
});

import { Graph } from "../../../graph";
import { sceneTextLayout } from "../../../lib/scene/text/textMetrics";
import { clearMeasureTextCache } from "../../../utils/functions/text";
import { clearTextCache } from "../../../utils/renderers/text";

jest.mock("../../../utils/functions/text", () => {
  const actual: typeof import("../../../utils/functions/text") = jest.requireActual("../../../utils/functions/text");
  return { ...actual, clearMeasureTextCache: jest.fn() };
});

jest.mock("../../../utils/renderers/text", () => {
  const actual: typeof import("../../../utils/renderers/text") = jest.requireActual("../../../utils/renderers/text");
  return { ...actual, clearTextCache: jest.fn() };
});

describe("graph.scene and late web fonts", () => {
  // jsdom has no FontFaceSet: a plain event target stands in for document.fonts.
  const fonts = new EventTarget();

  beforeAll(() => {
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  });

  afterAll(() => {
    Reflect.deleteProperty(document, "fonts");
  });

  afterEach(() => jest.restoreAllMocks());

  it("observes fonts only while attached and refreshes their measurements on reattach", () => {
    const graph = new Graph({});
    const measurer = { invalidateTextMeasures: jest.fn() };
    graph.scene.trackTextMeasure(measurer);
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(measurer.invalidateTextMeasures).not.toHaveBeenCalled();

    const root = document.createElement("div");
    graph.attach(root);
    graph.detach();
    measurer.invalidateTextMeasures.mockClear();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(measurer.invalidateTextMeasures).not.toHaveBeenCalled();
    graph.attach(root);
    expect(measurer.invalidateTextMeasures).toHaveBeenCalledTimes(1);
    graph.unmount();
  });

  it("clears the measures and the wrapped lines and runs the measurers again on loadingdone, until dispose", () => {
    const graph = new Graph({}, document.createElement("div"));
    jest.mocked(clearMeasureTextCache).mockClear();
    jest.mocked(clearTextCache).mockClear();
    let charWidthEm = 0.4;
    jest.spyOn(CanvasRenderingContext2D.prototype, "measureText").mockImplementation(function (
      this: CanvasRenderingContext2D,
      text
    ) {
      const size = Number(/([\d.]+)px/.exec(this.font)?.[1]);
      return { width: size * text.length * charWidthEm } as TextMetrics;
    });
    const label = {
      kind: "text",
      text: "aaaa bbbb",
      family: "LateFont",
      size: 10,
      lineHeight: 12,
      x: 0,
      y: 0,
      width: 50,
    } as const;
    const lines = () => sceneTextLayout(label, label, label.size).lines;
    const measurer = { invalidateTextMeasures: jest.fn() };
    const released = { invalidateTextMeasures: jest.fn() };
    graph.scene.trackTextMeasure(measurer);
    graph.scene.trackTextMeasure(released);
    graph.scene.untrackTextMeasure(released);

    expect(lines()).toEqual(["aaaa bbbb"]);
    charWidthEm = 0.75;
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(lines()).toEqual(["aaaa", "bbbb"]);
    expect(clearMeasureTextCache).toHaveBeenCalledTimes(1);
    // The Canvas2D interpreter's wrap cache, keyed by the base size: zooming never refreshes it.
    expect(clearTextCache).toHaveBeenCalledTimes(1);
    expect(measurer.invalidateTextMeasures).toHaveBeenCalledTimes(1);
    expect(released.invalidateTextMeasures).not.toHaveBeenCalled();

    graph.unmount();
    jest.mocked(clearTextCache).mockClear();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(clearTextCache).not.toHaveBeenCalled();
    expect(clearMeasureTextCache).toHaveBeenCalledTimes(1);
    expect(measurer.invalidateTextMeasures).toHaveBeenCalledTimes(1);
  });
});

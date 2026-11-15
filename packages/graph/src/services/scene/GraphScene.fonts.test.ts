import { Graph } from "../../graph";
import { clearMeasureTextCache } from "../../utils/functions/text";
import { clearTextCache } from "../../utils/renderers/text";

jest.mock("../../utils/functions/text", () => {
  const actual: typeof import("../../utils/functions/text") = jest.requireActual("../../utils/functions/text");
  return { ...actual, clearMeasureTextCache: jest.fn() };
});

jest.mock("../../utils/renderers/text", () => {
  const actual: typeof import("../../utils/renderers/text") = jest.requireActual("../../utils/renderers/text");
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

  it("clears the measures and the wrapped lines and runs the measurers again on loadingdone, until dispose", () => {
    const graph = new Graph({}, document.createElement("div"));
    jest.mocked(clearTextCache).mockClear();
    const onFontsLoaded = jest.spyOn(graph.scene, "onFontsLoaded");
    const measurer = { invalidateTextMeasures: jest.fn() };
    const released = { invalidateTextMeasures: jest.fn() };
    graph.scene.trackTextMeasure(measurer);
    graph.scene.trackTextMeasure(released);
    graph.scene.untrackTextMeasure(released);

    fonts.dispatchEvent(new Event("loadingdone"));
    expect(onFontsLoaded).toHaveBeenCalledTimes(1);
    expect(clearMeasureTextCache).toHaveBeenCalledTimes(1);
    // The Canvas2D interpreter's wrap cache, keyed by the base size: zooming never refreshes it.
    expect(clearTextCache).toHaveBeenCalledTimes(1);
    expect(measurer.invalidateTextMeasures).toHaveBeenCalledTimes(1);
    expect(released.invalidateTextMeasures).not.toHaveBeenCalled();

    graph.unmount();
    jest.mocked(clearTextCache).mockClear();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(clearTextCache).not.toHaveBeenCalled();
    expect(onFontsLoaded).toHaveBeenCalledTimes(1);
    expect(clearMeasureTextCache).toHaveBeenCalledTimes(1);
    expect(measurer.invalidateTextMeasures).toHaveBeenCalledTimes(1);
  });
});

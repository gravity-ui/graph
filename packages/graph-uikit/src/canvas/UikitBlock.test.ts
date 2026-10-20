import { createUikitGraph, disposeUikitGraph, flushFrames, getBlockView } from "../test-utils/graphFixture";
import { clearUikitTextCache } from "../text/measure";

import { UikitBlock } from "./UikitBlock";

describe("UikitBlock", () => {
  beforeEach(() => clearUikitTextCache());

  it("is used for default blocks", () => {
    const fixture = createUikitGraph();
    expect(getBlockView(fixture.graph, "a")).toBeInstanceOf(UikitBlock);
    disposeUikitGraph(fixture);
  });

  it("tracks canvas hover through component mouse events", () => {
    const fixture = createUikitGraph();
    const view = getBlockView(fixture.graph, "a");

    view.dispatchEvent(new MouseEvent("mouseenter"));
    flushFrames(fixture.graph);
    expect(view.$hovered.value).toBe(true);

    view.dispatchEvent(new MouseEvent("mouseleave"));
    flushFrames(fixture.graph);
    expect(view.$hovered.value).toBe(false);

    disposeUikitGraph(fixture);
  });

  it("draws name and description on the schematic level", () => {
    const fixture = createUikitGraph();
    const view = getBlockView(fixture.graph, "a");
    jest.spyOn(fixture.graph.cameraService, "getCameraScale").mockReturnValue(1);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Expected a 2d context");
    jest.spyOn(ctx, "measureText").mockImplementation((text: string) => ({ width: text.length * 5 }) as TextMetrics);
    const fillText = jest.spyOn(ctx, "fillText");

    view.renderSchematicView(ctx);

    expect(fillText.mock.calls.map(([text]) => text)).toEqual(["Block A", "First"]);
    disposeUikitGraph(fixture);
  });

  it("skips the description when no caption line fits under the title", () => {
    const fixture = createUikitGraph();
    // Content height 56 - 2 * 12 = 32; the title takes 18 + 4 gap, leaving 10px for a 16px caption line.
    fixture.graph.api.updateBlock({ id: "a", height: 56 });
    flushFrames(fixture.graph);
    const view = getBlockView(fixture.graph, "a");
    jest.spyOn(fixture.graph.cameraService, "getCameraScale").mockReturnValue(1);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Expected a 2d context");
    jest.spyOn(ctx, "measureText").mockImplementation((text: string) => ({ width: text.length * 5 }) as TextMetrics);
    const fillText = jest.spyOn(ctx, "fillText");

    view.renderSchematicView(ctx);

    expect(fillText.mock.calls.map(([text]) => text)).toEqual(["Block A"]);
    disposeUikitGraph(fixture);
  });
});

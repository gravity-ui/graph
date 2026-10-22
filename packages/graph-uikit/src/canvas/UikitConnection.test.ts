import { getUikitGraphStore } from "../store/UikitGraphStore";
import {
  FIXTURE_BLOCKS,
  FIXTURE_CONNECTIONS,
  createUikitGraph,
  disposeUikitGraph,
  flushFrames,
  getConnectionView,
} from "../test-utils/graphFixture";
import { clearUikitTextCache } from "../text/measure";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "../theme/typography";

import { UikitConnection } from "./UikitConnection";

function createContext(): CanvasRenderingContext2D {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) throw new Error("Expected a 2d context");
  jest.spyOn(ctx, "measureText").mockImplementation((text: string) => ({ width: text.length * 5 }) as TextMetrics);
  return ctx;
}

describe("UikitConnection", () => {
  beforeEach(() => clearUikitTextCache());

  it("is used for connections and reads hover colors from the kit palette", () => {
    const fixture = createUikitGraph();
    const view = getConnectionView(fixture.graph, "a:b");

    expect(view).toBeInstanceOf(UikitConnection);
    expect(view.getStrokeColor({ ...view.state, hovered: true })).toBe("rgba(0, 0, 0, 0.3)");

    disposeUikitGraph(fixture);
  });

  it("draws the arrow with screen-pixel line widths", () => {
    const fixture = createUikitGraph();
    const view = getConnectionView(fixture.graph, "a:b");
    jest.spyOn(fixture.graph.cameraService, "getCameraScale").mockReturnValue(2);
    const ctx = createContext();

    expect(view.styleArrow(ctx)).toEqual({ type: "stroke" });
    // 1 screen pixel at scale 2; core would set 2 world units.
    expect(ctx.lineWidth).toBe(0.5);

    fixture.graph.api.selectConnections(["a:b"], true);
    flushFrames(fixture.graph);
    view.styleArrow(ctx);
    expect(ctx.lineWidth).toBe(1);

    disposeUikitGraph(fixture);
  });

  it("re-renders when the kit typography changes", () => {
    const fixture = createUikitGraph();
    const view = getConnectionView(fixture.graph, "a:b");
    const performRender = jest.spyOn(view, "performRender");

    getUikitGraphStore(fixture.graph).$typography.value = { ...DEFAULT_UIKIT_TYPOGRAPHY };

    expect(performRender).toHaveBeenCalled();
    disposeUikitGraph(fixture);
  });

  it("skips the whole label when its text is too small to draw", () => {
    const fixture = createUikitGraph();
    const { graph } = fixture;
    graph.updateSettings({ showConnectionLabels: true });
    graph.setEntities({
      blocks: FIXTURE_BLOCKS,
      connections: [{ ...FIXTURE_CONNECTIONS[0], label: "valid" }],
    });
    // jsdom has no layout: give the camera a viewport so the connection counts as visible.
    graph.cameraService.set({ width: 1280, height: 720 });
    flushFrames(graph);
    const view = getConnectionView(graph, "a:b");
    const scale = jest.spyOn(graph.cameraService, "getCameraScale");
    const ctx = createContext();
    const fill = jest.spyOn(ctx, "fill");
    const fillText = jest.spyOn(ctx, "fillText");

    // caption-2 is 11px: at 0.3 it is 3.3px on screen, below the 4px minimum but above the core label zoom.
    scale.mockReturnValue(0.3);
    view.afterRender?.(ctx);
    expect(fill).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();

    scale.mockReturnValue(1);
    view.afterRender?.(ctx);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(fillText.mock.calls.map(([text]) => text)).toEqual(["valid"]);

    disposeUikitGraph(fixture);
  });
});

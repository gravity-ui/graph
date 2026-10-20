import { createUikitGraph, disposeUikitGraph, getBlockView } from "../test-utils/graphFixture";

import { createHoverAnchor, getEntityViewportRect, resolveGraphEntity, toClientRect } from "./entity";

describe("graph entities", () => {
  it("resolves blocks and ignores unknown targets", () => {
    const fixture = createUikitGraph();
    const view = getBlockView(fixture.graph, "a");

    expect(resolveGraphEntity(view)).toEqual({ kind: "block", id: "a", component: view });
    expect(resolveGraphEntity({})).toBeNull();
    expect(resolveGraphEntity(undefined)).toBeNull();

    disposeUikitGraph(fixture);
  });

  it("converts world rects to viewport rects through the camera and the canvas position", () => {
    const fixture = createUikitGraph();
    const { graph } = fixture;
    jest
      .spyOn(graph.cameraService, "getAbsoluteXY")
      .mockImplementation((x: number, y: number) => [x * 2 + 5, y * 2 + 5]);
    const canvas = graph.getGraphCanvas();
    if (!canvas) throw new Error("Expected a graph canvas");
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20 } as DOMRect);

    expect(toClientRect(graph, { x: 0, y: 0, width: 200, height: 100 })).toEqual({
      x: 15,
      y: 25,
      width: 400,
      height: 200,
      left: 15,
      top: 25,
      right: 415,
      bottom: 225,
    });
    expect(getEntityViewportRect(graph, { kind: "canvas", worldPoint: { x: 1, y: 1 } })).toMatchObject({
      x: 17,
      y: 27,
      width: 0,
      height: 0,
    });

    disposeUikitGraph(fixture);
  });

  it("anchors blocks to their own rect even when a pointer point is known", () => {
    const fixture = createUikitGraph();
    const { graph } = fixture;
    jest.spyOn(graph.cameraService, "getAbsoluteXY").mockImplementation((x: number, y: number) => [x, y]);
    const view = getBlockView(graph, "a");
    const entity = resolveGraphEntity(view);
    if (!entity) throw new Error("Expected an entity");

    const anchor = createHoverAnchor(graph, { entity, worldPoint: { x: 7, y: 9 } });
    expect(anchor.getBoundingClientRect()).toMatchObject({ width: 200, height: 100 });

    disposeUikitGraph(fixture);
  });
});

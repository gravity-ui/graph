import { Graph } from "./graph";

describe("Graph structural geometry", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({}, document.createElement("div"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    graph.unmount();
  });

  it.each([
    { camera: { x: 0, y: 0, scale: 1 }, dpr: 1, expected: { x: 10.5, y: -20.5 } },
    { camera: { x: 25.5, y: -40.25, scale: 0.5 }, dpr: 2, expected: { x: 61.5, y: -101 } },
    { camera: { x: -10.5, y: 3.25, scale: 2.25 }, dpr: 3, expected: { x: 39.375, y: -128.625 } },
  ])("converts a plain world point to canvas pixels ($camera, DPR $dpr)", ({ camera, dpr, expected }) => {
    graph.cameraService.set(camera);
    jest.spyOn(graph.layers, "getDPR").mockReturnValue(dpr);
    const testHitBox = jest.spyOn(graph.hitTest, "testHitBox").mockReturnValue([]);
    const point = { x: 10.5, y: -20.5 };
    const expectedHitBox = { minX: 9.5, minY: -21.5, maxX: 11.5, maxY: -19.5, ...expected };

    graph.getElementsOverPoint(point);
    expect(testHitBox).toHaveBeenLastCalledWith(expectedHitBox);

    graph.getElementOverPoint(point);
    expect(testHitBox).toHaveBeenLastCalledWith(expectedHitBox);

    const cameraPoint = graph.cameraService.createCameraPoint(point);
    graph.getElementOverPoint(cameraPoint);
    expect(testHitBox).toHaveBeenLastCalledWith(expectedHitBox);

    graph.hitTest.testPoint(cameraPoint, dpr);
    expect(testHitBox).toHaveBeenLastCalledWith(expectedHitBox);
  });

  it("preserves exact canvas coordinates from a mouse event", () => {
    graph.cameraService.set({ x: 25.5, y: -40.25, scale: 0.5 });
    jest.spyOn(graph.layers, "getDPR").mockReturnValue(2);
    jest.spyOn(graph.getGraphCanvas(), "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 500, 400));
    const testHitBox = jest.spyOn(graph.hitTest, "testHitBox").mockReturnValue([]);

    const point = graph.getPointInCameraSpace(new MouseEvent("mousemove", { clientX: 40.75, clientY: 69.5 }));

    expect(point).toStrictEqual({ world: { x: 10.5, y: 179.5 }, canvas: { x: 30.75, y: 49.5 } });
    graph.getElementOverPoint(point);
    expect(testHitBox).toHaveBeenCalledWith({ minX: 9.5, minY: 178.5, maxX: 11.5, maxY: 180.5, x: 61.5, y: 99 });
  });

  it("honors an explicit canvas origin at zero", () => {
    graph.cameraService.set({ x: 100, y: 200, scale: 0.5 });
    const testHitBox = jest.spyOn(graph.hitTest, "testHitBox").mockReturnValue([]);

    graph.getElementOverPoint({ world: { x: -200, y: -400 }, canvas: { x: 0, y: 0 } });

    expect(testHitBox).toHaveBeenCalledWith({ minX: -201, minY: -401, maxX: -199, maxY: -399, x: 0, y: 0 });
  });
});

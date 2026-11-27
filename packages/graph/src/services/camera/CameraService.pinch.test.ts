import { Graph } from "../../graph";

describe("pinching the camera", () => {
  let graph: Graph;
  const previous = { x: 50.5, y: 28.25 };
  const center = { x: 60.75, y: 30.5 };

  const baseline = (distance = 20) => ({ center: previous, distance, camera: graph.$camera.peek() });

  beforeEach(() => {
    graph = new Graph({});
    graph.cameraService.set({ x: 10.5, y: 8.25, scale: 0.5, scaleMin: 0.25, scaleMax: 2 });
  });
  afterEach(() => graph.unmount());

  it("projects the world anchor into the moving midpoint with one committed update", () => {
    const snapshots = jest.fn();
    const unsubscribe = graph.$camera.subscribe(snapshots);
    snapshots.mockClear();

    graph.cameraService.applyPinch(baseline(), center, 30);

    expect(snapshots).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveBeenCalledWith(expect.objectContaining({ x: 0.75, y: 0.5, scale: 0.75 }));
    expect(graph.cameraService.getAbsoluteXY(80, 40)).toEqual([60.75, 30.5]);
    unsubscribe();
  });

  it("leaves the entire camera unchanged when the proposed transform is vetoed", () => {
    const before = graph.$camera.peek();
    graph.on("camera-change", (event) => event.preventDefault(), { once: true });

    expect(graph.cameraService.applyPinch(baseline(), center, 30)).toBe(false);

    expect(graph.$camera.peek()).toBe(before);
    expect(graph.cameraService.getCameraState()).toEqual(before);
  });

  it.each([
    [2, 0.25],
    [200, 2],
  ])("clamps a distance of %s to scale %s and keeps the anchor under the midpoint", (distance, scale) => {
    graph.cameraService.applyPinch(baseline(), center, distance);
    expect(graph.$camera.peek().scale).toBe(scale);
    expect(graph.cameraService.getAbsoluteXY(80, 40)).toEqual([60.75, 30.5]);
  });

  it("stays at the limit as the pair translates and only leaves it at the original distance ratio", () => {
    graph.cameraService.set({ scaleMax: 1 });
    const start = baseline(100);
    expect(graph.cameraService.applyPinch(start, previous, 400)).toBe(true);
    expect(graph.cameraService.applyPinch(start, center, 300)).toBe(true);
    expect(graph.$camera.peek().scale).toBe(1);
    expect(graph.cameraService.getAbsoluteXY(80, 40)).toEqual([60.75, 30.5]);
    graph.cameraService.applyPinch(start, previous, 100);
    expect(graph.$camera.peek()).toMatchObject({ x: 10.5, y: 8.25, scale: 0.5 });
  });

  it("allows midpoint translation alone when zoom is disabled", () => {
    graph.updateSettings({ canZoomCamera: false });
    graph.cameraService.applyPinch(baseline(), center, 30);
    expect(graph.$camera.peek()).toMatchObject({ x: 20.75, y: 10.5, scale: 0.5 });
  });

  it("zooms about the previous midpoint without translating it when pan is disabled", () => {
    graph.updateSettings({ canDragCamera: false });
    graph.cameraService.applyPinch(baseline(), center, 30);
    expect(graph.$camera.peek()).toMatchObject({ x: -9.5, y: -1.75, scale: 0.75 });
    expect(graph.cameraService.getAbsoluteXY(80, 40)).toEqual([50.5, 28.25]);
  });

  it("does not publish a camera update when both actions are disabled", () => {
    graph.updateSettings({ canDragCamera: false, canZoomCamera: false });
    const before = graph.$camera.peek();
    graph.cameraService.applyPinch(baseline(), center, 30);
    expect(graph.$camera.peek()).toBe(before);
  });

  it.each([
    [0, 20],
    [0.01, 20],
    [20, 0.01],
  ])("keeps translation usable around coincident contacts (%s → %s)", (from, to) => {
    expect(graph.cameraService.applyPinch(baseline(from), center, to)).toBe(false);
    expect(graph.$camera.peek()).toMatchObject({ x: 20.75, y: 10.5, scale: 0.5 });
  });
});

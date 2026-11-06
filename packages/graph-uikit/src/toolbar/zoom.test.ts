import { getNextZoomScale, zoomGroup } from "./zoom";

const bounds = { scaleMin: 0.01, scaleMax: 1 };

describe("getNextZoomScale", () => {
  it("zooms multiplicatively and reciprocally", () => {
    const zoomedIn = getNextZoomScale(0.5, 0.1, 1, bounds);
    expect(zoomedIn).toBeCloseTo(0.55);
    expect(getNextZoomScale(zoomedIn, 0.1, -1, bounds)).toBeCloseTo(0.5);
  });

  it("clamps to the camera bounds", () => {
    expect(getNextZoomScale(0.95, 0.1, 1, bounds)).toBe(1);
    expect(getNextZoomScale(0.0105, 0.1, -1, bounds)).toBe(0.01);
  });
});

describe("zoomGroup", () => {
  it("returns zoom in and zoom out by default", () => {
    expect(zoomGroup().map((action) => action.id)).toEqual(["zoom-in", "zoom-out"]);
  });

  it("orders optional actions like the reference toolbar and appends extras", () => {
    const extra = { id: "extra", title: "Extra", label: "E", action: jest.fn() };
    expect(zoomGroup({ reset: true, viewport: true, selection: true }, extra).map((action) => action.id)).toEqual([
      "zoom-in",
      "zoom-reset",
      "zoom-viewport",
      "zoom-selection",
      "zoom-out",
      "extra",
    ]);
  });

  it("lets titles be overridden", () => {
    expect(zoomGroup({ titles: { zoomIn: "Приблизить" } })[0].title).toBe("Приблизить");
  });
});

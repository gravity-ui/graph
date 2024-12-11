import { polyline } from "./polyline";

describe("polyline", () => {
  it("Should render polyline", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    expect(polyline(points)).toMatchSnapshot();
  });

  it("should create an empty shape for empty points", () => {
    expect(polyline([])).toMatchSnapshot();
  });
});

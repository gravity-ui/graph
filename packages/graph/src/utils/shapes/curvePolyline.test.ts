import { curvePolyline } from "./curvePolyline";

describe("curve", () => {
  test("should create a Path2D object", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ];
    const radius = 20;

    const result = curvePolyline(points, radius);
    expect(result).toBeInstanceOf(Path2D);
  });

  test("should handle a straight line with two points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];
    const radius = 20;

    const result = curvePolyline(points, radius);
    expect(result).toBeInstanceOf(Path2D);
    // Check: the curve should be a straight line
    expect(result).toMatchSnapshot();
  });

  test("should create smooth arcs for multiple points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 50 },
      { x: 150, y: 150 },
    ];
    const radius = 20;

    const result = curvePolyline(points, radius);
    expect(result).toBeInstanceOf(Path2D);
    // Verify that a valid Path2D object is created
    expect(result).toMatchSnapshot();
  });

  test("should limit radius to fit between points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 }, // Very close points
      { x: 20, y: 0 },
    ];
    const baseRadius = 20;

    const result = curvePolyline(points, baseRadius);
    expect(result).toBeInstanceOf(Path2D);
    // Ensure the function does not create artifacts
    expect(result).toMatchSnapshot();
  });

  test("should handle sharp angles by reducing the radius", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 }, // Sharp angle
      { x: 100, y: 50 },
    ];
    const baseRadius = 30;

    const result = curvePolyline(points, baseRadius);
    expect(result).toBeInstanceOf(Path2D);
    // Check that the radius is reduced for the sharp angle
    expect(result).toMatchSnapshot();
  });

  test("should handle collinear points without arcs", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 }, // Points are collinear
    ];
    const radius = 20;

    const result = curvePolyline(points, radius);
    expect(result).toBeInstanceOf(Path2D);
    // Verify no arc is created for collinear points
    expect(result).toMatchSnapshot();
  });
});

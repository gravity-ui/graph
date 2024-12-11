// Importing the function
import { trangleArrowForVector } from "./triangle";

describe("trangleArrowForVector", () => {
  it("should return a Path2D instance representing an arrow from start to end", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 10 };
    const height = 5;

    const trianglePath = trangleArrowForVector(start, end, height);

    expect(trianglePath).toMatchSnapshot();
  });

  it("should handle a default height if not provided", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 10 };

    const trianglePath = trangleArrowForVector(start, end);

    expect(trianglePath).toMatchSnapshot();
  });
});

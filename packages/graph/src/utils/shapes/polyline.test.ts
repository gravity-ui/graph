import { pathCommands } from "../../../test/utils/pathCommands";

import { polyline } from "./polyline";

it("connects the points in order", () => {
  const points = [
    { x: 3, y: 5 },
    { x: 10, y: -8 },
    { x: 20, y: 4 },
  ];
  expect(pathCommands(polyline(points))).toEqual(["moveTo 3 5", "lineTo 10 -8", "lineTo 20 4"]);
});

it("leaves an empty path for no points", () => {
  expect(pathCommands(polyline([]))).toEqual([]);
});

import { pathCommands } from "../../../test/utils/pathCommands";

import { curvePolyline } from "./curvePolyline";

it("draws a straight line between two points", () => {
  const path = curvePolyline(
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    20
  );
  expect(pathCommands(path)).toEqual(["moveTo 0 0", "lineTo 100 100"]);
});

it("rounds consecutive bends along their segments", () => {
  const path = curvePolyline(
    [
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 50 },
      { x: 150, y: 150 },
    ],
    20
  );
  expect(pathCommands(path)).toMatchSnapshot();
});

it("limits the radius to half the length of a short segment", () => {
  const path = curvePolyline(
    [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ],
    20
  );
  expect(pathCommands(path)).toEqual(["moveTo 0 0", "lineTo 5 5", "arcTo 10 10 15 5 7.071068", "lineTo 20 0"]);
});

it("uses half the specified radius on a right angle", () => {
  const path = curvePolyline(
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ],
    30
  );
  expect(pathCommands(path)).toEqual([
    "moveTo 0 0",
    "lineTo 35 0",
    "arcTo 50 0 50 15 15",
    "lineTo 50 35",
    "arcTo 50 50 65 50 15",
    "lineTo 100 50",
  ]);
});

it("keeps collinear segments straight", () => {
  const path = curvePolyline(
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ],
    20
  );
  // Canvas treats arcTo at the current point with a zero radius as a straight segment.
  const start = ["moveTo 0 0", "lineTo 50 0"];
  const end = "lineTo 100 0";
  expect([
    [...start, end],
    [...start, "arcTo 50 0 50 0 0", end],
  ]).toContainEqual(pathCommands(path));
});

import { vectorDistance, vectorDistanceSquared } from "./vector";

it.each([
  [0, 0, 0, 0, 0],
  [1, 1, 4, 5, 5],
  [0, 0, -3, -4, 5],
  [-3, -4, 0, 0, 5],
])("measures the distance from (%i, %i) to (%i, %i)", (x1, y1, x2, y2, distance) => {
  const a = { x: x1, y: y1 };
  const b = { x: x2, y: y2 };
  expect(vectorDistance(a, b)).toBe(distance);
  expect(vectorDistanceSquared(a, b)).toBe(distance ** 2);
});

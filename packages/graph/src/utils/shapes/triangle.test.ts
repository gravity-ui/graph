import { pathCommands } from "../../../test/utils/pathCommands";

import { trangleArrowForVector } from "./triangle";

it.each([
  { height: 5, left: "lineTo 1 5.5", right: "lineTo 5 2.5" },
  { height: undefined, left: "lineTo -2 1.5", right: "lineTo 2 -1.5" },
])("draws a closed arrow with height $height", ({ height, left, right }) => {
  const path = trangleArrowForVector({ x: 0, y: 0 }, { x: 6, y: 8 }, height);
  expect(pathCommands(path)).toEqual(["moveTo 6 8", left, right, "closePath"]);
});

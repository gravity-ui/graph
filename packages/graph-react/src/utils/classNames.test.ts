import { parseClassNames } from "./classNames";

it.each([
  ["", []],
  ["   ", []],
  ["single-class", ["single-class"]],
  ["  block__element\tclass_name \n  block--modifier  ", ["block__element", "class_name", "block--modifier"]],
] as const)("splits %j into class names", (input, expected) => {
  expect(parseClassNames(input)).toEqual(expected);
});

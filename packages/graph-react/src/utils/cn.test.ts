import { cn } from "./cn";

it("keeps the order of strings and enabled object keys", () => {
  expect(cn("base", { active: true, count: 2, pending: false }, undefined, {}, "", "extra", { label: "enabled" })).toBe(
    "base active count extra label"
  );
});

it("skips empty arguments and disabled classes", () => {
  expect(cn()).toBe("");
  expect(cn("", undefined, {}, { pending: false, count: 0, label: "", empty: null, missing: undefined })).toBe("");
});

it("preserves whitespace and punctuation in class names", () => {
  expect(cn("  first.class  ", "  second:class  ", { "123": true })).toBe("  first.class     second:class   123");
});

import { deepFreeze } from "./deepFreeze";

describe("deepFreeze", () => {
  it("freezes nested objects and returns the same object", () => {
    const value = { a: { b: { c: 1 } }, d: "text" };

    const frozen = deepFreeze(value);

    expect(frozen).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(() => {
      value.a.b.c = 2;
    }).toThrow(TypeError);
    expect(value.a.b.c).toBe(1);
  });
});

import { ALL_LEVELS_MASK, LEVEL_BIT, isOnLevel, levelMaskOf } from "./levels";

describe("scene levels", () => {
  it("builds masks from levels and ignores repeats", () => {
    expect(levelMaskOf(["minimalistic", "detailed", "detailed"])).toBe(5);
    expect(levelMaskOf(["minimalistic", "schematic", "detailed"])).toBe(ALL_LEVELS_MASK);
    expect(LEVEL_BIT.schematic).toBe(2);
  });

  it("tests a mask against a level; no mask or no level means every level", () => {
    expect(isOnLevel(5, "minimalistic")).toBe(true);
    expect(isOnLevel(5, "schematic")).toBe(false);
    expect(isOnLevel(5, "detailed")).toBe(true);
    expect(isOnLevel(undefined, "schematic")).toBe(true);
    expect(isOnLevel(2, undefined)).toBe(true);
  });
});

import { ALL_LEVELS_MASK, LEVEL_BIT, isOnLevel, levelMaskOf, levelMaskOfPrimitives, unionLevelMasks } from "./levels";

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

  it("unions the levels of primitives: none is 0, a primitive without a mask is every level", () => {
    expect(levelMaskOfPrimitives([])).toBe(0);
    expect(levelMaskOfPrimitives([{ kind: "rect", x: 0, y: 0, width: 1, height: 1 }])).toBe(ALL_LEVELS_MASK);
    expect(
      levelMaskOfPrimitives([
        { kind: "circle", cx: 0, cy: 0, r: 1, levelMask: LEVEL_BIT.minimalistic },
        { kind: "circle", cx: 0, cy: 0, r: 1, levelMask: LEVEL_BIT.detailed },
      ])
    ).toBe(LEVEL_BIT.minimalistic + LEVEL_BIT.detailed);
  });

  it("unions two level masks without bitwise operators", () => {
    expect(unionLevelMasks(LEVEL_BIT.schematic, LEVEL_BIT.schematic + LEVEL_BIT.detailed)).toBe(6);
    expect(unionLevelMasks(0, LEVEL_BIT.minimalistic)).toBe(1);
    expect(unionLevelMasks(0, 0)).toBe(0);
  });
});

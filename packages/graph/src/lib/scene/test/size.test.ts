import { resolveSceneSize } from "../utils/size";

describe("resolveSceneSize", () => {
  it("keeps a plain number as world units", () => {
    expect(resolveSceneSize(4, 0.25)).toBe(4);
  });

  it("turns pixels into world units within the world clamp", () => {
    const border = { px: 3, minWorld: 3, maxWorld: 10 };
    expect(resolveSceneSize(border, 2)).toBe(3); // 1.5 → clamped up to 3
    expect(resolveSceneSize(border, 1)).toBe(3);
    expect(resolveSceneSize(border, 0.5)).toBe(6);
    expect(resolveSceneSize(border, 0.1)).toBe(10); // 30 → clamped down to 10
  });

  it("clamps a world size by pixels", () => {
    const line = { world: 2, minPx: 1, maxPx: 4 };
    expect(resolveSceneSize(line, 0.1)).toBe(10); // 0.2 px → 1 px → 10 world
    expect(resolveSceneSize(line, 1)).toBe(2);
    expect(resolveSceneSize(line, 4)).toBe(1); // 8 px → 4 px → 1 world
  });
});

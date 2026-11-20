import { LEVEL_BIT } from "../../../levels";
import type { TSceneFrame } from "../../../renderer/backendTypes";
import { SAMPLE_SPRITE, appendSprite, visibleSpriteAnimation } from "../sprites";
import type { TSprite } from "../sprites";
import { HIDDEN_ALPHA, STYLE_ROW_TEXELS } from "../tables";

describe("sprite instances", () => {
  it("passes effect parameters and only schedules frames for visible animated quads", () => {
    const input: TSprite = {
      kind: "sprite",
      image: document.createElement("img"),
      x: 4,
      y: 2,
      width: 12,
      height: 10,
      minScale: 1,
      maxScale: 2,
      levelMask: LEVEL_BIT.detailed,
    };
    const encoded: number[] = [];
    appendSprite(encoded, input, 1, 2, 3, 1);
    const params = [0.25, 1, 0.5, 0] as const;
    const animated = { ...input, params, effect: { fragment: SAMPLE_SPRITE, animated: true } };
    appendSprite(encoded, animated, 1, 3, 3, 0.5);
    expect(encoded.slice(-4)).toEqual(params);
    appendSprite(encoded, animated, 1, 4, 3, 0);
    const data = new Float32Array(encoded);
    const elements = new Float32Array([0, 0, 0, 0, 6, 8, 1, 1]);
    const styles = new Float32Array(2 * STYLE_ROW_TEXELS * 4).fill(-1);
    const frame: TSceneFrame = {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      scale: 1,
      level: "detailed",
      dpr: 2,
      time: 1,
      dimColor: "#000",
    };
    const visible = (overrides: Partial<TSceneFrame> = {}) =>
      visibleSpriteAnimation(data, 1, 1, elements, styles, { ...frame, ...overrides });

    expect(visibleSpriteAnimation(data, 0, 1, elements, styles, frame)).toBe(false);
    expect(visibleSpriteAnimation(data, 2, 1, elements, styles, frame)).toBe(false);
    expect(visible()).toBe(true);
    expect(visible({ scale: 2 })).toBe(false);
    expect(visible({ scale: 0.5 })).toBe(false);
    expect(visible({ level: "minimalistic" })).toBe(false);
    expect(visible({ x: 10 })).toBe(false);
    expect(visible({ y: -20 })).toBe(false);
    elements[6] = -1;
    expect(visible()).toBe(false);
    elements[6] = 1;
    styles[(STYLE_ROW_TEXELS + 3) * 4 + 3] = HIDDEN_ALPHA;
    expect(visible()).toBe(false);
  });
});

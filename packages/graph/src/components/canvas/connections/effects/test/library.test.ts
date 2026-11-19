import { toConnectionEffect } from "../ConnectionEffect";
import { dashFlow, pulse } from "../library";

const STROKE = { color: "#fff", width: 2 };

describe("dashFlow", () => {
  it("encodes on, off, speed and fade", () => {
    expect(dashFlow.use({ pattern: [90, 160], speed: 120, fade: true }).params).toEqual([90, 160, 120, 1]);
    expect(dashFlow.use({ pattern: [40, 10], speed: -5 }).params).toEqual([40, 10, -5, 0]);
  });

  it("uses the on length as the off length when the pattern has one number", () => {
    expect(dashFlow.use({ pattern: [30], speed: 1 }).params).toEqual([30, 30, 1, 0]);
  });

  it("falls back to a still dash", () => {
    const { params } = dashFlow.use({ pattern: [90, 160], speed: 120 });
    expect(toConnectionEffect(dashFlow).getFallbackStroke(STROKE, params ?? [])).toEqual({
      ...STROKE,
      dash: { pattern: [90, 160] },
    });
  });

  it("is animated", () => {
    expect(toConnectionEffect(dashFlow).animated).toBe(true);
  });
});

describe("pulse", () => {
  it("encodes period and wavelength", () => {
    expect(pulse.use({ period: 3, wavelength: 24000 }).params).toEqual([3, 24000]);
    expect(pulse.use({ period: 2 }).params).toEqual([2, 0]);
  });

  it("falls back to the plain stroke and is animated", () => {
    const effect = toConnectionEffect(pulse);
    expect(effect.getFallbackStroke(STROKE, [3, 0])).toBe(STROKE);
    expect(effect.animated).toBe(true);
  });
});

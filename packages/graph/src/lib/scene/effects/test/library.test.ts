import { toPathEffect } from "../PathEffect";
import { dashFlow, pathGradient } from "../library";

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
    expect(toPathEffect(dashFlow).getFallbackStroke(STROKE, params ?? [])).toEqual({
      ...STROKE,
      dash: { pattern: [90, 160] },
    });
  });

  it("is animated", () => {
    expect(toPathEffect(dashFlow).animated).toBe(true);
  });
});

describe("pathGradient", () => {
  it("encodes the RGB channels of both stops in separate shader vectors", () => {
    expect(pathGradient.use({ from: "#f80", to: "rgb(0 255 128 / 20%)" }).params).toEqual([
      1,
      136 / 255,
      0,
      0,
      0,
      1,
      128 / 255,
    ]);
  });

  it("keeps the base stroke as fallback and does not request animation frames", () => {
    const use = pathGradient.use({ from: "#000", to: "#fff" });
    const effect = toPathEffect(pathGradient);
    expect(effect.getFallbackStroke(STROKE, use.params ?? [])).toBe(STROKE);
    expect(effect.animated).toBe(false);
  });

  it("shares one program between static and moving gradients and only animates at nonzero speed", () => {
    const stops = { from: "#00f", to: "#f80" };
    const still = pathGradient.use({ ...stops, speed: 0 });
    const moving = pathGradient.clone().use({ ...stops, speed: -0.5 }, { minScale: 0.4 });
    expect(moving.params?.[3]).toBe(-0.5);
    expect(moving.minScale).toBe(0.4);
    const stillEffect = toPathEffect(still.effect);
    const movingEffect = toPathEffect(moving.effect);
    expect(stillEffect.animated).toBe(false);
    expect(movingEffect.animated).toBe(true);
    expect(movingEffect.programKey).toBe(stillEffect.programKey);
  });
});

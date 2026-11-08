import { createFragmentShader } from "../webgl/shaders";

import { toConnectionEffect } from "./ConnectionEffect";
import { dashFlow, pulse } from "./library";

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

describe("GLSL helpers", () => {
  const source = createFragmentShader();

  it("defines each helper once, after ConnectionFragment and before the effect", () => {
    for (const name of ["graph_dashPhase", "graph_comet", "graph_wave"]) {
      expect(source.match(new RegExp(`\\b\\w+ ${name}\\(`, "g"))).toHaveLength(1);
    }
    const struct = source.indexOf("struct ConnectionFragment");
    const line = source.indexOf("#line 1");
    expect(source.indexOf("float graph_dashPhase(")).toBeGreaterThan(struct);
    expect(source.indexOf("float graph_wave(")).toBeLessThan(line);
  });

  it.each(["dashFlow", "pulse"])("%s reads only the fragment, graph_ helpers and built-ins", (name) => {
    const fragment = name === "dashFlow" ? toConnectionEffect(dashFlow).fragment : toConnectionEffect(pulse).fragment;
    expect(fragment).toMatch(/vec4 effect\(ConnectionFragment f, vec4 color\)/);
    expect(fragment).not.toMatch(/\b[uvi]_\w+/);
  });

  it.each(["dashFlow", "pulse"])("%s shows the selection with f.selected and f.selectionColor", (name) => {
    const fragment = name === "dashFlow" ? toConnectionEffect(dashFlow).fragment : toConnectionEffect(pulse).fragment;
    expect(fragment).toMatch(/\bf\.selected\b/);
    expect(fragment).toMatch(/\bf\.selectionColor\b/);
  });

  it("dashFlow calls the helpers", () => {
    const { fragment } = toConnectionEffect(dashFlow);
    expect(fragment).toContain("graph_dashPhase(");
    expect(fragment).toContain("graph_comet(");
    expect(toConnectionEffect(pulse).fragment).toContain("graph_wave(");
  });
});

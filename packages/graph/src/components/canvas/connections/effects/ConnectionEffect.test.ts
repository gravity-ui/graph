import type { TWebGLStroke } from "../lines/WebGLLine";
import type { TLineStroke } from "../lines/types";

import { ConnectionEffect, defineConnectionEffect, toConnectionEffect } from "./ConnectionEffect";

const FRAGMENT = "vec4 effect(ConnectionFragment f, vec4 color) { return color; }";

describe("defineConnectionEffect", () => {
  let warn: jest.SpyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("packs a typed input with encode", () => {
    const effect = defineConnectionEffect<Record<never, never>, { hot: boolean; level: number }>({
      fragment: FRAGMENT,
      encode: ({ hot, level }) => [hot ? 1 : 0, level],
    });
    expect(effect.use({ hot: true, level: 0.5 })).toEqual({ effect, params: [1, 0.5] });
  });

  it("passes the input through without encode", () => {
    const effect = defineConnectionEffect({ fragment: FRAGMENT });
    expect(effect.use([1, 2, 3]).params).toEqual([1, 2, 3]);
  });

  it("keeps 8 parameters and warns once per effect object", () => {
    const effect = defineConnectionEffect({ fragment: FRAGMENT });
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(effect.use(many).params).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    effect.use(many);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[@gravity-ui\/graph\]/);
  });

  it("does not warn in production builds", () => {
    process.env.NODE_ENV = "production";
    const effect = defineConnectionEffect({ fragment: FRAGMENT });
    expect(effect.use(new Array(9).fill(1)).params).toHaveLength(8);
    expect(warn).not.toHaveBeenCalled();
  });

  it("clones with the same program key and separate uniform signals", () => {
    const effect = defineConnectionEffect({
      fragment: FRAGMENT,
      uniforms: { intensity: { type: "float", value: 1 }, tint: { type: "vec3", value: [1, 0, 0] } },
    });
    effect.uniforms.intensity.value = 5;
    const copy = effect.clone();
    expect(copy.uniforms.intensity.value).toBe(1);
    copy.uniforms.intensity.value = 2;
    expect(effect.uniforms.intensity.value).toBe(5);
    expect(copy).not.toBe(effect);
    expect(toConnectionEffect(copy as never).programKey).toBe(toConnectionEffect(effect as never).programKey);
  });

  it("gives different fragments and uniform sets different program keys", () => {
    const a = toConnectionEffect(defineConnectionEffect({ fragment: FRAGMENT }) as never);
    const b = toConnectionEffect(defineConnectionEffect({ fragment: `${FRAGMENT} ` }) as never);
    const c = toConnectionEffect(
      defineConnectionEffect({ fragment: FRAGMENT, uniforms: { k: { type: "float", value: 1 } } }) as never
    );
    expect(new Set([a.programKey, b.programKey, c.programKey]).size).toBe(3);
    expect(c.programKey).toContain("uniform float u_k;");
  });

  it("rejects invalid uniform names and extraWidth", () => {
    expect(() =>
      defineConnectionEffect({ fragment: FRAGMENT, uniforms: { "a-b": { type: "float", value: 1 } } })
    ).toThrow(/uniform name/);
    expect(() => defineConnectionEffect({ fragment: FRAGMENT, extraWidth: -1 })).toThrow(/extraWidth/);
    expect(() => defineConnectionEffect({ fragment: FRAGMENT, extraWidth: Infinity })).toThrow(/extraWidth/);
    expect(toConnectionEffect(defineConnectionEffect({ fragment: FRAGMENT }) as never).extraWidth).toBe(0);
  });

  it("warns once past 64 objects with one fragment", () => {
    const effect = defineConnectionEffect({ fragment: `${FRAGMENT} // many` });
    for (let i = 0; i < 70; i++) effect.clone();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("defineConnectionEffect() or clone() is called per connection");
  });

  it("returns the class instance from toConnectionEffect and rejects other objects", () => {
    const effect = defineConnectionEffect({ fragment: FRAGMENT });
    expect(toConnectionEffect(effect as never)).toBeInstanceOf(ConnectionEffect);
    expect(() => toConnectionEffect({} as never)).toThrow();
  });

  it("uses the fallback and defaults to the stroke itself", () => {
    const stroke: TLineStroke = { color: "#fff", width: 2 };
    const plain = toConnectionEffect(defineConnectionEffect({ fragment: FRAGMENT }) as never);
    expect(plain.getFallbackStroke(stroke, [])).toBe(stroke);
    const custom = toConnectionEffect(
      defineConnectionEffect({ fragment: FRAGMENT, fallback: (s, p) => ({ ...s, width: p[0] }) }) as never
    );
    expect(custom.getFallbackStroke(stroke, [7])).toEqual({ color: "#fff", width: 7 });
  });

  it("accepts the use of a typed effect in a WebGL stroke", () => {
    const effect = defineConnectionEffect<{ k: "float" }, { hot: boolean }>({
      fragment: FRAGMENT,
      uniforms: { k: { type: "float", value: 1 } },
      encode: ({ hot }) => [hot ? 1 : 0],
    });
    const stroke: TWebGLStroke = { color: "#fff", width: 2, effect: effect.use({ hot: true }) };
    expect(stroke.effect?.params).toEqual([1]);
  });
});

import type { TSceneLineStroke } from "../../../../components/canvas/connections/lines/SceneLine";
import type { TLineStroke } from "../../../../components/canvas/connections/lines/types";
import { PathEffect, toPathEffect } from "../PathEffect";
import { defineSceneEffect } from "../defineSceneEffect";

const FRAGMENT = "vec4 effect(PathFragment f, vec4 color) { return color; }";

describe("defineSceneEffect", () => {
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
    const effect = defineSceneEffect<Record<never, never>, { hot: boolean; level: number }>({
      kind: "path",
      fragment: FRAGMENT,
      encode: ({ hot, level }) => [hot ? 1 : 0, level],
    });
    expect(effect.use({ hot: true, level: 0.5 })).toEqual({ effect, params: [1, 0.5] });
  });

  it("passes the input through without encode", () => {
    const effect = defineSceneEffect({ kind: "path", fragment: FRAGMENT });
    expect(effect.use([1, 2, 3]).params).toEqual([1, 2, 3]);
  });

  it("carries optional scale bounds alongside the encoded parameters", () => {
    const effect = defineSceneEffect<Record<never, never>, number>({
      kind: "path",
      fragment: FRAGMENT,
      encode: (value) => [value * 2],
    });
    expect(effect.use(5, { minScale: 0.25, maxScale: 1 })).toEqual({
      effect,
      params: [10],
      minScale: 0.25,
      maxScale: 1,
    });
    expect(effect.use(5, { maxScale: 2 })).toEqual({ effect, params: [10], maxScale: 2 });
    expect(effect.use(5, { minScale: 2 })).toEqual({ effect, params: [10], minScale: 2 });
  });

  it.each([
    [{ minScale: -1 }, "minScale"],
    [{ minScale: NaN }, "minScale"],
    [{ maxScale: Infinity }, "maxScale"],
    [{ maxScale: 0 }, "maxScale"],
    [{ minScale: 1, maxScale: 1 }, "maxScale"],
    [{ minScale: 2, maxScale: 1 }, "maxScale"],
  ])("rejects invalid effect scale bounds %j", (range, property) => {
    const effect = defineSceneEffect({ kind: "path", fragment: FRAGMENT });
    expect(() => effect.use([], range)).toThrow(property);
  });

  it("keeps 8 parameters and warns once per effect object", () => {
    const effect = defineSceneEffect({ kind: "path", fragment: FRAGMENT });
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(effect.use(many).params).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    effect.use(many);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[@gravity-ui\/graph\]/);
  });

  it("truncates parameters without registering or warning about effect objects in production", () => {
    process.env.NODE_ENV = "production";
    const scope = globalThis as { FinalizationRegistry?: unknown };
    const original = scope.FinalizationRegistry;
    const Registry = jest.fn(() => ({ register: jest.fn() }));
    scope.FinalizationRegistry = Registry;
    try {
      jest.isolateModules(() => {
        const { defineSceneEffect: define } =
          jest.requireActual<typeof import("../defineSceneEffect")>("../defineSceneEffect");
        const effect = define({ kind: "path", fragment: FRAGMENT });
        expect(effect.clone().use(new Array(9).fill(1)).params).toHaveLength(8);
      });
      expect(Registry).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      scope.FinalizationRegistry = original;
    }
  });

  it("clones with the same program key and separate uniform signals", () => {
    const effect = defineSceneEffect({
      kind: "path",
      fragment: FRAGMENT,
      uniforms: { intensity: { type: "float", value: 1 }, tint: { type: "vec3", value: [1, 0, 0] } },
    });
    effect.uniforms.intensity.value = 5;
    const copy = effect.clone();
    expect(copy.uniforms.intensity.value).toBe(1);
    copy.uniforms.intensity.value = 2;
    expect(effect.uniforms.intensity.value).toBe(5);
    expect(copy).not.toBe(effect);
    expect(toPathEffect(copy).programKey).toBe(toPathEffect(effect).programKey);
  });

  it("gives different fragments and uniform sets different program keys", () => {
    const a = toPathEffect(defineSceneEffect({ kind: "path", fragment: FRAGMENT }));
    const b = toPathEffect(defineSceneEffect({ kind: "path", fragment: `${FRAGMENT} ` }));
    const c = toPathEffect(
      defineSceneEffect({ kind: "path", fragment: FRAGMENT, uniforms: { k: { type: "float", value: 1 } } })
    );
    expect(new Set([a.programKey, b.programKey, c.programKey]).size).toBe(3);
    expect(c.programKey).toContain("uniform float u_k;");
  });

  it("rejects invalid uniform names and extraWidth", () => {
    expect(() =>
      defineSceneEffect({ kind: "path", fragment: FRAGMENT, uniforms: { "a-b": { type: "float", value: 1 } } })
    ).toThrow(/uniform name/);
    expect(() => defineSceneEffect({ kind: "path", fragment: FRAGMENT, extraWidth: -1 })).toThrow(/extraWidth/);
    expect(() => defineSceneEffect({ kind: "path", fragment: FRAGMENT, extraWidth: Infinity })).toThrow(/extraWidth/);
    expect(toPathEffect(defineSceneEffect({ kind: "path", fragment: FRAGMENT })).extraWidth).toBe(0);
  });

  it("warns once past 64 objects with one fragment", () => {
    const effect = defineSceneEffect({ kind: "path", fragment: `${FRAGMENT} // many` });
    for (let i = 0; i < 70; i++) effect.clone();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("defineSceneEffect() or clone() is called per path");
  });

  it("still counts and warns where FinalizationRegistry is missing", () => {
    const scope = globalThis as { FinalizationRegistry?: unknown };
    const Registry = scope.FinalizationRegistry;
    delete scope.FinalizationRegistry;
    try {
      expect(scope.FinalizationRegistry).toBeUndefined();
      jest.isolateModules(() => {
        const isolated = jest.requireActual<{ defineSceneEffect: typeof defineSceneEffect }>("../defineSceneEffect");
        const effect = isolated.defineSceneEffect({ kind: "path", fragment: `${FRAGMENT} // no registry` });
        for (let i = 0; i < 70; i++) effect.clone();
      });
    } finally {
      scope.FinalizationRegistry = Registry;
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns the class instance from toPathEffect and rejects other objects", () => {
    const effect = defineSceneEffect({ kind: "path", fragment: FRAGMENT });
    expect(toPathEffect(effect)).toBeInstanceOf(PathEffect);
    expect(() => toPathEffect({} as never)).toThrow();
  });

  it("uses the fallback and defaults to the stroke itself", () => {
    const stroke: TLineStroke = { color: "#fff", width: 2 };
    const plain = toPathEffect(defineSceneEffect({ kind: "path", fragment: FRAGMENT }));
    expect(plain.getFallbackStroke(stroke, [])).toBe(stroke);
    const custom = toPathEffect(
      defineSceneEffect({ kind: "path", fragment: FRAGMENT, fallback: (s, p) => ({ ...s, width: p[0] }) })
    );
    expect(custom.getFallbackStroke(stroke, [7])).toEqual({ color: "#fff", width: 7 });
  });

  it("uses a scene path effect in a connection stroke", () => {
    const effect = defineSceneEffect({
      kind: "path",
      fragment: FRAGMENT,
      uniforms: { k: { type: "float", value: 1 } },
      encode: ({ hot }: { hot: boolean }) => [hot ? 1 : 0],
    });
    const clone = effect.clone();
    clone.uniforms.k.value = 2;
    const stroke: TSceneLineStroke = { color: "#fff", width: 2, effect: clone.use({ hot: true }, { minScale: 0.5 }) };
    expect(stroke.effect).toEqual({ effect: clone, params: [1], minScale: 0.5 });
    expect(stroke.effect?.effect.kind).toBe("path");
    expect(effect.uniforms.k.value).toBe(1);
  });

  it("rejects a scene effect kind with no renderer support", () => {
    expect(() =>
      defineSceneEffect({
        // @ts-expect-error Rectangles have no shader effect contract yet.
        kind: "rect",
        fragment: FRAGMENT,
      })
    ).toThrow("Unsupported scene effect kind");
  });
});

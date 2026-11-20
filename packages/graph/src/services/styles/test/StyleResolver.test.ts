import { effect, signal } from "@preact/signals-core";

import { defineSceneEffect } from "../../../lib/scene/effects/defineSceneEffect";
import { SceneStore } from "../../../lib/scene/store/SceneStore";
import { TagStore } from "../../tags/TagStore";
import { defineTag } from "../../tags/defineTag";
import type { TTag } from "../../tags/types";
import { SceneStyleSheet } from "../SceneStyleSheet";
import { StyleResolver } from "../StyleResolver";
import type { TStyleParts } from "../types";

class Target {
  public declare readonly __styleParts?: TStyleParts<"border">;
}
const running = defineTag("running");

function setup() {
  const store = new SceneStore();
  const sheet = new SceneStyleSheet();
  const tags = new TagStore();
  const level = signal<"minimalistic" | "schematic" | "detailed">("schematic");
  const scale = signal(0.5);
  const resolver = new StyleResolver({ store, sheet, tags, $level: level, $scale: scale });
  return { store, sheet, tags, level, scale, resolver };
}

describe("StyleResolver", () => {
  it("interns one row per signature and frees it at zero references", () => {
    const { store, resolver } = setup();
    const set = new Map([[running, true]]) as never;
    const a = resolver.acquire(Target, set);
    const b = resolver.acquire(Target, new Map([[running, true]]) as never);
    expect(a).toBe(b);
    expect(a).not.toBe(0);
    resolver.release(a);
    expect(store.getStyles()[a]).not.toEqual({});
    resolver.release(b);
    expect(store.getStyles()[a]).toEqual({});
  });

  it("keeps distinct rows for distinct targets and tag values", () => {
    const { resolver } = setup();
    class Other {}
    const status = defineTag<string>("status");
    const ok = resolver.acquire(Target, new Map([[status as TTag<unknown>, "ok"]]));
    const failed = resolver.acquire(Target, new Map([[status as TTag<unknown>, "failed"]]));
    const other = resolver.acquire(Other, new Map([[status as TTag<unknown>, "ok"]]));
    expect(new Set([ok, failed, other]).size).toBe(3);
  });

  it("rewrites live rows when rules, root tags or the level change", () => {
    const { store, sheet, level, resolver } = setup();
    sheet.add([
      { target: Target, scope: { levels: ["minimalistic"] }, style: { parts: { border: { color: "#2e7d32" } } } },
    ]);
    const id = resolver.acquire(Target, new Map() as never);
    expect(store.getStyles()[id].base).toEqual({});
    const generation = resolver.$generation.value;
    level.value = "minimalistic";
    expect(store.getStyles()[id].base).toEqual({ border: { color: "#2e7d32" } });
    expect(resolver.$generation.value).toBe(generation + 1);
  });

  it("rewrites live rows on a root tag and on a rule change", () => {
    const { store, sheet, tags, resolver } = setup();
    const focus = defineTag("focus");
    sheet.add([{ target: Target, root: [focus], style: { parts: { border: { color: "#ff0000" } } } }]);
    const id = resolver.acquire(Target, new Map() as never);
    expect(store.getStyles()[id].parts).toEqual({});
    tags.setRoot(focus, true);
    expect(store.getStyles()[id].parts).toEqual({ border: { color: "#ff0000" } });
    const remove = sheet.add([{ target: Target, tags: [], style: { parts: { border: { width: 3 } } } }]);
    expect(store.getStyles()[id].base).toEqual({ border: { width: 3 } });
    remove();
    expect(store.getStyles()[id].base).toEqual({});
  });

  it("leaves unchanged rows untouched", () => {
    const { store, sheet, resolver } = setup();
    const id = resolver.acquire(Target, new Map() as never);
    const before = store.getStyles()[id];
    sheet.add([{ target: class Unrelated {}, style: { parts: { body: { color: "#000000" } } } }]);
    expect(store.getStyles()[id]).toBe(before);
  });

  it("rewrites a live effect row when a rule changes which object's uniforms it uses", () => {
    const { store, sheet, resolver } = setup();
    const first = defineSceneEffect({
      kind: "path",
      fragment: "vec4 effect(PathFragment f, vec4 color) { return color * u_intensity; }",
      uniforms: { intensity: { type: "float", value: 1 } },
    });
    const second = first.clone();
    sheet.setThemeRules([{ target: Target, tags: [running], style: { parts: { border: { effect: first.use([]) } } } }]);
    const id = resolver.acquire(Target, new Map([[running, true]]) as never);
    const before = store.getStyles()[id];
    const unsubscribe = first.uniforms.intensity.subscribe(() => undefined);
    try {
      first.uniforms.intensity.value = 0.5;
      sheet.add([{ target: class Unrelated {}, style: {} }]);
      expect(store.getStyles()[id]).toBe(before);
      second.uniforms.intensity.value = 0.5;
      sheet.setThemeRules([
        { target: Target, tags: [running], style: { parts: { border: { effect: second.use([]) } } } },
      ]);
      expect(store.getStyles()[id].parts?.border.effect?.effect).toBe(second);
    } finally {
      unsubscribe();
      resolver.dispose();
    }
  });

  it("recomputes on a scale change only when it crosses a rule threshold", () => {
    const { sheet, scale, resolver } = setup();
    sheet.add([{ target: Target, scope: { minScale: 0.35 }, style: { parts: { border: { color: "#000000" } } } }]);
    resolver.acquire(Target, new Map() as never);
    const generation = resolver.$generation.value;
    scale.value = 0.45;
    expect(resolver.$generation.value).toBe(generation);
    scale.value = 0.3;
    expect(resolver.$generation.value).toBe(generation + 1);
  });

  it("does not make a caller's effect track the inputs it reads", () => {
    const { sheet, level, resolver } = setup();
    let runs = 0;
    const stop = effect(() => {
      runs++;
      resolver.acquire(Target, new Map() as never);
      resolver.styleFor(Target, new Map() as never);
    });
    level.value = "detailed";
    sheet.add([{ target: Target, style: {} }]);
    expect(runs).toBe(1);
    stop();
  });

  it("returns the live row's style from styleFor and computes others", () => {
    const { store, sheet, resolver } = setup();
    sheet.add([{ target: Target, tags: [running], style: { parts: { border: { color: "#2e7d32" } } } }]);
    const id = resolver.acquire(Target, new Map([[running, true]]) as never);
    expect(resolver.styleFor(Target, new Map([[running, true]]) as never)).toBe(store.getStyles()[id]);
    expect(resolver.styleFor(Target, new Map() as never)).toEqual({ base: {}, parts: {} });
  });

  it("stops recomputing after dispose", () => {
    const { level, resolver } = setup();
    resolver.acquire(Target, new Map() as never);
    const generation = resolver.$generation.value;
    resolver.dispose();
    level.value = "minimalistic";
    expect(resolver.$generation.value).toBe(generation);
  });

  it("computes the live rows at another level and scale without changing them (an export's styles)", () => {
    const { store, sheet, resolver } = setup();
    sheet.add([
      { target: Target, scope: { levels: ["minimalistic"] }, style: { parts: { border: { color: "#2e7d32" } } } },
      { target: Target, scope: { minScale: 1 }, style: { parts: { border: { width: 4 } } } },
    ]);
    const id = resolver.acquire(Target, new Map() as never);
    const live = store.getStyles()[id];
    const generation = resolver.$generation.value;
    // At the live level and scale band nothing differs; 0.6 is in the live band (below the 1 threshold).
    expect(resolver.stylesAt("schematic", 0.6).size).toBe(0);
    expect(resolver.stylesAt("minimalistic", 0.5).get(id)?.base).toEqual({ border: { color: "#2e7d32" } });
    expect(resolver.stylesAt("schematic", 2).get(id)?.base).toEqual({ border: { width: 4 } });
    expect(store.getStyles()[id]).toBe(live);
    expect(resolver.$generation.value).toBe(generation);
  });
});

import { defineTag } from "../tags/defineTag";

import { SceneStyleSheet } from "./SceneStyleSheet";
import { computeStyle } from "./computeStyle";
import type { TStyleParts } from "./types";

class Base {
  public declare readonly __styleParts?: TStyleParts<"body" | "border">;
}
class Derived extends Base {}
class Other {}

const running = defineTag("running");
const presence = defineTag<{ color: string }>("presence");
const focus = defineTag("focus");

function compute(sheet: SceneStyleSheet, target: typeof Base | typeof Other, tags: Map<unknown, unknown>, extra = {}) {
  return computeStyle({
    rules: sheet.$rules.value,
    target,
    tags: tags as never,
    root: new Set(),
    level: "schematic",
    scale: 0.5,
    ...extra,
  }).style;
}

describe("computeStyle", () => {
  it("puts tagless rules into base and tag rules into parts", () => {
    const sheet = new SceneStyleSheet();
    sheet.setThemeRules([{ target: Base, style: { parts: { body: { color: "#111111" } } } }]);
    sheet.add([{ target: Base, tags: [running], style: { parts: { border: { color: "#2e7d32" } }, raise: 1 } }]);
    expect(compute(sheet, Derived, new Map([[running, true]]))).toEqual({
      base: { body: { color: "#111111" } },
      parts: { border: { color: "#2e7d32" } },
      raise: 1,
    });
    expect(compute(sheet, Other, new Map([[running, true]]))).toEqual({ base: {}, parts: {} });
  });

  it("orders rules by priority with theme rules first at equal priority, later wins", () => {
    const sheet = new SceneStyleSheet();
    sheet.add([{ target: Base, tags: [running], priority: 5, style: { parts: { border: { color: "#000005" } } } }]);
    sheet.add([{ target: Base, tags: [running], style: { parts: { body: { color: "#000000" } } } }]);
    sheet.setThemeRules([
      { target: Base, tags: [running], priority: 100, style: { parts: { border: { width: 2, color: "#000100" } } } },
      { target: Base, tags: [running], style: { parts: { body: { color: "#ffffff", width: 1 } } } },
    ]);
    expect(compute(sheet, Base, new Map([[running, true]])).parts).toEqual({
      border: { color: "#000100", width: 2 },
      body: { color: "#000000", width: 1 },
    });
  });

  it("takes the element dim from the last matching rule that sets it and merges part dims", () => {
    const sheet = new SceneStyleSheet();
    sheet.setThemeRules([{ target: Base, style: { parts: { body: { dim: 0.1 } } } }]);
    sheet.add([
      { target: Base, tags: [running], style: { dim: 0.3, parts: { border: { dim: 0.5 } } } },
      { target: Base, tags: [running], style: { dim: 0.6, parts: { border: { color: "#000000" } } } },
      { target: Base, tags: [running], style: { parts: { border: { dim: 0.2 } } } },
      { target: Base, tags: [focus], style: { dim: 0.9 } },
    ]);
    expect(compute(sheet, Base, new Map([[running, true]]))).toEqual({
      base: { body: { dim: 0.1 } },
      parts: { border: { dim: 0.2, color: "#000000" } },
      dim: 0.6,
    });
    expect("dim" in compute(sheet, Base, new Map())).toBe(false);
  });

  it("takes the element opacity from the last matching rule that sets it and merges part opacities", () => {
    const sheet = new SceneStyleSheet();
    sheet.setThemeRules([{ target: Base, style: { parts: { body: { opacity: 0.9 } } } }]);
    sheet.add([
      { target: Base, tags: [running], style: { opacity: 0.3, parts: { border: { opacity: 0.5 } } } },
      { target: Base, tags: [running], style: { opacity: 0.6, parts: { border: { color: "#000000" } } } },
      { target: Base, tags: [running], style: { parts: { border: { opacity: 0.2 } } } },
      { target: Base, tags: [focus], style: { opacity: 0.1 } },
    ]);
    expect(compute(sheet, Base, new Map([[running, true]]))).toEqual({
      base: { body: { opacity: 0.9 } },
      parts: { border: { opacity: 0.2, color: "#000000" } },
      opacity: 0.6,
    });
    expect("opacity" in compute(sheet, Base, new Map())).toBe(false);
  });

  it("passes tag values to function styles and respects notTags, root and scope", () => {
    const sheet = new SceneStyleSheet();
    sheet.add([
      {
        target: Base,
        tags: [presence],
        style: (values) => ({ parts: { border: { color: values.get(presence)?.color } } }),
      },
      { target: Base, notTags: [running], root: [focus], style: { parts: { body: { color: "#999999" } } } },
      {
        target: Base,
        tags: [running],
        scope: { levels: ["minimalistic"] },
        style: { parts: { body: { color: "#2e7d32" } } },
      },
    ]);
    const tags = new Map<unknown, unknown>([[presence, { color: "#ff00ff" }]]);
    expect(compute(sheet, Base, tags).parts).toEqual({ border: { color: "#ff00ff" } });
    expect(compute(sheet, Base, tags, { root: new Set([focus]) }).parts).toEqual({
      border: { color: "#ff00ff" },
      body: { color: "#999999" },
    });
    const runningTags = new Map<unknown, unknown>([[running, true]]);
    expect(compute(sheet, Base, runningTags, { level: "minimalistic" }).parts).toEqual({
      body: { color: "#2e7d32" },
    });
    expect(compute(sheet, Base, runningTags).parts).toEqual({});
  });

  it("lets an undefined value from a function style set nothing", () => {
    const sheet = new SceneStyleSheet();
    sheet.add([
      { target: Base, tags: [running], style: { parts: { border: { color: "#000000", width: 2 } } } },
      {
        target: Base,
        tags: [running],
        style: (values) => ({ parts: { border: { color: values.get(presence)?.color } } }),
      },
    ]);
    expect(compute(sheet, Base, new Map([[running, true]])).parts).toEqual({
      border: { color: "#000000", width: 2 },
    });
  });

  it("applies scale ranges as [minScale, maxScale)", () => {
    const sheet = new SceneStyleSheet();
    sheet.add([
      { target: Base, scope: { minScale: 0.3, maxScale: 0.6 }, style: { parts: { body: { visible: false } } } },
    ]);
    const at = (scale: number): unknown => compute(sheet, Base, new Map(), { scale }).base;
    expect(at(0.29)).toEqual({});
    expect(at(0.3)).toEqual({ body: { visible: false } });
    expect(at(0.59)).toEqual({ body: { visible: false } });
    expect(at(0.6)).toEqual({});
  });

  it("takes raise from the last matching rule that sets it and returns the matched rules in order", () => {
    const sheet = new SceneStyleSheet();
    sheet.add([
      { target: Base, tags: [running], style: { raise: 3 } },
      { target: Base, tags: [running], style: { parts: { border: { color: "#000000" } } } },
      { target: Base, tags: [focus], style: { raise: 9 } },
    ]);
    const result = computeStyle({
      rules: sheet.$rules.value,
      target: Base,
      tags: new Map([[running, true]]),
      root: new Set(),
      level: "schematic",
      scale: 1,
    });
    expect(result.style.raise).toBe(3);
    expect(result.matched.map((ordered) => ordered.seq)).toEqual([1, 2]);
    expect(Object.isFrozen(result.style)).toBe(true);
  });
});

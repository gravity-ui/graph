import { defineTag } from "../../tags/defineTag";
import { SceneStyleSheet } from "../SceneStyleSheet";
import type { TStyleParts } from "../types";

class Target {
  public declare readonly __styleParts?: TStyleParts<"body">;
}
const running = defineTag("running");

describe("SceneStyleSheet", () => {
  it("orders all rules by priority; at equal priority theme rules come first, then registration order", () => {
    const sheet = new SceneStyleSheet();
    const low = { target: Target, priority: -1, style: {} };
    const high = { target: Target, priority: 2, style: {} };
    const plain = { target: Target, style: {} };
    const later = { target: Target, style: {} };
    sheet.add([high, plain]);
    sheet.add([low, later]);
    const themeHigh = { target: Target, priority: 50, style: {} };
    const themePlain = { target: Target, style: {} };
    sheet.setThemeRules([themeHigh, themePlain]);
    expect(sheet.$rules.value.map((ordered) => ordered.rule)).toEqual([low, themePlain, plain, later, high, themeHigh]);
    expect(sheet.$rules.value.map((ordered) => ordered.theme)).toEqual([false, true, false, false, false, true]);
  });

  it("removes the added rules with the returned function, once", () => {
    const sheet = new SceneStyleSheet();
    const first = { target: Target, tags: [running], style: {} };
    const second = { target: Target, style: {} };
    const removeFirst = sheet.add([first]);
    sheet.add([second]);
    removeFirst();
    removeFirst();
    expect(sheet.$rules.value.map((ordered) => ordered.rule)).toEqual([second]);
  });

  it("replaces theme rules as a whole", () => {
    const sheet = new SceneStyleSheet();
    sheet.setThemeRules([{ target: Target, style: {} }]);
    const next = { target: Target, style: {} };
    sheet.setThemeRules([next]);
    expect(sheet.$rules.value.map((ordered) => ordered.rule)).toEqual([next]);
  });

  it("collects sorted distinct scale thresholds", () => {
    const sheet = new SceneStyleSheet();
    expect(sheet.$thresholds.value).toEqual([]);
    sheet.add([
      { target: Target, scope: { minScale: 0.5 }, style: {} },
      { target: Target, scope: { minScale: 0.2, maxScale: 0.5 }, style: {} },
    ]);
    sheet.setThemeRules([{ target: Target, scope: { maxScale: 0.1, levels: ["detailed"] }, style: {} }]);
    expect(sheet.$thresholds.value).toEqual([0.1, 0.2, 0.5]);
  });
});

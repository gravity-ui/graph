import type { TScenePartStyle, TSceneStyle } from "../../lib/scene/types";
import type { TSceneLevel } from "../scene/types";
import type { TTag, TTagSet } from "../tags/types";

import type { TOrderedRule } from "./SceneStyleSheet";
import type { TStyleRule, TStyleTarget, TTagValues } from "./types";

export type TComputedStyle = { style: TSceneStyle; matched: readonly TOrderedRule[] };

/** A rule with `tags`, `notTags` or `root` is a state rule (writes `parts`); any other is a base rule (`base`). */
export function isStateRule(rule: TStyleRule): boolean {
  return Boolean(rule.tags?.length || rule.notTags?.length || rule.root?.length);
}

function targets(rule: TStyleRule, target: TStyleTarget): boolean {
  return rule.target === target || Object.prototype.isPrototypeOf.call(rule.target.prototype, target.prototype);
}

function inScope(rule: TStyleRule, level: TSceneLevel, scale: number): boolean {
  const scope = rule.scope;
  if (!scope) return true;
  if (scope.levels && !scope.levels.includes(level)) return false;
  if (scope.minScale !== undefined && scale < scope.minScale) return false;
  if (scope.maxScale !== undefined && scale >= scope.maxScale) return false;
  return true;
}

/** Later values win per property; an undefined value (a function style without a tag value) sets nothing. */
function mergePart(into: TScenePartStyle | undefined, value: TScenePartStyle): TScenePartStyle {
  const result: Record<string, unknown> = { ...into };
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as TScenePartStyle;
}

/** The element-level values of a rule style: the last matching rule that sets one wins, whatever its layer. */
const ELEMENT_KEYS = ["raise", "dim", "opacity"] as const;

type TElementValues = { [K in (typeof ELEMENT_KEYS)[number]]?: number };

function freezeParts(parts: Record<string, TScenePartStyle>): Readonly<Record<string, Readonly<TScenePartStyle>>> {
  for (const value of Object.values(parts)) Object.freeze(value);
  return Object.freeze(parts);
}

/**
 * The style of an entity: the matching rules applied in order, values merged per property (later wins). Base rules
 * write `base`, state rules write `parts`; `raise`, the element's `dim` and the element's `opacity` come from the last
 * matching rule that sets them.
 */
export function computeStyle(input: {
  rules: readonly TOrderedRule[];
  target: TStyleTarget;
  tags: TTagSet;
  root: ReadonlySet<TTag<true>>;
  level: TSceneLevel;
  scale: number;
}): TComputedStyle {
  const { tags, root } = input;
  const values: TTagValues = { get: <V>(tag: TTag<V>): V | undefined => tags.get(tag) as V | undefined };
  const base: Record<string, TScenePartStyle> = {};
  const parts: Record<string, TScenePartStyle> = {};
  const element: TElementValues = {};
  const matched: TOrderedRule[] = [];
  for (const ordered of input.rules) {
    const rule = ordered.rule;
    if (!targets(rule, input.target)) continue;
    if (rule.tags && !rule.tags.every((tag) => tags.has(tag))) continue;
    if (rule.notTags && rule.notTags.some((tag) => tags.has(tag))) continue;
    if (rule.root && !rule.root.every((tag) => root.has(tag))) continue;
    if (!inScope(rule, input.level, input.scale)) continue;
    matched.push(ordered);
    const style = typeof rule.style === "function" ? rule.style(values) : rule.style;
    const into = isStateRule(rule) ? parts : base;
    for (const [part, value] of Object.entries(style.parts ?? {}) as [string, TScenePartStyle | undefined][]) {
      if (value) into[part] = mergePart(into[part], value);
    }
    for (const key of ELEMENT_KEYS) {
      const value = style[key];
      if (value !== undefined) element[key] = value;
    }
  }
  // Computed styles are frozen (spec §7.5): renderers and React may keep references to them.
  const style: TSceneStyle = Object.freeze({ base: freezeParts(base), parts: freezeParts(parts), ...element });
  return { style, matched };
}

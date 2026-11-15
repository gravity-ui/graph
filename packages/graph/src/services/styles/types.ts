import type { TScenePartStyle, TSceneStyle } from "../../lib/scene/types";
import type { TSceneLevel } from "../scene/types";
import type { TTag } from "../tags/types";

/** A component class that rules target; matched with instanceof semantics on classes. */
export type TStyleTarget = abstract new (...args: never[]) => object;

/**
 * The type brand of a class's style parts: `public declare readonly __styleParts?: TStyleParts<"body" | "border">`.
 * It is method-typed, so it is bivariant: a subclass can redeclare it with more parts
 * (`TStyleParts<"body" | "border" | "badge">`), and a subclass that does not redeclare it inherits the base's parts.
 */
export type TStyleParts<P extends string> = { bivarianceHack(part: P): void }["bivarianceHack"];

/** Part names a class declares with a `__styleParts?: TStyleParts<...>` brand; any string otherwise. */
export type TPartsOf<C extends TStyleTarget> =
  InstanceType<C> extends { readonly __styleParts?: TStyleParts<infer P> } ? (P extends string ? P : string) : string;

export type TRuleStyle<C extends TStyleTarget> = {
  parts?: Partial<Record<TPartsOf<C>, TScenePartStyle>>;
  /** Added to the element's zIndex bucket while the rule applies. */
  raise?: number;
  /**
   * In [0, 1]: moves the element's paints towards the scene's dim colour (the theme's layer background) without
   * touching their colours otherwise; a part's own `dim` wins over it. The last matching rule that sets it wins.
   */
  dim?: number;
  /**
   * In [0, 1]: multiplies the alpha of every paint of the element's primitives, so what lies under them shows through;
   * a part's own `opacity` multiplies it again. The last matching rule that sets it wins. Each primitive fades on its
   * own (not CSS group opacity), and a faded primitive is drawn in the translucent pass.
   */
  opacity?: number;
};

/** The tag values of the entity a function style is computed for. */
export interface TTagValues {
  get<V>(tag: TTag<V>): V | undefined;
}

/** Where a rule applies, like a media query: scene levels and raw scale ranges [minScale, maxScale). */
export type TStyleScope = { levels?: readonly TSceneLevel[]; minScale?: number; maxScale?: number };

export type TStyleRule<C extends TStyleTarget = TStyleTarget> = {
  target: C;
  /** All of these tags are on the entity. */
  tags?: readonly TTag<unknown>[];
  /** None of these tags is on the entity. */
  notTags?: readonly TTag<unknown>[];
  /** Graph-wide tags that must be on. */
  root?: readonly TTag<true>[];
  scope?: TStyleScope;
  /**
   * Higher applies later and wins, over theme and user rules alike; at equal priority theme rules come first, then
   * registration order. Default 0.
   */
  priority?: number;
  style: TRuleStyle<C> | ((values: TTagValues) => TRuleStyle<C>);
};

export type TStyleExplanation = {
  tags: readonly { name: string; value: unknown }[];
  root: readonly string[];
  /** The class the entity's element is styled as, when an element is bound to it. */
  target?: string;
  /** Matched rules in application order. */
  rules: readonly { theme: boolean; priority: number; layer: "base" | "state"; tags: readonly string[] }[];
  style?: TSceneStyle;
  /**
   * Present while the graph setting `cameraAwareText` is off: every scene text is world-sized, whatever `style` says
   * about `cameraAware`.
   */
  cameraAwareText?: "forced-off";
  /**
   * The parts whose `cameraAware: true` in `style` is not applied to a text of the element: a heightless text that does
   * not declare `cameraAware` itself keeps its world size (give it a `height`, or declare `cameraAware` on the
   * primitive).
   */
  cameraAwareNotApplied?: readonly string[];
};

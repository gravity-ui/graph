import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { TStyleRule, TStyleTarget } from "./types";

/** A rule with its place in the cascade. */
export type TOrderedRule = {
  readonly rule: TStyleRule;
  readonly theme: boolean;
  readonly priority: number;
  /** Registration order within its list (theme or user). */
  readonly seq: number;
};

/** Priority ascending; at equal priority theme rules before user rules; then registration order. */
function byCascade(a: TOrderedRule, b: TOrderedRule): number {
  return a.priority - b.priority || Number(b.theme) - Number(a.theme) || a.seq - b.seq;
}

/**
 * The graph's style rules (`graph.scene.styles`). All rules apply in one order: by priority (ascending, so a higher
 * priority applies later and wins), at equal priority theme rules before user rules, then registration order. A user
 * rule with `priority: -1` therefore applies before the theme's rules of the default priority 0.
 */
export class SceneStyleSheet {
  /** Theme and user rules sorted by (priority, theme first, registration order). */
  public readonly $rules: ReadonlySignal<readonly TOrderedRule[]>;

  /** Sorted distinct `minScale` / `maxScale` values of all rules: crossing one can change a computed style. */
  public readonly $thresholds: ReadonlySignal<readonly number[]>;

  private readonly themeRules = signal<readonly TOrderedRule[]>([]);

  private readonly userRules = signal<readonly TOrderedRule[]>([]);

  private seq = 0;

  constructor() {
    this.$rules = computed(() => Object.freeze([...this.themeRules.value, ...this.userRules.value].sort(byCascade)));
    this.$thresholds = computed(() => {
      const values = new Set<number>();
      for (const { rule } of this.$rules.value) {
        if (rule.scope?.minScale !== undefined) values.add(rule.scope.minScale);
        if (rule.scope?.maxScale !== undefined) values.add(rule.scope.maxScale);
      }
      return Object.freeze([...values].sort((a, b) => a - b));
    });
  }

  /**
   * Adds user rules; each rule's `style.parts` is checked against its own target's part names. Returns a function
   * that removes these rules.
   */
  public add<const T extends readonly TStyleTarget[]>(rules: {
    readonly [K in keyof T]: TStyleRule<T[K]>;
  }): () => void {
    const added = (rules as readonly TStyleRule[]).map(
      (rule): TOrderedRule => Object.freeze({ rule, theme: false, priority: rule.priority ?? 0, seq: ++this.seq })
    );
    if (added.length === 0) return () => undefined;
    this.userRules.value = [...this.userRules.peek(), ...added];
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const drop = new Set(added);
      this.userRules.value = this.userRules.peek().filter((ordered) => !drop.has(ordered));
    };
  }

  /** @internal The graph's theme rules; replaced as a whole on a colour change. */
  public setThemeRules(rules: readonly TStyleRule[]): void {
    this.themeRules.value = rules.map(
      (rule, index): TOrderedRule => Object.freeze({ rule, theme: true, priority: rule.priority ?? 0, seq: index + 1 })
    );
  }
}

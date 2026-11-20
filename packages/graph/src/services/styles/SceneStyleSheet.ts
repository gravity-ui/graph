import { computed, signal } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { TSceneStyles, TStyleRule, TStyleTarget } from "./types";

type TComponentTarget = TStyleTarget & { getSceneStyles?: () => TSceneStyles };

/** A rule with its place in the cascade. */
export type TOrderedRule = {
  readonly rule: TStyleRule;
  readonly theme: boolean;
  readonly component?: true;
  readonly priority: number;
  /** Declaration order within its source. */
  readonly seq: number;
};

const NO_COMPONENT_RULES: readonly TOrderedRule[] = [];

function byCascade(a: TOrderedRule, b: TOrderedRule): number {
  return (
    a.priority - b.priority ||
    Number(b.theme) - Number(a.theme) ||
    Number(b.component === true) - Number(a.component === true) ||
    a.seq - b.seq
  );
}

/**
 * The graph's style rules (`graph.scene.styles`). All rules apply in one order: by priority (ascending, so a higher
 * priority applies later and wins), at equal priority theme, component and user rules, in that order. A user
 * rule with `priority: -1` therefore applies before the theme's rules of the default priority 0.
 */
export class SceneStyleSheet {
  /** Rules sorted by priority, source and declaration order. */
  public readonly $rules: ReadonlySignal<readonly TOrderedRule[]>;

  /** Sorted distinct `minScale` / `maxScale` values of all rules: crossing one can change a computed style. */
  public readonly $thresholds: ReadonlySignal<readonly number[]>;

  private readonly themeRules = signal<readonly TOrderedRule[]>([]);

  private readonly componentRules = signal<readonly TOrderedRule[]>(NO_COMPONENT_RULES);

  private readonly userRules = signal<readonly TOrderedRule[]>([]);

  private readonly rulesByClass = new WeakMap<TStyleTarget, readonly TOrderedRule[]>();
  private configuredClasses = new Set<TStyleTarget>();
  private readonly usedClasses = new Map<TStyleTarget, number>();
  private seq = 0;

  constructor() {
    this.$rules = computed(() =>
      Object.freeze([...this.themeRules.value, ...this.componentRules.value, ...this.userRules.value].sort(byCascade))
    );
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

  /** @internal Classes from the graph's current component settings, including classes with no elements yet. */
  public setConfiguredClasses(targets: readonly (TStyleTarget | undefined)[]): void {
    const configured = new Set<TStyleTarget>();
    for (const target of targets) {
      if (target && this.rulesForClass(target).length > 0) configured.add(target);
    }
    this.configuredClasses = configured;
    this.refreshComponentRules();
  }

  /** @internal Keep the declarations of a class while any computed row uses it. */
  public retainClass(target: TStyleTarget): void {
    if (this.rulesForClass(target).length === 0) return;
    const count = this.usedClasses.get(target) ?? 0;
    this.usedClasses.set(target, count + 1);
    if (count === 0 && !this.configuredClasses.has(target)) this.refreshComponentRules();
  }

  /** @internal Release a class's use by one computed row. */
  public releaseClass(target: TStyleTarget): void {
    const count = this.usedClasses.get(target);
    if (count === undefined) return;
    if (count > 1) {
      this.usedClasses.set(target, count - 1);
    } else {
      this.usedClasses.delete(target);
      if (!this.configuredClasses.has(target)) this.refreshComponentRules();
    }
  }

  private rulesForClass(target: TComponentTarget): readonly TOrderedRule[] {
    if (typeof target.getSceneStyles !== "function") return NO_COMPONENT_RULES;
    const cached = this.rulesByClass.get(target);
    if (cached) return cached;
    // Give ancestors their order before adding rules of the derived class. An inherited method belongs to its owner.
    const inherited = this.rulesForClass(Object.getPrototypeOf(target) as TComponentTarget);
    const own = Object.prototype.hasOwnProperty.call(target, "getSceneStyles")
      ? target.getSceneStyles().map(
          (rule): TOrderedRule =>
            Object.freeze({
              rule: { ...rule, target },
              theme: false,
              component: true,
              priority: rule.priority ?? 0,
              seq: ++this.seq,
            })
        )
      : NO_COMPONENT_RULES;
    const combined = own.length > 0 ? [...inherited, ...own] : inherited;
    this.rulesByClass.set(target, combined);
    return combined;
  }

  private refreshComponentRules(): void {
    const rules = new Set<TOrderedRule>();
    for (const target of this.configuredClasses) {
      for (const rule of this.rulesForClass(target)) rules.add(rule);
    }
    for (const target of this.usedClasses.keys()) {
      for (const rule of this.rulesForClass(target)) rules.add(rule);
    }
    const previous = this.componentRules.peek();
    if (previous.length !== rules.size || !previous.every((rule) => rules.has(rule))) {
      this.componentRules.value = [...rules];
    }
  }
}

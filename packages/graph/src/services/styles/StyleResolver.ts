import { computed, effect, signal, untracked } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { SceneStore } from "../../lib/scene/SceneStore";
import { styleLookKey } from "../../lib/scene/style";
import type { TSceneStyle } from "../../lib/scene/types";
import type { TSceneLevel } from "../scene/types";
import type { TagStore } from "../tags/TagStore";
import type { TTagSet } from "../tags/types";

import type { SceneStyleSheet } from "./SceneStyleSheet";
import { computeStyle } from "./computeStyle";
import type { TStyleTarget } from "./types";

type TRow = {
  readonly signature: string;
  readonly target: TStyleTarget;
  readonly tags: TTagSet;
  readonly styleId: number;
  refs: number;
  style: TSceneStyle;
  /** A key for the contents of the style row, compared on a recompute. */
  lookKey: string;
};

export type TStyleResolverDeps = {
  store: SceneStore;
  sheet: SceneStyleSheet;
  tags: TagStore;
  $level: ReadonlySignal<TSceneLevel>;
  $scale: ReadonlySignal<number>;
};

/**
 * Computed styles as rows of the scene store's style table. A row is interned per signature (target class and the
 * entity's tags with their values) and counted by reference. When a global input changes (rules, root tags, the scene
 * level or the scale band), every live row is recomputed and the changed ones are rewritten in one call.
 */
export class StyleResolver {
  /** Increments on each change of rules, root tags, level or scale band, including equivalent levels. */
  public readonly $generation: ReadonlySignal<number>;

  /** Changes when rules can match differently, including for a target without a live style row. */
  public readonly $cascadeGeneration: ReadonlySignal<number>;

  private readonly generation = signal(0);

  private readonly cascadeGeneration = signal(0);

  private readonly rows = new Map<string, TRow>();

  private readonly rowsById = new Map<number, TRow>();

  private readonly targetIds = new WeakMap<TStyleTarget, number>();

  private nextTargetId = 1;

  /** The number of rule thresholds at or below the camera scale; a zoom that crosses none keeps it. */
  private readonly $band: ReadonlySignal<number>;

  private readonly stop: () => void;

  constructor(private readonly deps: TStyleResolverDeps) {
    this.$generation = this.generation;
    this.$cascadeGeneration = this.cascadeGeneration;
    this.$band = computed(() => this.bandOf(deps.$scale.value, deps.sheet.$thresholds.value));
    const globals = computed(() => ({
      rules: deps.sheet.$rules.value,
      root: deps.tags.$root.value,
      band: this.$band.value,
    }));
    let previousGlobals: ReturnType<typeof globals.peek> | undefined;
    let previousLevel: TSceneLevel | undefined;
    this.stop = effect(() => {
      const current = globals.value;
      const level = deps.$level.value;
      const from = previousLevel;
      if (from !== undefined) {
        // Levels affect rules only through scope.levels. Keep a shared row and its observers asleep
        // when every rule covers both levels equally, even if the public level itself changed.
        if (
          current !== previousGlobals ||
          current.rules.some(({ rule }) => rule.scope?.levels?.includes(from) !== rule.scope?.levels?.includes(level))
        ) {
          untracked(() => this.recompute());
          this.cascadeGeneration.value = this.cascadeGeneration.peek() + 1;
        }
        this.generation.value = this.generation.peek() + 1;
      }
      previousGlobals = current;
      previousLevel = level;
    });
  }

  /** The row id of the style for a target and tags; interns the row on the first reference. Reads no signal. */
  public acquire(target: TStyleTarget, tags: TTagSet): number {
    const signature = this.signatureOf(target, tags);
    let row = this.rows.get(signature);
    if (!row) {
      const own = new Map(tags);
      const style = this.compute(target, own);
      const styleId = this.deps.store.defineStyle(style);
      row = { signature, target, tags: own, styleId, refs: 0, style, lookKey: styleLookKey(style) };
      this.rows.set(signature, row);
      this.rowsById.set(row.styleId, row);
    }
    row.refs++;
    return row.styleId;
  }

  /** Drops one reference; the row is freed at zero. */
  public release(styleId: number): void {
    const row = this.rowsById.get(styleId);
    if (!row) return;
    row.refs--;
    if (row.refs > 0) return;
    this.rows.delete(row.signature);
    this.rowsById.delete(styleId);
    this.deps.store.freeStyle(styleId);
  }

  /** The computed style for a target and tags: the live row's style when one exists. Reads no signal. */
  public styleFor(target: TStyleTarget, tags: TTagSet): TSceneStyle {
    return this.rows.get(this.signatureOf(target, tags))?.style ?? this.compute(target, tags);
  }

  /**
   * The live rows as they compute at another level and scale, for an export that draws there (`toImage`): by row id,
   * only the rows whose style differs from the live one. Empty at the live level and scale band. Reads no signal.
   */
  public stylesAt(level: TSceneLevel, scale: number): ReadonlyMap<number, TSceneStyle> {
    const rows = new Map<number, TSceneStyle>();
    const band = this.bandOf(scale, this.deps.sheet.$thresholds.peek());
    if (level === this.deps.$level.peek() && band === this.$band.peek()) return rows;
    for (const row of this.rows.values()) {
      const style = this.compute(row.target, row.tags, level, scale);
      if (styleLookKey(style) !== row.lookKey) rows.set(row.styleId, style);
    }
    return rows;
  }

  public dispose(): void {
    this.stop();
  }

  /** The number of rule thresholds at or below a scale; a zoom that crosses none keeps it. */
  private bandOf(scale: number, thresholds: Iterable<number>): number {
    let band = 0;
    for (const threshold of thresholds) {
      if (threshold > scale) break;
      band++;
    }
    return band;
  }

  private compute(
    target: TStyleTarget,
    tags: TTagSet,
    level: TSceneLevel = this.deps.$level.peek(),
    scale: number = this.deps.$scale.peek()
  ): TSceneStyle {
    return computeStyle({
      rules: this.deps.sheet.$rules.peek(),
      target,
      tags,
      root: this.deps.tags.$root.peek(),
      level,
      scale,
    }).style;
  }

  private recompute(): void {
    const changed = new Map<number, TSceneStyle>();
    for (const row of this.rows.values()) {
      const style = this.compute(row.target, row.tags);
      const lookKey = styleLookKey(style);
      if (lookKey === row.lookKey) continue;
      row.style = style;
      row.lookKey = lookKey;
      changed.set(row.styleId, style);
    }
    if (changed.size > 0) this.deps.store.replaceStyles(changed);
  }

  /** `${targetId}|${tag.id}=${JSON(value)},...` with tags sorted by id. */
  private signatureOf(target: TStyleTarget, tags: TTagSet): string {
    let targetId = this.targetIds.get(target);
    if (targetId === undefined) {
      targetId = this.nextTargetId++;
      this.targetIds.set(target, targetId);
    }
    const entries = [...tags]
      .sort(([a], [b]) => a.id - b.id)
      .map(([tag, value]) => `${tag.id}=${JSON.stringify(value)}`);
    return `${targetId}|${entries.join(",")}`;
  }
}

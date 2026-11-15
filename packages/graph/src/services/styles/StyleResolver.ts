import { computed, effect, signal, untracked } from "@preact/signals-core";
import type { ReadonlySignal } from "@preact/signals-core";

import type { SceneStore } from "../../lib/scene/SceneStore";
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
  /** JSON of `style`, compared on a recompute. */
  json: string;
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
  /** Increments after every recompute of the live rows: a change of rules, root tags, level or scale band. */
  public readonly $generation: ReadonlySignal<number>;

  private readonly generation = signal(0);

  private readonly rows = new Map<string, TRow>();

  private readonly rowsById = new Map<number, TRow>();

  private readonly targetIds = new WeakMap<TStyleTarget, number>();

  private nextTargetId = 1;

  /** The number of rule thresholds at or below the camera scale; a zoom that crosses none keeps it. */
  private readonly $band: ReadonlySignal<number>;

  private readonly stop: () => void;

  constructor(private readonly deps: TStyleResolverDeps) {
    this.$generation = this.generation;
    this.$band = computed(() => this.bandOf(deps.$scale.value, deps.sheet.$thresholds.value));
    let previous: readonly unknown[] | undefined;
    this.stop = effect(() => {
      // Every global input of a computed style; the effect re-runs when one of them changes.
      const inputs = [deps.sheet.$rules.value, deps.tags.$root.value, deps.$level.value, this.$band.value];
      if (previous !== undefined) untracked(() => this.recompute());
      previous = inputs;
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
      row = { signature, target, tags: own, styleId, refs: 0, style, json: JSON.stringify(style) };
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
      if (JSON.stringify(style) !== row.json) rows.set(row.styleId, style);
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
      const json = JSON.stringify(style);
      if (json === row.json) continue;
      row.style = style;
      row.json = json;
      changed.set(row.styleId, style);
    }
    if (changed.size > 0) this.deps.store.replaceStyles(changed);
    this.generation.value = this.generation.peek() + 1;
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

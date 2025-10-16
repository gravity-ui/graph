import { signal } from "@preact/signals-core";

import { Graph } from "../../graph";

import type { THighlightTargets } from "./types";

/**
 * Highlight/Focus visualization states for graph entities.
 * - Highlight: emphasized target
 * - Lowlight: dimmed non-target (only in focus mode)
 */
export enum HighlightVisualMode {
  Highlight = 20,
  Lowlight = 10,
}

/** Allowed service modes. */
export type THighlightServiceMode = "highlight" | "focus";

type TInternalHighlightState = {
  active: boolean;
  mode?: THighlightServiceMode;
  entities: Set<string>;
};

/**
 * HighlightService
 *
 * Centralized service to manage graph-wide highlight/focus state.
 *
 * Responsibilities:
 * - Store current highlight mode and targeted entities
 * - Compute visual mode for any entity id
 * - Emit "highlight-changed" graph event on state updates
 *
 * Notes:
 * - Supports extensible prefixes (e.g., block:, connection:, anchor:, plugin:, myApp:)
 * - In highlight mode: only targets are highlighted, others unchanged
 * - In focus mode: targets highlighted, all non-targets lowlighted
 */
export class HighlightService {
  public readonly $state = signal<TInternalHighlightState>({ active: false, mode: undefined, entities: new Set() });

  constructor(private graph: Graph) {
    // noop
  }

  /**
   * Enables highlight mode for specified targets. Non-target entities remain unchanged.
   * @param targets Map of prefixes to arrays of entity ids (composed as `${prefix}:${id}` if needed)
   */
  public highlight(targets: THighlightTargets): void {
    const entities = this.normalizeTargets(targets);
    const previous = this.$state.value;
    this.$state.value = { active: entities.size > 0, mode: "highlight", entities };
    this.graph.emit("highlight-changed", {
      mode: "highlight",
      entities: Array.from(entities),
      previous: previous.active ? { mode: previous.mode, entities: Array.from(previous.entities) } : undefined,
    });
  }

  /**
   * Enables focus mode for specified targets. Targets highlighted, others lowlighted.
   * @param targets Map of prefixes to arrays of entity ids (composed as `${prefix}:${id}` if needed)
   */
  public focus(targets: THighlightTargets): void {
    const entities = this.normalizeTargets(targets);
    const previous = this.$state.value;
    this.$state.value = { active: entities.size > 0, mode: "focus", entities };
    this.graph.emit("highlight-changed", {
      mode: "focus",
      entities: Array.from(entities),
      previous: previous.active ? { mode: previous.mode, entities: Array.from(previous.entities) } : undefined,
    });
  }

  /** Clears any highlight/focus state and emits event. */
  public clear(): void {
    const previous = this.$state.value;
    this.$state.value = { active: false, mode: undefined, entities: new Set() };
    this.graph.emit("highlight-changed", {
      mode: undefined,
      entities: [],
      previous: previous.active ? { mode: previous.mode, entities: Array.from(previous.entities) } : undefined,
    });
  }

  /**
   * Returns visual mode for a given entity id according to current service state.
   * @param entityId Fully composed id including prefix (e.g., `block:42`)
   */
  public getEntityHighlightMode(entityId: string): HighlightVisualMode | undefined {
    const state = this.$state.value;
    if (!state.active) return undefined;

    const isTargeted = state.entities.has(entityId);

    if (state.mode === "highlight") {
      return isTargeted ? HighlightVisualMode.Highlight : undefined;
    }
    // focus mode
    return isTargeted ? HighlightVisualMode.Highlight : HighlightVisualMode.Lowlight;
  }

  /** Normalizes targets to composed ids; avoids duplicating prefix if id already starts with it. */
  private normalizeTargets(targets: THighlightTargets): Set<string> {
    const result = new Set<string>();
    for (const [prefix, ids] of Object.entries(targets)) {
      if (!ids || !Array.isArray(ids)) continue;
      for (const id of ids) {
        // Convert to string and add prefix only if id doesn't already start with "prefix:"
        const idStr = String(id);
        const composed = idStr.startsWith(`${prefix}:`) ? idStr : `${prefix}:${idStr}`;
        result.add(composed);
      }
    }
    return result;
  }
}

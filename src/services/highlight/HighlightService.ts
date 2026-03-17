import { signal } from "@preact/signals-core";

import type { Graph } from "../../graph";
import type { TSelectionEntityId } from "../selection/types";

import {
  HighlightVisualMode,
  THighlightChangedEvent,
  THighlightSelection,
  THighlightServiceMode,
  THighlightServiceState,
  THighlightableEntity,
} from "./types";

function cloneSelection(selection: THighlightSelection): THighlightSelection {
  const result: THighlightSelection = {};

  for (const [entityType, ids] of Object.entries(selection)) {
    result[entityType] = Array.from(new Set(ids));
  }

  return result;
}

export class HighlightService {
  public $state = signal<THighlightServiceState>({
    active: false,
    mode: undefined,
    selection: {},
  });

  private components = new Set<THighlightableEntity>();

  constructor(private graph: Graph) {}

  public registerComponent(component: THighlightableEntity): void {
    this.components.add(component);
    const mode = this.resolveModeForState(component.getEntityType(), component.getEntityId(), this.$state.value);
    component.setHighlight(mode);
  }

  public unregisterComponent(component: THighlightableEntity): void {
    this.components.delete(component);
  }

  public highlight(selection: THighlightSelection): void {
    this.applyMode("highlight", selection);
  }

  public focus(selection: THighlightSelection): void {
    this.applyMode("focus", selection);
  }

  public clearHighlight(): void {
    const previous = this.$state.value;
    const next: THighlightServiceState = {
      active: false,
      mode: undefined,
      selection: {},
    };
    const payload: THighlightChangedEvent = {
      mode: undefined,
      selection: {},
      previous,
    };

    this.graph.executеDefaultEventAction("highlight-changed", payload, () => {
      this.$state.value = next;
      this.applyDiff(previous, next);
    });
  }

  public getEntityHighlightMode(entityType: string, entityId: TSelectionEntityId): HighlightVisualMode | undefined {
    return this.resolveModeForState(entityType, entityId, this.$state.value);
  }

  public reset(): void {
    const previous = this.$state.value;
    const next: THighlightServiceState = {
      active: false,
      mode: undefined,
      selection: {},
    };
    this.$state.value = next;
    this.applyDiff(previous, next);
  }

  private applyMode(mode: THighlightServiceMode, selection: THighlightSelection): void {
    const normalizedSelection = cloneSelection(selection);
    const previous = this.$state.value;
    const next: THighlightServiceState = {
      active: true,
      mode,
      selection: normalizedSelection,
    };

    const payload: THighlightChangedEvent = {
      mode,
      selection: normalizedSelection,
      previous,
    };

    this.graph.executеDefaultEventAction("highlight-changed", payload, () => {
      this.$state.value = next;
      this.applyDiff(previous, next);
    });
  }

  private applyDiff(previous: THighlightServiceState, next: THighlightServiceState): void {
    for (const component of this.components) {
      const entityType = component.getEntityType();
      const entityId = component.getEntityId();

      const prevMode = this.resolveModeForState(entityType, entityId, previous);
      const nextMode = this.resolveModeForState(entityType, entityId, next);

      if (prevMode !== nextMode) {
        component.setHighlight(nextMode);
      }
    }
  }

  private resolveModeForState(
    entityType: string,
    entityId: TSelectionEntityId,
    state: THighlightServiceState
  ): HighlightVisualMode | undefined {
    if (!state.active || !state.mode) {
      return undefined;
    }

    const isTargeted = Boolean(state.selection[entityType]?.includes(entityId));
    if (isTargeted) {
      return HighlightVisualMode.Highlight;
    }

    if (state.mode === "focus") {
      return HighlightVisualMode.Lowlight;
    }

    return undefined;
  }
}

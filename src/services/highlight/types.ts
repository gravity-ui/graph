import type { TSelectionEntityId } from "../selection/types";

export enum HighlightVisualMode {
  Lowlight = 10,
  Highlight = 20,
}

export type THighlightServiceMode = "highlight" | "focus";

export type THighlightSelection = Record<string, TSelectionEntityId[]>;

export type THighlightServiceState = {
  active: boolean;
  mode: THighlightServiceMode | undefined;
  selection: THighlightSelection;
};

export type THighlightChangedEvent = {
  mode: THighlightServiceMode | undefined;
  selection: THighlightSelection;
  previous: THighlightServiceState;
};

export type THighlightableEntity = {
  getEntityType(): string;
  getEntityId(): TSelectionEntityId;
  getHighlightVisualMode(): HighlightVisualMode | undefined;
  setHighlight(mode: HighlightVisualMode | undefined, value?: boolean): boolean;
};

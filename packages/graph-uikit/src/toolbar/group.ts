import type { TGraphToolbarAction, TGraphToolbarGroup } from "./types";

/** Builds a toolbar card from actions and arrays of actions (e.g. the result of `zoomGroup`). */
export function group(...items: Array<TGraphToolbarAction | TGraphToolbarAction[]>): TGraphToolbarGroup {
  return { actions: items.flat() };
}

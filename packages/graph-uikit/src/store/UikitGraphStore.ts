import type { Graph, TGraphColorsPatch } from "@gravity-ui/graph";
import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import type { TGraphContextMenuState, TGraphHoverState } from "../interactions/types";
import { DEFAULT_UIKIT_PALETTE } from "../theme/palette";
import type { TUikitPalette, TUikitTypography } from "../theme/types";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "../theme/typography";

export type TUikitGraphMode = "view" | "edit";

/** Kit state attached to one graph. Canvas classes read it; React subscribes with `useSignal`. */
export class UikitGraphStore {
  public readonly $palette: Signal<TUikitPalette> = signal(DEFAULT_UIKIT_PALETTE);

  public readonly $typography: Signal<TUikitTypography> = signal(DEFAULT_UIKIT_TYPOGRAPHY);

  public readonly $mode: Signal<TUikitGraphMode> = signal<TUikitGraphMode>("view");

  /** User color patch applied on top of theme colors. */
  public readonly $colorsPatch: Signal<TGraphColorsPatch | undefined> = signal<TGraphColorsPatch | undefined>(
    undefined
  );

  public readonly $hovered: Signal<TGraphHoverState | null> = signal<TGraphHoverState | null>(null);

  public readonly $pointerPressed: Signal<boolean> = signal(false);

  public readonly $contextMenu: Signal<TGraphContextMenuState | null> = signal<TGraphContextMenuState | null>(null);

  /** Number of mounted GraphContextMenu components; the native menu is prevented only when > 0. */
  public readonly $contextMenuConsumers: Signal<number> = signal(0);

  /** Increments on every camera change so anchored popups can reposition. */
  public readonly $cameraVersion: Signal<number> = signal(0);
}

const stores = new WeakMap<Graph, UikitGraphStore>();

// TODO(graph-core): per-graph extension storage — kit state has to live in a WeakMap next to the graph.
export function getUikitGraphStore(graph: Graph): UikitGraphStore {
  let store = stores.get(graph);
  if (!store) {
    store = new UikitGraphStore();
    stores.set(graph, store);
  }
  return store;
}

import type React from "react";

import type { Graph } from "@gravity-ui/graph";
import type { ButtonView, IconData } from "@gravity-ui/uikit";

/** Values the toolbar passes to every action. */
export type TGraphToolbarContext = {
  zoomStep: number;
};

export type TGraphToolbarAction = {
  /** Stable key; defaults to the title. */
  id?: string;
  /** uikit `Icon` data, e.g. from `@gravity-ui/icons`. Wins over `label`. */
  icon?: IconData;
  /** Plain content when there is no icon, e.g. "1:1". */
  label?: React.ReactNode;
  /** Tooltip title and accessible name. */
  title: string;
  action: (graph: Graph, toolbar: TGraphToolbarContext) => void;
  disabled?: boolean | ((graph: Graph, toolbar: TGraphToolbarContext) => boolean);
  /** uikit `Button` view. Default: "flat". "action" renders an accent button. */
  view?: ButtonView;
  /** Hotkey label shown in the tooltip; it is not bound. */
  hotkey?: string;
};

/** One toolbar card. */
export type TGraphToolbarGroup = {
  actions: TGraphToolbarAction[];
};

export type TGraphToolbarLayout = "vertical" | "horizontal";

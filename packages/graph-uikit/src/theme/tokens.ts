import type { TGraphColorsPatch } from "@gravity-ui/graph";

import type { TUikitStatus, TUikitTextColor } from "./types";

/** Token names (not values): graph colors and kit palette → uikit CSS custom properties. */
export type TUikitGraphTokens = {
  colors: TGraphColorsPatch;
  palette: {
    blockHoverBorder: string;
    connectionHover: string;
    text: Record<TUikitTextColor, string>;
    status: Record<TUikitStatus, { background: string; border: string }>;
  };
};

export const UIKIT_GRAPH_TOKENS: TUikitGraphTokens = {
  colors: {
    canvas: {
      layerBackground: "--g-color-base-background",
      belowLayerBackground: "--g-color-base-generic-ultralight",
      dots: "--g-color-line-generic",
      border: "--g-color-line-generic",
    },
    block: {
      background: "--g-color-base-float",
      border: "--g-color-line-generic",
      selectedBorder: "--g-color-line-brand",
      text: "--g-color-text-primary",
    },
    anchor: {
      background: "--g-color-line-generic-solid",
      selectedBorder: "--g-color-line-brand",
    },
    connection: {
      background: "--g-color-line-generic-accent",
      selectedBackground: "--g-color-line-brand",
    },
    connectionLabel: {
      background: "--g-color-base-float",
      hoverBackground: "--g-color-base-simple-hover-solid",
      selectedBackground: "--g-color-base-selection",
      text: "--g-color-text-primary",
      hoverText: "--g-color-text-primary",
      selectedText: "--g-color-text-primary",
    },
    selection: {
      background: "--g-color-base-selection",
      border: "--g-color-line-brand",
    },
  },
  palette: {
    blockHoverBorder: "--g-color-line-generic-hover",
    connectionHover: "--g-color-line-generic-accent-hover",
    text: {
      primary: "--g-color-text-primary",
      complementary: "--g-color-text-complementary",
      secondary: "--g-color-text-secondary",
      hint: "--g-color-text-hint",
      info: "--g-color-text-info",
      positive: "--g-color-text-positive",
      warning: "--g-color-text-warning",
      danger: "--g-color-text-danger",
      utility: "--g-color-text-utility",
      misc: "--g-color-text-misc",
      brand: "--g-color-text-brand",
    },
    status: {
      info: { background: "--g-color-base-info-light", border: "--g-color-line-info" },
      success: { background: "--g-color-base-positive-light", border: "--g-color-line-positive" },
      warning: { background: "--g-color-base-warning-light", border: "--g-color-line-warning" },
      danger: { background: "--g-color-base-danger-light", border: "--g-color-line-danger" },
      utility: { background: "--g-color-base-utility-light", border: "--g-color-line-utility" },
    },
  },
};

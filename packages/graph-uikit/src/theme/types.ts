import type { TGraphColorsPatch } from "@gravity-ui/graph";
import type { TEXT_VARIANTS } from "@gravity-ui/uikit";

/** uikit `<Text variant>` values (without `inherit`). */
export type TUikitTextVariant = (typeof TEXT_VARIANTS)[number];

/** uikit text colors available on canvas. */
export type TUikitTextColor =
  | "primary"
  | "complementary"
  | "secondary"
  | "hint"
  | "info"
  | "positive"
  | "warning"
  | "danger"
  | "utility"
  | "misc"
  | "brand";

/** Block statuses, named after uikit Card `theme` values. */
export type TUikitStatus = "info" | "success" | "warning" | "danger" | "utility";

export type TUikitBlockTheme = "normal" | TUikitStatus;

export type TUikitTextStyle = {
  fontFamily: string;
  fontWeight: string;
  /** World pixels; equals CSS pixels at camera scale 1. */
  fontSize: number;
  lineHeight: number;
};

export type TUikitTypography = Record<TUikitTextVariant, TUikitTextStyle>;

/** Colors that `TGraphColors` cannot hold. */
export type TUikitPalette = {
  blockHoverBorder: string;
  connectionHover: string;
  text: Record<TUikitTextColor, string>;
  status: Record<TUikitStatus, { background: string; border: string }>;
};

export type TUikitGraphTheme = {
  /** False when uikit tokens are missing (styles not loaded or no ThemeProvider). */
  isAvailable: boolean;
  colors: TGraphColorsPatch;
  palette: TUikitPalette;
  typography: TUikitTypography;
};

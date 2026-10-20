import type { TUikitTextStyle, TUikitTextVariant, TUikitTypography } from "./types";

export type TUikitTextGroup = "display" | "header" | "subheader" | "body" | "caption" | "code";

const TEXT_GROUPS: readonly TUikitTextGroup[] = ["display", "header", "subheader", "body", "caption", "code"];

/** Token group that holds family and weight of a variant; `code-inline-*` uses the `code` group. */
export function getUikitTextGroup(variant: TUikitTextVariant): TUikitTextGroup {
  const group = TEXT_GROUPS.find((name) => variant.startsWith(`${name}-`));
  if (!group) {
    throw new Error(`Unknown uikit text variant: ${variant}`);
  }
  return group;
}

export const UIKIT_FONT_FAMILY_SANS = '"Inter", "Helvetica Neue", "Helvetica", "Arial", sans-serif';

export const UIKIT_FONT_FAMILY_MONOSPACE =
  '"Menlo", "Monaco", "Consolas", "Liberation Mono", "Ubuntu Mono", "DejaVu Sans Mono", "Courier New", "Courier", monospace';

const GROUP_FONTS: Record<TUikitTextGroup, Pick<TUikitTextStyle, "fontFamily" | "fontWeight">> = {
  display: { fontFamily: UIKIT_FONT_FAMILY_SANS, fontWeight: "600" },
  header: { fontFamily: UIKIT_FONT_FAMILY_SANS, fontWeight: "600" },
  subheader: { fontFamily: UIKIT_FONT_FAMILY_SANS, fontWeight: "600" },
  body: { fontFamily: UIKIT_FONT_FAMILY_SANS, fontWeight: "400" },
  caption: { fontFamily: UIKIT_FONT_FAMILY_SANS, fontWeight: "400" },
  code: { fontFamily: UIKIT_FONT_FAMILY_MONOSPACE, fontWeight: "400" },
};

function textStyle(group: TUikitTextGroup, fontSize: number, lineHeight: number): TUikitTextStyle {
  return { ...GROUP_FONTS[group], fontSize, lineHeight };
}

/** uikit 7 typography; used until the theme is read from the DOM. */
export const DEFAULT_UIKIT_TYPOGRAPHY: TUikitTypography = {
  "display-1": textStyle("display", 28, 36),
  "display-2": textStyle("display", 32, 40),
  "display-3": textStyle("display", 40, 48),
  "display-4": textStyle("display", 48, 52),
  "header-1": textStyle("header", 20, 24),
  "header-2": textStyle("header", 24, 28),
  "subheader-1": textStyle("subheader", 13, 18),
  "subheader-2": textStyle("subheader", 15, 20),
  "subheader-3": textStyle("subheader", 17, 24),
  "body-1": textStyle("body", 13, 18),
  "body-2": textStyle("body", 15, 20),
  "body-3": textStyle("body", 17, 24),
  "body-short": textStyle("body", 13, 16),
  "caption-1": textStyle("caption", 9, 12),
  "caption-2": textStyle("caption", 11, 16),
  "code-1": textStyle("code", 12, 18),
  "code-2": textStyle("code", 14, 20),
  "code-3": textStyle("code", 16, 24),
  "code-inline-1": textStyle("code", 12, 14),
  "code-inline-2": textStyle("code", 14, 16),
  "code-inline-3": textStyle("code", 16, 20),
};

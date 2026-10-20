import { deepFreeze } from "../utils/deepFreeze";
import type { TDeepReadonly } from "../utils/deepFreeze";

import type { TUikitPalette, TUikitStatus, TUikitTextColor } from "./types";

export const UIKIT_TEXT_COLORS: readonly TUikitTextColor[] = [
  "primary",
  "complementary",
  "secondary",
  "hint",
  "info",
  "positive",
  "warning",
  "danger",
  "utility",
  "misc",
  "brand",
];

export const UIKIT_STATUSES: readonly TUikitStatus[] = ["info", "success", "warning", "danger", "utility"];

/** uikit 7 light-theme values; used until the theme is read from the DOM. Frozen: copy it to change values. */
export const DEFAULT_UIKIT_PALETTE: TDeepReadonly<TUikitPalette> = deepFreeze<TUikitPalette>({
  blockHoverBorder: "rgba(0, 0, 0, 0.15)",
  connectionHover: "rgba(0, 0, 0, 0.3)",
  text: {
    primary: "rgba(0, 0, 0, 0.85)",
    complementary: "rgba(0, 0, 0, 0.7)",
    secondary: "rgba(0, 0, 0, 0.5)",
    hint: "rgba(0, 0, 0, 0.3)",
    info: "rgb(52, 139, 220)",
    positive: "rgb(48, 170, 110)",
    warning: "rgb(189, 142, 75)",
    danger: "rgb(233, 3, 58)",
    utility: "rgb(132, 77, 187)",
    misc: "rgb(100, 122, 141)",
    brand: "rgb(189, 142, 75)",
  },
  status: {
    info: { background: "rgba(54, 151, 241, 0.15)", border: "rgba(54, 151, 241, 0.8)" },
    success: { background: "rgba(50, 186, 118, 0.15)", border: "rgba(50, 186, 118, 0.8)" },
    warning: { background: "rgba(255, 190, 92, 0.3)", border: "rgb(233, 174, 86)" },
    danger: { background: "rgba(255, 0, 61, 0.15)", border: "rgba(255, 0, 61, 0.8)" },
    utility: { background: "rgba(143, 82, 204, 0.15)", border: "rgba(143, 82, 204, 0.8)" },
  },
});

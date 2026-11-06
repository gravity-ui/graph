import type { TBlock } from "@gravity-ui/graph";

import type { TUikitBlockTheme } from "../theme/types";

export type TUikitBlockMeta = {
  description?: string;
  /** Status colors, like uikit Card `theme`. Default: "normal". */
  theme?: TUikitBlockTheme;
};

export type TUikitBlock = TBlock<TUikitBlockMeta>;

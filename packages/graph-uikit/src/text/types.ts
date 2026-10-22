import type { TUikitTextColor, TUikitTextVariant } from "../theme/types";

/** Canvas counterpart of uikit `<Text>` props. */
export type TUikitTextProps = {
  /** Default: "body-1". */
  variant?: TUikitTextVariant;
  /** Default: "primary". */
  color?: TUikitTextColor;
  /** Explicit canvas color; wins over `color`. */
  fill?: string;
  /** Single line truncated with "…". */
  ellipsis?: boolean;
  /** Line clamp; the last kept line is truncated with "…". */
  ellipsisLines?: number;
  whiteSpace?: "nowrap" | "break-spaces";
  wordBreak?: "break-all" | "break-word";
  /** Default: "left". */
  align?: CanvasTextAlign;
};

export type TUikitTextLayout = {
  lines: string[];
  width: number;
  height: number;
};

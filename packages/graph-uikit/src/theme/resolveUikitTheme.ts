import type { TGraphColorsPatch } from "@gravity-ui/graph";
import { TEXT_VARIANTS } from "@gravity-ui/uikit";

import { DEFAULT_UIKIT_PALETTE, UIKIT_STATUSES, UIKIT_TEXT_COLORS } from "./palette";
import { UIKIT_GRAPH_TOKENS } from "./tokens";
import type { TUikitGraphTokens } from "./tokens";
import type { TUikitGraphTheme, TUikitPalette, TUikitTypography } from "./types";
import { DEFAULT_UIKIT_TYPOGRAPHY, getUikitTextGroup } from "./typography";

export type TReadToken = (name: string) => string;

function resolveGroup<K extends string>(
  read: TReadToken,
  group: Partial<Record<K, string>> | undefined
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  if (!group) {
    return result;
  }
  // Keys of a Partial<Record<K, string>> are K.
  for (const key of Object.keys(group) as K[]) {
    const token = group[key];
    const value = token ? read(token) : "";
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

function resolveColors(read: TReadToken, tokens: TGraphColorsPatch): TGraphColorsPatch {
  return {
    canvas: resolveGroup(read, tokens.canvas),
    block: resolveGroup(read, tokens.block),
    anchor: resolveGroup(read, tokens.anchor),
    connection: resolveGroup(read, tokens.connection),
    connectionLabel: resolveGroup(read, tokens.connectionLabel),
    selection: resolveGroup(read, tokens.selection),
  };
}

function resolvePalette(read: TReadToken, tokens: TUikitGraphTokens["palette"]): TUikitPalette {
  const value = (token: string, fallback: string): string => read(token) || fallback;
  const text = { ...DEFAULT_UIKIT_PALETTE.text };
  for (const color of UIKIT_TEXT_COLORS) {
    text[color] = value(tokens.text[color], DEFAULT_UIKIT_PALETTE.text[color]);
  }
  const status = { ...DEFAULT_UIKIT_PALETTE.status };
  for (const name of UIKIT_STATUSES) {
    status[name] = {
      background: value(tokens.status[name].background, DEFAULT_UIKIT_PALETTE.status[name].background),
      border: value(tokens.status[name].border, DEFAULT_UIKIT_PALETTE.status[name].border),
    };
  }
  return {
    blockHoverBorder: value(tokens.blockHoverBorder, DEFAULT_UIKIT_PALETTE.blockHoverBorder),
    connectionHover: value(tokens.connectionHover, DEFAULT_UIKIT_PALETTE.connectionHover),
    text,
    status,
  };
}

function parsePixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Builds fonts from per-variant tokens; the `--g-text-<variant>-font` shorthand has a wrong line height. */
function resolveTypography(read: TReadToken): TUikitTypography {
  const typography: TUikitTypography = { ...DEFAULT_UIKIT_TYPOGRAPHY };
  for (const variant of TEXT_VARIANTS) {
    const group = getUikitTextGroup(variant);
    const fallback = DEFAULT_UIKIT_TYPOGRAPHY[variant];
    typography[variant] = {
      fontFamily: read(`--g-text-${group}-font-family`) || fallback.fontFamily,
      fontWeight: read(`--g-text-${group}-font-weight`) || fallback.fontWeight,
      fontSize: parsePixels(read(`--g-text-${variant}-font-size`), fallback.fontSize),
      lineHeight: parsePixels(read(`--g-text-${variant}-line-height`), fallback.lineHeight),
    };
  }
  return typography;
}

/** Pure theme resolution from a token reader. Empty tokens are omitted from colors. */
export function resolveUikitTheme(
  readToken: TReadToken,
  tokens: TUikitGraphTokens = UIKIT_GRAPH_TOKENS
): TUikitGraphTheme {
  const read: TReadToken = (name) => readToken(name).trim();
  const blockBackgroundToken = tokens.colors.block?.background ?? UIKIT_GRAPH_TOKENS.colors.block?.background;
  return {
    isAvailable: blockBackgroundToken ? read(blockBackgroundToken) !== "" : false,
    colors: resolveColors(read, tokens.colors),
    palette: resolvePalette(read, tokens.palette),
    typography: resolveTypography(read),
  };
}

/** Reads computed uikit tokens from `element`; works for global and scoped ThemeProvider. */
export function readUikitTheme(element: Element, tokens: TUikitGraphTokens = UIKIT_GRAPH_TOKENS): TUikitGraphTheme {
  const style = getComputedStyle(element);
  return resolveUikitTheme((name) => style.getPropertyValue(name), tokens);
}

export function mergeColorPatches(base: TGraphColorsPatch, patch?: TGraphColorsPatch): TGraphColorsPatch {
  if (!patch) {
    return base;
  }
  return {
    canvas: { ...base.canvas, ...patch.canvas },
    block: { ...base.block, ...patch.block },
    anchor: { ...base.anchor, ...patch.anchor },
    connection: { ...base.connection, ...patch.connection },
    connectionLabel: { ...base.connectionLabel, ...patch.connectionLabel },
    selection: { ...base.selection, ...patch.selection },
  };
}

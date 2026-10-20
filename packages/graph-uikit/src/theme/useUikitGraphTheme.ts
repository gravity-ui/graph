import { useEffect } from "react";

import type { Graph } from "@gravity-ui/graph";
import { useSignal } from "@gravity-ui/graph-react";
import { useThemeValue } from "@gravity-ui/uikit";
import { batch } from "@preact/signals-core";

import { getUikitGraphStore } from "../store/UikitGraphStore";

import { mergeColorPatches, readUikitTheme } from "./resolveUikitTheme";

let missingThemeWarned = false;

function warnMissingTheme(): void {
  if (missingThemeWarned) {
    return;
  }
  missingThemeWarned = true;
  console.warn(
    "@gravity-ui/graph-uikit: uikit theme tokens were not found. Render the graph inside ThemeProvider " +
      'and import "@gravity-ui/uikit/styles/styles.css".'
  );
}

/** Keeps graph colors and the kit palette/typography in sync with the active uikit theme. */
export function useUikitGraphTheme(graph: Graph): void {
  const themeValue = useThemeValue();
  const store = getUikitGraphStore(graph);
  const colorsPatch = useSignal(store.$colorsPatch);
  const tokens = useSignal(store.$tokens);

  // Passive effect on purpose: a global ThemeProvider updates body classes in its own layout effect,
  // which runs after the layout effects of its children.
  useEffect(() => {
    const root = graph.layers.$root;
    if (!root) {
      return;
    }
    const theme = readUikitTheme(root, tokens);
    if (!theme.isAvailable) {
      warnMissingTheme();
      return;
    }
    batch(() => {
      // Colors first: palette subscribers (UikitConnection.applyShape) read `context.colors`.
      graph.setColors(mergeColorPatches(theme.colors, colorsPatch));
      store.$palette.value = theme.palette;
      store.$typography.value = theme.typography;
    });
  }, [graph, store, themeValue, colorsPatch, tokens]);
}

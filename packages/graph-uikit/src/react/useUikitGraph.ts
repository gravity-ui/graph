import { useLayoutEffect, useMemo } from "react";

import { ECanDrag } from "@gravity-ui/graph";
import type { TGraphColorsPatch, TGraphSettingsPatch } from "@gravity-ui/graph";
import { useGraph } from "@gravity-ui/graph-react";
import type { HookGraphParams, UseGraphResult } from "@gravity-ui/graph-react";

import { UikitBlock } from "../canvas/UikitBlock";
import { UikitConnection } from "../canvas/UikitConnection";
import { getUikitGraphStore } from "../store/UikitGraphStore";
import type { TUikitGraphMode } from "../store/UikitGraphStore";

export type TUikitGraphParams = HookGraphParams & {
  /** Default: "view". */
  mode?: TUikitGraphMode;
  /** Applied on top of theme colors. */
  colors?: TGraphColorsPatch;
  /** Added next to `{ Block: UikitBlock }`. Pass a stable object (module constant or useMemo). */
  blockComponents?: TGraphSettingsPatch["blockComponents"];
};

export const UIKIT_GRAPH_MODE_SETTINGS: Record<TUikitGraphMode, TGraphSettingsPatch> = {
  view: { canDrag: ECanDrag.NONE },
  edit: { canDrag: ECanDrag.ALL },
};

/** useGraph with uikit block/connection classes and view/edit presets. User settings win. */
export function useUikitGraph(config: TUikitGraphParams): UseGraphResult {
  const { mode = "view", colors, blockComponents, settings, ...graphParams } = config;

  const uikitSettings = useMemo<TGraphSettingsPatch>(
    () => ({
      ...UIKIT_GRAPH_MODE_SETTINGS[mode],
      connection: UikitConnection,
      ...settings,
      blockComponents: { Block: UikitBlock, ...blockComponents, ...settings?.blockComponents },
    }),
    [mode, settings, blockComponents]
  );

  const result = useGraph({ ...graphParams, settings: uikitSettings });
  const store = getUikitGraphStore(result.graph);

  useLayoutEffect(() => {
    store.$mode.value = mode;
  }, [store, mode]);

  useLayoutEffect(() => {
    store.$colorsPatch.value = colors;
  }, [store, colors]);

  return result;
}

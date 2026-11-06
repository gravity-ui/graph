import { ECanDrag } from "@gravity-ui/graph";
import { renderHook } from "@testing-library/react";

import { UikitBlock } from "../canvas/UikitBlock";
import { UikitConnection } from "../canvas/UikitConnection";
import { getUikitGraphStore } from "../store/UikitGraphStore";
import { UIKIT_GRAPH_TOKENS } from "../theme/tokens";
import type { TUikitGraphTokens } from "../theme/tokens";

import { useUikitGraph } from "./useUikitGraph";
import type { TUikitGraphParams } from "./useUikitGraph";

describe("useUikitGraph", () => {
  it("registers kit classes and the view preset", () => {
    const { result } = renderHook(() => useUikitGraph({}));
    const settings = result.current.graph.rootStore.settings.$settings.value;

    expect(settings.blockComponents.Block).toBe(UikitBlock);
    expect(settings.connection).toBe(UikitConnection);
    expect(settings.canDrag).toBe(ECanDrag.NONE);
  });

  it("switches presets with mode and keeps user settings and colors on top", () => {
    const { result, rerender } = renderHook((props: TUikitGraphParams) => useUikitGraph(props), {
      initialProps: { mode: "view" },
    });
    const graph = result.current.graph;

    rerender({ mode: "edit" });
    expect(graph.rootStore.settings.$settings.value.canDrag).toBe(ECanDrag.ALL);
    expect(getUikitGraphStore(graph).$mode.value).toBe("edit");

    const colors = { block: { background: "user" } };
    rerender({ mode: "edit", settings: { canDrag: ECanDrag.ONLY_SELECTED }, colors });
    expect(graph.rootStore.settings.$settings.value.canDrag).toBe(ECanDrag.ONLY_SELECTED);
    expect(getUikitGraphStore(graph).$colorsPatch.value).toBe(colors);
  });

  it("stores the token table and falls back to the default one", () => {
    const tokens: TUikitGraphTokens = {
      ...UIKIT_GRAPH_TOKENS,
      palette: { ...UIKIT_GRAPH_TOKENS.palette, blockHoverBorder: "--custom-hover" },
    };
    const initialProps: TUikitGraphParams = { tokens };
    const { result, rerender } = renderHook((props: TUikitGraphParams) => useUikitGraph(props), { initialProps });
    const store = getUikitGraphStore(result.current.graph);

    expect(store.$tokens.value).toBe(tokens);
    rerender({});
    expect(store.$tokens.value).toBe(UIKIT_GRAPH_TOKENS);
  });
});

import { ECanDrag } from "@gravity-ui/graph";
import { renderHook } from "@testing-library/react";

import { UikitBlock } from "../canvas/UikitBlock";
import { UikitConnection } from "../canvas/UikitConnection";
import { getUikitGraphStore } from "../store/UikitGraphStore";

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
});

import { Graph } from "@gravity-ui/graph";

import { DEFAULT_UIKIT_PALETTE } from "../theme/palette";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "../theme/typography";

import { getUikitGraphStore } from "./UikitGraphStore";

describe("getUikitGraphStore", () => {
  it("returns one store per graph", () => {
    const first = new Graph({});
    const second = new Graph({});

    expect(getUikitGraphStore(first)).toBe(getUikitGraphStore(first));
    expect(getUikitGraphStore(first)).not.toBe(getUikitGraphStore(second));

    first.unmount();
    second.unmount();
  });

  it("starts from the default palette, typography and view mode", () => {
    const graph = new Graph({});
    const store = getUikitGraphStore(graph);

    expect(store.$palette.value).toBe(DEFAULT_UIKIT_PALETTE);
    expect(store.$typography.value).toBe(DEFAULT_UIKIT_TYPOGRAPHY);
    expect(store.$mode.value).toBe("view");
    expect(store.$hovered.value).toBeNull();
    expect(store.$contextMenu.value).toBeNull();
    expect(store.$contextMenuConsumers.value).toBe(0);

    graph.unmount();
  });
});

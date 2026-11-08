import { Graph } from "@gravity-ui/graph";

import { getUikitGraphStore } from "../store/UikitGraphStore";
import type { TUikitTextVariant } from "../theme/types";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "../theme/typography";

import { buildUikitFont, getUikitFont, getUikitLineHeight, getUikitTextStyle } from "./font";

describe("uikit fonts", () => {
  it("builds a canvas font string", () => {
    expect(buildUikitFont({ fontFamily: "Inter", fontWeight: "600", fontSize: 13, lineHeight: 18 })).toBe(
      "600 13px Inter"
    );
  });

  it("reads the graph typography", () => {
    const graph = new Graph({});
    getUikitGraphStore(graph).$typography.value = {
      ...DEFAULT_UIKIT_TYPOGRAPHY,
      "body-1": { fontFamily: "Test", fontWeight: "400", fontSize: 14, lineHeight: 20 },
    };

    expect(getUikitFont(graph)).toBe("400 14px Test");
    expect(getUikitLineHeight(graph, "body-1")).toBe(20);
    graph.unmount();
  });

  it("falls back to body-1 for a variant missing from the typography", () => {
    const graph = new Graph({});
    // A variant from a newer uikit than the one the kit was built with.
    const variant = "label-1" as unknown as TUikitTextVariant;

    expect(getUikitTextStyle(graph, variant)).toEqual(DEFAULT_UIKIT_TYPOGRAPHY["body-1"]);
    expect(getUikitFont(graph, variant)).toBe(buildUikitFont(DEFAULT_UIKIT_TYPOGRAPHY["body-1"]));
    graph.unmount();
  });
});

import { Graph } from "@gravity-ui/graph";

import { getUikitGraphStore } from "../store/UikitGraphStore";
import { DEFAULT_UIKIT_TYPOGRAPHY } from "../theme/typography";

import { buildUikitFont, getUikitFont, getUikitLineHeight } from "./font";

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
});

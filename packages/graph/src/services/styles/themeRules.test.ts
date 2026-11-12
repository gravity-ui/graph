import { Anchor } from "../../components/canvas/anchors";
import { Block } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";
import { draggingTag, hoveredTag, selectedTag } from "../tags/builtinTags";

describe("theme rules", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph({});
  });

  afterEach(() => graph.unmount());

  it("style a selected block with the theme's selected border and a raise", () => {
    const style = graph.scene.styleFor(Block, new Map([[selectedTag, true]]));
    expect(style.parts?.border?.color).toBe(graph.graphColors.block?.selectedBorder);
    expect(style.raise).toBe(1);
    expect(style.base?.body?.color).toBe(graph.graphColors.block?.background);
    expect(style.base?.border?.color).toBe(graph.graphColors.block?.border);
    expect(style.base?.title?.color).toBe(graph.graphColors.block?.text);
  });

  it("raise a dragged block", () => {
    expect(graph.scene.styleFor(Block, new Map([[draggingTag, true]])).raise).toBe(1);
  });

  it("style anchors", () => {
    expect(graph.scene.styleFor(Anchor, new Map()).base?.anchor?.color).toBe(graph.graphColors.anchor?.background);
    expect(graph.scene.styleFor(Anchor, new Map([[selectedTag, true]])).parts?.anchor?.color).toBe(
      graph.graphColors.anchor?.selectedBorder
    );
    expect(graph.scene.styleFor(Anchor, new Map([[hoveredTag, true]])).parts?.anchor?.scale).toBe(
      Anchor.CANVAS_HOVER_FACTOR
    );
  });

  it("follow a colour change", () => {
    graph.setColors({ block: { selectedBorder: "#123456" } });
    expect(graph.scene.styleFor(Block, new Map([[selectedTag, true]])).parts?.border?.color).toBe("#123456");
  });
});

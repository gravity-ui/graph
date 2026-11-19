import { Anchor } from "../../../components/canvas/anchors";
import { Block } from "../../../components/canvas/blocks/Block";
import { Graph } from "../../../graph";
import { draggingTag, hoveredTag, selectedTag } from "../../tags/builtinTags";

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

  it("hide a block's halo and badge", () => {
    const style = graph.scene.styleFor(Block, new Map());
    expect(style.base?.halo).toEqual({ visible: false });
    expect(style.base?.badge).toEqual({ visible: false });
  });

  it("raise a dragged block", () => {
    expect(graph.scene.styleFor(Block, new Map([[draggingTag, true]])).raise).toBe(1);
  });

  it("style anchors: a dot in the background colour and a ring shown while selected", () => {
    const base = graph.scene.styleFor(Anchor, new Map());
    expect(base.base?.anchor?.color).toBe(graph.graphColors.anchor?.background);
    expect(base.base?.border).toEqual({ color: graph.graphColors.anchor?.selectedBorder, visible: false });
    const selected = graph.scene.styleFor(Anchor, new Map([[selectedTag, true]]));
    expect(selected.parts?.border?.visible).toBe(true);
    // The dot keeps the background colour, as before.
    expect(selected.parts?.anchor?.color).toBeUndefined();
    expect(selected.base?.anchor?.color).toBe(graph.graphColors.anchor?.background);
    const hovered = graph.scene.styleFor(Anchor, new Map([[hoveredTag, true]]));
    expect([hovered.parts?.anchor?.scale, hovered.parts?.border?.scale]).toEqual([
      Anchor.CANVAS_HOVER_FACTOR,
      Anchor.CANVAS_HOVER_FACTOR,
    ]);
  });

  it("follow a colour change", () => {
    graph.setColors({ block: { selectedBorder: "#123456" } });
    expect(graph.scene.styleFor(Block, new Map([[selectedTag, true]])).parts?.border?.color).toBe("#123456");
  });
});

import { Anchor } from "../../components/canvas/anchors";
import { Block } from "../../components/canvas/blocks/Block";
import type { TGraphColors } from "../../graphConfig";
import { draggingTag, hoveredTag, selectedTag } from "../tags/builtinTags";

import type { TStyleRule } from "./types";

/**
 * The theme's style rules for a colour set: base rules fill the colours a primitive leaves unset, tag rules style
 * selection, dragging and hover. Anchor rules are provisional until `Anchor` draws through scene parts.
 */
export function createThemeRules(colors: TGraphColors): TStyleRule[] {
  const blockBase: TStyleRule<typeof Block> = {
    target: Block,
    style: {
      parts: {
        body: { color: colors.block.background },
        border: { color: colors.block.border },
        title: { color: colors.block.text },
      },
    },
  };
  const blockSelected: TStyleRule<typeof Block> = {
    target: Block,
    tags: [selectedTag],
    style: { parts: { border: { color: colors.block.selectedBorder } }, raise: 1 },
  };
  const blockDragging: TStyleRule<typeof Block> = { target: Block, tags: [draggingTag], style: { raise: 1 } };
  const anchorBase: TStyleRule<typeof Anchor> = {
    target: Anchor,
    style: { parts: { anchor: { color: colors.anchor.background } } },
  };
  const anchorSelected: TStyleRule<typeof Anchor> = {
    target: Anchor,
    tags: [selectedTag],
    style: { parts: { anchor: { color: colors.anchor.selectedBorder } } },
  };
  const anchorHovered: TStyleRule<typeof Anchor> = {
    target: Anchor,
    tags: [hoveredTag],
    style: { parts: { anchor: { scale: Anchor.CANVAS_HOVER_FACTOR } } },
  };
  return [blockBase, blockSelected, blockDragging, anchorBase, anchorSelected, anchorHovered];
}

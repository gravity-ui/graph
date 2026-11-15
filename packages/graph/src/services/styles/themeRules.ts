import { Anchor } from "../../components/canvas/anchors";
import { Block } from "../../components/canvas/blocks/Block";
import type { TGraphColors } from "../../graphConfig";
import { draggingTag, hoveredTag, selectedTag } from "../tags/builtinTags";

import type { TStyleRule } from "./types";

/**
 * The theme's style rules for a colour set: base rules fill the colours a primitive leaves unset and hide the parts
 * the default look keeps for later (a block's halo and badge, an anchor's ring); tag rules style selection, dragging
 * and hover.
 */
export function createThemeRules(colors: TGraphColors): TStyleRule[] {
  const blockBase: TStyleRule<typeof Block> = {
    target: Block,
    style: {
      parts: {
        body: { color: colors.block.background },
        border: { color: colors.block.border },
        title: { color: colors.block.text },
        halo: { visible: false },
        badge: { visible: false },
      },
    },
  };
  const blockSelected: TStyleRule<typeof Block> = {
    target: Block,
    tags: [selectedTag],
    style: { parts: { border: { color: colors.block.selectedBorder } }, raise: 1 },
  };
  const blockDragging: TStyleRule<typeof Block> = { target: Block, tags: [draggingTag], style: { raise: 1 } };
  // An anchor is a dot (part `anchor`) and a ring around it (part `border`), shown while the anchor is selected.
  const anchorBase: TStyleRule<typeof Anchor> = {
    target: Anchor,
    style: {
      parts: {
        anchor: { color: colors.anchor.background },
        border: { color: colors.anchor.selectedBorder, visible: false },
      },
    },
  };
  const anchorSelected: TStyleRule<typeof Anchor> = {
    target: Anchor,
    tags: [selectedTag],
    style: { parts: { border: { visible: true } } },
  };
  const anchorHovered: TStyleRule<typeof Anchor> = {
    target: Anchor,
    tags: [hoveredTag],
    style: { parts: { anchor: { scale: Anchor.CANVAS_HOVER_FACTOR }, border: { scale: Anchor.CANVAS_HOVER_FACTOR } } },
  };
  return [blockBase, blockSelected, blockDragging, anchorBase, anchorSelected, anchorHovered];
}

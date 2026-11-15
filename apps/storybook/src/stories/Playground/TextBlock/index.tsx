import React from "react";

import { CanvasBlock, TBlockView, TScenePrimitive } from "@gravity-ui/graph";

import { TGravityTextBlock } from "../generateLayout";

import { TextBlockHtml } from "./TextBlockHtml";

import "./TextBlock.css";

const TEXT_COLOR = "rgba(189, 142, 75, 1)";

/** The shapes of one view: the frame every level shows, and the text. */
type TTextShapes = { view: object; frame: readonly TScenePrimitive[]; text: TScenePrimitive };

export class TextBlock extends CanvasBlock<TGravityTextBlock> {
  public cursor = "pointer";

  private shapesCache?: TTextShapes;

  public renderHTML() {
    return <TextBlockHtml graph={this.context.graph} block={this.connectedState.$state.value} />;
  }

  /** The body and the dashed border (shared by every level) and the text. */
  private shapes(view: TBlockView<TGravityTextBlock>): TTextShapes {
    if (this.shapesCache?.view === view) return this.shapesCache;
    const { width, height, look } = view;
    this.shapesCache = {
      view,
      frame: [
        { kind: "rect", part: "body", x: 0, y: 0, width, height, radius: 8, fill: "rgba(189, 142, 75, 0.1)" },
        {
          kind: "rect",
          part: "border",
          x: 0,
          y: 0,
          width,
          height,
          radius: 8,
          border: { color: TEXT_COLOR, width: 2, dash: [4, 4] },
        },
      ],
      // v1 drew the text with the block font (`bold ${BASE_FONT_SIZE x scaleFontSize}px sans-serif`, world units),
      // centred and from the top of the content rect, a line pitch of the font size.
      text: {
        kind: "text",
        part: "title",
        text: view.meta?.text ?? "",
        family: "sans-serif",
        weight: "bold",
        size: look.fontSize,
        lineHeight: look.fontSize,
        color: TEXT_COLOR,
        x: look.padding,
        y: look.padding,
        width: width - 2 * look.padding,
        height: height - 2 * look.padding,
        align: "center",
        minScale: look.textMinScale,
      },
    };
    return this.shapesCache;
  }

  /** The body and the dashed border, without text, as before. */
  protected override minimalistic(view: TBlockView<TGravityTextBlock>): readonly TScenePrimitive[] {
    return this.shapes(view).frame;
  }

  protected override schematic(view: TBlockView<TGravityTextBlock>): readonly TScenePrimitive[] {
    const { frame, text } = this.shapes(view);
    return [...frame, text];
  }

  protected override detailed(view: TBlockView<TGravityTextBlock>): readonly TScenePrimitive[] {
    return this.shapes(view).frame;
  }
}

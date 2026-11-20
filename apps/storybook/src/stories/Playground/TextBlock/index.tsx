import React from "react";

import { CanvasBlock, TScenePrimitive } from "@gravity-ui/graph";

import { TGravityTextBlock } from "../generateLayout";

import { TextBlockHtml } from "./TextBlockHtml";

import "./TextBlock.css";

const TEXT_COLOR = "rgba(189, 142, 75, 1)";

export class TextBlock extends CanvasBlock<TGravityTextBlock> {
  public cursor = "pointer";

  private frameCache?: { width: number; height: number; primitives: readonly TScenePrimitive[] };

  public renderHTML() {
    return <TextBlockHtml graph={this.context.graph} block={this.connectedState.$state.value} />;
  }

  /** The body and dashed border are shared by all levels. */
  private frame(): readonly TScenePrimitive[] {
    const { width, height } = this.state;
    if (this.frameCache?.width === width && this.frameCache.height === height) return this.frameCache.primitives;
    this.frameCache = {
      width,
      height,
      primitives: [
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
    };
    return this.frameCache.primitives;
  }

  protected override minimalistic(): readonly TScenePrimitive[] {
    return this.frame();
  }

  protected override schematic(): readonly TScenePrimitive[] {
    const { width, height, meta } = this.state;
    const look = this.blockLook;
    return [
      ...this.frame(),
      // v1 drew the text with the block font (`bold ${BASE_FONT_SIZE x scaleFontSize}px sans-serif`, world units),
      // centred and from the top of the content rect, a line pitch of the font size.
      {
        kind: "text",
        part: "title",
        text: meta?.text ?? "",
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
    ];
  }

  protected override detailed(): readonly TScenePrimitive[] {
    return this.frame();
  }
}

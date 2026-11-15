import React from "react";

import {
  Anchor,
  CanvasBlock,
  EAnchorType,
  TAnchor,
  TBlockView,
  TPoint,
  TScenePrimitive,
  TStyleRule,
  hoveredTag,
} from "@gravity-ui/graph";

import { TGravityActionBlock } from "../generateLayout";

import { ActionBlockHtml } from "./ActionBlockHtml";

import "./ActionBlock.css";

function getAnchorY(index: number): number {
  let y = 18 * index;
  if (index >= 1) {
    y += 8 * index;
  }
  return y + 18;
}

/** The action icon: the path of the former renderSVG call, in a 14-unit view box. */
const ACTION_ICON =
  "M5.75 2.5H10.25C10.7842 2.5 11.2532 2.77929 11.519 3.19983C10.6259 3.58121 10 4.46751 10 5.5" +
  "C10 6.61941 10.7357 7.56698 11.75 7.88555V12C11.75 12.8284 11.0784 13.5 10.25 13.5H5.75" +
  "C5.21576 13.5 4.74676 13.2207 4.48102 12.8002C5.3741 12.4188 6 11.5325 6 10.5" +
  "C6 9.38059 5.26428 8.43302 4.25 8.11445V7.88555C5.26428 7.56698 6 6.61941 6 5.5" +
  "C6 4.46751 5.3741 3.58121 4.48102 3.19982C4.74676 2.77929 5.21576 2.5 5.75 2.5ZM2.75 8.11445V7.88555" +
  "C1.73572 7.56698 1 6.61941 1 5.5C1 4.32762 1.80699 3.34373 2.8958 3.0735C3.28617 1.87008 4.41648 1 5.75 1" +
  "H10.25C11.5835 1 12.7138 1.87008 13.1042 3.07351C14.193 3.34373 15 4.32762 15 5.5" +
  "C15 6.61941 14.2643 7.56698 13.25 7.88555V12C13.25 13.6569 11.9069 15 10.25 15H5.75" +
  "C4.41647 15 3.28616 14.1299 2.8958 12.9265C1.80699 12.6563 1 11.6724 1 10.5" +
  "C1 9.38059 1.73572 8.43302 2.75 8.11445ZM3.5 11.5C4.05228 11.5 4.5 11.0523 4.5 10.5" +
  "C4.5 9.94771 4.05228 9.5 3.5 9.5C2.94772 9.5 2.5 9.94772 2.5 10.5C2.5 11.0523 2.94772 11.5 3.5 11.5ZM2.5 5.5" +
  "C2.5 4.94772 2.94772 4.5 3.5 4.5C4.05228 4.5 4.5 4.94772 4.5 5.5C4.5 6.05228 4.05228 6.5 3.5 6.5" +
  "C2.94772 6.5 2.5 6.05229 2.5 5.5ZM12.5 4.5C11.9477 4.5 11.5 4.94772 11.5 5.5" +
  "C11.5 6.05229 11.9477 6.5 12.5 6.5C13.0523 6.5 13.5 6.05229 13.5 5.5C13.5 4.94772 13.0523 4.5 12.5 4.5Z";
const ICON_SIZE = 56;
/**
 * The name keeps 9 screen pixels (v1 drew `500 ${9 / scale}px`), capped at 90 world units (9 / 0.1, the lowest scale
 * with text in the Playground), and re-fits the content box as the camera zooms.
 */
const TEXT_PX = 9;
const TEXT_MAX_WORLD = 90;
let actionIcon: Path2D | undefined;

/** Path2D exists only in the browser: build the icon on first use. */
function actionIconPath(): Path2D {
  actionIcon ??= new Path2D(ACTION_ICON);
  return actionIcon;
}

export class ActionBlock extends CanvasBlock<TGravityActionBlock> {
  public cursor = "pointer";

  private cardCache?: { view: object; card: readonly TScenePrimitive[] };

  /** Body and border, shared by every level; the theme colours them, and the rules below style hover and selection. */
  private card(view: TBlockView<TGravityActionBlock>): readonly TScenePrimitive[] {
    if (this.cardCache?.view !== view) {
      const { width, height } = view;
      this.cardCache = {
        view,
        card: [
          { kind: "rect", part: "body", x: 0, y: 0, width, height, radius: 8 },
          {
            kind: "rect",
            part: "border",
            x: 0,
            y: 0,
            width,
            height,
            radius: 8,
            border: { width: { px: 2, maxWorld: 12 } },
          },
        ],
      };
    }
    return this.cardCache.card;
  }

  protected override minimalistic(view: TBlockView<TGravityActionBlock>): TScenePrimitive[] {
    const { width, height, look } = view;
    const centerX = look.padding + (width - 2 * look.padding) / 2;
    const centerY = look.padding + (height - 2 * look.padding) / 2;
    return [
      ...this.card(view),
      {
        kind: "icon",
        path: actionIconPath(),
        viewBox: 14,
        x: centerX - ICON_SIZE / 2,
        y: centerY - ICON_SIZE / 2,
        size: ICON_SIZE,
        color: "rgba(255, 190, 92, 1)",
        minScale: 0.1,
      },
    ];
  }

  protected override schematic(view: TBlockView<TGravityActionBlock>): TScenePrimitive[] {
    const { width, height, name, look } = view;
    return [
      ...this.card(view),
      {
        // v1 renderTextAtCenter: wrapped in the content rect, a line pitch of the font size, centred vertically.
        kind: "text",
        part: "title",
        text: name,
        family: "YS Text",
        weight: "500",
        size: TEXT_PX,
        cameraAware: { maxWorld: TEXT_MAX_WORLD },
        lineHeight: TEXT_PX,
        x: look.padding,
        y: look.padding,
        width: width - 2 * look.padding,
        height: height - 2 * look.padding,
        align: "center",
        verticalAlign: "middle",
        minScale: look.textMinScale,
      },
    ];
  }

  /** Today's detailed canvas look was this class's body. */
  protected override detailed(view: TBlockView<TGravityActionBlock>): readonly TScenePrimitive[] {
    return this.card(view);
  }

  public renderHTML() {
    return <ActionBlockHtml graph={this.context.graph} block={this.connectedState.$state.value} />;
  }

  protected renderAnchor(anchor: TAnchor) {
    return Anchor.create(
      {
        ...anchor,
        zIndex: this.zIndex,
        size: 18,
        lineWidth: 2,
        port: this.getAnchorPort(anchor.id),
      },
      {
        key: anchor.id,
      }
    );
  }

  protected getAnchorsYOffter(type: EAnchorType) {
    const anchors = (this.connectedState.$state.value.anchors ?? []).filter((a) => a.type === type);
    const { height } = this.getContentRect();
    return (height - getAnchorY(anchors.length - 1)) / 2;
  }

  public getAnchorPosition(anchor: TAnchor): TPoint {
    const a = this.getAnchorsYOffter(anchor.type as EAnchorType);
    const index = this.connectedState.$anchorIndexs.value?.get(anchor.id) || 0;
    const y = getAnchorY(index);
    return {
      x: anchor.type === EAnchorType.OUT ? this.state.width : 0,
      y: a + y,
    };
  }
}

/** Hover darkens the body and fades the border; priority -1 keeps the theme's selected border above it. */
export const actionBlockRules: TStyleRule<typeof ActionBlock>[] = [
  {
    target: ActionBlock,
    tags: [hoveredTag],
    priority: -1,
    style: { parts: { body: { color: "rgba(57, 47, 57, 1)" }, border: { color: "rgba(229, 229, 229, 0.4)" } } },
  },
];

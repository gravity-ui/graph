import { CanvasBlock, TBlockView, TGraphConfig, TScenePrimitive, TStyleRule, selectedTag } from "@gravity-ui/graph";

import { storiesSettings } from "./definitions";

const RADIUS = [0, 30, 50, 60];

class SpecificBlockView extends CanvasBlock {
  protected override schematic(view: TBlockView): TScenePrimitive[] {
    const { width, height, name, look } = view;
    return [
      { kind: "rect", part: "body", x: 0, y: 0, width, height, radius: RADIUS, fill: "#C4EFC2" },
      {
        kind: "rect",
        part: "border",
        x: 0,
        y: 0,
        width,
        height,
        radius: RADIUS,
        border: { color: "rgba(0, 0, 0, 0.30)", width: 2 },
      },
      {
        kind: "text",
        part: "title",
        text: name,
        family: "sans-serif",
        weight: "bold",
        size: look.fontSize,
        lineHeight: look.fontSize,
        x: look.padding,
        y: look.padding,
        width: width - 2 * look.padding,
        height: height - 2 * look.padding,
        align: "center",
        minScale: look.textMinScale,
      },
    ];
  }
}

/** The selected block's border: 3 screen pixels, 2 to 20 world units (it was Math.round(3 / scale)). */
export const customBlockRules: TStyleRule<typeof SpecificBlockView>[] = [
  {
    target: SpecificBlockView,
    tags: [selectedTag],
    style: { parts: { border: { width: { px: 3, minWorld: 2, maxWorld: 20 } } } },
  },
];

const SpecificBlockIs = "some-specific-view";
export const customSchematicViewConfig: TGraphConfig = {
  configurationName: "custom-schematic",
  blocks: [
    {
      x: 265,
      y: 334,
      is: SpecificBlockIs,
      width: 200,
      height: 160,
      id: "Lonely block without anchors",
      name: "one block",
      anchors: [],
    },
  ],
  connections: [],
  cameraScale: 0.9,
  rect: {
    x: -156,
    y: 0,
    width: 631,
    height: 494,
  },
  settings: {
    ...storiesSettings,
    blockComponents: {
      [SpecificBlockIs]: SpecificBlockView,
    },
  },
};

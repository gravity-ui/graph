import { CanvasBlock, TBlock, TConnection, TGraphConfig } from "@gravity-ui/graph";

import { random } from "../../storyUtils";

import { storiesSettings } from "./definitions";

export function createBlock(x: number, y: number, index: number | string): TBlock {
  const blockId = `block_${index}`;
  return {
    id: blockId,
    is: CanvasBlock.IS,
    x,
    y,
    width: 200,
    height: 150,
    selected: false,
    name: blockId,
    anchors: [],
  };
}

function getRandomArbitrary(min: number, max: number): number {
  return (Math.random() * (max - min) + min) | 0;
}

/** Generated config: `blocks` and `connections` are always present. */
export type TGeneratedGraphConfig = TGraphConfig & { blocks: TBlock[]; connections: TConnection[] };

type Props = {
  layersCount: number;
  connectionsPerLayer: number;
  dashedLine?: boolean;
  overrideSettings?: Partial<TGraphConfig["settings"]>;
  startIndex?: number;
};

export function generatePrettyBlocks({
  layersCount,
  connectionsPerLayer,
  dashedLine,
  overrideSettings = {},
  startIndex = 0,
}: Props): TGeneratedGraphConfig {
  const blocks: TBlock[] = [];
  const connections: TConnection[] = [];
  const config: TGeneratedGraphConfig = {
    configurationName: "power of 2",
    blocks,
    connections,
    rect: {
      x: -500,
      y: -2000,
      width: 2000,
      height: 2000,
    },
    cameraScale: 0.05,
    settings: {
      ...storiesSettings,
      showConnectionLabels: true,
      ...overrideSettings,
    },
  };

  const gapX = 500;
  const gapY = 200;

  let prevLayerBlocks: TBlock[] = [];
  let index = 0;
  for (let i = 0; i <= layersCount; i++) {
    let count = i ** 2;
    if (i >= layersCount / 2) {
      count = (layersCount - i) ** 2;
    }
    const startY = (500 - gapY * count) / 2;
    const layerX = gapX * i * 2.5;
    const currentLayerBlocks: TBlock[] = [];
    for (let j = 0; j <= count; j++) {
      const y = startY + gapY * j;

      const block = createBlock(layerX, y, startIndex + ++index);

      blocks.push(block);
      currentLayerBlocks.push(block);
    }
    if (i > 1) {
      for (let c = 0; c <= connectionsPerLayer; c++) {
        const indexSource = getRandomArbitrary(
          blocks.length - currentLayerBlocks.length - prevLayerBlocks.length - 1,
          blocks.length - currentLayerBlocks.length - 1
        );
        const indexTarget = getRandomArbitrary(blocks.length - currentLayerBlocks.length - 1, blocks.length - 1);
        const sourceBlockId = `block_${startIndex + indexSource}`;
        const targetBlockId = `block_${startIndex + indexTarget}`;
        connections.push({
          id: `${sourceBlockId}/${targetBlockId}`,
          sourceBlockId: sourceBlockId,
          targetBlockId: targetBlockId,
          label: "Some label",
          dashed: dashedLine && Boolean(Math.floor(random(0, 2))),
        });
      }
      prevLayerBlocks = [...currentLayerBlocks];
    }
  }

  console.log("Blocks count: ", blocks.length);
  console.log("Connections count: ", connections.length);

  return config;
}

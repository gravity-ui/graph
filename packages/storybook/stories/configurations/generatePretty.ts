/* eslint-disable no-console */
import { TBlock } from "../../components/canvas/blocks/Block";
import { random } from "../../components/canvas/blocks/generate";
import { TGraphConfig } from "../../graph";
import { IS_BLOCK_TYPE } from "../../store/block/Block";

import { storiesSettings } from "./definitions";

export function createBlock(x: number, y: number, index): TBlock {
  const blockId = `block_${index}`;
  return {
    id: blockId,
    is: IS_BLOCK_TYPE,
    x,
    y,
    width: 200,
    height: 150,
    selected: false,
    name: blockId,
    anchors: [],
  };
}

function getRandomArbitrary(min, max) {
  return (Math.random() * (max - min) + min) | 0;
}

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
}: Props) {
  const config: TGraphConfig = {
    configurationName: "power of 2",
    blocks: [],
    connections: [],
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

      config.blocks.push(block);
      currentLayerBlocks.push(block);
    }
    if (i > 1) {
      for (let c = 0; c <= connectionsPerLayer; c++) {
        const indexSource = getRandomArbitrary(
          config.blocks.length - currentLayerBlocks.length - prevLayerBlocks.length - 1,
          config.blocks.length - currentLayerBlocks.length - 1
        );
        const indexTarget = getRandomArbitrary(
          config.blocks.length - currentLayerBlocks.length - 1,
          config.blocks.length - 1
        );
        const sourceBlockId = `block_${startIndex + indexSource}`;
        const targetBlockId = `block_${startIndex + indexTarget}`;
        config.connections.push({
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

  console.log("Blocks count: ", config.blocks.length);
  console.log("Connections count: ", config.connections.length);

  return config;
}

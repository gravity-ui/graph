import { CanvasBlock, TBlock, TConnection, TGraphConfig } from "@gravity-ui/graph";

import { storiesSettings } from "./definitions";
import { mulberry32 } from "./seededRandom";

export function createBlock(x: number, y: number, index: number | string): TBlock {
  const blockId = `block_${index}`;
  return {
    id: blockId,
    is: CanvasBlock.IS,
    x,
    y,
    width: 200,
    height: 150,
    name: blockId,
    anchors: [],
  };
}

/** Generated config: `blocks` and `connections` are always present. */
export type TGeneratedGraphConfig = TGraphConfig & { blocks: TBlock[]; connections: TConnection[] };

type Props = {
  layersCount: number;
  connectionsPerLayer: number;
  dashedLine?: boolean;
  overrideSettings?: Partial<TGraphConfig["settings"]>;
  startIndex?: number;
  seed?: number;
};

export function generatePrettyBlocks({
  layersCount,
  connectionsPerLayer,
  dashedLine,
  overrideSettings = {},
  startIndex = 0,
  seed,
}: Props): TGeneratedGraphConfig {
  const random = seed === undefined ? Math.random : mulberry32(seed);
  const getRandomArbitrary = (min: number, max: number): number => Math.floor(random() * (max - min) + min);
  const config: TGeneratedGraphConfig = {
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
          dashed: dashedLine && random() >= 0.5,
        });
      }
      prevLayerBlocks = [...currentLayerBlocks];
    }
  }

  console.log("Blocks count: ", config.blocks.length);
  console.log("Connections count: ", config.connections.length);

  return config;
}

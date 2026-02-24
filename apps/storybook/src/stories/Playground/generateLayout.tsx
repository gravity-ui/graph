import { TBlock } from "@gravity-ui/graph";
import { TGraphConfig } from "@gravity-ui/graph";
import { EAnchorType } from "@gravity-ui/graph";

export const GravityActionBlockIS = "block-action";
export type TGravityActionBlock = TBlock<{ description: string }> & { is: typeof GravityActionBlockIS };

export const GravityTextBlockIS = "block-text";
export type TGravityTextBlock = TBlock<{ text: string }> & { is: typeof GravityTextBlockIS };

function getActionBlockId(num: number): string {
  return `action_${num}`;
}

export function createActionBlock(x: number, y: number, index: number): TGravityActionBlock {
  const blockId = getActionBlockId(index);

  return {
    is: GravityActionBlockIS,
    id: blockId,
    x,
    y,
    width: 63 * 2,
    height: 63 * 2,
    selected: false,
    name: `Block #${index}`,
    anchors: [
      {
        id: `${blockId}_in`,
        blockId,
        type: EAnchorType.IN,
      },
      {
        id: `${blockId}_out`,
        blockId,
        type: EAnchorType.OUT,
      },
    ],
    meta: {
      description: "Description",
    },
  };
}

export function createTextBlock(x: number, y: number, width: number, index: number, text): TGravityTextBlock {
  const blockId = `text_${index}`;

  return {
    is: GravityTextBlockIS,
    id: blockId,
    x,
    y,
    width,
    height: 48,
    selected: false,
    name: `Text Block`,
    anchors: [],
    meta: {
      text,
    },
  };
}

function getRandomArbitrary(min, max) {
  return (Math.random() * (max - min) + min) | 0;
}

export function generatePlaygroundActionBlocks(layersCount: number, connectionsPerLayer: number) {
  const config: TGraphConfig<TGravityActionBlock> = {
    blocks: [],
    connections: [],
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

      const block = createActionBlock(layerX, y, ++index);

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
        if (indexSource !== indexTarget) {
          const sourceBlockId = getActionBlockId(indexSource);
          const targetBlockId = getActionBlockId(indexTarget);
          config.connections.push({
            sourceBlockId: sourceBlockId,
            sourceAnchorId: `${sourceBlockId}_out`,
            targetBlockId: targetBlockId,
            targetAnchorId: `${targetBlockId}_in`,
          });
        }
      }
      prevLayerBlocks = [...currentLayerBlocks];
    }
  }

  return config;
}
